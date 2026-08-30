// The weld between the scales and the approved stylesheet they claim to be derived from.
//
// `scales.ts` states a `uses` count beside every step. A count nothing checks is decoration — and
// this epic's whole subject is numbers that were written down, reasoned about as intent, and turned
// out to be unreproducible. So every one is re-counted here from `reference.css`, which is itself
// generated verbatim from the approved prototype and CI-diffed.
//
// What this makes impossible:
//   · a step that the approved design does not actually use
//   · a `uses` count that has drifted from the stylesheet
//   · a size cited by the MEASURED contract that is not a step of the type scale
//   · an off-scale value that quietly gets adopted without appearing in OFF_SCALE_SPACE

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_STEPS, OFF_SCALE_SPACE, SPACE, TYPE, WEIGHT } from './scales.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REFERENCE = readFileSync(join(HERE, 'reference.css'), 'utf8')

/**
 * How many px VALUES the approved stylesheet writes for a family of properties.
 *
 * ⚠️ Counts every value in a declaration, not just the first. `padding: 11px 14px` is two spacing
 * decisions, and a scale has to cover both — an earlier version took only the leading value, which
 * disagreed with the counts in `scales.ts` and made this test fail on its first run. That failure
 * was the point: the numbers in that file had been measured one way and asserted another, which is
 * the same class of defect as a contract number nobody can reproduce. This extraction is now the
 * single definition, and `scales.ts`'s counts are derived from it.
 */
function countPx(pattern: RegExp): Map<number, number> {
  const counts = new Map<number, number>()
  for (const declaration of REFERENCE.match(pattern) ?? []) {
    for (const raw of declaration.match(/[\d.]+px/g) ?? []) {
      const value = Number(raw.replace('px', ''))
      if (Number.isNaN(value)) continue
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return counts
}

const FONT_SIZES = countPx(/font-size:[\d.]+px/g)
const WEIGHTS = new Map<number, number>(
  Object.entries(
    (REFERENCE.match(/font-weight:\d+/g) ?? []).reduce<Record<string, number>>((acc, m) => {
      const w = m.replace('font-weight:', '')
      acc[w] = (acc[w] ?? 0) + 1
      return acc
    }, {})
  ).map(([w, c]) => [Number(w), c])
)
const SPACES = countPx(/(?:padding|margin|gap)[a-z-]*:[^;}]+/g)

test('the stylesheet the scales are derived from is not empty', () => {
  // A parser that finds nothing turns every count below into `0 === 0`. Pinned so a change to
  // `extract-css.mjs`'s output shape fails HERE, loudly, rather than by asserting nothing.
  assert.ok(REFERENCE.length > 20000, 'reference.css is too small to be the approved stylesheet')
  assert.ok(FONT_SIZES.size >= 15, 'too few distinct font sizes — the parser is not matching')
  assert.ok(SPACES.size >= 15, 'too few distinct spacing values — the parser is not matching')
})

test('every type step is a size the approved design actually uses, at the stated count', () => {
  for (const [name, step] of Object.entries(TYPE)) {
    const actual = FONT_SIZES.get(step.px)
    assert.ok(actual, `TYPE.${name} is ${step.px}px, which the approved stylesheet never declares`)
    assert.equal(
      step.uses,
      actual,
      `TYPE.${name} claims ${step.uses} uses of ${step.px}px; the stylesheet has ${actual}`
    )
  }
})

test('every weight step is a weight the approved design actually declares', () => {
  for (const [name, step] of Object.entries(WEIGHT)) {
    const actual = WEIGHTS.get(step.px)
    assert.ok(actual, `WEIGHT.${name} is ${step.px}, which the approved stylesheet never declares`)
    assert.equal(step.uses, actual, `WEIGHT.${name} claims ${step.uses} uses; found ${actual}`)
  }

  // ⚠️ And 400 is deliberately absent. If the stylesheet ever declares it, that is a design change
  // and the scale should gain a step — not silently disagree with the design.
  assert.equal(
    WEIGHTS.get(400),
    undefined,
    'the approved stylesheet now declares font-weight 400; WEIGHT has no step for it'
  )
})

test('every space step is a value the approved design actually uses, at the stated count', () => {
  for (const [name, step] of Object.entries(SPACE)) {
    const actual = SPACES.get(step.px)
    assert.ok(actual, `SPACE.${name} is ${step.px}px, which the approved stylesheet never uses`)
    assert.equal(step.uses, actual, `SPACE.${name} claims ${step.uses} uses; found ${actual}`)
  }
})

test('the off-scale spacing list is complete and honest', () => {
  // ⚠️ THE FINDING, pinned. The approved design's spacing is not on a scale, and this asserts that
  // the record of that is accurate — both directions. A value that stops being used should leave the
  // list (it is a debt register, not a graveyard), and a NEW off-scale value must be added
  // deliberately rather than appearing silently.
  // `Set<number>`, not the literal union `as const satisfies` infers — `.has(someNumber)` is a
  // lookup, not a narrowing, and the inferred type makes it a type error rather than a false answer.
  const onScale = new Set<number>(Object.values(SPACE).map((step) => step.px))
  const recorded = new Set(OFF_SCALE_SPACE.map((entry) => entry.px))

  for (const [px, uses] of SPACES) {
    if (onScale.has(px)) continue
    // Only values that carry real weight are tracked; a one-off is noise, not a debt.
    if (uses < 5) continue
    assert.ok(
      recorded.has(px),
      `${px}px is used ${uses}× in the approved design, is not a scale step, and is not in OFF_SCALE_SPACE`
    )
  }

  for (const entry of OFF_SCALE_SPACE) {
    const actual = SPACES.get(entry.px)
    assert.ok(actual, `OFF_SCALE_SPACE lists ${entry.px}px, which the stylesheet no longer uses`)
    assert.equal(entry.uses, actual, `${entry.px}px claims ${entry.uses} uses; found ${actual}`)
    assert.ok(
      !onScale.has(entry.px),
      `${entry.px}px is listed as off-scale AND is a step of SPACE — one of the two is wrong`
    )
  }
})

test('every size the MEASURED contract cites is a step of the type scale', () => {
  // The two documents have to agree about what sizes exist. `MEASURED-SPEC.md` is measured from the
  // rendered prototype; `scales.ts` is derived from its stylesheet. A size in the contract that is
  // not a step means the scale is missing something the design demonstrably renders.
  const spec = readFileSync(join(HERE, 'MEASURED-SPEC.md'), 'utf8')
  const cited = new Set<number>()
  for (const line of spec.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim())
    if (cells.length !== 7 || cells[0] !== '') continue
    const size = /^([\d.]+) \/ \d+$/.exec(cells[2])?.[1]
    if (size) cited.add(Number(size))
  }
  assert.ok(cited.size >= 8, 'parsed too few sizes out of MEASURED-SPEC.md')

  const steps = new Set<number>(Object.values(TYPE).map((step) => step.px))
  for (const size of cited) {
    assert.ok(
      steps.has(size),
      `the measured contract renders ${size}px and the type scale has no step for it`
    )
  }
})

test('no two steps of a scale share a value', () => {
  // Two names for one number is how a scale stops being one — a builder picks whichever reads
  // better and the two drift apart in meaning while staying equal in px.
  for (const scale of ['TYPE', 'SPACE', 'RADIUS']) {
    const steps = ALL_STEPS.filter((step) => step.scale === scale)
    const seen = new Map<number, string>()
    for (const step of steps) {
      const other = seen.get(step.px)
      assert.equal(other, undefined, `${scale}.${step.name} and ${scale}.${other} are both ${step.px}px`)
      seen.set(step.px, step.name)
    }
  }
})
