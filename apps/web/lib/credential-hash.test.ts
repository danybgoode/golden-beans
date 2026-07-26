import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashCredential } from './credential-hash.ts'

// One function hashes every credential in `api_keys.key_hash` — ingest keys and share tokens alike.
// The first attempt at this coverage was a test asserting that lib/api-keys.ts's `hashApiKey` and a
// separate share-token hasher AGREED. It could not run: api-keys.ts imports 'server-only', and a
// unit test dies on load the moment it touches such a module (Roadmap/LEARNINGS.md).
//
// The obstacle produced the better design. Both modules now delegate here, so there is no second
// implementation to drift — "they agree" became "there is only one", which needs no test at all.
// What is left worth pinning is the construction itself.

test('hashCredential is sha256-hex, pinned against known vectors', () => {
  // A swapped algorithm would invalidate every credential already stored — every ingest key in
  // production and every share link ever handed out — and would surface as an unexplained wave of
  // 401s rather than as a failure anyone could trace back to this line.
  assert.equal(hashCredential('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(
    hashCredential(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  )
})

test('the hash is deterministic, fixed-width, and not the input', () => {
  const secret = 'gb_key_something-secret'
  assert.equal(hashCredential(secret), hashCredential(secret))
  assert.equal(hashCredential(secret).length, 64)
  assert.match(hashCredential(secret), /^[0-9a-f]{64}$/)
  assert.notEqual(hashCredential(secret), secret)
})

test('one changed character changes the hash', () => {
  assert.notEqual(hashCredential('gbs_aaaa'), hashCredential('gbs_aaab'))
})
