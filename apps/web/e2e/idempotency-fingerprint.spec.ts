import { test, expect } from '@playwright/test'
import { computePayloadFingerprint, type FingerprintInput } from '@/lib/idempotency-fingerprint'

// event-destination-router · Story 1.1 hardening (cross-review, Codex round 4) — the payload
// fingerprint that makes idempotency-key reuse safe. Pure module, asserted directly.

const base: FingerprintInput = {
  event: 'order_placed',
  userId: 'u1',
  featureId: null,
  tags: { source: 'web', amount: 42 },
  metadata: { note: 'hello' },
  context: {
    context_version: 1,
    actor_type: 'staff_user',
    actor_id: 'staff_7',
    subject_type: 'order',
    subject_id: 'o1',
    correlation_id: 'wf1',
    occurred_at: '2026-07-22T10:00:00.000Z',
  },
}

test('identical payloads hash identically', () => {
  expect(computePayloadFingerprint(base)).toBe(computePayloadFingerprint({ ...base }))
})

test('key ORDER in tags/metadata does not change the fingerprint', () => {
  // The property that stops a client serialising its JSON with a different key order from looking
  // like a mismatch and getting a spurious 409.
  const reordered: FingerprintInput = {
    ...base,
    tags: { amount: 42, source: 'web' }, // same pairs, different order
    metadata: { note: 'hello' },
  }
  expect(computePayloadFingerprint(reordered)).toBe(computePayloadFingerprint(base))
})

test('nested object key order also does not matter', () => {
  const a: FingerprintInput = { ...base, tags: { outer: { x: 1, y: 2 } } }
  const b: FingerprintInput = { ...base, tags: { outer: { y: 2, x: 1 } } }
  expect(computePayloadFingerprint(a)).toBe(computePayloadFingerprint(b))
})

test('array order DOES matter — it is meaningful', () => {
  const a: FingerprintInput = { ...base, tags: { items: [1, 2, 3] } }
  const b: FingerprintInput = { ...base, tags: { items: [3, 2, 1] } }
  expect(computePayloadFingerprint(a)).not.toBe(computePayloadFingerprint(b))
})

test('changing any meaningful field changes the fingerprint', () => {
  const original = computePayloadFingerprint(base)
  expect(computePayloadFingerprint({ ...base, event: 'order_refunded' })).not.toBe(original)
  expect(computePayloadFingerprint({ ...base, userId: 'u2' })).not.toBe(original)
  expect(computePayloadFingerprint({ ...base, featureId: 'checkout' })).not.toBe(original)
  expect(computePayloadFingerprint({ ...base, tags: { source: 'mobile', amount: 42 } })).not.toBe(original)
  expect(
    computePayloadFingerprint({ ...base, context: { ...base.context, subject_id: 'o2' } }),
  ).not.toBe(original)
  expect(
    computePayloadFingerprint({ ...base, context: { ...base.context, occurred_at: '2026-07-22T11:00:00.000Z' } }),
  ).not.toBe(original)
})

test('a value vs an absent (null) field are distinguishable', () => {
  // `{note: undefined}` should not collide with `{}`; null vs a value must differ.
  const withNote = computePayloadFingerprint(base)
  const withoutNote = computePayloadFingerprint({ ...base, metadata: {} })
  expect(withNote).not.toBe(withoutNote)
})
