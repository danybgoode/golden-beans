// The geometry every chart primitive draws with — pure, and zero-import on purpose.
//
// ── Why this is a module and not arithmetic inside the components ─────────────────────────────
// CODE-QUALITY #5: "a rule that only exists inside a server component can only be tested by
// rendering the page." Every rule DD4 states is a rule about a NUMBER — the 4px floor, one hue for
// magnitude, a series too short to be a line — so every one of them is a function here with a test
// beside it, rather than a `style={{ width: … }}` expression nobody can assert.
//
// `lib/funnel-geometry.ts` is the direct precedent (`app-shell-and-agent-rail`), and this is its
// generalisation. It is not replaced: `FunnelBars` still imports it, and `barHeightPercent` still
// scales the Command Center funnel. What is here is the shape the approved states need that it has
// no equivalent for — a line path, an interval around zero, a two-way split, a day column.
//
// ── The one rule that has to survive every reading of this file ───────────────────────────────
// **An absent number is not a zero, and a zero is not an absence.** Every function here that can be
// handed nothing returns a NAMED state rather than a number, and the components render a word for
// it. That is the same rule `lib/stat-figures.ts` enforces for stat cards, applied to pictures —
// and a picture is where it is easiest to break, because a bar of length zero and a bar that could
// not be drawn look identical.

/**
 * The smallest a nonzero fill may render, in CSS pixels.
 *
 * DD4, stated as arithmetic: *"A nonzero value never rounds to zero pixels. 3 failures of 1,843
 * draws under a pixel and reads as 'nothing failed'."* A percentage cannot express that on its own,
 * because the pixel it becomes depends on the track's width — so the floor lives in the stylesheet
 * as a `min-width`/`min-height` on the fill, and this constant is what `charts.test.ts` asserts the
 * stylesheet against. Two things that must agree get one definition (CODE-QUALITY #2).
 *
 * The complement matters as much: a fill is **not rendered at all** when the value is zero. If a
 * zero-value fill existed, the floor would give it four pixels and invent the very reading the
 * floor is there to prevent.
 */
export const MIN_VISIBLE_PX = 4

/** A single reading. `date` is whatever label belongs on the axis; nothing here parses it. */
export type SeriesPoint = { date: string; value: number }

/**
 * Why a series cannot be drawn as a line — or `ok`, when it can.
 *
 * `too_short` is the state **L2** is about. `attributed_revenue` on production `miyagisanchez` has
 * exactly one recorded value. Drawing one point as a horizontal stroke says *"flat, steady"*, which
 * is a claim about a trend that nobody measured — the picture equivalent of an unreadable value
 * rendering as `0`.
 */
export type SeriesState = 'empty' | 'too_short' | 'ok'

export function seriesState(series: readonly SeriesPoint[]): SeriesState {
  if (series.length === 0) return 'empty'
  if (series.length < 2) return 'too_short'
  return 'ok'
}

/**
 * A value as a percentage of the largest in its set.
 *
 * Guarded the same way `lib/funnel-geometry.ts` guards its arithmetic, and for the same reason: a
 * non-finite input must not become `NaN%`, which is a number-shaped nothing that CSS silently drops
 * — leaving a full-width bar (the track) that reads as 100%.
 *
 * Returns `null` when there is nothing to scale against, so a caller must decide what to render
 * rather than receiving a plausible `0`.
 */
export function sharePercent(value: number, max: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(max)) return null
  if (max <= 0) return null
  if (value <= 0) return 0
  return Math.min(100, (value / max) * 100)
}

/** The largest finite value in a set, or `null` when the set has none to compare. */
export function largest(values: readonly (number | null)[]): number | null {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (finite.length === 0) return null
  return Math.max(...finite)
}

// ── The line path ─────────────────────────────────────────────────────────────────────────────

export type LinePath = {
  /** The `d` of the line itself. */
  line: string
  /** The `d` of the filled area beneath it, closed along the baseline. */
  area: string
  /** Where the last reading sits, for the endpoint dot. */
  endpoint: { x: number; y: number }
  /** The value domain actually drawn, so a caller can label it. */
  domain: { min: number; max: number }
}

/**
 * A series as an SVG path in a `viewBox` of `width × height`.
 *
 * ⚠️ **Returns `null` for a series that is not a line** — fewer than two points, or any non-finite
 * value. A caller that receives `null` renders the `too_short` / `empty` word, never a stroke.
 *
 * ⚠️ **A flat series is drawn flat, deliberately.** When every value is equal the vertical span is
 * zero, and dividing by it would produce `NaN` for every point. The fallback is a span of 1, which
 * puts the whole series on the baseline — and that is *correct*: several equal readings really are
 * steady, which is a different statement from one reading, and only the first is a measurement.
 */
export function linePath(
  series: readonly SeriesPoint[],
  width: number,
  height: number,
  pad: number
): LinePath | null {
  if (series.length < 2) return null
  const values = series.map((point) => point.value)
  if (!values.every((value) => Number.isFinite(value))) return null
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= pad * 2 || height <= pad * 2) {
    return null
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (index: number) => pad + index * ((width - pad * 2) / (series.length - 1))
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2)

  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`)
  const line = `M${points.join('L')}`
  const lastIndex = series.length - 1
  return {
    line,
    area: `${line}L${x(lastIndex).toFixed(1)},${(height - pad).toFixed(1)}L${pad.toFixed(1)},${(height - pad).toFixed(1)}Z`,
    endpoint: { x: Number(x(lastIndex).toFixed(1)), y: Number(y(values[lastIndex]).toFixed(1)) },
    domain: { min, max },
  }
}

// ── The interval around zero ──────────────────────────────────────────────────────────────────

export type IntervalGeometry = {
  /** Where "no difference" sits on the track, as a percentage from the left. */
  zeroPercent: number
  /** The interval's left edge and width, as percentages of the track. */
  startPercent: number
  widthPercent: number
  /** The point estimate's position. */
  pointPercent: number
  /** Whether the interval contains zero — the whole reason the picture exists. */
  crossesZero: boolean
}

/**
 * An interval placed on a track that always contains zero.
 *
 * Zero has to be on the track whatever the interval does, because the single question this picture
 * answers is *"does the range include no-difference?"* — and a track that starts at the interval's
 * own low bound cannot show that. So the domain is `[min(low, 0), max(high, 0)]`, padded outward by
 * a tenth so an interval that only just clears zero does not touch the edge.
 *
 * ⚠️ `crossesZero` is computed on the VALUES, never on the geometry. Reading it off the pixels
 * would make a rounding decision into a statistical claim.
 *
 * Returns `null` on a degenerate domain — a non-finite bound, or `high < low`, which is a caller
 * bug rather than a datum and must not be drawn as an inside-out bar.
 */
export function intervalGeometry(low: number, high: number, point: number): IntervalGeometry | null {
  if (![low, high, point].every((value) => Number.isFinite(value))) return null
  if (high < low) return null

  const rawMin = Math.min(low, 0)
  const rawMax = Math.max(high, 0)
  const pad = (rawMax - rawMin) * 0.1 || 1
  const min = rawMin - pad
  const max = rawMax + pad
  const span = max - min
  const at = (value: number) => ((value - min) / span) * 100

  return {
    zeroPercent: at(0),
    startPercent: at(low),
    widthPercent: at(high) - at(low),
    pointPercent: at(Math.min(Math.max(point, low), high)),
    crossesZero: low <= 0 && high >= 0,
  }
}

// ── The two-way split ─────────────────────────────────────────────────────────────────────────

export type SplitGeometry = {
  okPercent: number
  failedPercent: number
  /** True when a nonzero failure count is small enough to need the floor to be seen at all. */
  failedNeedsFloor: boolean
}

/**
 * Held versus failed, as two widths that sum to 100.
 *
 * This is DD4's worked example: *"3 failures of 1,843 draws"* is 0.16% — under a pixel on any track
 * a console renders, and therefore indistinguishable from "nothing failed". `failedNeedsFloor` says
 * so out loud so the component can put the exact count beside the bar rather than relying on a
 * sliver nobody can see.
 *
 * Returns `null` when nothing was sent: zero requests is not a 0% failure rate, it is an absence,
 * and this is exactly the distinction `lib/stat-figures.ts` exists to keep.
 */
export function splitGeometry(ok: number, failed: number): SplitGeometry | null {
  if (!Number.isFinite(ok) || !Number.isFinite(failed)) return null
  if (ok < 0 || failed < 0) return null
  const total = ok + failed
  if (total === 0) return null
  const failedPercent = (failed / total) * 100
  return {
    okPercent: (ok / total) * 100,
    failedPercent,
    // 1% of a 1180px content column is ~12px, comfortably visible; below that the exact count is
    // the only thing carrying the fact. The threshold is a rendering judgement, not a statistic,
    // and it is here rather than in CSS so it can be asserted.
    failedNeedsFloor: failed > 0 && failedPercent < 1,
  }
}

// ── The sequential shade ramp ─────────────────────────────────────────────────────────────────

/**
 * The four steps of the magnitude ramp, as token names — light to dark, ONE hue.
 *
 * DD4: *"Magnitude → `--gold` alone, light to dark. Never a rainbow."* Exposed as an ordered list
 * of custom-property names rather than as colours, so `check-design-drift.mjs`'s raw-hex rule keeps
 * applying and there is no second place a colour is written down.
 *
 * ⚠️ The prototype's third step is a literal `#c79a2c`, which is the one colour in the approved
 * design that is not a token. It is expressed here as `--gold-mid`, declared once in `system.css`
 * beside the ramp — a raw hex in a `.tsx` is what the drift guard bans, and rightly.
 */
export const MAGNITUDE_RAMP = ['--gold-hot', '--gold', '--gold-mid', '--gold-deep'] as const

/** The ramp step for position `index` in an ordered set, clamped to the darkest. */
export function magnitudeShade(index: number): (typeof MAGNITUDE_RAMP)[number] {
  if (!Number.isFinite(index) || index < 0) return MAGNITUDE_RAMP[0]
  return MAGNITUDE_RAMP[Math.min(Math.floor(index), MAGNITUDE_RAMP.length - 1)]
}
