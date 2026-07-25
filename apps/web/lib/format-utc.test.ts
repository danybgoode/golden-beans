// Fast unit layer for the fail-safe UTC timestamp formatter.
//
// The module's own comment states the property directly: "a bad historical row cannot crash a
// dashboard." That means the interesting cases are the malformed ones — an unparseable string, an
// empty string — which must degrade to UNKNOWN_UTC_TIME rather than throwing or rendering
// "Invalid Date" straight into the UI. The valid-input case pins the exact "YYYY-MM-DD HH:MM UTC"
// shape: minute precision, seconds and milliseconds dropped, "T" replaced with a space.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatUtc, UNKNOWN_UTC_TIME } from './format-utc.ts'

test('formats a valid ISO timestamp as "YYYY-MM-DD HH:MM UTC"', () => {
  assert.equal(formatUtc('2026-07-24T10:15:30.123Z'), '2026-07-24 10:15 UTC')
})

test('drops seconds and milliseconds — minute precision only', () => {
  assert.equal(formatUtc('2026-07-24T10:15:00.000Z'), '2026-07-24 10:15 UTC')
  assert.equal(formatUtc('2026-07-24T10:15:59.999Z'), '2026-07-24 10:15 UTC')
})

test('a non-UTC-offset ISO input is normalized to UTC before formatting', () => {
  // 10:15 in +05:00 is 05:15 UTC.
  assert.equal(formatUtc('2026-07-24T10:15:00.000+05:00'), '2026-07-24 05:15 UTC')
})

test('a bare date (no time component) still formats, at midnight', () => {
  assert.equal(formatUtc('2026-07-24'), '2026-07-24 00:00 UTC')
})

test('an unparseable string falls back to UNKNOWN_UTC_TIME rather than throwing', () => {
  assert.equal(formatUtc('not-a-date'), UNKNOWN_UTC_TIME)
})

test('an empty string falls back to UNKNOWN_UTC_TIME', () => {
  assert.equal(formatUtc(''), UNKNOWN_UTC_TIME)
})

test('whitespace-only input falls back to UNKNOWN_UTC_TIME', () => {
  assert.equal(formatUtc('   '), UNKNOWN_UTC_TIME)
})

test('a raw epoch-millisecond string (not ISO 8601) falls back to UNKNOWN_UTC_TIME', () => {
  // Date.parse does not accept a bare numeric string as epoch millis — this pins that formatUtc
  // inherits that strictness rather than silently accepting a different timestamp shape.
  assert.equal(formatUtc('1690000000000'), UNKNOWN_UTC_TIME)
})

test('the literal string "Invalid Date" falls back to UNKNOWN_UTC_TIME', () => {
  assert.equal(formatUtc('Invalid Date'), UNKNOWN_UTC_TIME)
})

test('UNKNOWN_UTC_TIME is a stable, human-readable sentinel', () => {
  assert.equal(UNKNOWN_UTC_TIME, 'Unknown time')
})
