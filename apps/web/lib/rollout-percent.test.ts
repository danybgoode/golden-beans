// flags-visual-rule-builder · Sprint 1, Story 1.1 — the highest-consequence arithmetic in the epic.
//
// D3: percent is a display unit, basis points are the stored unit, and the conversion lives in
// exactly one place. A misplaced factor of 100 here is a silent targeting error on a production
// flag — the flag saves, the page looks right, and ten times too many users get the variant. No
// type-checker catches it and no integration test notices, because 1000 and 100000 are both just
// numbers. That is why this file asserts the boundaries rather than a happy path.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  basisPointsToPercent,
  formatRolloutPercent,
  percentToBasisPoints,
  rolloutBarPercent,
} from './rollout-percent.ts'

test('the epic-defining case: 10 percent is 1000 basis points', () => {
  // Sprint 1's smoke walkthrough step 4 is this number and nothing else. Not 10, not 100000.
  assert.equal(percentToBasisPoints(10), 1000)
  assert.equal(basisPointsToPercent(1000), 10)
})

test('both ends of the range are exact', () => {
  assert.equal(percentToBasisPoints(0), 0)
  assert.equal(percentToBasisPoints(100), 10_000)
  assert.equal(basisPointsToPercent(0), 0)
  assert.equal(basisPointsToPercent(10_000), 100)
})

test('one basis point is the smallest representable rollout, and it is not zero', () => {
  // 0.01% is a real, expressible targeting decision — the parser accepts basisPoints: 1. Rounding
  // it to 0 would turn "the smallest possible canary" into "nobody" without saying so.
  assert.equal(percentToBasisPoints(0.01), 1)
  assert.equal(basisPointsToPercent(1), 0.01)
})

test('one percent is one hundred basis points, not one', () => {
  // The literal off-by-100 this seam exists to prevent, asserted as its own case.
  assert.equal(percentToBasisPoints(1), 100)
  assert.equal(basisPointsToPercent(100), 1)
})

test('fifty percent is half, in both directions', () => {
  assert.equal(percentToBasisPoints(50), 5_000)
  assert.equal(basisPointsToPercent(5_000), 50)
})

test('the round trip is stable for every value a PM can type', () => {
  // Two decimal places is exactly the precision basis points can hold. Anything this seam accepts
  // must survive a save-and-reopen unchanged — smoke step 5's "the round-trip is symmetric".
  for (const percent of [0, 0.01, 0.5, 1, 7.25, 10, 33.33, 50, 99.99, 100]) {
    const basisPoints = percentToBasisPoints(percent)
    assert.notEqual(basisPoints, null, `${percent}% should be representable`)
    assert.equal(basisPointsToPercent(basisPoints as number), percent)
  }
})

test('rounding is half-up and documented, never a silent truncation', () => {
  // Below basis-point precision the value HAS to move. What must not happen is a silent floor:
  // 0.019% floors to 0 (a canary that reaches nobody) but rounds to 2bp. The direction is a
  // decision, so it is pinned here rather than inherited from whichever operator got typed.
  assert.equal(percentToBasisPoints(0.014), 1)
  assert.equal(percentToBasisPoints(0.015), 2)
  assert.equal(percentToBasisPoints(0.019), 2)
  assert.equal(percentToBasisPoints(33.335), 3334)
})

test('an out-of-range percent is rejected, not clamped', () => {
  // Clamping 150% to 100% would silently agree with a PM who meant something else. The parser
  // rejects >10000 basis points server-side (D2); this seam must not pre-emptively launder an
  // input into something the parser would have caught.
  assert.equal(percentToBasisPoints(-1), null)
  assert.equal(percentToBasisPoints(101), null)
  assert.equal(percentToBasisPoints(1000), null)
})

test('a non-finite or missing percent is rejected rather than coerced', () => {
  // An empty number input reads as NaN. CODE-QUALITY rule 7: fail loud, never substitute.
  assert.equal(percentToBasisPoints(Number.NaN), null)
  assert.equal(percentToBasisPoints(Number.POSITIVE_INFINITY), null)
  assert.equal(percentToBasisPoints(Number.NEGATIVE_INFINITY), null)
})

test('basis points outside the stored range are refused, not displayed', () => {
  // basisPointsToPercent is fed from stored definitions. A value outside 0-10000 means the row
  // disagrees with the parser that wrote it; rendering "150%" would present corruption as data.
  assert.equal(basisPointsToPercent(-1), null)
  assert.equal(basisPointsToPercent(10_001), null)
  assert.equal(basisPointsToPercent(1.5), null)
  assert.equal(basisPointsToPercent(Number.NaN), null)
})

test('the display label carries its unit and never leaks basis points', () => {
  // Sprint 2's mutation check: make the diff report a rollout change in basis points and this
  // goes red. Every label in the epic renders through here, so there is one place to break.
  assert.equal(formatRolloutPercent(1000), '10%')
  assert.equal(formatRolloutPercent(10_000), '100%')
  assert.equal(formatRolloutPercent(0), '0%')
  assert.equal(formatRolloutPercent(1), '0.01%')
  assert.equal(formatRolloutPercent(750), '7.5%')
})

test('a rollout that is absent is not a rollout of zero', () => {
  // Sprint 2, Story 2.1: "a flag with no rollout set renders a full bar and says so; it does not
  // render an empty bar that reads as 0%." Undefined and 0 are opposite meanings — everyone and
  // nobody — so the seam refuses to render one as the other. CODE-QUALITY rule 8.
  assert.equal(formatRolloutPercent(undefined), 'everyone')
  assert.equal(formatRolloutPercent(null), 'everyone')
})

test('an uninterpretable stored value is labelled unreadable, never guessed', () => {
  assert.equal(formatRolloutPercent(10_001), 'unreadable')
  assert.equal(formatRolloutPercent(Number.NaN), 'unreadable')
})

test('the bar and its label agree about what is unreadable', () => {
  // Cross-review (Codex): rolloutBarPercent used to return 0 for a corrupt stored value while
  // formatRolloutPercent called the same value "unreadable" — so one half of the component drew an
  // empty bar meaning "reaching nobody" while the other half said it could not read the number.
  // Corrupt data must never render as a deliberate 0% rollout. The two are pinned together here.
  for (const corrupt of [10_001, -1, 1.5, Number.NaN]) {
    assert.equal(rolloutBarPercent(corrupt), null, `${corrupt} should be unreadable, not a bar`)
    assert.equal(formatRolloutPercent(corrupt), 'unreadable')
  }
})

test('an unset rollout fills the bar, matching its "everyone" label', () => {
  assert.equal(rolloutBarPercent(undefined), 100)
  assert.equal(rolloutBarPercent(null), 100)
  assert.equal(formatRolloutPercent(undefined), 'everyone')
})

test('a real rollout draws the percent it says', () => {
  assert.equal(rolloutBarPercent(1000), 10)
  assert.equal(rolloutBarPercent(0), 0)
  assert.equal(rolloutBarPercent(10_000), 100)
})
