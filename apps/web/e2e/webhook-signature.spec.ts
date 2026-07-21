import { test, expect } from '@playwright/test'
import {
  signWebhookPayload,
  verifyWebhookSignature,
  SIGNATURE_TOLERANCE_SECONDS,
} from '@/lib/webhook-signature'

// event-destination-router · Sprint 2, Story 2.1 — the HMAC webhook signature scheme. Pure module,
// asserted directly (the receiver copies verifyWebhookSignature() as reference code, so the scheme
// must be provably correct in isolation).

const SECRET = 'whsec_test_0123456789abcdef'
const BODY = JSON.stringify({ event: 'order_placed', id: 'evt_1' })
const T = 1_800_000_000 // a fixed clock so the signature is deterministic

test('a freshly signed payload verifies against the same secret', () => {
  const header = signWebhookPayload(SECRET, BODY, T)
  expect(verifyWebhookSignature(SECRET, BODY, header, T)).toEqual({ ok: true })
})

test('the header has the documented shape t=<seconds>,v1=<64 hex>', () => {
  const header = signWebhookPayload(SECRET, BODY, T)
  expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/)
})

test('a WRONG secret fails as bad_signature', () => {
  const header = signWebhookPayload(SECRET, BODY, T)
  expect(verifyWebhookSignature('whsec_the_wrong_secret_here', BODY, header, T)).toEqual({
    ok: false,
    reason: 'bad_signature',
  })
})

test('a TAMPERED body fails — the signature binds the exact bytes', () => {
  const header = signWebhookPayload(SECRET, BODY, T)
  const tampered = BODY.replace('order_placed', 'order_refunded')
  expect(verifyWebhookSignature(SECRET, tampered, header, T)).toEqual({ ok: false, reason: 'bad_signature' })
})

test('a stale timestamp is rejected even with an OTHERWISE-VALID signature — bounds replay', () => {
  // A byte-perfect capture replayed after the tolerance window must fail: this is the whole reason
  // the timestamp is part of the signed material.
  const header = signWebhookPayload(SECRET, BODY, T)
  const wayLater = T + SIGNATURE_TOLERANCE_SECONDS + 1
  expect(verifyWebhookSignature(SECRET, BODY, header, wayLater)).toEqual({ ok: false, reason: 'stale_timestamp' })

  // Just inside the window still verifies.
  const justInside = T + SIGNATURE_TOLERANCE_SECONDS - 1
  expect(verifyWebhookSignature(SECRET, BODY, header, justInside)).toEqual({ ok: true })
})

test('an attacker moving t in the header cannot make a forged signature verify', () => {
  // Setting `t` to "now" doesn't help — the signature is over t.body, so changing t invalidates the
  // signature the attacker copied. And the receiver's clock, not the header, decides staleness.
  const header = signWebhookPayload(SECRET, BODY, T)
  const forged = header.replace(/^t=\d+/, `t=${T + 10}`) // moved timestamp, original signature
  expect(verifyWebhookSignature(SECRET, BODY, forged, T + 10)).toEqual({ ok: false, reason: 'bad_signature' })
})

test('malformed headers are refused, not treated as unsigned', () => {
  for (const bad of [
    '',
    'garbage',
    'v1=abc', // no timestamp
    't=1800000000', // no signature
    't=notanumber,v1=' + 'a'.repeat(64),
    't=1800000000,v1=tooshort',
    't=1800000000,v1=' + 'g'.repeat(64), // non-hex
  ]) {
    expect(verifyWebhookSignature(SECRET, BODY, bad, T)).toEqual({ ok: false, reason: 'malformed_header' })
  }
})

test('signatures differ per timestamp for identical bodies — no fixed signature to replay', () => {
  expect(signWebhookPayload(SECRET, BODY, T)).not.toBe(signWebhookPayload(SECRET, BODY, T + 1))
})
