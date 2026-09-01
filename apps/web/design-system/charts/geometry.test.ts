// The geometry, asserted. Every rule DD4 states is a number, so every one is a test.
//
// ── What this file is defending ───────────────────────────────────────────────────────────────
// The epic's premise is that nothing could go red on a page that looked wrong. A chart is the
// sharpest version of that: a bar of the wrong length is still a bar, an unreadable series drawn as
// a flat line is still a line, and a failure count too small to see still renders as a green bar
// that says everything held. None of those throws, none of those is a type error, and none of those
// is visible in a screenshot somebody glances at.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAGNITUDE_RAMP,
  MIN_VISIBLE_PX,
  intervalGeometry,
  largest,
  linePath,
  magnitudeShade,
  seriesState,
  sharePercent,
  splitGeometry,
} from './geometry.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const SYSTEM_CSS = readFileSync(join(HERE, '..', 'system.css'), 'utf8')

const point = (date: string, value: number) => ({ date, value })

// ── seriesState — the distinction L2 is about ────────────────────────────────────────────────

test('a series of one point is too short to be a line, and that is not the same as empty', () => {
  assert.equal(seriesState([]), 'empty')
  assert.equal(seriesState([point('2026-07-06', 4200)]), 'too_short')
  assert.equal(seriesState([point('2026-07-06', 4200), point('2026-07-07', 4300)]), 'ok')
})

test('linePath refuses to draw a series it cannot draw', () => {
  assert.equal(linePath([], 200, 30, 3), null)
  assert.equal(linePath([point('a', 1)], 200, 30, 3), null)
  // Production `attributed_revenue` is exactly this shape: one reading, on 2026-07-06. A stroke
  // here would say "steady", which is a claim about a trend nobody measured.
  assert.equal(linePath([point('2026-07-06', 1)], 200, 30, 3), null)
  assert.equal(linePath([point('a', Number.NaN), point('b', 2)], 200, 30, 3), null)
  assert.equal(linePath([point('a', 1), point('b', Number.POSITIVE_INFINITY)], 200, 30, 3), null)
  // A viewBox with no room inside its own padding is a caller bug, not a datum.
  assert.equal(linePath([point('a', 1), point('b', 2)], 4, 30, 3), null)
})

test('linePath draws a flat series flat, rather than dividing by a zero span', () => {
  const flat = linePath([point('a', 5), point('b', 5), point('c', 5)], 100, 20, 2)
  assert.ok(flat)
  assert.ok(!flat.line.includes('NaN'), `a zero span leaked into the path: ${flat.line}`)
  assert.equal(flat.domain.min, 5)
  assert.equal(flat.domain.max, 5)
})

test('linePath puts the first point at the left pad and the last at the right pad', () => {
  const path = linePath([point('a', 0), point('b', 10)], 100, 20, 2)
  assert.ok(path)
  assert.equal(path.line, 'M2.0,18.0L98.0,2.0')
  assert.deepEqual(path.endpoint, { x: 98, y: 2 })
  // The area closes along the baseline, so it never floats above the axis.
  assert.ok(path.area.endsWith('L2.0,18.0Z'), path.area)
})

// ── sharePercent — the guard `lib/funnel-geometry.ts` taught us to write ─────────────────────

test('sharePercent never returns a number it cannot justify', () => {
  assert.equal(sharePercent(50, 100), 50)
  assert.equal(sharePercent(0, 100), 0)
  // Nothing to scale against is an absence, not a 0% share.
  assert.equal(sharePercent(5, 0), null)
  assert.equal(sharePercent(5, -1), null)
  assert.equal(sharePercent(Number.NaN, 100), null)
  assert.equal(sharePercent(5, Number.NaN), null)
  // A value above its own max is a data bug; clamping keeps it inside the track rather than
  // painting over the page.
  assert.equal(sharePercent(150, 100), 100)
})

test('largest ignores the unreadable rather than treating it as zero', () => {
  assert.equal(largest([1, null, 9, 3]), 9)
  assert.equal(largest([null, null]), null)
  assert.equal(largest([]), null)
  // A series of unreadable values must not resolve to a max of 0, which would make every bar full.
  assert.equal(largest([null, Number.NaN]), null)
})

// ── The 4px floor — DD4's worked example, end to end ─────────────────────────────────────────

test('a nonzero value never rounds to zero pixels: the floor is declared, once, in the stylesheet', () => {
  // The floor cannot be a percentage — the pixel a percentage becomes depends on the track. So it
  // lives in CSS as a min-width, and this is the weld that stops the two drifting (CODE-QUALITY #2).
  assert.match(
    SYSTEM_CSS,
    new RegExp(`\\.ds-chart-fill\\b[^}]*min-width:\\s*${MIN_VISIBLE_PX}px`, 's'),
    `system.css must give .ds-chart-fill a min-width of ${MIN_VISIBLE_PX}px — DD4's 4px floor`
  )
  assert.match(
    SYSTEM_CSS,
    new RegExp(`\\.ds-chart-col\\b[^}]*min-height:\\s*${MIN_VISIBLE_PX}px`, 's'),
    `system.css must give .ds-chart-col a min-height of ${MIN_VISIBLE_PX}px — the same rule, vertically`
  )
})

test('splitGeometry names the case where the failure bar is too small to be seen', () => {
  // DD4, literally: 3 failures of 1,843 draws.
  const tiny = splitGeometry(1840, 3)
  assert.ok(tiny)
  assert.equal(tiny.failedNeedsFloor, true)
  assert.ok(tiny.failedPercent > 0, 'three failures is not zero percent')

  const plain = splitGeometry(90, 10)
  assert.ok(plain)
  assert.equal(plain.failedNeedsFloor, false)
  assert.equal(plain.okPercent, 90)
  assert.equal(plain.failedPercent, 10)

  // A clean run needs no floor, because there is nothing to floor.
  const clean = splitGeometry(2400, 0)
  assert.ok(clean)
  assert.equal(clean.failedNeedsFloor, false)
  assert.equal(clean.failedPercent, 0)
})

test('splitGeometry refuses to turn "nothing was sent" into "nothing failed"', () => {
  // The drill that has never run. A 0/0 split is an absence; rendering it as 100% held would be the
  // most dangerous possible reading of an untested control.
  assert.equal(splitGeometry(0, 0), null)
  assert.equal(splitGeometry(-1, 0), null)
  assert.equal(splitGeometry(Number.NaN, 3), null)
})

// ── The interval ──────────────────────────────────────────────────────────────────────────────

test('the interval track always contains zero, whichever side the interval is on', () => {
  const above = intervalGeometry(0.062, 0.304, 0.181)
  assert.ok(above)
  assert.ok(above.zeroPercent > 0 && above.zeroPercent < 100, 'no-difference fell off the track')
  assert.equal(above.crossesZero, false)

  const below = intervalGeometry(-0.4, -0.1, -0.25)
  assert.ok(below)
  assert.ok(below.zeroPercent > 0 && below.zeroPercent < 100, 'no-difference fell off the track')
  assert.equal(below.crossesZero, false)

  const crossing = intervalGeometry(-0.091, 0.278, 0.084)
  assert.ok(crossing)
  assert.equal(crossing.crossesZero, true)
  assert.ok(crossing.startPercent < crossing.zeroPercent)
  assert.ok(crossing.startPercent + crossing.widthPercent > crossing.zeroPercent)
})

test('crossesZero is read off the values, never off the pixels', () => {
  // An interval whose low bound is a hair above zero does NOT cross it, even though the two round
  // to the same pixel on any track a browser renders. A rounding decision must not become a
  // statistical claim.
  const hair = intervalGeometry(0.0000001, 0.5, 0.25)
  assert.ok(hair)
  assert.equal(hair.crossesZero, false)
  // And an interval that touches zero exactly DOES cross it — "includes no difference" is inclusive.
  const touching = intervalGeometry(0, 0.5, 0.25)
  assert.ok(touching)
  assert.equal(touching.crossesZero, true)
})

test('the point estimate stays inside its own interval', () => {
  // A point outside its bounds is a caller bug. Clamping keeps the dot on the bar rather than
  // floating somewhere that implies a reading nobody produced.
  const geometry = intervalGeometry(0.1, 0.2, 0.9)
  assert.ok(geometry)
  assert.ok(geometry.pointPercent <= geometry.startPercent + geometry.widthPercent + 1e-9)
})

test('intervalGeometry refuses a degenerate domain rather than drawing it inside out', () => {
  assert.equal(intervalGeometry(0.5, 0.1, 0.3), null)
  assert.equal(intervalGeometry(Number.NaN, 1, 0.5), null)
  assert.equal(intervalGeometry(0, Number.POSITIVE_INFINITY, 0.5), null)
  // A zero-width interval at zero is degenerate in the DOMAIN but not in the data — the pad
  // fallback keeps the track from collapsing.
  const pinned = intervalGeometry(0, 0, 0)
  assert.ok(pinned)
  assert.ok(Number.isFinite(pinned.zeroPercent))
})

// ── The ramp ──────────────────────────────────────────────────────────────────────────────────

test('magnitude is ONE hue, light to dark, and every step is a declared token', () => {
  assert.deepEqual([...MAGNITUDE_RAMP], ['--gold-hot', '--gold', '--gold-mid', '--gold-deep'])
  assert.equal(magnitudeShade(0), '--gold-hot')
  assert.equal(magnitudeShade(3), '--gold-deep')
  // A fifth stage is the darkest step again, never a fifth hue (DD4: never a rainbow).
  assert.equal(magnitudeShade(9), '--gold-deep')
  assert.equal(magnitudeShade(-1), '--gold-hot')
  assert.equal(magnitudeShade(Number.NaN), '--gold-hot')

  // Every step must actually be declared, or a bar paints with an unresolved var() — which renders
  // as nothing at all, silently, because an undefined custom property has no error path.
  for (const token of MAGNITUDE_RAMP) {
    assert.match(
      SYSTEM_CSS + readFileSync(join(HERE, '..', 'tokens.css'), 'utf8'),
      new RegExp(`${token}\\s*:`),
      `${token} is on the magnitude ramp and is declared nowhere`
    )
  }
})
