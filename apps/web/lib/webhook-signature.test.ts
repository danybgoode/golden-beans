// event-destination-router · Sprint 2, Story 2.1 — fast unit layer for the delivery HMAC scheme.
//
// Three properties matter, per the module's own header: (1) a signature computed over the real
// secret+body+timestamp verifies; (2) a tampered body OR a tampered signature is rejected — the
// point of signing at all; (3) a stale-but-otherwise-valid signature is rejected past the tolerance
// window, bounding replay of a byte-perfect capture. We can't literally measure constant-time
// comparison from outside the process, but we CAN pin the "shape" that makes it safe: the
// comparison path never throws on a well-formed-but-wrong signature (a length mismatch inside
// timingSafeEqual would itself be a timing/exception signal), and a byte-for-byte-close forgery
// fails exactly the same way as a completely different one — no partial-credit code path exists.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  signWebhookPayload,
  verifyWebhookSignature,
  SIGNATURE_TOLERANCE_SECONDS,
} from './webhook-signature.ts'

const secret = 'whsec_test_1234567890'
const body = JSON.stringify({ event: 'order_placed', id: 'evt_1' })
const now = 1_800_000_000 // fixed clock, per the module's own testability contract

test('a correctly signed payload verifies', () => {
  const header = signWebhookPayload(secret, body, now)
  assert.deepEqual(verifyWebhookSignature(secret, body, header, now), { ok: true })
})

test('signWebhookPayload produces the documented header shape: t=<seconds>,v1=<64-hex>', () => {
  const header = signWebhookPayload(secret, body, now)
  assert.match(header, /^t=\d+,v1=[0-9a-f]{64}$/)
  assert.ok(header.startsWith(`t=${now},`))
})

test('a tampered BODY fails verification even with the original header', () => {
  const header = signWebhookPayload(secret, body, now)
  const tamperedBody = JSON.stringify({ event: 'order_placed', id: 'evt_1', amount: 999999 })
  const result = verifyWebhookSignature(secret, tamperedBody, header, now)
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

test('a tampered SIGNATURE fails verification even with the original body', () => {
  const header = signWebhookPayload(secret, body, now)
  const [tPart, vPart] = header.split(',')
  const flippedHex = vPart.slice(0, 3) === 'v1=' + '0' ? 'v1=1' + vPart.slice(4) : 'v1=0' + vPart.slice(4)
  const tamperedHeader = `${tPart},${flippedHex}`
  const result = verifyWebhookSignature(secret, body, tamperedHeader, now)
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

test('signing with a different secret produces a header that fails verification against the real secret', () => {
  const header = signWebhookPayload('a-completely-different-secret', body, now)
  const result = verifyWebhookSignature(secret, body, header, now)
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

test('a timestamp exactly at the tolerance boundary still verifies', () => {
  const header = signWebhookPayload(secret, body, now)
  const result = verifyWebhookSignature(secret, body, header, now + SIGNATURE_TOLERANCE_SECONDS)
  assert.deepEqual(result, { ok: true })
})

test('a timestamp one second past the tolerance window is rejected as stale, even with a valid signature', () => {
  const header = signWebhookPayload(secret, body, now)
  const result = verifyWebhookSignature(secret, body, header, now + SIGNATURE_TOLERANCE_SECONDS + 1)
  assert.deepEqual(result, { ok: false, reason: 'stale_timestamp' })
})

test('a stale timestamp is rejected even in the past direction (clock skew both ways)', () => {
  const header = signWebhookPayload(secret, body, now)
  const result = verifyWebhookSignature(secret, body, header, now - SIGNATURE_TOLERANCE_SECONDS - 1)
  assert.deepEqual(result, { ok: false, reason: 'stale_timestamp' })
})

test('an attacker cannot forge a fresh timestamp to smuggle a captured signature past staleness — the signature itself still fails', () => {
  // The module's own comment: "an attacker can freely set t in the header... a forged signature
  // fails below regardless of t." Take a genuinely stale, correctly-signed header and rewrite its
  // timestamp to look fresh — verification must still fail, because now the signature no longer
  // matches timestamp.body for the NEW timestamp.
  const staleTimestamp = now - SIGNATURE_TOLERANCE_SECONDS - 100
  const staleHeader = signWebhookPayload(secret, body, staleTimestamp)
  const [, vPart] = staleHeader.split(',')
  const forgedFreshHeader = `t=${now},${vPart}`
  const result = verifyWebhookSignature(secret, body, forgedFreshHeader, now)
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' })
})

test('malformed header: missing the v1 component', () => {
  const result = verifyWebhookSignature(secret, body, `t=${now}`, now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('malformed header: missing the t component', () => {
  const header = signWebhookPayload(secret, body, now)
  const [, vPart] = header.split(',')
  const result = verifyWebhookSignature(secret, body, vPart, now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('malformed header: non-numeric timestamp is rejected rather than coerced', () => {
  // The module comment specifically calls out that Number("12x") is NaN but parseInt("12x") would
  // accept it — this pins that the strict \d+ regex is what's actually used, not a lenient parse.
  const result = verifyWebhookSignature(secret, body, 't=12x,v1=' + '0'.repeat(64), now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('malformed header: signature is not 64 hex characters', () => {
  const result = verifyWebhookSignature(secret, body, `t=${now},v1=abcd`, now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('malformed header: signature contains a non-hex character', () => {
  const result = verifyWebhookSignature(secret, body, `t=${now},v1=` + 'g'.repeat(64), now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('malformed header: completely empty string', () => {
  const result = verifyWebhookSignature(secret, body, '', now)
  assert.deepEqual(result, { ok: false, reason: 'malformed_header' })
})

test('constant-time shape: a signature wrong only in its LAST byte fails the same way as one wrong everywhere', () => {
  // Guards against a naive early-exit byte compare, which would behave identically for these two
  // cases from the OUTSIDE (both simply "fail") but take a different number of comparisons
  // internally. We can't observe timing here, but we can pin that neither one is treated as a
  // partial match or throws — both come back as the same bad_signature result.
  const header = signWebhookPayload(secret, body, now)
  const [tPart, vPart] = header.split(',')
  const correctSig = vPart.slice(3)
  const wrongLastByte = correctSig.slice(0, -2) + (correctSig.slice(-2) === '00' ? '11' : '00')
  const wrongEveryByte = '0'.repeat(64) === correctSig ? '1'.repeat(64) : '0'.repeat(64)

  const resultLastByteWrong = verifyWebhookSignature(secret, body, `${tPart},v1=${wrongLastByte}`, now)
  const resultAllBytesWrong = verifyWebhookSignature(secret, body, `${tPart},v1=${wrongEveryByte}`, now)

  assert.deepEqual(resultLastByteWrong, { ok: false, reason: 'bad_signature' })
  assert.deepEqual(resultAllBytesWrong, { ok: false, reason: 'bad_signature' })
})

test('verifyWebhookSignature defaults nowSeconds so a fresh real-time signature verifies without an injected clock', () => {
  const header = signWebhookPayload(secret, body)
  assert.deepEqual(verifyWebhookSignature(secret, body, header), { ok: true })
})
