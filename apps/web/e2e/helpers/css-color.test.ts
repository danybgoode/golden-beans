// The parser decides what two browser specs can SEE, so it is tested directly — including the two
// serialisations that do not appear in Chromium today but are legal, and which would have made one
// of those specs pass while the thing it asserts was false.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrastRatio, isOpaque, parseCssColor } from './css-color.ts'

test('the legacy comma form, with and without alpha', () => {
  assert.deepEqual(parseCssColor('rgb(22, 18, 13)'), { r: 22, g: 18, b: 13, a: 1 })
  assert.deepEqual(parseCssColor('rgba(22, 18, 13, 0.72)'), { r: 22, g: 18, b: 13, a: 0.72 })
})

// The finding. A space-separated form split on commas yields ONE part, fewer than four components,
// and the old check concluded "opaque" — a silent false pass on a translucency assertion.
test('the space-separated Level 4 form is not mistaken for opaque', () => {
  assert.deepEqual(parseCssColor('rgb(22 18 13)'), { r: 22, g: 18, b: 13, a: 1 })
  assert.deepEqual(parseCssColor('rgb(22 18 13 / 0.72)'), { r: 22, g: 18, b: 13, a: 0.72 })
  assert.equal(isOpaque('rgb(22 18 13 / 0.72)'), false)
  assert.equal(isOpaque('rgba(22, 18, 13, 0.72)'), false)
  assert.equal(isOpaque('rgb(22 18 13)'), true)
})

test('color(srgb …) — what color-mix() computes to', () => {
  const c = parseCssColor('color(srgb 0.086 0.071 0.051)')
  assert.equal(Math.round(c.r), 22)
  assert.equal(c.a, 1)
  assert.equal(isOpaque('color(srgb 0.086 0.071 0.051 / 0.72)'), false)
  assert.equal(isOpaque('color(srgb 0.086 0.071 0.051)'), true)
})

// A parser that returns a default for an unknown input is how a guard stops guarding.
test('an unrecognised value throws rather than guessing', () => {
  for (const bad of [
    '',
    'not a colour',
    'hsl(20 30% 40%)',
    'rgb(1, 2)',
    // Fail-closed means REJECTING malformed input, not parsing the first three numbers out of it.
    'rgb(1, 2, 3, 4, 5)',
    'color(srgb 0.1 0.2 0.3 0.4)',
    'rgba(1, 2, 3, 7)',
    'rgb(1 2 3 / 2)',
    'rgb(1 2 3 / -1)',
  ]) {
    assert.throws(() => parseCssColor(bad), /unparsed/, `${bad} must throw`)
  }
  assert.deepEqual(parseCssColor('transparent'), { r: 0, g: 0, b: 0, a: 0 })
})

test('contrast ratio matches the WCAG anchors', () => {
  // Black on white is the definitional 21:1; a colour against itself is 1:1.
  assert.equal(Math.round(contrastRatio('rgb(0, 0, 0)', 'rgb(255, 255, 255)')), 21)
  assert.equal(contrastRatio('rgb(120, 120, 120)', 'rgb(120, 120, 120)'), 1)
  // ...and it is symmetric, so a spec cannot get a different answer by argument order.
  assert.equal(
    contrastRatio('rgb(184, 168, 136)', 'rgb(36, 29, 20)'),
    contrastRatio('rgb(36, 29, 20)', 'rgb(184, 168, 136)')
  )
})
