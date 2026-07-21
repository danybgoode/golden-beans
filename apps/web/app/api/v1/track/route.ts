import { NextRequest, NextResponse, after } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { trackEventSchema } from '@/lib/track-schema'
import { checkIngestRate, checkMonthlyQuota, MAX_TRACK_PAYLOAD_BYTES } from '@/lib/quota'
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
  // 1. Payload cap, from the header — refuse an oversized body BEFORE reading or parsing it.
  //    A caller can lie about or omit Content-Length, so this is the cheap first pass; the real
  //    bound is the byte length check after the body is read below.
  const declaredLength = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TRACK_PAYLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Payload too large (max ${MAX_TRACK_PAYLOAD_BYTES} bytes)` },
      { status: 413 },
    )
  }

  // 2. Per-key burst limit, then 3. per-project monthly quota. Rate first: it's the bound that
  //    protects the counter behind the quota check from being hammered in the first place.
  const rate = await checkIngestRate(auth.apiKeyId, auth.ingestRatePerMin)
  if (!rate.ok) {
    return NextResponse.json({ ok: false, error: rate.error }, { status: rate.status })
  }

  const quota = await checkMonthlyQuota(auth.projectId, auth.monthlyEventQuota)
  if (!quota.ok) {
    return NextResponse.json({ ok: false, error: quota.error }, { status: quota.status })
  }

  let raw: string
  try {
    raw = await req.text()
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not read request body' }, { status: 400 })
  }

  // The authoritative payload cap — a missing or dishonest Content-Length can't get past this.
  // Byte length, not string length: a multi-byte UTF-8 body is bigger than its character count.
  if (Buffer.byteLength(raw, 'utf8') > MAX_TRACK_PAYLOAD_BYTES) {
    return NextResponse.json(
      { ok: false, error: `Payload too large (max ${MAX_TRACK_PAYLOAD_BYTES} bytes)` },
      { status: 413 },
    )
  }

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

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('events')
    .insert({
      project_id: auth.projectId, // resolved from the API key, never from the body — Decision 8
      user_id: parsed.data.userId,
      event: parsed.data.event,
      feature_id: parsed.data.featureId ?? null,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[track] event insert failed:', error)
    return NextResponse.json({ ok: false, error: 'Failed to persist event' }, { status: 500 })
  }

  // ── Story 3.3 · the activation funnel's last stage ──────────────────────────────────────────
  // A project's FIRST successful event is `first_event_ingested`. The `firstEventAt === null`
  // guard means the extra write happens at most once per project lifetime, not once per request —
  // and the conditional `.is('first_event_at', null)` makes the write itself the race resolver, so
  // two concurrent first events still stamp (and fire) exactly once.
  //
  // Only self-serve tenants (`createdBy` set) count toward this funnel: the three hand-seeded
  // tenants were never signups, so stamping them would inject a conversion nobody made.
  if (auth.firstEventAt === null && auth.createdBy) {
    const funnelUserId = auth.createdBy
    const projectId = auth.projectId
    after(async () => {
      const { data: stamped } = await supabase
        .from('projects')
        .update({ first_event_at: new Date().toISOString() })
        .eq('id', projectId)
        .is('first_event_at', null)
        .select('id')
      if ((stamped ?? []).length > 0) {
        await trackSelfEvent(FIRST_EVENT_INGESTED_EVENT, funnelUserId)
      }
    })
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}
