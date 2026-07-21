import { NextRequest, NextResponse, after } from 'next/server'
import { resolveProjectFromAuthHeader, type AuthSuccess } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { trackEventSchema } from '@/lib/track-schema'
import { normalizeEventContext, LEGACY_EVENT_CONTEXT } from '@/lib/event-context'
import { checkIngestRate, checkMonthlyQuota, refundMonthlyQuota, MAX_TRACK_PAYLOAD_BYTES } from '@/lib/quota'
import { trackSelfEvent, FIRST_EVENT_INGESTED_EVENT } from '@/lib/self-track'

export async function POST(req: NextRequest) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  // ── Story 2.2 · isolation guardrails ────────────────────────────────────────────────────────
  // Ordered cheapest-first, and all AFTER authentication: an unauthenticated caller must not be
  // able to consume a real tenant's quota or burn its rate-limit window by guessing at this route.
  //
  // 1. Payload cap, from the header — refuse an oversized body without reading a single byte of
  //    it. A caller can lie about or omit Content-Length, so this is only a cheap fast path; the
  //    authoritative bound is readBoundedBody() below, which enforces the same limit on the
  //    stream itself and therefore cannot be lied past.
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRACK_PAYLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Payload too large (max ${MAX_TRACK_PAYLOAD_BYTES} bytes)` },
      { status: 413 },
    )
  }

  // The authoritative cap, enforced WHILE READING rather than after. `await req.text()` buffers
  // the entire body into memory first, so a caller who simply omits or lies about Content-Length
  // could force us to hold an arbitrarily large payload before the size check ever ran — the
  // check would be honest and the memory already spent (cross-review, Agy 2026-07-20). Reading
  // chunk-by-chunk and bailing the moment the running total crosses the line bounds the memory a
  // single request can cost us at the cap itself.
  const read = await readBoundedBody(req)
  if (!read.ok) {
    return read.tooLarge
      ? NextResponse.json(
          { ok: false, error: `Payload too large (max ${MAX_TRACK_PAYLOAD_BYTES} bytes)` },
          { status: 413 },
        )
      : NextResponse.json({ ok: false, error: 'Could not read request body' }, { status: 400 })
  }
  const raw = read.body

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = trackEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed event', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // ── Story 1.1 · versioned actor/subject context ─────────────────────────────────────────────
  // Validated BEFORE the rate/quota counters below, for the same reason those counters sit after
  // schema validation: only an ACCEPTABLE event is ever charged. A broken integration sending an
  // unparseable occurredAt must not silently consume the tenant's monthly allowance.
  //
  // Absent `context` is not an error — it's the legacy contract, and it must keep working forever.
  const eventContext = parsed.data.context
    ? normalizeEventContext(parsed.data.context)
    : { ok: true as const, context: LEGACY_EVENT_CONTEXT }
  if (!eventContext.ok) {
    return NextResponse.json(
      { ok: false, error: 'Malformed event context', issues: eventContext.errors },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()

  // ── Idempotency pre-resolution — BEFORE rate/quota (cross-review, Codex round 2) ─────────────
  // A retry of an already-accepted event must return the original id even for a tenant now AT its
  // monthly quota: that event was counted once, at its first ingest, and a "safe to retry" contract
  // that 429s the retry isn't safe to retry — the client would conclude the event was rejected while
  // it sits stored. So when an idempotency key is present we look it up first; a hit returns the
  // original id with no charge at all.
  //
  // This SELECT is best-effort, not the authority: the real dedup arbiter is still the unique index
  // inside ingest_event(), which catches the concurrent first+retry race this pre-check cannot see
  // (both would miss here and one would win the insert). A miss simply falls through to the normal
  // charged path below.
  const idempotencyKey = eventContext.context.idempotency_key
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .eq('project_id', auth.projectId) // tenant scope re-asserted, never assumed from the key
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) {
      // Already ingested — no charge. Still (re)schedule activation: if the ORIGINAL ingest crashed
      // after the RPC commit but before stamping first_event_at, this retry is what completes the
      // funnel's terminal stage (cross-review, Codex round 2). Idempotent by the `.is(null)` guard.
      scheduleFirstEventActivation(supabase, auth)
      return NextResponse.json({ ok: true, id: existing.id as string, deduplicated: true }, { status: 200 })
    }
  }

  // 2. Per-key burst limit, then 3. per-project monthly quota — both AFTER validation and after the
  //    idempotency pre-check, so only an ACCEPTABLE, NON-duplicate event is ever charged. Checking
  //    them earlier (the first version of this route) meant a broken integration sending malformed
  //    JSON burned a tenant's monthly allowance without a single event being stored: the tenant
  //    would see far fewer than their configured quota accepted, with nothing in the events table to
  //    explain where it went (cross-review, Codex 2026-07-20).
  //
  //    Both counters are still incremented BEFORE the insert rather than after a confirmed write:
  //    an atomic increment-and-compare is the only race-free shape, and moving it after the insert
  //    would reintroduce the check-then-act window the rate_limit migration exists to avoid. The
  //    resulting over-charge on a failed insert is REFUNDED explicitly below rather than waved
  //    away — an earlier version of this comment called it "bounded at one", which was wrong: a
  //    sustained `events` outage would burn a whole month one retry at a time.
  const rate = await checkIngestRate(auth.apiKeyId, auth.ingestRatePerMin)
  if (!rate.ok) {
    return NextResponse.json({ ok: false, error: rate.error }, { status: rate.status })
  }

  const quota = await checkMonthlyQuota(auth.projectId, auth.monthlyEventQuota)
  if (!quota.ok) {
    return NextResponse.json({ ok: false, error: quota.error }, { status: quota.status })
  }

  // ── Story 1.2 · atomic ingest + outbox fan-out ──────────────────────────────────────────────
  // The plain `.from('events').insert()` this replaced could not commit the event and its delivery
  // work in one transaction — supabase-js has no multi-statement transaction, so a crash between two
  // separate inserts would store the event with no delivery rows, an event that silently never
  // reaches its destination with nothing recording that it should have. `ingest_event()` is a
  // plpgsql function (one transaction by definition — see 20260722110000_delivery_outbox.sql) that
  // writes the canonical event AND one outbox row per eligible destination, or neither.
  //
  // The idempotent-replay semantics (Story 1.1) moved INTO that function verbatim; this route's HTTP
  // contract is unchanged — 201 + id for a new event, 200 + id + deduplicated:true for a replay —
  // and Story 1.1's specs still pass against it unmodified. `queued_count` is how many destinations
  // wanted this event: 0 today (none configured) and correctly so, until Story 2.1 lets a tenant
  // create one. project_id comes from `auth.projectId` (the resolved key), never the body.
  const { data: ingest, error } = await supabase
    .rpc('ingest_event', {
      p_project_id: auth.projectId,
      p_user_id: parsed.data.userId,
      p_event: parsed.data.event,
      p_feature_id: parsed.data.featureId ?? null,
      p_tags: parsed.data.tags,
      p_metadata: parsed.data.metadata,
      p_context_version: eventContext.context.context_version,
      p_actor_type: eventContext.context.actor_type,
      p_actor_id: eventContext.context.actor_id,
      p_subject_type: eventContext.context.subject_type,
      p_subject_id: eventContext.context.subject_id,
      p_correlation_id: eventContext.context.correlation_id,
      p_occurred_at: eventContext.context.occurred_at,
      p_idempotency_key: eventContext.context.idempotency_key,
    })
    // RETURNS TABLE(...) surfaces as a one-row array through PostgREST; ask for the single object.
    .single<{ event_id: string; deduplicated: boolean; queued_count: number }>()

  if (error || !ingest) {
    console.error('[track] ingest_event failed:', error)
    // Hand the quota unit back: it was charged above but nothing was stored. Without this, a
    // sustained outage on the write path would burn a tenant's entire month one failed retry at a
    // time (cross-review, Codex 2026-07-20). The rate-limit unit is deliberately NOT refunded — that
    // one is a burst guard protecting us from the caller, and a failing caller retrying hard is
    // exactly when it should still apply.
    //
    // A replay (deduplicated) never reaches here — the function returns the original id, not an
    // error — so the dedup path's own quota refund lives below, next to its 200 response.
    await refundMonthlyQuota(auth.projectId)
    return NextResponse.json({ ok: false, error: 'Failed to persist event' }, { status: 500 })
  }

  if (ingest.deduplicated) {
    // The concurrent-race dedup the pre-check above couldn't see: two first-time requests for the
    // same key, one wins the insert, this one lost it. Hand the quota unit back — a client retrying
    // a delivery it never got an answer for must not be charged twice for one logical event — and
    // still (re)schedule activation for the same crash-window reason as the pre-check path.
    await refundMonthlyQuota(auth.projectId)
    scheduleFirstEventActivation(supabase, auth)
    // 200, not 201: nothing was created. The id is the original event's, so an at-least-once caller
    // converges on one identity no matter how many times it retries.
    return NextResponse.json({ ok: true, id: ingest.event_id, deduplicated: true }, { status: 200 })
  }

  scheduleFirstEventActivation(supabase, auth)
  return NextResponse.json({ ok: true, id: ingest.event_id }, { status: 201 })
}

// ── Story 3.3 · the activation funnel's last stage ────────────────────────────────────────────
// A project's FIRST successful event is `first_event_ingested`. Runs on EVERY success path — fresh
// insert AND both dedup exits — because a dedup can be the moment that repairs an activation the
// original ingest started but crashed before finishing (cross-review, Codex round 2): if
// `first_event_at` is still null, the stamp genuinely hasn't happened and a retry is the only thing
// that can complete it. The `firstEventAt === null` guard means the extra work happens at most once
// per project lifetime; the conditional `.is('first_event_at', null)` UPDATE makes the write itself
// the race resolver, so concurrent first events still stamp (and fire) exactly once.
//
// Only self-serve tenants (`createdBy` set) count toward this funnel: the three hand-seeded tenants
// were never signups, so stamping them would inject a conversion nobody made.
function scheduleFirstEventActivation(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  auth: AuthSuccess,
): void {
  if (auth.firstEventAt !== null || !auth.createdBy) return
  const funnelUserId = auth.createdBy
  const projectId = auth.projectId
  after(async () => {
    // TRACK FIRST, STAMP SECOND. The stamp is a permanent "already counted" marker, so committing
    // it before knowing the send landed loses the funnel's terminal stage forever — no later event
    // retries it, because the project is already stamped (cross-review, Codex 2026-07-20).
    //
    // The inverted order can instead send the event more than once (two concurrent first events, or
    // a crash between send and stamp). That is harmless by construction: TARS counts DISTINCT users
    // per event (lib/tars.ts), so a duplicate for the same user changes no number. Losing the only
    // send is unrecoverable; duplicating it costs nothing — so the trade is one-sided.
    const landed = await trackSelfEvent(FIRST_EVENT_INGESTED_EVENT, funnelUserId)
    if (!landed) return
    await supabase
      .from('projects')
      .update({ first_event_at: new Date().toISOString() })
      .eq('id', projectId)
      .is('first_event_at', null)
  })
}

type BoundedRead = { ok: true; body: string } | { ok: false; tooLarge: boolean }

// Reads the request body while enforcing MAX_TRACK_PAYLOAD_BYTES as it goes, so an oversized or
// length-lying request is abandoned mid-stream instead of being fully buffered and then rejected.
// Byte length, not string length: a multi-byte UTF-8 body is larger than its character count, and
// counting characters would let a caller smuggle roughly 4x the cap past it.
async function readBoundedBody(req: NextRequest): Promise<BoundedRead> {
  if (!req.body) return { ok: true, body: '' }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_TRACK_PAYLOAD_BYTES) {
        // Stop pulling immediately — the point is to not receive the rest of it.
        await reader.cancel().catch(() => {})
        return { ok: false, tooLarge: true }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, tooLarge: false }
  }

  return { ok: true, body: Buffer.concat(chunks).toString('utf8') }
}
