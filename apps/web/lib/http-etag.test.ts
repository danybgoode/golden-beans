import test from 'node:test'
import assert from 'node:assert/strict'
import { ifNoneMatchIncludes } from './http-etag.ts'

test('If-None-Match accepts exact, weak, list and wildcard validators', () => {
  const etag = '"gbsc-7"'
  assert.equal(ifNoneMatchIncludes(etag, etag), true)
  assert.equal(ifNoneMatchIncludes(`W/${etag}`, etag), true)
  assert.equal(ifNoneMatchIncludes(`"old", W/${etag}`, etag), true)
  assert.equal(ifNoneMatchIncludes('*', etag), true)
})

test('If-None-Match rejects missing, malformed and different validators', () => {
  const etag = '"gbsc-7"'
  assert.equal(ifNoneMatchIncludes(null, etag), false)
  assert.equal(ifNoneMatchIncludes('', etag), false)
  assert.equal(ifNoneMatchIncludes('"gbsc-8"', etag), false)
  assert.equal(ifNoneMatchIncludes('W/gbsc-7', etag), false)
})
