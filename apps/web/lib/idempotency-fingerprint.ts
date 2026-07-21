import { createHash } from 'node:crypto'

// event-destination-router · Story 1.1 hardening (cross-review, Codex round 4) — the payload
// fingerprint that makes idempotency-key reuse SAFE instead of silently lossy.
//
// An idempotency key identifies ONE logical operation. Reusing it for a RETRY of the same event is
// the whole point (return the original, create nothing). But reusing it by ACCIDENT for a
// *different* event — a client bug where `order-123` gets attached to both an `order_placed` and an
// `order_refunded` — must NOT silently return the first and drop the second: for an analytics engine
// that is lost data nobody is told about. Stripe/IETF idempotency answers a mismatched reuse with a
// conflict, and so do we (409). This module produces the fingerprint the two payloads are compared
// by.
//
// DELIBERATELY ZERO-IMPORT beyond node:crypto, so the canonicalisation is unit-testable directly —
// the property that matters (key order and object nesting must not change the hash) is exactly the
// kind of thing an HTTP spec cannot pin down.

/**
 * The semantic identity of a track payload, hashed. Everything that makes an event what it IS goes
 * in; the idempotency key itself does NOT (it is the lookup key, not part of the identity being
 * compared). occurred_at is included because two events the client asserts happened at different
 * times are different facts.
 */
export type FingerprintInput = {
  event: string
  userId: string
  featureId: string | null
  tags: unknown
  metadata: unknown
  context: {
    context_version: number | null
    actor_type: string | null
    actor_id: string | null
    subject_type: string | null
    subject_id: string | null
    correlation_id: string | null
    occurred_at: string | null
  }
}

export function computePayloadFingerprint(input: FingerprintInput): string {
  // Canonicalise before hashing: `{a:1,b:2}` and `{b:2,a:1}` are the same payload and must hash the
  // same, so keys are sorted recursively. Without this, a client that serialises its JSON with a
  // different key order on a retry would look like a MISMATCH and get a spurious 409 — the opposite
  // of the bug we're fixing.
  const canonical = stableStringify({
    event: input.event,
    userId: input.userId,
    featureId: input.featureId,
    tags: input.tags,
    metadata: input.metadata,
    context: input.context,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

/**
 * Deterministic JSON: object keys sorted at every depth, arrays kept in order (array order is
 * meaningful), primitives as JSON. Handles the arbitrary nesting `tags`/`metadata` allow.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value as Record<string, unknown>).sort()
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
  return `{${entries.join(',')}}`
}
