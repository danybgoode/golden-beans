// signals-loop · Story 1.1 — the SDK-side scrub, tested directly.
//
// This is the courtesy layer (see scrub.ts's header): a smaller, cheaper rule set than the
// server's authoritative `apps/web/lib/signal-scrub.ts`, shipped into a customer's bundle. Each
// assertion here names the property it defends, matching that file's convention, and covers only
// the subset of rules this module actually carries.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scrubClientText, SDK_MAX_MESSAGE, SDK_MAX_STACK } from './scrub.ts'

test('an ingest key is redacted', () => {
  const out = scrubClientText('Request failed with Authorization gb_key_AbCdEf0123456789xyzAB', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('gb_key_AbCdEf0123456789xyzAB'), out)
  assert.ok(out.includes('[redacted]'), out)
})

test('a connector token is redacted', () => {
  const out = scrubClientText('bad token gb_connector_QrStUv0123456789abcdEFGH', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('gb_connector_QrStUv0123456789abcdEFGH'), out)
  assert.ok(out.includes('[redacted]'), out)
})

test('a JWT is redacted', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'
  const out = scrubClientText(`token expired: ${jwt}`, SDK_MAX_MESSAGE)
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'), out)
  assert.ok(!out.includes('dBjftJeZ4CVPmB92K27uhbUJU1p1r'), out)
})

test('a bearer header keeps its scheme and loses its value', () => {
  const out = scrubClientText('Authorization: Bearer abcdef1234567890ABCDEF', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('abcdef1234567890ABCDEF'), out)
  assert.match(out, /Bearer/i)
})

test('a key=value secret keeps the key name and loses the value', () => {
  const out = scrubClientText('connect(password=hunter2trustno1, host=db.internal)', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('hunter2trustno1'), out)
  assert.match(out, /password=/)
})

test('a token=value secret keeps the key name and loses the value', () => {
  const out = scrubClientText('request failed token=abc.def-123 retrying', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('abc.def-123'), out)
  assert.match(out, /token=/)
})

test('an email address is redacted', () => {
  const out = scrubClientText('no account for daniel@example.com', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('daniel@example.com'), out)
  assert.ok(out.includes('[redacted]'), out)
})

test('a URL keeps its origin and path and loses its query string', () => {
  const out = scrubClientText('GET https://api.example.com/v1/orders?session=abc123&token=xyz 500', SDK_MAX_MESSAGE)
  assert.ok(!out.includes('abc123'), out)
  assert.ok(!out.includes('xyz'), out)
  assert.ok(out.includes('https://api.example.com/v1/orders'), out)
})

test('an ordinary short identifier is NOT redacted', () => {
  // The counter-test for every rule above: a scrub that eats every identifier produces reports
  // nobody can act on, which fails the product just as surely as a leak fails the trust.
  const out = scrubClientText('feature setup_guide not found for order_8821', SDK_MAX_MESSAGE)
  assert.ok(out.includes('setup_guide'), out)
  assert.ok(out.includes('order_8821'), out)
})

// A helper, not decoration. `'z'.repeat(n)` is itself a long unbroken run, and some redaction
// rulesets treat that shape as a secret in its own right — which would make a length assertion
// pass even if truncation ran in the wrong order. These strings are word-shaped so the truncation
// branch, not some other rule, is what's actually under test.
function longProse(chars: number): string {
  return 'the quick brown fox jumps over the lazy dog '.repeat(Math.ceil(chars / 45)).slice(0, chars)
}

test('redaction happens BEFORE truncation, so a cap never slices a secret in half', () => {
  // The secret sits past the cap. If truncation ran first, the tail (including the whole secret)
  // would simply be dropped — which looks safe for this exact arrangement, but the same order bug
  // would store the first half of a secret straddling the cap. Asserting the ordering property
  // directly, against word-shaped padding, is what actually pins it.
  const secret = 'gb_key_ZZZZZZZZZZZZZZZZZZZZZZZZ'
  const padded = longProse(40) + secret + longProse(40)
  const out = scrubClientText(padded, 60)
  assert.ok(!out.includes('gb_key_'), out)
  assert.ok(out.length <= 60, `cap exceeded: ${out.length}`)
})

test('the truncation marker fits INSIDE the budget', () => {
  const out = scrubClientText(longProse(500), 100)
  assert.equal(out.length, 100)
  assert.ok(out.endsWith('…'))
})

test('scrubClientText respects the caller-supplied cap for a short input (no truncation needed)', () => {
  const out = scrubClientText('short message', SDK_MAX_MESSAGE)
  assert.equal(out, 'short message')
  assert.ok(out.length <= SDK_MAX_MESSAGE)
})

test('SDK_MAX_STACK caps a long stack the same way', () => {
  const out = scrubClientText(longProse(SDK_MAX_STACK * 2), SDK_MAX_STACK)
  assert.equal(out.length, SDK_MAX_STACK)
  assert.ok(out.endsWith('…'))
})
