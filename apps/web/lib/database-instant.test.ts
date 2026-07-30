import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizeDatabaseInstant } from './database-instant.ts'

test('canonicalizes the PostgREST UTC-offset form for strict wire contracts', () => {
  assert.equal(
    canonicalizeDatabaseInstant('2026-07-30T01:06:19.934305+00:00'),
    '2026-07-30T01:06:19.934Z'
  )
})

test('normalizes non-UTC offsets to canonical UTC', () => {
  assert.equal(
    canonicalizeDatabaseInstant('2026-07-30T06:06:19.934+05:00'),
    '2026-07-30T01:06:19.934Z'
  )
})

test('leaves malformed and non-string values for the contract parser to reject', () => {
  assert.equal(canonicalizeDatabaseInstant('not-an-instant'), 'not-an-instant')
  assert.equal(canonicalizeDatabaseInstant('Jan 1 2026'), 'Jan 1 2026')
  assert.equal(canonicalizeDatabaseInstant('2026-07-30'), '2026-07-30')
  assert.equal(canonicalizeDatabaseInstant(null), null)
  assert.equal(canonicalizeDatabaseInstant(1_785_373_579_934), 1_785_373_579_934)
})
