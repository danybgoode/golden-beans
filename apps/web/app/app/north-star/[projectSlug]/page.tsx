import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getProjectNorthStarByProjectId } from '@/lib/north-star-query'
import { ProductShell } from '@/components/product/ProductShell'
import { Answer, ListCard, PageHead } from '@/design-system/primitives'
import { HeroFigure, Plot, SmallMultiple, seriesAbsence } from '@/design-system/charts'
import { NorthStarReadings } from './readings'

// mockups-as-built · Sprint 3, Story 3.1 — reference state `measure-north-star`.
//
// ── The route that did not exist ──────────────────────────────────────────────────────────────
// The approved Measure rail opens on North Star. The product had no such route, so
// `design-system-rails` mapped the state onto `/app/impact/[projectSlug]/[featureKey]` — an
// architect's substitution, recorded honestly in `route-manifest.ts` and still a different screen:
// that page answers *"what does THIS FEATURE feed"* and this one answers *"what feeds the North
// Star"*. The second is not a subset of the first (epic D14).
//
// ⚠️ **THE HERO IS EMPTY BY CONSTRUCTION, AND THAT IS THE DELIVERABLE.** The approved state opens on
// a big number and a fourteen-week plot. This product cannot produce either: `north_star_metrics`
// registers a KEY, `leading_inputs` registers the things that feed it, and `input_values` belongs to
// an INPUT — there is no table holding a level for the metric itself, which is why
// `readNorthStar` (`lib/pod-report-query.ts`) returns `latestValue: null` unconditionally and says
// so in its own docstring. Drawing a number here would mean inventing one, and the metric is synced
// in from outside the product, so the page's job is to say **when** — including when the answer is
// "never".
//
// ⚠️ **Three plots, never three lines on one chart** (`APPROVED.md` DD4, and the approved state's own
// callout says it in words). They are counts of different things on different scales; one axis would
// make the largest look like the most important. Live data has exactly three (epic D13-b).
//
// ⚠️ **No `<details>`.** The day-by-day readings — the capability `app-component-kit-adoption` Story
// 2.3 built, which somebody reconciling a figure against their own system needs — open from a
// secondary control in the head. A disclosure is never the answer on a rebuilt surface (epic D3).
export const dynamic = 'force-dynamic'

export default async function NorthStarPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const result = await getProjectNorthStarByProjectId(membership.projectId, projectSlug)
  // A failed read THROWS rather than rendering as an absence. `metricKey: null` with `ok: true` is
  // the truthful "nothing registered"; an outage that looked like it would be the defect this whole
  // epic is named after.
  if (!result.ok) throw new Error('North Star lookup failed')

  const { metricKey, inputs } = result
  // The freshest reading across every input — the "last synced" the approved state carries. It is
  // the INPUTS' freshness, said as the inputs' freshness: the metric itself has never been synced,
  // and a line claiming otherwise would be the one thing this page must not say.
  const lastReading = inputs
    .flatMap((input) => input.series.map((point) => point.date))
    .sort()
    .at(-1)

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={'north-star'}>
      <main>
        <PageHead
          title="North Star"
          lede="The one number this project is trying to move, and the things that feed it."
          actions={<NorthStarReadings inputs={inputs} />}
        />

        <Answer>
          {metricKey === null ? (
            <>
              <strong>This project has no North Star metric registered.</strong> Until one is, there is no
              number for the inputs below to feed — they are counted, and they are counted towards nothing.
            </>
          ) : inputs.length === 0 ? (
            <>
              <strong>
                <span className="ds-mono">{metricKey}</span> is registered, and nothing feeds it yet.
              </strong>{' '}
              A leading input is a thing you can move this week that moves the number over months.
            </>
          ) : (
            <>
              <strong>
                <span className="ds-mono">{metricKey}</span> is registered, and the engine holds no reading
                for it.
              </strong>{' '}
              What it does hold is underneath:{' '}
              {inputs.length === 1
                ? 'the one input that feeds it'
                : `all ${inputs.length} inputs that feed it`}
              , with what each has actually recorded.
            </>
          )}
        </Answer>

        {/* Block 3 — the hero and the trend, in the state the data supports. `ListCard plain` because
            the prototype draws this panel as `<div class="listcard" style="padding:22px">`. */}
        <ListCard plain>
          <HeroFigure
            value={null}
            absent={
              <>
                {metricKey === null ? (
                  'No North Star metric is registered for this project yet.'
                ) : (
                  <>
                    <span className="ds-mono">{metricKey}</span> is registered, and no value has ever been
                    recorded for it — a defined metric with no reading, which is not a reading of zero.
                  </>
                )}{' '}
                The engine records readings for the <em>inputs</em> below; the metric itself is synced in from
                outside the product, and nothing has synced one.
              </>
            }
            sub={
              lastReading === undefined
                ? 'Never synced. No input has recorded a reading either.'
                : `Weekly · the newest reading across every input is ${lastReading}. The metric itself has never been synced.`
            }
          />
          <Plot series={[]} label="North Star" unreadable={seriesAbsence([], 'North Star reading')} />
        </ListCard>

        {/* Blocks 4 and 5 — the label, and the three plots it names. */}
        <p className="ds-label">What fed it</p>
        <div className="ds-chart-smalls">
          {inputs.length === 0 ? (
            <p className="ds-chart-note">
              No leading input is registered, so there is nothing here to plot — not a flat line, an absent
              one.
            </p>
          ) : (
            inputs.map((input) => <InputPlot key={input.key} input={input} />)
          )}
        </div>
      </main>
    </ProductShell>
  )
}

/**
 * One input's small multiple.
 *
 * ⚠️ **Not `ImpactPane`, and not a `<details>`.** `feature-panes.tsx` renders the same three plots
 * and then a disclosure per input holding the day-by-day table — one of the SIX `flags/…`
 * disclosures epic D6 leaves alone, on a route this gate does not open. Importing it here would put
 * a `<details>` on a route the gate DOES open, on the sprint that deletes the last of them. The
 * table is not lost: it opens from the head (`NorthStarReadings`).
 */
function InputPlot({ input }: { input: import('@/lib/north-star-query').FeatureImpactInput }) {
  const latest = input.series.at(-1) ?? null
  const previous = input.series.at(-2) ?? null
  // The delta is between the last two readings and exists ONLY when there are two. A "change"
  // computed against a single point is a direction nobody measured, and a previous value of zero has
  // no percentage change: "up from nothing" is not a percentage. Same rule as `InputMultiple`.
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
        // ⚠️ An empty series is NOT a zero. A card reading "0" for a metric nobody has recorded is a
        // measurement claim this page did not make.
        latest === null ? 'Nothing recorded yet' : `last reading ${latest.date}`
      }
    />
  )
}
