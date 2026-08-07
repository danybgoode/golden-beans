// Story 3.2 — the arithmetic behind the bars. Two rules here decide what a reader concludes, and
// neither is visible from the component: a small non-zero stage must still LOOK like something, and
// a genuine zero must still look like nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { barHeightPercent, dropOffLabel } from './funnel-geometry.ts'

test('the tallest stage fills the plot', () => {
  assert.equal(barHeightPercent(1000, 1000), 100)
})

test('a tiny but real stage is still visibly a bar', () => {
  // 3 retained out of 10,000 targeted is 0.03% — a hairline. "Almost nobody" must not render
  // identically to "nobody"; that is the same failure as an unreadable figure showing as 0, in
  // pixels rather than in type.
  assert.equal(barHeightPercent(3, 10_000), 4)
  assert.ok(barHeightPercent(1, 1_000_000) > 0)
})

test('a genuine zero renders at zero — flooring it would invent users', () => {
  assert.equal(barHeightPercent(0, 1000), 0)
})

test('a degenerate scale never produces a bar rather than NaN', () => {
  assert.equal(barHeightPercent(5, 0), 0)
  assert.equal(barHeightPercent(Number.NaN, 100), 0)
  assert.equal(barHeightPercent(5, Number.NaN), 0)
  assert.equal(barHeightPercent(-5, 100), 0)
})

test('drop-off is null, never a number, when there is nothing to compare against', () => {
  // A ratio against zero or against an unreadable stage is undefined. Printing "0%" there would be
  // inventing a measurement — the same rule stat-figures.ts applies to an undefined rate.
  assert.equal(dropOffLabel(null, 50), null)
  assert.equal(dropOffLabel(50, null), null)
  assert.equal(dropOffLabel(0, 0), null)
  assert.equal(dropOffLabel(Number.NaN, 10), null)
})

test('drop-off reports what SURVIVED, and the wording says so', () => {
  assert.equal(dropOffLabel(1000, 250), '25% of previous')
  assert.equal(dropOffLabel(1000, 1000), '100% of previous')
  // A real total loss IS reportable — it is measured, unlike the cases above.
  assert.equal(dropOffLabel(1000, 0), '0% of previous')
})
