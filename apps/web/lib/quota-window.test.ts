// multi-tenant-activation · Sprint 2, Story 2.2 — fast unit layer for the quota window maths.
//
// The module's own header names the exact bug this file exists to prevent: flooring Date.now() by
// "milliseconds in this month" lands the window on an arbitrary multiple of that duration since the
// Unix epoch, not on the calendar 1st — a bug an HTTP-level spec could never see, because the
// counter still counts, just against the wrong bucket, and every quota resets on a wandering date
// matching no calendar. These tests pin the window to an actual calendar boundary, including the
// December → January rollover the module comment calls out explicitly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthWindowStart, monthWindowEnd, MAX_TRACK_PAYLOAD_BYTES } from './quota-window.ts'

test('monthWindowStart resolves to midnight UTC on the 1st of the given month', () => {
  const now = new Date('2026-07-24T15:42:07.123Z')
  const start = monthWindowStart(now)
  assert.equal(start.toISOString(), '2026-07-01T00:00:00.000Z')
})

test('monthWindowStart is stable across every day/time within the same month', () => {
  const first = monthWindowStart(new Date('2026-07-01T00:00:00.001Z'))
  const last = monthWindowStart(new Date('2026-07-31T23:59:59.999Z'))
  assert.equal(first.toISOString(), last.toISOString())
})

test('monthWindowStart does NOT land on an arbitrary multiple of the month length since epoch', () => {
  // The exact bug this module's header warns about: flooring Date.now() by a fixed millisecond
  // duration instead of by calendar month. Pick a date where "days since epoch" is not divisible
  // by 30/31 and assert the result is still calendar-anchored to day 1, not some other day.
  const now = new Date('2027-02-15T03:00:00.000Z')
  const start = monthWindowStart(now)
  assert.equal(start.getUTCDate(), 1)
  assert.equal(start.getUTCMonth(), 1) // February, 0-indexed
})

test('monthWindowEnd rolls a normal month over to the 1st of the next month', () => {
  const start = new Date('2026-07-01T00:00:00.000Z')
  assert.equal(monthWindowEnd(start).toISOString(), '2026-08-01T00:00:00.000Z')
})

test('monthWindowEnd normalizes December into January of the following year (no special case needed)', () => {
  const start = new Date('2026-12-01T00:00:00.000Z')
  assert.equal(monthWindowEnd(start).toISOString(), '2027-01-01T00:00:00.000Z')
})

test('monthWindowEnd - monthWindowStart round trip: a quota window has strictly positive duration', () => {
  for (const iso of ['2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2028-02-01T00:00:00.000Z']) {
    const start = monthWindowStart(new Date(iso))
    const end = monthWindowEnd(start)
    assert.ok(end.getTime() > start.getTime())
  }
})

test('monthWindowStart defaults to "now" when called with no argument', () => {
  const before = Date.now()
  const start = monthWindowStart()
  const after = Date.now()
  assert.ok(start.getTime() <= before)
  assert.ok(start.getTime() <= after)
  assert.equal(start.getUTCDate(), 1)
})

test('MAX_TRACK_PAYLOAD_BYTES is 64 KiB', () => {
  assert.equal(MAX_TRACK_PAYLOAD_BYTES, 64 * 1024)
})
