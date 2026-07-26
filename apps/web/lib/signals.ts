import 'server-only'
import { after } from 'next/server'
import { getSupabaseServiceClient } from './supabase'
import { isSignalsEnabled } from './flags'
import { scrubErrorPayload, scrubValue } from './signal-scrub'
import { computeSignalFingerprint, signalTitle } from './signal-fingerprint'

// signals-loop · Sprint 1, Story 1.2 — grouping an `$error` occurrence into its signal.
//
// Signals ride the EXISTING /v1/track envelope rather than getting a route of their own — the
// growth-engine-v1 S1.1 `tags`/`metadata` forward-compat was left open for exactly this, so error
// capture needs no schema migration and no second ingest path (AGENTS rule #1).
//
// The reserved event NAMES live in lib/signal-events.ts, a zero-import module, and are re-exported
// here for callers that already depend on this file. See that file's header for why they cannot
// live in this one: it imports `server-only`, which breaks any test runner that touches it.
export { ERROR_EVENT, FRICTION_EVENT, isReservedSignalEvent } from './signal-events'
import { ERROR_EVENT, isReservedSignalEvent } from './signal-events'

/**
 * Redacts a reserved `$error` event's tags/metadata BEFORE the event itself is persisted.
 *
 * ── Why this exists, and why it is not gated by SIGNALS_ENABLED ─────────────────────────────
 * Found by cross-review (Codex, 2026-07-26) and REPRODUCED against a real database before being
 * accepted: the first version of this epic scrubbed only on the way into `signals`, while
 * `ingest_event` had already written the caller's RAW tags into `events`. A hand-rolled client
 * posting `{"event":"$error","tags":{"message":"failed with gb_key_…"}}` got a clean signal row and
 * a permanent plaintext credential in `events.tags`. The e2e spec missed it completely because it
 * asserted against the `signals` table — the right property, checked in the wrong place.
 *
 * Two consequences shape this function:
 *
 * 1. It runs on the INGEST path, before persistence, so there is no window in which the raw payload
 *    exists at rest. `events` is append-only for the service role, so a leak here is not something a
 *    later cleanup could fully undo.
 *
 * 2. It is deliberately NOT behind `SIGNALS_ENABLED`. That flag gates whether we GROUP signals; it
 *    must not decide whether we redact credentials. Otherwise turning the seam off — the thing an
 *    operator does when something looks wrong — would silently start storing raw secrets, which is
 *    the exact inversion of what a kill switch is for.
 */
export function scrubReservedEventPayload(input: {
  event: string
  tags: Record<string, unknown>
  metadata: Record<string, unknown>
}): { tags: Record<string, unknown>; metadata: Record<string, unknown> } {
  if (!isReservedSignalEvent(input.event)) {
    // Ordinary tenant telemetry is untouched. Their event vocabulary is their own, they chose every
    // value in it, and redacting it would corrupt data they rely on.
    return { tags: input.tags, metadata: input.metadata }
  }

  const scrubbed = scrubErrorPayload({
    name: input.tags.name ?? input.tags.errorName ?? input.metadata.name,
    message: input.tags.message ?? input.metadata.message,
    stack: input.tags.stack ?? input.metadata.stack,
    context: input.metadata.context ?? input.metadata,
  })

  return {
    // The remaining caller-supplied tags are passed through scrubValue rather than dropped: a client
    // may legitimately attach `release`, `route` or `buildId`, and those are useful evidence. They
    // are still redacted, because "a field we did not think about" is exactly where a secret lands.
    tags: {
      ...(scrubValue(input.tags) as Record<string, unknown>),
      name: scrubbed.name,
      message: scrubbed.message,
      stack: scrubbed.stack,
    },
    metadata: {
      ...(scrubValue(input.metadata) as Record<string, unknown>),
      context: scrubbed.context,
    },
  }
}

export type RecordSignalResult = {
  signalId: string
  eventCount: number
  usersAffected: number
  isNew: boolean
}

/**
 * Groups one `$error` occurrence into its signal, scrubbing on the way in.
 *
 * ── The scrub here is the AUTHORITATIVE one ─────────────────────────────────────────────────
 * The SDK scrubs too, but that call is a courtesy that reduces what crosses the wire. This one is
 * the boundary that matters, because the server cannot tell a payload scrubbed by our SDK from one
 * posted by curl — and a `$error` event is a payload assembled by someone else's code out of
 * whatever happened to be in scope. Both sides call the same pure module rather than two
 * implementations that agree today.
 *
 * ── The fingerprint is computed here and never read from the request ────────────────────────
 * A tenant may send whatever `tags` they like; the engine still decides what counts as one problem.
 * Trusting a client-supplied fingerprint would mean each client re-implements grouping, badly, and
 * the counts stop being comparable across releases — which is the entire value of the table.
 */
export async function recordErrorSignal(input: {
  projectId: string
  userId: string
  featureId: string | null
  tags: Record<string, unknown>
  metadata: Record<string, unknown>
  occurredAt: string | null
}): Promise<RecordSignalResult | null> {
  const scrubbed = scrubErrorPayload({
    name: input.tags.name ?? input.tags.errorName ?? input.metadata.name,
    message: input.tags.message ?? input.metadata.message,
    stack: input.tags.stack ?? input.metadata.stack,
    context: input.metadata.context ?? input.metadata,
  })

  const fingerprint = computeSignalFingerprint({
    kind: 'error',
    name: scrubbed.name,
    message: scrubbed.message,
    // ── This is the ALREADY-SCRUBBED stack, and that is now deliberate ──────────────────────
    // An earlier version of this comment claimed the RAW stack fed the digest, on the reasoning
    // that redaction collapses distinct secrets to one placeholder and could therefore merge two
    // errors differing only inside a redacted span. That reasoning was sound; the comment stopped
    // being TRUE the moment the leak fix moved redaction ahead of persistence, because the raw
    // stack no longer exists by the time this runs. Cross-review (Agy, 2026-07-26) caught the
    // contradiction — a comment asserting something the code does not do, which LEARNINGS rates as
    // worse than no comment because a reviewer who reads a stated rationale spends their scrutiny
    // elsewhere.
    //
    // Keeping the scrubbed input is the right resolution, not a concession: the alternative is
    // threading an unredacted copy of customer runtime data through a second code path purely to
    // hash it, which reintroduces exactly the exposure the fix removed. The theoretical cost —
    // two errors that differ ONLY inside a redacted span merging into one signal — requires the
    // difference to be entirely within a secret, in which case the two occurrences are the same
    // code path failing on different credentials, which is one problem and should group.
    stack: typeof input.tags.stack === 'string' ? input.tags.stack : null,
    featureId: input.featureId,
  })

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .rpc('record_signal', {
      p_project_id: input.projectId,
      p_kind: 'error',
      p_fingerprint: fingerprint,
      p_title: signalTitle(scrubbed.name, scrubbed.message),
      p_feature_id: input.featureId,
      p_user_id: input.userId,
      // The stored sample is the scrubbed, CLOSED shape — never the caller's object. See
      // scrubErrorPayload: an open passthrough would grow the set of things that can leak every
      // time a customer adds a field, with no review ever seeing it.
      p_sample: scrubbed as unknown as Record<string, unknown>,
      p_occurred_at: input.occurredAt,
    })
    .single<{ signal_id: string; event_count: number; users_affected: number; is_new: boolean }>()

  if (error || !data) {
    console.error('[signals] record_signal failed:', error)
    return null
  }

  return {
    signalId: data.signal_id,
    eventCount: Number(data.event_count),
    usersAffected: data.users_affected,
    isNew: data.is_new,
  }
}

/**
 * Fire-and-forget grouping, scheduled off the ingest response.
 *
 * ── Why this must never block, and never fail, the ingest it follows ────────────────────────
 * Ingest's contract is that a stored event is stored. Grouping is a DERIVED projection of an event
 * that has already been committed — so a grouping failure must cost the tenant a signal row, never
 * their event, and never a 500 on a write that actually succeeded. This is the same reasoning the
 * outbox encodes one layer down: turning delivery off must lose no events, only stop them moving.
 *
 * `after()` rather than a bare floating promise: on a serverless runtime an un-awaited promise can
 * be killed when the response is returned, which would make grouping silently probabilistic. The
 * commercial-shell S3 review found precisely that bug in a different route.
 *
 * The flag is read HERE rather than at the call site so there is exactly one place that decides
 * whether the signals seam is live — a second copy is a second thing to forget.
 */
export function scheduleSignalGrouping(input: {
  projectId: string
  event: string
  userId: string
  featureId: string | null
  tags: Record<string, unknown>
  metadata: Record<string, unknown>
  occurredAt: string | null
}): void {
  if (!isSignalsEnabled()) return
  if (input.event !== ERROR_EVENT) return

  after(async () => {
    try {
      await recordErrorSignal(input)
    } catch (err) {
      // Swallowed deliberately, and loudly logged. See the header: a derived projection must not be
      // able to retroactively fail a committed write.
      console.error('[signals] grouping threw:', err)
    }
  })
}

export type SignalRow = {
  id: string
  kind: 'error' | 'friction'
  fingerprint: string
  title: string
  featureId: string | null
  firstSeenAt: string
  lastSeenAt: string
  eventCount: number
  usersAffected: number
  sample: Record<string, unknown>
}

/**
 * Reads a project's signals, most impactful first.
 *
 * `projectId` is required and is always resolved server-side by the caller (from a hashed API key,
 * a connector token, or a verified session) — never taken from a request body. Every query in this
 * module is scoped by it, with no code path that omits the filter.
 */
export async function listSignalsByProjectId(projectId: string, limit = 50): Promise<SignalRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('signals')
    .select(
      'id, kind, fingerprint, title, feature_id, first_seen_at, last_seen_at, event_count, users_affected, sample'
    )
    .eq('project_id', projectId)
    .order('users_affected', { ascending: false })
    .order('event_count', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200))

  if (error) {
    // Thrown, not flattened to []. An empty list renders as "no problems", which during an outage
    // is the most dangerous possible lie for a queue whose job is to surface problems — the same
    // reasoning listProjectKeys uses for credentials (cross-review, Codex 2026-07-20).
    console.error('[signals] list failed:', error)
    throw new Error('Could not load signals')
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as 'error' | 'friction',
    fingerprint: r.fingerprint as string,
    title: r.title as string,
    featureId: (r.feature_id as string | null) ?? null,
    firstSeenAt: r.first_seen_at as string,
    lastSeenAt: r.last_seen_at as string,
    eventCount: Number(r.event_count),
    usersAffected: r.users_affected as number,
    sample: (scrubValue(r.sample) as Record<string, unknown>) ?? {},
  }))
}
