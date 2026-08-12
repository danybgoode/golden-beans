import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { weekOverWeek, type DailyPoint } from './week-over-week.ts'

/** `days(n, v)` → n consecutive days, each worth `v`. Dates ascend from 2026-01-01. */
function days(count: number, value: number, startDay = 1): DailyPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-01-${String(startDay + i).padStart(2, '0')}`,
    value,
  }))
}

test('an empty series has nothing to report', () => {
  assert.equal(weekOverWeek([]), null)
})

test('a full 14 days compares the two weeks', () => {
  // 7 days at 10 (=70), then 7 days at 20 (=140). 140 vs 70 is +100%.
  const result = weekOverWeek([...days(7, 10, 1), ...days(7, 20, 8)])
  assert.equal(result?.lastSum, 140)
  assert.equal(result?.current, 20)
  assert.equal(result?.wow, 1)
})

test('a flat 14-day series reports no change, not a spike', () => {
  const result = weekOverWeek(days(14, 5))
  assert.equal(result?.wow, 0)
})

// ── The regression this module was extracted for (cross-family review of PR #92) ───────────────
// A 10-day series: `slice(-7)` gives 7 days, `slice(-14, -7)` gives only 3, because -14 clamps to
// 0 while -7 resolves to index 3. The original implementation divided the two sums regardless and
// reported a perfectly flat series as +133% growth, on a public page, next to the claim that its
// numbers are independently checkable.
test('a partial prior week reports no trend rather than a fabricated one', () => {
  const flat = days(10, 3)
  const result = weekOverWeek(flat)

  assert.equal(result?.wow, null, 'a 10-day series cannot support a week-over-week comparison')

  // Pin the exact number the old implementation produced, so this test fails loudly if anyone
  // reintroduces the unguarded division: 7 days x 3 = 21 against 3 days x 3 = 9 → +133%.
  const lastSum = flat.slice(-7).reduce((s, p) => s + p.value, 0)
  const priorSum = flat.slice(-14, -7).reduce((s, p) => s + p.value, 0)
  assert.equal(lastSum, 21)
  assert.equal(priorSum, 9)
  assert.ok(Math.abs((lastSum - priorSum) / priorSum - 4 / 3) < 1e-9)
})

test('every length from 8 to 13 refuses to compare', () => {
  for (let length = 8; length <= 13; length += 1) {
    assert.equal(weekOverWeek(days(length, 4))?.wow, null, `${length} days is not two comparable weeks`)
  }
})

test('exactly 14 days is the first length that can compare', () => {
  assert.equal(weekOverWeek(days(13, 4))?.wow, null)
  assert.equal(weekOverWeek(days(14, 4))?.wow, 0)
})

test('a prior week of zeros yields no percentage, because every change from zero is infinite', () => {
  const result = weekOverWeek([...days(7, 0, 1), ...days(7, 9, 8)])
  assert.equal(result?.wow, null)
  assert.equal(result?.lastSum, 63)
})

test('the series is sorted before it is sliced, so input order cannot change the answer', () => {
  const ordered = [...days(7, 10, 1), ...days(7, 20, 8)]
  const shuffled = [...ordered].reverse()
  assert.deepEqual(weekOverWeek(shuffled), weekOverWeek(ordered))
})

test('current is the most recent day, not the largest', () => {
  const series = [...days(13, 100, 1), { date: '2026-01-14', value: 1 }]
  assert.equal(weekOverWeek(series)?.current, 1)
})
