// Story 3.1's acceptance, asserted where it is provable: an UNREADABLE figure and a REAL ZERO must
// never render the same way. This repo shipped the opposite once, and LEARNINGS records the class
// four times — a query that silently requires a tag nobody sets returns an honest-looking zero, and
// a zero pages nobody.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { northStarFigure, rateFigure } from './stat-figures.ts'

test('a recorded ZERO is a value, not an empty state', () => {
  const figure = northStarFigure({ metric: 'payable_sellers', inputCount: 2, latestValue: 0 })
  assert.equal(figure.value, '0')
  // The value is present, so the card renders a number. This is the case that must NOT be confused
  // with any of the three below.
  assert.notEqual(figure.value, null)
})

test('the three kinds of nothing are three different sentences, and none of them is a number', () => {
  const noMetric = northStarFigure(null)
  const unreadable = northStarFigure({
    metric: null,
    inputCount: null,
    latestValue: null,
    unavailable: true,
  })
  const neverRecorded = northStarFigure({ metric: 'payable_sellers', inputCount: 3, latestValue: null })

  for (const figure of [noMetric, unreadable, neverRecorded]) {
    assert.equal(figure.value, null, 'a nothing must never carry a value')
    assert.ok(figure.caveat && String(figure.caveat).length > 0, 'a null value must say which nothing')
  }

  // And they are genuinely distinct — a single "no data" sentence for all three would be the same
  // collapse in prose that a zero is in numbers.
  const sentences = new Set([noMetric.caveat, unreadable.caveat, neverRecorded.caveat])
  assert.equal(sentences.size, 3)

  // Each names its own cause rather than borrowing a neighbour's.
  assert.match(String(noMetric.caveat), /no north star metric is registered/i)
  assert.match(String(unreadable.caveat), /failed query|could not be read/i)
  assert.match(String(neverRecorded.caveat), /no value has been recorded|no reading/i)
})

test('a caveat supplied upstream wins over the local fallback', () => {
  // lib/pod-outcome.ts already writes the sentence for these two states; re-writing it here would
  // be two implementations of one message, drifting the first time either is edited.
  const figure = northStarFigure({
    metric: null,
    inputCount: null,
    latestValue: null,
    unavailable: true,
    caveat: 'upstream sentence',
  })
  assert.equal(figure.caveat, 'upstream sentence')
})

test('an undefined RATE is not 0% — the denominator being zero is not a failure to convert', () => {
  const noTargets = rateFigure(null, 'adoption')
  assert.equal(noTargets.value, null)
  assert.match(String(noTargets.caveat), /not a 0% adoption rate/i)

  const noAdopters = rateFigure(null, 'retention')
  assert.equal(noAdopters.value, null)
  assert.match(String(noAdopters.caveat), /not a 0% retention rate/i)

  // ...and a genuine 0% — a thousand targeted, none adopted — is a real, alarming measurement that
  // must reach the screen as a number.
  const realZero = rateFigure(0, 'adoption')
  assert.equal(realZero.value, '0%')
})

test('the rate is ROUNDED, not truncated', () => {
  // Pinned because 0.62 → "62%" is satisfied by Math.floor as well as Math.round, so the existing
  // assertion could not tell them apart (fresh-reviewer finding). 5/8 = 0.625 is the real fixture
  // the browser smoke drives, and it is exactly the value the two disagree on.
  assert.equal(rateFigure(0.625, 'adoption').value, '63%')
  assert.equal(rateFigure(0.624, 'adoption').value, '62%')
  assert.equal(rateFigure(0.4, 'retention').value, '40%')
})

test('a non-finite rate is a nothing, never "NaN%"', () => {
  // A number-shaped nothing is the worst output this module can produce: it looks like a
  // measurement and is not one. Guarded here for the same reason charts/geometry.ts guards its
  // arithmetic, even though pod-outcome.ts' rate() already returns null for these.
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const figure = rateFigure(bad, 'adoption')
    assert.equal(figure.value, null)
    assert.ok(figure.caveat)
  }
})

test('a readable rate still carries the registry-declared caveat', () => {
  // Targeted/adopted/retained count the events a tenant MAPPED to each stage. Every other surface
  // in this product says so, and the front door is the last place that should quietly disappear.
  assert.match(String(rateFigure(0.62, 'adoption').caveat), /registry-declared/i)
  assert.equal(rateFigure(0.62, 'adoption').value, '62%')
})
