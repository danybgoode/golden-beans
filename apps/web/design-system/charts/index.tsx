// The chart primitives — hand-rolled SVG and CSS on the token set. No dependency (epic D7).
//
// ── What audit §2.3 found, and what this closes ───────────────────────────────────────────────
// *"Zero data visualization anywhere in `/app`, and no chart library installed."* Every number in
// the product is a table row. That is the finding; these are the six shapes the approved states
// need, and `apps/web/package.json` is untouched.
//
// ── The rule that shapes every component here ─────────────────────────────────────────────────
// **A picture is the easiest place to say something untrue.** A bar of length zero and a bar that
// could not be drawn look identical; one reading drawn as a line says "steady"; three failures in
// 1,843 draws paints under a pixel and reads as "nothing failed". So every component below takes an
// explicit unreadable case and renders a WORD for it, and every geometric decision is a function in
// `./geometry.ts` with a test beside it rather than an expression inside a `style` attribute.
//
// ── Why inline `style` is legal here, checked rather than assumed ─────────────────────────────
// `check-design-drift.mjs` applies its inline-style ban to `VOICE_AND_STYLE_ROOTS` only —
// `components/landing`, `components/methodology`, `app/methodology` (verified at the lock, epic D7).
// A bar's length is computed geometry, not a colour drifting away from the tokens. Every COLOUR
// below is a `var()` naming a token the stylesheet declares; nothing here picks one.

import type { ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  type SeriesPoint,
  intervalGeometry,
  largest,
  linePath,
  magnitudeShade,
  seriesState,
  sharePercent,
  splitGeometry,
} from './geometry'

/** A count, with the thousands separator every stat in this console uses. */
function count(value: number): string {
  return value.toLocaleString('en-US')
}

/**
 * The word a chart renders instead of a picture it cannot honestly draw.
 *
 * Text, not an empty frame: a reader has to be able to tell *"nothing was measured"* from *"the
 * measurement is zero"*, and an empty plot area says the second one.
 */
export function ChartUnreadable({ children }: { children: ReactNode }) {
  return <p className="ds-chart-unreadable">{children}</p>
}

// ── Stage bars ────────────────────────────────────────────────────────────────────────────────

export type Stage = {
  label: string
  /** `null` when this stage could not be read — rendered as a word, never as an empty bar. */
  value: number | null
  /** Optional: what fraction of the first stage this is, when the caller has already computed it. */
  sharePercent?: number | null
  /** Optional: how many did not continue from the previous stage, with its own percentage. */
  dropped?: { count: number; percent: number } | null
}

/**
 * An ordered set of stages as horizontal bars — a funnel, a journey, a TARS triple.
 *
 * **One hue, light to dark by position (DD4).** The shade comes from `magnitudeShade`, whose ramp is
 * four token names; a fifth stage repeats the darkest rather than reaching for a fifth colour.
 *
 * Bars scale against the LARGEST stage rather than a fixed ceiling, so the shape of the drop-off is
 * what a reader sees — the same choice `components/ui/FunnelBars.tsx` makes, and this does not
 * replace it: that one still renders the Command Center's vertical funnel.
 */
export function StageBars({
  stages,
  size = 'full',
  note,
}: {
  stages: Stage[]
  size?: 'full' | 'slim'
  note?: ReactNode
}) {
  const max = largest(stages.map((stage) => stage.value))

  return (
    <figure className="ds-chart">
      <div className="ds-chart-bars">
        {stages.map((stage, index) => {
          const share = stage.value === null || max === null ? null : sharePercent(stage.value, max)
          const declared = stage.sharePercent
          return (
            <div key={stage.label}>
              <div className="ds-chart-bar-head">
                <span className="ds-chart-bar-name">
                  {stages.length > 2 ? <span className="ds-chart-stagenum">{index + 1}</span> : null}
                  {stage.label}
                </span>
                <span className="ds-chart-num">
                  {stage.value === null ? 'unreadable' : count(stage.value)}
                  {declared === null || declared === undefined ? null : ` · ${Math.round(declared)}%`}
                </span>
              </div>
              <div className="ds-chart-track" data-size={size}>
                {/* ⚠️ No fill element at all when the value is zero or unreadable. The stylesheet
                    gives every fill a 4px floor, so a zero-value fill would be given four pixels
                    and would invent the reading the floor exists to prevent. */}
                {share === null || share === 0 ? null : (
                  <div
                    className="ds-chart-fill"
                    style={{ width: `${share.toFixed(1)}%`, background: `var(${magnitudeShade(index)})` }}
                  />
                )}
              </div>
              {stage.dropped ? (
                <p className="ds-chart-drop">
                  <span className="ds-chart-drop-mark" aria-hidden="true">
                    <Icon name="arrow-down" size={12} />
                  </span>
                  {count(stage.dropped.count)} did not continue ({Math.round(stage.dropped.percent)}%)
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      {note ? <figcaption className="ds-chart-note">{note}</figcaption> : null}
    </figure>
  )
}

// ── Control vs treatment ──────────────────────────────────────────────────────────────────────

export type ComparisonRow = {
  series: 'control' | 'treatment'
  label: string
  observed: number
  /** The number this arm needs before it counts. `null` when the plan declares none. */
  needed: number | null
}

/**
 * Two arms of an experiment, against the sample each still needs.
 *
 * **Grey and blue — the only pair on this palette that survives a colour-vision check** (DD4:
 * ΔE 23.4 protan, 23.2 tritan, 25.3 normal). A third variant is a third ROW, never a third hue,
 * which is why the series is an attribute rather than a growing list of class modifiers.
 *
 * The bar is scaled against `needed`, not against the other arm: the question this picture answers
 * is *"is there enough yet"*, and scaling two arms against each other answers a different one.
 */
export function ComparisonBars({ rows, note }: { rows: ComparisonRow[]; note?: ReactNode }) {
  return (
    <figure className="ds-chart">
      <div className="ds-chart-bars">
        {rows.map((row) => {
          const ceiling = row.needed ?? largest(rows.map((other) => other.observed))
          const share = ceiling === null ? null : sharePercent(row.observed, ceiling)
          const short = row.needed === null ? null : row.needed - row.observed
          return (
            <div key={row.series}>
              <div className="ds-chart-bar-head">
                <span className="ds-chart-bar-name">
                  <span className="ds-chart-swatch" data-series={row.series} aria-hidden="true" />
                  {row.label}
                </span>
                <span className="ds-chart-num">
                  {count(row.observed)}
                  {row.needed === null ? '' : ` of ${count(row.needed)} needed`}
                </span>
              </div>
              <div className="ds-chart-track">
                {share === null || share === 0 ? null : (
                  <div
                    className="ds-chart-fill"
                    data-series={row.series}
                    style={{ width: `${share.toFixed(1)}%` }}
                  />
                )}
              </div>
              {short !== null && short > 0 ? (
                <p className="ds-chart-drop">{count(short)} more needed before this counts</p>
              ) : null}
            </div>
          )
        })}
      </div>
      {note ? <figcaption className="ds-chart-note">{note}</figcaption> : null}
    </figure>
  )
}

// ── Held vs failed ────────────────────────────────────────────────────────────────────────────

/**
 * A run's outcome as one bar — **always with the two words and the two counts beside it.**
 *
 * DD4 is explicit that status is the one place colour alone is most tempting and least safe:
 * red/green is the classic colour-vision pair and deutan ΔE here is 9.9, above the floor but only
 * just. So the legend is part of the primitive rather than a caption a caller may forget.
 *
 * `splitGeometry` returns `null` for a run that sent nothing, and this renders the word — a drill
 * that has never run must never paint as 100% held, which is the most dangerous reading available
 * of an untested control.
 */
export function SplitBar({
  held,
  failed,
  unreadable,
}: {
  held: number
  failed: number
  unreadable: ReactNode
}) {
  const geometry = splitGeometry(held, failed)
  if (!geometry) return <ChartUnreadable>{unreadable}</ChartUnreadable>

  return (
    <figure className="ds-chart">
      <div className="ds-chart-split" aria-hidden="true">
        {geometry.okPercent > 0 ? (
          <span
            className="ds-chart-split-part"
            data-series="held"
            style={{ width: `${geometry.okPercent.toFixed(2)}%` }}
          />
        ) : null}
        {failed > 0 ? (
          <span
            className="ds-chart-split-part"
            data-series="failed"
            style={{ width: `${geometry.failedPercent.toFixed(2)}%` }}
          />
        ) : null}
      </div>
      {/* The counts, in words. `failedNeedsFloor` is why this is not optional: at 0.16% the red
          segment is a sliver the eye reads as absent, and the number beside it is the only thing
          actually carrying the fact. */}
      <figcaption className="ds-chart-legend">
        <span>
          <span className="ds-chart-swatch" data-series="held" aria-hidden="true" />
          Held <span className="ds-chart-num">{count(held)}</span>
        </span>
        <span>
          <span className="ds-chart-swatch" data-series="failed" aria-hidden="true" />
          Failed <span className="ds-chart-num">{count(failed)}</span>
        </span>
      </figcaption>
    </figure>
  )
}

// ── Day columns ───────────────────────────────────────────────────────────────────────────────

/**
 * A short daily series as columns — *times served, last 14 days*.
 *
 * A day with one event and a day with none must not look the same, which is what the stylesheet's
 * `min-height` floor is for; a day with none is drawn in the inert token instead, so "zero" is a
 * shape rather than an absence.
 */
export function DayColumns({
  series,
  unreadable,
  note,
}: {
  series: SeriesPoint[]
  unreadable: ReactNode
  note?: ReactNode
}) {
  const max = largest(series.map((point) => point.value))
  if (series.length === 0 || max === null) return <ChartUnreadable>{unreadable}</ChartUnreadable>

  return (
    <figure className="ds-chart">
      <div
        className="ds-chart-cols"
        role="img"
        aria-label={series.map((point) => `${point.date}: ${count(point.value)}`).join(', ')}
      >
        {series.map((point) => (
          <span
            key={point.date}
            className="ds-chart-col"
            data-zero={point.value === 0}
            style={{ height: `${(sharePercent(point.value, max) ?? 0).toFixed(1)}%` }}
          />
        ))}
      </div>
      <div className="ds-chart-scale">
        <span>{series[0].date}</span>
        <span>{series[series.length - 1].date}</span>
      </div>
      {note ? <figcaption className="ds-chart-note">{note}</figcaption> : null}
    </figure>
  )
}

// ── The line plot and its sparkline ───────────────────────────────────────────────────────────

const PLOT = { width: 880, height: 210, pad: 18 }
const SPARK = { width: 200, height: 30, pad: 3 }

/**
 * The sentence a series that cannot be a line gets instead.
 *
 * ⚠️ **`too_short` is not `empty`, and neither is a zero.** One reading is a measurement; a line
 * through it is a claim about a *trend*, which is a different and unmeasured thing (**L2**).
 * Production `attributed_revenue` is exactly this case — one value, recorded 2026-07-06.
 */
export function seriesAbsence(series: SeriesPoint[], noun: string): string | null {
  const state = seriesState(series)
  if (state === 'ok') return null
  if (state === 'empty') return `No ${noun} has been recorded yet, so there is nothing to plot.`
  return `One reading so far — not a trend. A line through a single ${noun} would show a direction nobody measured.`
}

/** One series, one axis, with the grid the approved plot draws. */
export function Plot({
  series,
  label,
  unreadable,
}: {
  series: SeriesPoint[]
  label: string
  unreadable?: ReactNode
}) {
  const path = linePath(series, PLOT.width, PLOT.height, PLOT.pad)
  if (!path) {
    return <ChartUnreadable>{unreadable ?? seriesAbsence(series, 'value')}</ChartUnreadable>
  }
  const grid = [0, 0.25, 0.5, 0.75, 1].map((fraction) => PLOT.pad + fraction * (PLOT.height - PLOT.pad * 2))

  return (
    <figure className="ds-chart ds-chart-plot">
      <svg
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${count(path.domain.min)} to ${count(path.domain.max)} across ${series.length} readings, ${series[0].date} to ${series[series.length - 1].date}.`}
      >
        {grid.map((y) => (
          <line key={y} className="ds-chart-grid" x1={PLOT.pad} y1={y} x2={PLOT.width - PLOT.pad} y2={y} />
        ))}
        <path className="ds-chart-area" d={path.area} />
        <path className="ds-chart-line" d={path.line} />
        <circle className="ds-chart-endpoint" cx={path.endpoint.x} cy={path.endpoint.y} r={4.5} />
      </svg>
      <figcaption className="ds-chart-scale">
        <span>{series[0].date}</span>
        <span>{series[series.length - 1].date}</span>
      </figcaption>
    </figure>
  )
}

/**
 * The same line, small, inside a card.
 *
 * `aria-hidden`, deliberately: a sparkline in a small multiple never carries a fact its own card
 * does not already state in text, so announcing the path twice is noise. The `Plot` above is the
 * opposite case and carries a real label.
 */
export function Sparkline({ series }: { series: SeriesPoint[] }) {
  const path = linePath(series, SPARK.width, SPARK.height, SPARK.pad)
  if (!path) return null
  return (
    <div className="ds-chart-spark">
      <svg viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="ds-chart-line" d={path.line} />
      </svg>
    </div>
  )
}

/**
 * One card of a small-multiple set.
 *
 * **DD4 forbids a dual axis outright**, and this is the primitive that makes the alternative cheap:
 * counts of different things on different scales get one plot each. Putting them on one axis would
 * make the biggest one look like the important one, which is a claim about priority nobody made.
 */
export function SmallMultiple({
  label,
  value,
  delta,
  series,
  freshness,
  absence,
}: {
  label: string
  /** `null` when nothing has been recorded — rendered as a dash with the sentence below it. */
  value: number | null
  delta?: { percent: number; direction: 'up' | 'down' | 'flat' } | null
  series: SeriesPoint[]
  freshness?: ReactNode
  /** The sentence naming which absence this is, when the series cannot be a line. */
  absence?: string | null
}) {
  const missing = absence ?? seriesAbsence(series, 'value')
  return (
    <div className="ds-chart-small">
      <p className="ds-chart-small-label">{label}</p>
      <p className="ds-chart-small-value">
        <b>{value === null ? '—' : count(value)}</b>
        {delta ? (
          <span className="ds-chart-delta" data-direction={delta.direction}>
            {delta.direction === 'up' ? '+' : ''}
            {delta.percent.toFixed(1)}%
          </span>
        ) : null}
      </p>
      {missing ? <ChartUnreadable>{missing}</ChartUnreadable> : <Sparkline series={series} />}
      {freshness ? <p className="ds-chart-stale">{freshness}</p> : null}
    </div>
  )
}

// ── The hero figure ───────────────────────────────────────────────────────────────────────────

/**
 * The one number a page opens with — or the sentence explaining why there isn't one.
 *
 * The two cases are one component on purpose. Where they were two, a page could render neither, and
 * a headline that is simply missing looks exactly like a layout bug (`lib/stat-figures.ts` makes the
 * same argument for stat cards, and this is its headline-sized twin).
 */
export function HeroFigure({
  value,
  absent,
  delta,
  sub,
}: {
  /** `null` puts the component in its absent state, where `absent` is REQUIRED by the type. */
  value: string | null
  absent?: ReactNode
  delta?: { label: string; direction: 'up' | 'down' | 'flat' } | null
  sub?: ReactNode
}) {
  return (
    <>
      <div className="ds-chart-hero">
        {value === null ? (
          <p className="ds-chart-hero-absent">{absent}</p>
        ) : (
          <>
            <span className="ds-chart-hero-value">{value}</span>
            {delta ? (
              <span className="ds-chart-hero-delta ds-chart-delta" data-direction={delta.direction}>
                <Icon name={delta.direction === 'down' ? 'trend-down' : 'trend-up'} size={13} />
                {delta.label}
              </span>
            ) : null}
          </>
        )}
      </div>
      {sub ? <p className="ds-chart-hero-sub">{sub}</p> : null}
    </>
  )
}

// ── The interval around zero ──────────────────────────────────────────────────────────────────

/**
 * A confidence interval, drawn — because a number ± a number is not a range anybody can see.
 *
 * ⚠️ **This primitive exists because Daniel decided it should** (DA2, 2026-09-01). The approved
 * design draws this bar; the engine did not compute an interval; and the recommendation to ship the
 * card in an honest "no interval" state was not taken. `lib/experiment-interval.ts` is the real
 * statistic behind it, and `not-computable` below is what renders when that module says a datum
 * cannot support one — which it does for a zero rate on either arm, where the ratio is undefined.
 *
 * The track always contains zero. That is the entire point: the question is *"does the range include
 * no-difference?"*, and a track that starts at the interval's own low bound cannot answer it.
 */
export function IntervalBar({
  low,
  high,
  point,
  format,
  unreadable,
}: {
  low: number
  high: number
  point: number
  /** How to write a bound. The caller owns the units; this component owns the geometry. */
  format: (value: number) => string
  unreadable: ReactNode
}) {
  const geometry = intervalGeometry(low, high, point)
  if (!geometry) return <ChartUnreadable>{unreadable}</ChartUnreadable>

  return (
    <figure className="ds-chart">
      <div
        className="ds-chart-interval"
        role="img"
        aria-label={`${format(low)} to ${format(high)}, around ${format(point)}. ${
          geometry.crossesZero ? 'The range includes no difference.' : 'The range excludes no difference.'
        }`}
      >
        <span className="ds-chart-interval-zero" style={{ left: `${geometry.zeroPercent.toFixed(2)}%` }} />
        <span
          className="ds-chart-interval-range"
          data-crosses-zero={geometry.crossesZero}
          style={{
            left: `${geometry.startPercent.toFixed(2)}%`,
            width: `${geometry.widthPercent.toFixed(2)}%`,
          }}
        />
        <span
          className="ds-chart-interval-point"
          data-crosses-zero={geometry.crossesZero}
          style={{ left: `${geometry.pointPercent.toFixed(2)}%` }}
        />
      </div>
      {/* ⚠️ **All three labels are positioned AT the thing they name. The approved prototype puts
          them in a `space-between` row, and that is only correct for its own dataset.**

          A deliberate correction, not a drift, and it was found by LOOKING at the rendered
          specimen rather than by any check. The prototype's `.cikey` is three spans in a
          `space-between` row, so the middle one lands at 50% and the outer two at the row's edges.
          With the prototype's numbers that happens to be about right. With a real interval sitting
          entirely above zero, the zero tick lands at 8.3% while its label sits ninety pixels away
          captioning empty track — and the bound labels caption the PAD rather than the interval's
          ends. A reader takes the centre of the row for no-difference and misreads the sign of the
          result.

          Nothing structural could have caught it: three spans rendered, the geometry was correct,
          and every assertion passed.

          The 10% pad in `intervalGeometry` is what makes this safe — every bound sits at least
          ~9% inside the track, so a centred label never overflows the row. */}
      <figcaption className="ds-chart-interval-key">
        <span className="ds-chart-interval-tag" style={{ left: `${geometry.startPercent.toFixed(2)}%` }}>
          {format(low)}
        </span>
        <span
          className="ds-chart-interval-tag ds-chart-interval-origin"
          style={{ left: `${geometry.zeroPercent.toFixed(2)}%` }}
        >
          no difference
        </span>
        <span
          className="ds-chart-interval-tag"
          style={{ left: `${(geometry.startPercent + geometry.widthPercent).toFixed(2)}%` }}
        >
          {format(high)}
        </span>
      </figcaption>
    </figure>
  )
}
