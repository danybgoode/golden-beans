// The fourteen-day served series — design-system-rails · Sprint 5, Story 5.3.
//
// ⚠️ **This file is NEW, and `computeTars` itself still has no unit test.** Its coverage is
// `e2e/tars.spec.ts`, an API-level spec against a seeded tenant, which is a reasonable home for
// funnel arithmetic that only means anything against real ingest. The series below is different in
// the way that matters here: every one of its rules is about a SHAPE the chart depends on — an
// empty day that must be present, a window that must not fold its edges, a malformed timestamp that
// must not become a bucket — and each is a one-line change away from a chart that looks right and
// says something false. Those belong where they can be asserted directly, with no database.
//
// Adding `computeTars`' own unit layer is out of this sprint's scope and is stated rather than
// quietly implied by the filename.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeServedDaily } from './tars.ts'

// ── design-system-rails · Sprint 5, Story 5.3 — the fourteen-day served series ────────────────

test('every day in the window is present, including the empty ones', () => {
  // The gap IS the signal: "if this drops to zero without anybody turning it off, something upstream
  // stopped asking." A series that omitted its empty days would draw a row of roughly equal bars
  // over a feature that stopped being served a week ago.
  const asOf = new Date('2026-08-27T12:00:00.000Z')
  const series = computeServedDaily(
    [
      { userId: 'a', event: 'x', createdAt: '2026-08-27T01:00:00.000Z' },
      { userId: 'b', event: 'x', createdAt: '2026-08-27T09:00:00.000Z' },
      { userId: 'a', event: 'x', createdAt: '2026-08-25T09:00:00.000Z' },
    ],
    5,
    asOf
  )
  assert.deepEqual(series, [
    { date: '2026-08-23', value: 0 },
    { date: '2026-08-24', value: 0 },
    { date: '2026-08-25', value: 1 },
    { date: '2026-08-26', value: 0 },
    { date: '2026-08-27', value: 2 },
  ])
})

test('it counts EVENTS, not distinct users — which is a different number on the same page', () => {
  // Two events from one person is two servings. The funnel three inches above answers the distinct-
  // users question; two numbers under two labels is information, two numbers under one is a bug.
  const series = computeServedDaily(
    [
      { userId: 'a', event: 'x', createdAt: '2026-08-27T01:00:00.000Z' },
      { userId: 'a', event: 'x', createdAt: '2026-08-27T02:00:00.000Z' },
      { userId: 'a', event: 'y', createdAt: '2026-08-27T03:00:00.000Z' },
    ],
    1,
    new Date('2026-08-27T23:00:00.000Z')
  )
  assert.deepEqual(series, [{ date: '2026-08-27', value: 3 }])
})

test('events outside the window are not folded into its edges', () => {
  // The first bar must not silently become "everything before this", which is the shape a naive
  // clamp produces and which reads as a spike on the oldest day.
  const series = computeServedDaily(
    [
      { userId: 'a', event: 'x', createdAt: '2026-01-01T00:00:00.000Z' },
      { userId: 'a', event: 'x', createdAt: '2026-08-27T00:00:00.000Z' },
    ],
    3,
    new Date('2026-08-27T10:00:00.000Z')
  )
  assert.deepEqual(
    series.map((day) => day.value),
    [0, 0, 1]
  )
})

test('a malformed timestamp neither throws nor inflates a real day', () => {
  // ⚠️ **This assertion was weaker than its own name until it was mutation-checked.** It read "never
  // bucketed under an invalid day", and bucketing one under the literal key `Invalid` left it GREEN
  // — the window loop only ever reads real dates, so an unreachable bucket changes no output. The
  // claim was true and unfalsifiable, which is the guard-that-cannot-fail class this epic is named
  // after, found in my own diff.
  //
  // Both mutations that matter DO go red now:
  //   · dropping the guard (`new Date(iso).toISOString()`) throws RangeError — a bad historical row
  //     taking down the whole page, which is exactly what `lib/format-utc.ts` exists to prevent;
  //   · falling back to "today" inflates a real day by the number of malformed rows.

  const series = computeServedDaily(
    [
      { userId: 'a', event: 'x', createdAt: 'not a date' },
      { userId: 'b', event: 'x', createdAt: '' },
      { userId: 'c', event: 'x', createdAt: '2026-08-27T00:00:00.000Z' },
    ],
    2,
    new Date('2026-08-27T10:00:00.000Z')
  )
  // The ONE readable event lands on its own day, and the two malformed ones land nowhere — not on
  // `asOf`, which is where a fallback would put them.
  assert.deepEqual(series, [
    { date: '2026-08-26', value: 0 },
    { date: '2026-08-27', value: 1 },
  ])
  // ...and no key that is not a date reached the output.
  for (const day of series) assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/)
  // The totals must account for exactly the readable events — this is the half that catches a
  // fallback, because a bucketed malformed row would make it 3.
  assert.equal(
    series.reduce((total, day) => total + day.value, 0),
    1,
    'a malformed timestamp was counted into a real day'
  )
})

test('the window is bounded and always produces at least one day', () => {
  const asOf = new Date('2026-08-27T10:00:00.000Z')
  assert.equal(computeServedDaily([], 14, asOf).length, 14)
  // A zero or negative window is a caller bug; one day is a legible answer, an empty chart is not.
  assert.equal(computeServedDaily([], 0, asOf).length, 1)
  assert.equal(computeServedDaily([], -5, asOf).length, 1)
  assert.equal(computeServedDaily([], 3.7, asOf).length, 3)
})

test('an empty project renders fourteen honest zeroes rather than nothing', () => {
  // A feature nobody has served is not a feature with no chart. `DayColumns` draws the zero days in
  // the inert token, which is a different statement from "there is no series".
  const series = computeServedDaily([], 14, new Date('2026-08-27T10:00:00.000Z'))
  assert.equal(series.length, 14)
  assert.ok(series.every((day) => day.value === 0))
  assert.equal(series[0].date, '2026-08-14')
  assert.equal(series[13].date, '2026-08-27')
})
