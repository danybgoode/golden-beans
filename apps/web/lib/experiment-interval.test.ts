// The significance layer, asserted — design-system-rails · Sprint 5, Story 5.4 (epic DA2).
//
// ⚠️ **This is a number people will make ship / no-ship decisions on**, which is why it is a pure
// module with its own tests rather than arithmetic inside a page. The reference values below were
// computed INDEPENDENTLY (Python, `math.log` / `math.exp`, the same z) and are pinned to ten
// decimal places — a test that recomputed the interval with the implementation's own formula would
// assert only that the code agrees with itself.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTERVAL_UNAVAILABLE_WORDS,
  relativeLiftInterval,
  type IntervalUnavailable,
} from './experiment-interval.ts'

const arm = (convertedSubjects: number, exposedSubjects: number) => ({ convertedSubjects, exposedSubjects })

/** Ten decimal places. Anything looser would pass on a subtly wrong variance term. */
function close(actual: number, expected: number, what: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${what}: expected ${expected}, got ${actual} (Δ ${Math.abs(actual - expected)})`
  )
}

test('a clear win reproduces the independently computed interval, and excludes zero', () => {
  const result = relativeLiftInterval(arm(575, 6120), arm(676, 6088))
  assert.ok(result.ok)
  close(result.lift, 0.181831686, 'lift')
  close(result.low, 0.0636287673, 'low')
  close(result.high, 0.313170701, 'high')
  assert.equal(result.crossesZero, false)
  assert.equal(result.confidence, 0.95)
})

test('a small sample produces a range that CROSSES zero, and says so', () => {
  // The `experiment-blocked` case: a real positive point estimate whose range still includes "no
  // difference". The page must never call this a difference, and `crossesZero` is what stops it.
  const result = relativeLiftInterval(arm(156, 410), arm(160, 388))
  assert.ok(result.ok)
  close(result.lift, 0.0837959292, 'lift')
  close(result.low, -0.0868809263, 'low')
  close(result.high, 0.2863750741, 'high')
  assert.equal(result.crossesZero, true)
})

test('a treatment that is WORSE gives a negative interval, entirely below zero', () => {
  // A guardrail metric moving the wrong way is the single most consequential thing this can report,
  // and an implementation that took an absolute value somewhere would still look plausible.
  const result = relativeLiftInterval(arm(600, 6000), arm(500, 6000))
  assert.ok(result.ok)
  close(result.lift, -0.1666666667, 'lift')
  close(result.low, -0.2558257988, 'low')
  close(result.high, -0.0668254243, 'high')
  assert.equal(result.crossesZero, false)
  assert.ok(result.high < 0, 'a worse treatment must not produce an interval reaching above zero')
})

test('identical arms give a lift of exactly zero and a range that contains it', () => {
  const result = relativeLiftInterval(arm(500, 5000), arm(500, 5000))
  assert.ok(result.ok)
  close(result.lift, 0, 'lift')
  close(result.low, -0.1109464767, 'low')
  close(result.high, 0.1247916731, 'high')
  assert.equal(result.crossesZero, true)
})

test('the point estimate always lies inside its own interval', () => {
  // The property a reader assumes without being told, and the one a sign error breaks silently.
  const cases: [number, number, number, number][] = [
    [575, 6120, 676, 6088],
    [156, 410, 160, 388],
    [600, 6000, 500, 6000],
    [1, 10, 9, 10],
    [9, 10, 1, 10],
    [3, 1000, 4000, 5000],
  ]
  for (const [c1, n1, c2, n2] of cases) {
    const result = relativeLiftInterval(arm(c1, n1), arm(c2, n2))
    assert.ok(result.ok, `${c1}/${n1} vs ${c2}/${n2} was not computable`)
    assert.ok(
      result.low <= result.lift && result.lift <= result.high,
      `${c1}/${n1} vs ${c2}/${n2}: ${result.lift} is outside [${result.low}, ${result.high}]`
    )
    assert.ok(result.low <= result.high, 'the interval is inside out')
    // A lift can never be below −100%: you cannot lose more than all of the baseline.
    assert.ok(result.low > -1, `the lower bound ${result.low} is below −100%, which is impossible`)
  }
})

test('swapping the arms inverts the direction, and never the width in log space', () => {
  // A ratio interval is symmetric on the LOG scale, not the linear one — so the two intervals are
  // reciprocals rather than mirror images. Asserting the linear mirror would be asserting a
  // property this method does not have, which is how a "fix" gets made to correct code.
  const forward = relativeLiftInterval(arm(575, 6120), arm(676, 6088))
  const reversed = relativeLiftInterval(arm(676, 6088), arm(575, 6120))
  assert.ok(forward.ok && reversed.ok)
  assert.ok(forward.lift > 0 && reversed.lift < 0, 'swapping the arms did not flip the direction')
  close(Math.log(1 + forward.low) + Math.log(1 + reversed.high), 0, 'log-space symmetry (low/high)')
  close(Math.log(1 + forward.high) + Math.log(1 + reversed.low), 0, 'log-space symmetry (high/low)')
})

test('more data narrows the interval', () => {
  // The one sanity property that catches a variance term with `n` and `c` transposed, which is the
  // easiest possible mistake here and produces entirely plausible numbers.
  const small = relativeLiftInterval(arm(50, 500), arm(60, 500))
  const large = relativeLiftInterval(arm(5000, 50_000), arm(6000, 50_000))
  assert.ok(small.ok && large.ok)
  close(small.lift, large.lift, 'the two cases must have the same point estimate')
  assert.ok(
    large.high - large.low < small.high - small.low,
    'a hundred times the data did not narrow the interval'
  )
})

// ── The degenerate cases, each with its own NAME ──────────────────────────────────────────────

test('every degenerate input returns a named reason, never a number', () => {
  const cases: [string, ReturnType<typeof arm>, ReturnType<typeof arm>, IntervalUnavailable][] = [
    ['nobody exposed in control', arm(0, 0), arm(10, 100), 'no_exposure'],
    ['nobody exposed in treatment', arm(10, 100), arm(0, 0), 'no_exposure'],
    // ⚠️ Two SEPARATE reasons, because they are two separate situations. A control that converted
    // nobody makes any lift infinite; a treatment that converted nobody is a real result with no
    // upper bound. Both are "no interval", and a reader needs to know which.
    ['control converted nobody', arm(0, 100), arm(10, 100), 'control_never_converted'],
    ['treatment converted nobody', arm(10, 100), arm(0, 100), 'treatment_never_converted'],
    ['a NaN count', arm(Number.NaN, 100), arm(10, 100), 'not_a_number'],
    ['an infinite exposure', arm(10, Number.POSITIVE_INFINITY), arm(10, 100), 'not_a_number'],
    ['a negative count', arm(-1, 100), arm(10, 100), 'not_a_number'],
  ]
  for (const [what, control, treatment, reason] of cases) {
    const result = relativeLiftInterval(control, treatment)
    assert.equal(result.ok, false, `${what} produced a number`)
    assert.equal(result.ok === false && result.reason, reason, what)
  }
})

test('no reachable input produces a non-finite bound', () => {
  // The property the renderer depends on: a bar of undefined width is the one output this module
  // exists to make impossible. Swept over the boundary shapes rather than argued in a comment.
  const counts = [0, 1, 2, 5, 100, 10_000]
  for (const n1 of counts) {
    for (const c1 of counts.filter((c) => c <= n1)) {
      for (const n2 of counts) {
        for (const c2 of counts.filter((c) => c <= n2)) {
          const result = relativeLiftInterval(arm(c1, n1), arm(c2, n2))
          if (!result.ok) continue
          for (const [name, value] of [
            ['lift', result.lift],
            ['low', result.low],
            ['high', result.high],
          ] as const) {
            assert.ok(
              Number.isFinite(value),
              `${c1}/${n1} vs ${c2}/${n2} produced a non-finite ${name}: ${value}`
            )
          }
        }
      }
    }
  }
})

test('an interval pinned exactly AT zero still counts as crossing it', () => {
  // ⚠️ **Added because a mutation check found this gap.** Flipping `crossesZero` from `<= 0 && >= 0`
  // to `< 0 && > 0` left all eleven tests green: Katz never returns a bound of exactly 0 for
  // ordinary inputs, so no case exercised the boundary. But it is reachable — when BOTH arms convert
  // everyone, the variance term `(1−p)/c` is 0 in both halves, the half-width is 0, and the interval
  // collapses to the single point 0.
  //
  // With the exclusive form the page would then say "the range excludes no difference, so the
  // difference is real" about two arms that performed identically. Inclusive is the right reading and
  // this is what pins it.
  const result = relativeLiftInterval(arm(100, 100), arm(100, 100))
  assert.ok(result.ok)
  close(result.lift, 0, 'lift')
  close(result.low, 0, 'low')
  close(result.high, 0, 'high')
  assert.equal(result.crossesZero, true, 'an interval that IS zero must include no-difference')
})

test('a 100% conversion rate is computable and does not divide by zero', () => {
  // `(1 − p)/c` is 0 for an arm that converted everyone — finite, and a known weakness of this
  // method rather than an error. It must produce a number, and the module's header says the
  // interval is optimistic there.
  const result = relativeLiftInterval(arm(100, 100), arm(50, 100))
  assert.ok(result.ok)
  assert.ok(Number.isFinite(result.low) && Number.isFinite(result.high))
  close(result.lift, -0.5, 'lift')
})

test('every reason has a sentence, and every sentence has a reason', () => {
  // A registry that outlives the code it describes reads as coverage. Both directions, so an added
  // reason with no sentence and a sentence for a reason nobody returns both fail here.
  const reasons: IntervalUnavailable[] = [
    'no_exposure',
    'control_never_converted',
    'treatment_never_converted',
    'not_a_number',
  ]
  assert.deepEqual(Object.keys(INTERVAL_UNAVAILABLE_WORDS).sort(), [...reasons].sort())
  for (const reason of reasons) {
    assert.ok(
      INTERVAL_UNAVAILABLE_WORDS[reason].length > 40,
      `${reason} has no sentence a reader could act on`
    )
    // Never the raw enum on a page — the same rule sprint contract #9 states for blockers.
    assert.ok(
      !INTERVAL_UNAVAILABLE_WORDS[reason].includes('_'),
      `${reason}'s sentence leaks an enum value at a reader`
    )
  }
})
