import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateShareToken, looksLikeShareToken, SHARE_TOKEN_PREFIX } from './share-token.ts'
import { hashCredential } from './credential-hash.ts'

test('a generated token is prefixed, long, and never repeats', () => {
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) {
    const t = generateShareToken()
    assert.ok(t.startsWith(SHARE_TOKEN_PREFIX))
    // 32 random bytes in base64url ⇒ 43 characters. Asserting the FLOOR rather than the exact
    // length so a future widening does not fail a test that was never about the exact number.
    assert.ok(t.length >= SHARE_TOKEN_PREFIX.length + 43, `too short: ${t.length}`)
    assert.equal(seen.has(t), false, 'generateShareToken repeated a value')
    seen.add(t)
  }
})

test('the plaintext is not recoverable from what gets stored', () => {
  const t = generateShareToken()
  const stored = hashCredential(t)
  assert.notEqual(stored, t)
  assert.equal(stored.length, 64)
  assert.equal(stored.includes(t.slice(SHARE_TOKEN_PREFIX.length)), false)
})

test('looksLikeShareToken sheds obvious non-tokens without pretending to be a check', () => {
  assert.equal(looksLikeShareToken(generateShareToken()), true)
  for (const bad of ['', 'gbs_', 'gbs_short', 'gb_key_abc', null, undefined, 42, {}, ['gbs_x']]) {
    assert.equal(looksLikeShareToken(bad), false, `${JSON.stringify(bad)} should not pass`)
  }
  // And the property that matters most: a well-formed GUESS passes it. This is a load-shedder, and
  // the test says so out loud, so nobody later mistakes it for the security control.
  assert.equal(looksLikeShareToken(`${SHARE_TOKEN_PREFIX}${'a'.repeat(43)}`), true)
})
