import { randomUUID } from 'node:crypto'

// event-destination-router · Sprint 2 — the webhook envelope a receiver actually parses. Kept as one
// builder so a "send test" and a real delivery are byte-identical in SHAPE (only the values and the
// `test` flag differ) — an owner who validated their receiver against the test shape must not then
// get a differently-shaped real delivery.
//
// Zero-import pure functions: the exact bytes matter (they are what the HMAC signs), so they are
// asserted directly in a spec rather than inferred.
//
// The envelope is intentionally SMALL and stable: an `id` a receiver can dedupe on (at-least-once
// delivery is contractual — epic README), the event `type` and `occurredAt`, and a `data` object
// carrying the canonical event fields. We forward the tenant's own metadata/tags verbatim; what a
// tenant puts there is their contract with their receiver, not ours to reshape.

export type WebhookEnvelope = {
  /** Stable logical id a receiver deduplicates on. The canonical EVENT id — the same across every
   *  retry and every replay of that event, which is exactly what makes consumer idempotency possible. */
  id: string
  type: string
  occurredAt: string
  /** Present and true only on an owner-initiated test send, so a receiver can route test traffic
   *  away from real pipelines. Absent (not `false`) on a real delivery — a field that is only ever
   *  present-when-true can't be mistaken for a real event by a receiver that checks truthiness. */
  test?: true
  data: Record<string, unknown>
}

// canonicalize → a deterministic string. JSON.stringify over a FIXED key order, because the output
// is what gets signed: two serializations of the same logical envelope that differ by key order
// would produce different signatures, and a receiver re-serializing to verify would fail. We build
// the object in a fixed order and never hand an arbitrary object to stringify.
export function serializeEnvelope(envelope: WebhookEnvelope): string {
  const ordered: Record<string, unknown> = {
    id: envelope.id,
    type: envelope.type,
    occurredAt: envelope.occurredAt,
  }
  if (envelope.test) ordered.test = true
  ordered.data = envelope.data
  return JSON.stringify(ordered)
}

// The canonical event row (as ingest_event stored it) → the delivery `data`. Only non-null fields
// are included, so a receiver's schema isn't polluted with a dozen nulls for the common case of a
// bare `userId` event.
export type CanonicalEventRow = {
  id: string
  event: string
  occurred_at?: string | null
  created_at?: string | null
  user_id?: string | null
  feature_id?: string | null
  tags?: unknown
  metadata?: unknown
  actor_type?: string | null
  actor_id?: string | null
  subject_type?: string | null
  subject_id?: string | null
  correlation_id?: string | null
}

export function buildEventEnvelope(row: CanonicalEventRow): WebhookEnvelope {
  const data: Record<string, unknown> = {}
  const put = (k: string, v: unknown) => {
    if (v !== null && v !== undefined) data[k] = v
  }
  put('userId', row.user_id)
  put('featureId', row.feature_id)
  put('tags', nonEmptyObject(row.tags))
  put('metadata', nonEmptyObject(row.metadata))
  if (row.actor_type || row.actor_id) data.actor = { type: row.actor_type ?? null, id: row.actor_id ?? null }
  if (row.subject_type || row.subject_id) data.subject = { type: row.subject_type ?? null, id: row.subject_id ?? null }
  put('correlationId', row.correlation_id)

  return {
    id: row.id,
    type: row.event,
    // occurred_at is the caller-asserted event time (Story 1.1); fall back to created_at (ingest
    // time) so occurredAt is never absent from the envelope.
    occurredAt: row.occurred_at ?? row.created_at ?? new Date().toISOString(),
    data,
  }
}

// A synthetic envelope for the owner-initiated "send test". Its `id` is a test-prefixed RANDOM uuid,
// never a real event id and never merely millisecond-unique (cross-review, Codex round 5: two
// concurrent tests a ms apart must not collide and be deduped by a receiver).
export function buildTestEnvelope(now: Date = new Date()): WebhookEnvelope {
  return {
    id: `evt_test_${randomUUID()}`,
    type: 'golden_beans.webhook.test',
    occurredAt: now.toISOString(),
    test: true,
    data: { message: 'This is a Golden Beans test delivery. If you can verify its signature, you are wired up.' },
  }
}

function nonEmptyObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
    return value as Record<string, unknown>
  }
  return undefined
}
