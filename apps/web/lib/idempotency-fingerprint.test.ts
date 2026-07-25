// event-destination-router · Story 1.1 hardening — fast unit layer for the payload fingerprint.
//
// The whole reason this module exists is that two payloads which are the SAME logical event must
// hash identically even if they were serialised differently (key order, JSON.stringify quirks
// across client libraries), while two payloads that are actually DIFFERENT events must hash
// differently — otherwise idempotency-key reuse either false-positives into a spurious 409 or
// false-negatives into silently dropped data. That's a canonicalisation property no HTTP spec can
// pin down without asserting internals, which is exactly why this file is zero-import beyond
// node:crypto in the first place.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computePayloadFingerprint, type FingerprintInput } from './idempotency-fingerprint.ts'

const basePayload: FingerprintInput = {
  event: 'order_placed',
  userId: 'user-1',
  featureId: 'feature-1',
  tags: { a: 1, b: 2 },
  metadata: { nested: { x: 1, y: 2 } },
  context: {
    context_version: 1,
    actor_type: 'user',
    actor_id: 'user-1',
    subject_type: 'order',
    subject_id: 'order-123',
    correlation_id: 'corr-1',
    occurred_at: '2026-07-24T00:00:00.000Z',
  },
}

test('computePayloadFingerprint returns a 64-char lowercase hex sha256 digest', () => {
  const fp = computePayloadFingerprint(basePayload)
  assert.match(fp, /^[0-9a-f]{64}$/)
})

test('computePayloadFingerprint is deterministic for the same logical payload', () => {
  const a = computePayloadFingerprint(basePayload)
  const b = computePayloadFingerprint(structuredClone(basePayload))
  assert.equal(a, b)
})

test('top-level key order does not change the fingerprint', () => {
  const reordered: FingerprintInput = {
    context: basePayload.context,
    metadata: basePayload.metadata,
    tags: basePayload.tags,
    featureId: basePayload.featureId,
    userId: basePayload.userId,
    event: basePayload.event,
  }
  assert.equal(computePayloadFingerprint(basePayload), computePayloadFingerprint(reordered))
})

test('nested object key order does not change the fingerprint', () => {
  const reorderedNested: FingerprintInput = {
    ...basePayload,
    tags: { b: 2, a: 1 }, // same object, keys swapped
    metadata: { nested: { y: 2, x: 1 } },
    context: {
      occurred_at: basePayload.context.occurred_at,
      correlation_id: basePayload.context.correlation_id,
      subject_id: basePayload.context.subject_id,
      subject_type: basePayload.context.subject_type,
      actor_id: basePayload.context.actor_id,
      actor_type: basePayload.context.actor_type,
      context_version: basePayload.context.context_version,
    },
  }
  assert.equal(computePayloadFingerprint(basePayload), computePayloadFingerprint(reorderedNested))
})

test('deeply nested key order (three levels) does not change the fingerprint', () => {
  const withDeepNesting: FingerprintInput = {
    ...basePayload,
    metadata: { outer: { inner: { z: 1, a: 2 }, other: 'x' } },
  }
  const reordered: FingerprintInput = {
    ...basePayload,
    metadata: { outer: { other: 'x', inner: { a: 2, z: 1 } } },
  }
  assert.equal(computePayloadFingerprint(withDeepNesting), computePayloadFingerprint(reordered))
})

test('array element order DOES change the fingerprint — array order is meaningful', () => {
  const a = computePayloadFingerprint({ ...basePayload, tags: [1, 2, 3] })
  const b = computePayloadFingerprint({ ...basePayload, tags: [3, 2, 1] })
  assert.notEqual(a, b)
})

test('a changed value changes the fingerprint (event)', () => {
  const a = computePayloadFingerprint(basePayload)
  const b = computePayloadFingerprint({ ...basePayload, event: 'order_refunded' })
  assert.notEqual(a, b)
})

test('a changed value changes the fingerprint (occurred_at) — same event at a different time is a different fact', () => {
  const a = computePayloadFingerprint(basePayload)
  const b = computePayloadFingerprint({
    ...basePayload,
    context: { ...basePayload.context, occurred_at: '2026-07-24T01:00:00.000Z' },
  })
  assert.notEqual(a, b)
})

test('a changed nested tags/metadata value changes the fingerprint', () => {
  const a = computePayloadFingerprint(basePayload)
  const b = computePayloadFingerprint({ ...basePayload, tags: { a: 1, b: 999 } })
  assert.notEqual(a, b)
})

test('null featureId vs a real featureId are different fingerprints', () => {
  const a = computePayloadFingerprint({ ...basePayload, featureId: null })
  const b = computePayloadFingerprint({ ...basePayload, featureId: 'feature-1' })
  assert.notEqual(a, b)
})

test('empty object and empty array tags are distinct payloads', () => {
  const a = computePayloadFingerprint({ ...basePayload, tags: {} })
  const b = computePayloadFingerprint({ ...basePayload, tags: [] })
  assert.notEqual(a, b)
})

test('null metadata does not collide with an empty object', () => {
  const withNull = computePayloadFingerprint({ ...basePayload, metadata: null })
  const withEmptyObject = computePayloadFingerprint({ ...basePayload, metadata: {} })
  assert.notEqual(withNull, withEmptyObject)
})
