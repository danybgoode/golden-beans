// console-ia-overhaul · Sprint 3, Story 3.2 — Funnel and Impact, on the feature they describe.
//
// ── Why these are panes and not pages ─────────────────────────────────────────────────────────
// `/app/funnel/<slug>/<key>` and `/app/impact/<slug>/<key>` both still exist and still work; Story
// 1.2 removed them from the NAV because their own inventory descriptions told the reader to "swap
// the feature key in the URL" — which is the single line the epic's outcome test is written
// against. A funnel is not a destination, it is one view of one feature, so it lives on the feature
// and the key comes from the route.
//
// ⚠️ **A4 — THE HONEST EMPTY STATE IS THE DELIVERABLE, for 42 of 42 features today.**
// Measured on production 2026-08-27: `features` (the TARS registry) holds ONE row for
// `miyagisanchez` — `setup_guide` — against 42 rows in `flag_registries`, and the join on `key`
// returns ZERO. They are separate tables with separate lifecycles and separate naming conventions,
// and not one flag has a TARS counterpart. So for every feature a reader can click today, these
// tabs render a SENTENCE naming which absence this is — never a zero, which would say "measured, and
// the answer is nothing" about something nobody is measuring.
//
// That is also why neither pane may call `notFound()`. The pages they came from do
// (`app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26`), and a tab that 404s the whole feature
// page because the OTHER registry has no row would be a regression caused by a missing measurement.

import { Empty as DsEmpty, Field, Stat } from '@/design-system/primitives'
import { DayColumns, SmallMultiple, StageBars } from '@/design-system/charts'
import { ImpactSeriesTable } from '@/app/app/impact/[projectSlug]/[featureKey]/series-table'
import { formatUtc } from '@/lib/format-utc'
import type { FunnelResult } from '@/lib/tars-query'
import type { FeatureImpactInput, FeatureImpactResult } from '@/lib/north-star-query'

/**
 * Why a feature has no funnel, in the reader's words.
 *
 * Each reason gets its own sentence, because they are different facts and a reader can act on
 * exactly one of them. A single "no data" would collapse "nobody is measuring this" (normal, and
 * the answer for every flag today) into "something went wrong" (not normal at all).
 */
function absence(reason: string, flagKey: string, what: 'funnel' | 'impact'): { head: string; body: string } {
  if (reason === 'feature_not_found') {
    // ⚠️ **The two absences have DIFFERENT causes, and one sentence for both sent the operator to
    // fix the wrong thing** (cross-review, agy, round 2 — correctly).
    //
    //   Funnel  → `getFeatureFunnelByProjectId` misses when `features` (the TARS registry) has no
    //             row for this key.
    //   Impact  → `getFeatureImpactByProjectId` misses when `feature_inputs` has no row — a North
    //             Star input has to be LINKED to the key, which is a different act in a different
    //             table from registering a TARS signal.
    //
    // A feature can have one and not the other, which is precisely why naming which absence this is
    // was the deliverable (A4). Saying "TARS" on the Impact tab was the same defect A4 exists to
    // prevent, one table over.
    return what === 'funnel'
      ? {
          head: 'Nothing is measuring this yet',
          body:
            `${flagKey} is a feature flag. It has no funnel because nothing in the TARS registry is ` +
            `measuring it — those are two separate registries, and a flag gets a funnel only once a ` +
            `signal is registered under the same key.`,
        }
      : {
          head: 'No impact to attribute yet',
          body:
            `${flagKey} is a feature flag, and no North Star input is linked to it. Impact is the ` +
            `movement of an input you have attached to a feature, so there is nothing here until ` +
            `one is — which is a different act from registering it for a funnel.`,
        }
  }
  if (reason === 'project_not_found') {
    return {
      head: 'This project could not be read',
      body: 'The project this feature belongs to could not be resolved. Nothing is wrong with the feature.',
    }
  }
  return {
    head: what === 'funnel' ? 'The funnel could not be read' : 'The impact could not be read',
    body: 'The query failed. This is a fault, not an absence — the numbers exist and could not be fetched.',
  }
}

/**
 * ⚠️ **The empty state IS the deliverable here, for 42 of 42 features.** It is the design system's
 * own empty state (`ds-empty`), not a paragraph — it has to read as "this is what you are looking
 * at", because on every flag a reader can click today, it is the whole pane.
 */
function Empty({ head, body }: { head: string; body: string }) {
  return <DsEmpty title={head} body={body} />
}

export function FunnelPane({ flagKey, result }: { flagKey: string; result: FunnelResult }) {
  if (!result.ok) {
    const { head, body } = absence(result.reason, flagKey, 'funnel')
    return <Empty head={head} body={body} />
  }
  const { feature, tars, servedDaily } = result
  // Percentages are OF THE TARGETED population, which is what makes the three numbers a funnel
  // rather than three unrelated counts. Guarded at zero: `0/0` is `NaN`, and a funnel reading
  // "NaN%" is worse than one reading nothing.
  const share = (value: number) => (tars.targeted === 0 ? null : Math.round((value / tars.targeted) * 100))
  const rows: Array<[string, number]> = [
    ['Targeted', tars.targeted],
    ['Adopted', tars.adopted],
    ['Retained', tars.retained],
  ]
  // How many did not continue from the previous stage, with its own share. The number the design
  // puts under each bar, and it is subtraction rather than a second measurement — so it can never
  // disagree with the two counts it sits between.
  const dropped = (index: number) => {
    if (index === 0) return null
    const previous = rows[index - 1][1]
    const here = rows[index][1]
    if (previous <= 0 || here >= previous) return null
    return { count: previous - here, percent: ((previous - here) / previous) * 100 }
  }

  return (
    <>
      <div className="ds-kpis">
        {rows.map(([label, value]) => (
          <Stat
            key={label}
            value={value.toLocaleString('en-US')}
            label={`${label}${share(value) === null ? '' : ` · ${share(value)}%`}`}
          />
        ))}
      </div>
      <Field label="Targeted → adopted → retained">
        {/* ⚠️ **`StageBars`, which replaces this pane's hand-rolled `.ds-bar-*` markup and
            `components/ui/FunnelBars.tsx` in the same commit** (Story 5.1, `console-ia-overhaul` A3).
            The three rules DD4 states now come from one place instead of three: one hue light to
            dark, the exact count beside every bar, and a 4px floor so a stage with three people in
            it is not indistinguishable from a stage with none.

            ⚠️ The BAR is scaled and the PERCENTAGE is not clamped, deliberately (cross-review, agy):
            an anomalous `adopted > targeted` must not paint outside its track, but "133%" beside it
            is information — it tells a reader a count is impossible, and clamping would hide the one
            signal that something upstream is wrong. `sharePercent` clamps the geometry; `share()`
            above does not touch the number. */}
        <StageBars
          size="slim"
          stages={rows.map(([label, value], index) => ({
            label,
            value,
            sharePercent: share(value),
            dropped: dropped(index),
          }))}
          note={
            <>
              Targeted, adopted and retained are declared by the registry, not observed at a gateway — this
              engine counts the events a signal names. Last synced {formatUtc(feature.syncedAt)}.
            </>
          }
        />
        {/* Preserved from the page this pane replaces, verbatim in substance: the counts are
            registry-declared, not gateway-observed. Dropping it while moving the numbers would
            quietly upgrade what they claim.
            ⚠️ `formatUtc`, not `new Date(…).toLocaleString()`. The raw form renders the literal
            string "Invalid Date" for a malformed or missing timestamp — a bad historical row making
            a dashboard unreadable is exactly what that helper exists to prevent, and it says
            "Unknown time" instead (cross-review, agy). It is also timezone-stable, which
            `toLocaleString` on a server-rendered page is not. */}
      </Field>
      <Field label="Times served, last 14 days">
        <DayColumns
          series={servedDaily}
          unreadable="This feature has never been served, so there is no daily history to draw."
          note="If this drops to zero without anybody turning it off, something upstream stopped asking. A day with nothing in it is drawn in the inert token rather than omitted — the gap is the signal. Counts events, not people; the distinct-user figures are the three above."
        />
      </Field>
    </>
  )
}

export function ImpactPane({ flagKey, result }: { flagKey: string; result: FeatureImpactResult }) {
  if (!result.ok) {
    const { head, body } = absence(result.reason, flagKey, 'impact')
    return <Empty head={head} body={body} />
  }
  const { inputs } = result
  if (inputs.length === 0) {
    return (
      <Empty
        head="No input is linked to this feature"
        body={`${flagKey} is measured, but no North Star input is attached to it — so there is nothing this page could attribute a movement to.`}
      />
    )
  }
  return (
    <>
      {/* ⚠️ **One plot per input, never one chart with several lines** (DD4: never a dual axis).
          They are counts of different things on different scales, and putting them on one axis
          would make the biggest one look like the important one — a claim about priority that
          nobody made. `SmallMultiple` is the primitive that makes the alternative cheap. */}
      <div className="ds-chart-smalls">
        {inputs.map((input) => (
          <InputMultiple key={input.key} input={input} />
        ))}
      </div>
      {/* ⚠️ Correlation, said out loud. The prototype's own copy makes this point and it is the one
          claim this pane could overstate: a number moving after a feature went on is not the feature
          having moved it. The causal answer is an experiment, and the sentence names where that
          lives. */}
      <p className="ds-hint">
        This is what each input did, beside a feature that is on — a correlation this page can see, not a
        causal claim. To make it causal, run it as an experiment from Ship › Experiments.
      </p>

      {/* ⚠️ **THE DAY-BY-DAY TABLE IS KEPT, behind a disclosure, and it very nearly was not.**
          `app-component-kit-adoption` Story 2.3 built it deliberately — a sortable, filterable
          `DataTable` of every reading — and the first draft of this pane replaced it with a
          sparkline and dropped it. A sparkline is a shape; the table is the numbers, and somebody
          reconciling a figure against their own system needs the second. Two existing specs went red
          on it, which is the guard doing its job.

          The approved state has no table because the prototype's inputs are illustrative. Deleting a
          capability to satisfy a geometry assertion is not what "render from the design system" asks
          for — the same call Sprint 4 recorded for Destinations' operational logs, and Story 5.4 for
          the experiment governance layer. */}
      {inputs.map((input) => (
        <details className="ds-gaps" key={`${input.key}-readings`}>
          <summary>Every reading · {input.name}</summary>
          <div className="ds-disclosure-body">
            <p className="ds-hint">
              {input.series.length === 0
                ? 'Nothing recorded yet.'
                : `${input.series.length} reading${input.series.length === 1 ? '' : 's'}, totalling ${input.series
                    .reduce((sum, point) => sum + point.value, 0)
                    .toLocaleString(
                      'en-US'
                    )} across ${input.series[0].date} → ${input.series[input.series.length - 1].date}.`}
            </p>
            <ImpactSeriesTable inputName={input.name} series={input.series} />
          </div>
        </details>
      ))}
    </>
  )
}

/**
 * One leading input, as a small multiple.
 *
 * ⚠️ **The three states are all reachable on live data, and two of them are what production
 * actually shows** (sprint L2). `miyagisanchez` has two inputs: `attributed_revenue` with a single
 * reading, and `setup_guide_shares` with none. A line through one point would show a direction
 * nobody measured, so `seriesAbsence` gives each its own sentence instead.
 */
function InputMultiple({ input }: { input: FeatureImpactInput }) {
  const latest = input.series.at(-1) ?? null
  const previous = input.series.at(-2) ?? null
  // The delta is between the last two readings, and it exists ONLY when there are two. A "change"
  // computed against a single point is a direction nobody measured — the same reason a one-point
  // series is not drawn as a line. A previous value of zero has no percentage change either:
  // "up from nothing" is not a percentage.
  const delta =
    latest && previous && previous.value > 0
      ? {
          percent: ((latest.value - previous.value) / previous.value) * 100,
          direction:
            latest.value > previous.value
              ? ('up' as const)
              : latest.value < previous.value
                ? ('down' as const)
                : ('flat' as const),
        }
      : null

  return (
    <SmallMultiple
      label={`${input.name} · ${input.valueSource === 'external_push' ? 'pushed in' : 'from your events'}`}
      // `latest.value`, not a sum: the tile is a level, and a total over a window is a different
      // quantity that the series beneath it does not draw.
      value={latest?.value ?? null}
      delta={delta}
      series={input.series}
      freshness={
        latest === null
          ? // ⚠️ An empty series is NOT a zero. A card reading "0" for a metric nobody has recorded
            // is the honest-looking zero this repo has shipped to production before.
            'nothing recorded yet'
          : `last reading ${latest.date}${input.series.length === 1 ? ' · the only one' : ` · ${input.series.length} in all`}`
      }
    />
  )
}
