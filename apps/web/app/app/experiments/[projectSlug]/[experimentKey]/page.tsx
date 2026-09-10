import { notFound } from 'next/navigation'
import { getExperimentComparison } from '@/lib/ab-query'
import { requireDashboardAccess, requireProjectMembership } from '@/lib/dashboard-auth'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { blockerWords } from '@/lib/experiment-blocker-words'
import { INTERVAL_UNAVAILABLE_WORDS } from '@/lib/experiment-interval'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import type { GovernedExperimentAnalysisResult } from '@/lib/experiment-analysis-query'
import { GovernanceDetail } from './governance-detail'
import { ProductShell } from '@/components/product/ProductShell'
import { Icon } from '@/components/ui/Icon'
import { Answer, Crumb, Crumbs, ListCard, PageHead, Pill } from '@/design-system/primitives'
import { ChartUnreadable, ComparisonBars, IntervalBar } from '@/design-system/charts'
import { NewThingDialog } from '@/components/product/NewThingDialog'
import { DecisionRecorder } from './decision-recorder'

type GovernedSuccess = Extract<GovernedExperimentAnalysisResult, { ok: true }>
type GovernedMetric = GovernedSuccess['analysis']['primaryMetric']

type SearchParams = {
  metricEvent?: string | string[]
  version?: string | string[]
  asOf?: string | string[]
  segmentField?: string | string[]
  segmentValue?: string | string[]
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function percentage(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function signedPercentage(value: number | null): string {
  return value === null ? '—' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

/**
 * The five blocks `experiment-ready` draws, and the sixth `experiment-blocked` adds.
 *
 * ⚠️ **Each one is its own `.ds-listcard`, and that is the whole shape of this rebuild.** The page
 * used to draw ONE `Card` holding the exposure bars and the interval together, and kept the split
 * check and the decision surface behind a `<details>`. The approved states are
 * `crumbs → head → answer → list × 5` (ready) and `× 6` (blocked) — five and six SEPARATE panels,
 * in this order. The gate reported it as *"block 5: the approved state has a `list` and the page
 * has nothing"*, four times over, for two sprints.
 *
 * `ListCard plain` rather than `Card`: the prototype writes every one of these as
 * `<div class="listcard" style="padding:22px">` (`console-prototype.html:3014-3095`) — the card
 * surface, with no header row and no rows in it.
 *
 * ⚠️ **Blocks 3-6 render UNCONDITIONALLY**, including when there is nothing in them. The approved
 * design draws all five panels on every experiment, and a page that hides a panel when its data is
 * empty would match the contract on one fixture and miss it on another — which is exactly the class
 * of green this epic exists to remove. An empty guardrail set is a NAMED empty state inside the
 * panel, never an absent panel.
 */
function ExposureBlock({
  metric,
  controlKey,
  minimumSample,
}: {
  metric: GovernedMetric
  controlKey: string
  minimumSample: Map<string, number | null>
}) {
  const control = metric.variants.find((variant) => variant.key === controlKey)
  const treatments = metric.variants.filter((variant) => variant.key !== controlKey)

  return (
    <ListCard plain>
      <p className="ds-label">Who saw what</p>
      {control === undefined ? (
        <p className="ds-chart-note">
          <strong>This experiment has no control arm.</strong> The definition names <code>{controlKey}</code>{' '}
          as the control and the analysis returned no such variant, so there is nothing to compare a treatment
          against.
        </p>
      ) : (
        <ComparisonBars
          rows={[
            {
              series: 'control',
              // ⚠️ Only annotate when the key does not already say it. A variant literally called
              // `control` rendered as "control (control)".
              label: control.key === 'control' ? control.key : `${control.key} (control)`,
              observed: control.exposedSubjects,
              needed: minimumSample.get(control.key) ?? null,
            },
            ...treatments.map((variant) => ({
              series: 'treatment' as const,
              label: variant.key,
              observed: variant.exposedSubjects,
              needed: minimumSample.get(variant.key) ?? null,
            })),
          ]}
          note="Two groups, two colours — grey and blue, the only pair that survives a colour-blindness check on this palette. A third variant is a third row, never a third hue."
        />
      )}
    </ListCard>
  )
}

/** The lift, the interval, and the sentence the interval licenses. Block 3 of the approved state. */
function MetricBlock({ metric, controlKey }: { metric: GovernedMetric; controlKey: string }) {
  const control = metric.variants.find((variant) => variant.key === controlKey)
  const treatments = metric.variants.filter((variant) => variant.key !== controlKey)

  return (
    <ListCard plain>
      {/* ⚠️ NOT `.ds-label`, which uppercases. An event name is an IDENTIFIER — the same
          reason `RowMain` renders a feature key in `<code>` — and `GB_E2E_CHECKOUT_COMPLETED`
          is not what anybody typed. The approved state's label is a human metric name
          ("Completed checkouts"); this engine stores only the event, so it is shown as the
          event, in mono, in the case it was written in. */}
      {control === undefined || treatments.length === 0 ? (
        // ⚠️ A SENTENCE, not `Empty`. `Empty` is the centred, 200px-tall state a LIST card shows
        // when it has no rows; three of these panels are one paragraph tall when they are full, and
        // an `Empty` in one made the guardrail panel the biggest block on the page while saying the
        // least. Found by looking at the rendered page, which is the only thing that can find it —
        // the structural contract counts `list`, and an empty `list` is still a `list`.
        <p className="ds-chart-note">
          <strong>There is no difference to measure yet.</strong> A lift is a treatment arm compared against a
          control, and this analysis returned fewer than two arms.
        </p>
      ) : (
        treatments.map((variant) => {
          const interval = variant.liftInterval
          return (
            <div key={variant.key} className="ds-field">
              <p className="ds-metric-label">
                <code>{metric.event}</code>
                {treatments.length > 1 ? <span> · {variant.key}</span> : null}
              </p>
              <p className="ds-chart-hero">
                <span
                  className="ds-chart-hero-value"
                  data-tone={
                    variant.liftFromControl === null
                      ? undefined
                      : variant.liftFromControl >= 0
                        ? 'up'
                        : 'down'
                  }
                >
                  {signedPercentage(variant.liftFromControl)}
                </span>
                <span className="ds-chart-hero-delta">
                  {percentage(control.conversionRate)} → {percentage(variant.conversionRate)}
                </span>
              </p>

              {/* ⚠️ **The sentence is computed from the fact it names.** A line copied from the
                  prototype would say "so the difference is real" whatever the range does; this one
                  reads `crossesZero`, which is the whole reason the interval was built. */}
              {interval === null ? null : interval.ok ? (
                <>
                  <p className="ds-chart-hero-sub">
                    {interval.crossesZero
                      ? 'How sure we are — and the range still includes “no difference”.'
                      : 'How sure we are, and it does not cross zero.'}
                  </p>
                  <IntervalBar
                    low={interval.low}
                    high={interval.high}
                    point={interval.lift}
                    format={(value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`}
                    unreadable="This range could not be drawn."
                  />
                  <p className="ds-chart-note">
                    {interval.crossesZero
                      ? 'The range includes zero, which means “no difference” is one of the answers this data allows. The point estimate above is the best guess, not a finding.'
                      : 'The whole range sits on one side of zero, so the direction is real — the only question left is by how much.'}{' '}
                    95% interval on the relative lift.
                  </p>
                </>
              ) : (
                <ChartUnreadable>{INTERVAL_UNAVAILABLE_WORDS[interval.reason]}</ChartUnreadable>
              )}
            </div>
          )
        })
      )}
    </ListCard>
  )
}

/**
 * Block 4 — a guardrail is a thing that must not get worse.
 *
 * The prototype draws every guardrail as one line, `name → delta`, in a single panel — not one
 * panel per metric, which is what this page used to render and which would have put a variable
 * number of blocks into a fixed block sequence.
 */
function GuardrailsBlock({
  metrics,
  controlKey,
}: {
  metrics: GovernedSuccess['analysis']['guardrailMetrics']
  controlKey: string
}) {
  return (
    <ListCard plain>
      <p className="ds-label">Guardrails</p>
      {metrics.length === 0 ? (
        <p className="ds-chart-note">
          <strong>No guardrail is declared.</strong> A guardrail names a metric that must not get worse while
          this experiment runs. This definition declares none, so nothing here can stop a win that cost
          something else.
        </p>
      ) : (
        <>
          <div className="ds-wordlist">
            {/* ⚠️ **ONE ROW PER (metric, treatment) — `find()` here was a Blocking defect**
                (cross-agent review, Codex, round 2). It took the FIRST non-control variant per
                guardrail, so on a three-arm experiment the second treatment could regress a
                guardrail and never appear on the decision surface at all. A guardrail's entire job
                is "this must not get worse", and the page silently answered for one arm.

                `flatMap`, and the arm is NAMED whenever there is more than one — the same rule
                `ComparisonBars` states for the same reason: *"a third variant is a third ROW, never
                a third hue."* The prototype draws one row per guardrail because its fixture has
                exactly two arms; the design's shape is `name → delta`, and with N treatments the
                honest reading of that shape is N rows. */}
            {metrics.flatMap((metric) => {
              const treatments = metric.variants.filter((variant) => variant.key !== controlKey)
              if (treatments.length === 0) {
                return [
                  <div key={metric.event} className="ds-wordlist-row">
                    <span className="ds-wordlist-was">
                      <code>{metric.event}</code>
                    </span>
                    <span className="ds-wordlist-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="ds-wordlist-now">no treatment arm</span>
                  </div>,
                ]
              }
              // ⚠️ "Worse" is DIRECTIONAL and this engine does not know a guardrail's direction, so
              // the row states the movement and refuses to grade it. A red arrow on a fall this
              // engine cannot interpret would be a judgement the data does not support.
              return treatments.map((treatment) => (
                <div key={`${metric.event}:${treatment.key}`} className="ds-wordlist-row">
                  <span className="ds-wordlist-was">
                    <code>{metric.event}</code>
                    {treatments.length > 1 ? <span> · {treatment.key}</span> : null}
                  </span>
                  <span className="ds-wordlist-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="ds-wordlist-now">{signedPercentage(treatment.liftFromControl)}</span>
                </div>
              ))
            })}
          </div>
          <p className="ds-chart-note">
            A guardrail is a thing that must not get worse. It never decides the experiment; it can stop you
            shipping a win that cost something else.
          </p>
        </>
      )}
    </ListCard>
  )
}

/** Block 5 — if the split is wrong, every number above is measuring the split. */
function SplitBlock({ srm }: { srm: GovernedSuccess['analysis']['diagnostics']['srm'] }) {
  return (
    <ListCard plain>
      <p className="ds-label">Was the split honest?</p>
      <p className="ds-split">
        {srm.status === 'clear' ? (
          <>
            <Pill state="on">Split checks out</Pill>
            <span>
              People were divided as designed{' '}
              <span className="ds-mono ds-split-stats">
                (χ² {srm.chiSquare?.toFixed(4) ?? '—'}, p {srm.pValue?.toPrecision(4) ?? '—'})
              </span>
            </span>
          </>
        ) : srm.status === 'detected' ? (
          <>
            <Pill state="off">Split is off</Pill>
            <span>
              People were not divided the way the definition says{' '}
              <span className="ds-mono ds-split-stats">
                (χ² {srm.chiSquare?.toFixed(4) ?? '—'}, p {srm.pValue?.toPrecision(4) ?? '—'})
              </span>
            </span>
          </>
        ) : (
          <>
            <Pill state="never">Cannot tell yet</Pill>
            <span>Too few people to check the split.</span>
          </>
        )}
      </p>
      <p className="ds-chart-note">
        If the split is wrong, every number above is measuring the split. This runs before the result, not
        after.
      </p>
    </ListCard>
  )
}

/**
 * Block 6 — the decision, on the page.
 *
 * ⚠️ **`DecisionRecorder` MOVES here from inside the disclosure, unchanged.** D7 called this the one
 * safe capability on the surface precisely because *"the approved design draws it"* — and it was
 * still two keystrokes down, inside `GovernanceDetail`, inside a `<details>`. The prototype's
 * version of this panel is a stub (`toast('Records the decision with your reason')`); the product's
 * is the real append-only recorder, which is what D8's rule — the approved shape, wrapping the
 * existing manager — means on a block that is not a `+ New …` control.
 */
function DecisionBlock({ result, canManage }: { result: GovernedSuccess; canManage: boolean }) {
  const { experiment, decisions } = result
  return (
    <ListCard plain>
      <p className="ds-label">The decision</p>
      <p className="ds-chart-note">Five outcomes, and the reason is kept with whichever you pick.</p>
      {canManage ? (
        <DecisionRecorder
          slug={result.project.slug}
          experimentKey={experiment.key}
          definitionVersion={experiment.definitionVersion}
          lifecycle={experiment.lifecycle}
          controlVariantKey={experiment.definition.controlVariantKey}
          treatmentVariantKeys={experiment.definition.variants
            .map((variant) => variant.key)
            .filter((key) => key !== experiment.definition.controlVariantKey)}
          currentDecisionId={decisions.current?.id ?? null}
        />
      ) : (
        <p className="ds-chart-note">
          <strong>Read-only access.</strong> A project owner records decisions and corrections.
        </p>
      )}
    </ListCard>
  )
}

/** What is in the way, in plain words — sprint contract #9. `experiment-blocked`'s extra block. */
function Blockers({ blockers }: { blockers: GovernedSuccess['analysis']['blockers'] }) {
  if (blockers.length === 0) return null
  return (
    <ListCard plain>
      <p className="ds-label">What is in the way</p>
      <ul className="ds-blockers">
        {blockers.map((blocker) => {
          const words = blockerWords(blocker)
          return (
            <li key={blocker} className="ds-blocker">
              <span className="ds-blocker-mark" aria-hidden="true">
                <Icon name="warning" size={13} />
              </span>
              <span>
                <strong>{words.what}</strong> {words.why}
              </span>
            </li>
          )
        })}
      </ul>
    </ListCard>
  )
}

function GovernedAnalysis({ result, canManage }: { result: GovernedSuccess; canManage: boolean }) {
  // `decisions` is read by `GovernanceDetail`, which owns the ledger; this page owns the comparison.
  const { experiment, analysis } = result
  const slug = result.project.slug
  const minimumSample = new Map(
    analysis.variants.map((variant) => [
      variant.key,
      // The declared minimum per variant, which is what the bar is scaled against — "is there
      // enough yet" is the question this picture answers, and scaling two arms against each other
      // answers a different one.
      experiment.definition.minimumSamplePerVariant ?? null,
    ])
  )

  // ⚠️ Computed from the three facts it NAMES, and it must never claim a difference is real while
  // the interval crosses zero (epic DA2, constraint 5). `decisionReady` is unchanged and still gates
  // exactly what it gated yesterday — the interval is reported, not a new gate.
  const primaryInterval = analysis.primaryMetric.variants.find(
    (variant) => variant.key !== experiment.definition.controlVariantKey
  )?.liftInterval
  const rangeExcludesZero = primaryInterval?.ok === true && !primaryInterval.crossesZero

  return (
    <ProductShell projectSlug={slug} section="ship" railActive={'experiments'}>
      <main>
        <Crumbs back={{ href: `/app/experiments/${slug}`, label: 'Experiments' }}>
          <Crumb mono>{experiment.key}</Crumb>
        </Crumbs>
        <PageHead
          title={<span className="ds-mono">{experiment.key}</span>}
          lede={experiment.definition.hypothesis}
          /* ⚠️ The status pill is what the approved head draws (`expStatusPill(x)`,
             `console-prototype.html:3002`), and the evidence trigger beside it is SECONDARY — the
             approved `head` carries `action: null`, so a primary button here would fail the
             contract and would also say that inspecting the governance record is the main thing to
             do on this screen. */
          actions={
            <>
              <Pill state={analysis.decisionReady ? 'on' : 'never'}>
                {analysis.decisionReady ? 'Ready to decide' : 'Still gathering'}
              </Pill>
              <NewThingDialog
                variant="secondary"
                label="The plan and the ledger"
                title="The plan, the diagnostics and the decision ledger"
                lede="The immutable plan, the allocation table, the trust diagnostics, the freshness read and every decision ever recorded against this version."
              >
                <GovernanceDetail result={result} canManage={canManage} />
              </NewThingDialog>
            </>
          }
        />

        <Answer>
          {analysis.decisionReady ? (
            <>
              <strong>You can decide this one.</strong>{' '}
              {analysis.diagnostics.srm.status === 'clear'
                ? 'The split checks out, '
                : 'The split could not be checked, '}
              {analysis.sampleStatus === 'met'
                ? 'both groups have enough people, '
                : 'the declared sample has not been reached, '}
              {rangeExcludesZero
                ? 'and the interval does not cross zero — so the difference is real.'
                : 'and the interval still includes “no difference”, so the size of the effect is not settled.'}
            </>
          ) : (
            <>
              <strong>You cannot decide this yet, and here is exactly why.</strong>{' '}
              {analysis.blockers.length === 1
                ? '1 thing is in the way.'
                : `${analysis.blockers.length} things are in the way.`}
            </>
          )}
        </Answer>

        {/* The approved block sequence, in the approved order. `Blockers` renders nothing when
            there is nothing in the way, which is the ONE difference between `experiment-blocked`
            (six lists) and `experiment-ready` (five). */}
        <Blockers blockers={analysis.blockers} />

        <ExposureBlock
          metric={analysis.primaryMetric}
          controlKey={experiment.definition.controlVariantKey}
          minimumSample={minimumSample}
        />

        <MetricBlock metric={analysis.primaryMetric} controlKey={experiment.definition.controlVariantKey} />

        <GuardrailsBlock
          metrics={analysis.guardrailMetrics}
          controlKey={experiment.definition.controlVariantKey}
        />

        <SplitBlock srm={analysis.diagnostics.srm} />

        <DecisionBlock result={result} canManage={canManage} />
      </main>
    </ProductShell>
  )
}
// Growth Engine v1 · Sprint 4, Story 4.3 — the side-by-side variant comparison page (v1's
// headline case: /experiments/miyagisanchez/checkout-cta-copy?metricEvent=checkout_completed).
// Behind per-tenant authorization (multi-tenant-activation Story 1.2) — same gate as /funnel and
// /impact: demo is anonymous, every other slug requires a signed-in member.
// ProductShell now reads the session cookie on every render (lib/shell-nav.ts), so this route is
// request-time by nature. Declared rather than inferred: LEARNINGS records a feature gate's required
// 404 turning into a 200 when a parent streamed, and an implicit-dynamic route is the same class of
// surprise — the behaviour should be in the file, not in a rule about generateStaticParams.
export const dynamic = 'force-dynamic'

export default async function ExperimentComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; experimentKey: string }>
  searchParams: Promise<SearchParams>
}) {
  const { projectSlug, experimentKey } = await params
  const raw = await searchParams
  const rawVersion = scalar(raw.version)?.trim()

  if (rawVersion) {
    if (!isExperimentGovernanceEnabled()) notFound()
    const membership = await requireProjectMembership(projectSlug)
    const parsed = parseExperimentAnalysisRequest({
      version: rawVersion,
      asOf: scalar(raw.asOf),
      segmentField: scalar(raw.segmentField),
      segmentValue: scalar(raw.segmentValue),
    })
    if (!parsed.ok) {
      return (
        <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
          <main>
            <h1>Invalid experiment analysis request</h1>
            <p>{parsed.error}</p>
          </main>
        </ProductShell>
      )
    }
    const result = await getExperimentAnalysisByProjectId(
      membership.projectId,
      projectSlug,
      experimentKey,
      parsed.request
    )
    if (!result.ok) {
      if (result.reason === 'query_failed') throw new Error('Experiment analysis lookup failed')
      if (result.reason === 'resource_limit') {
        return (
          <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
            <main>
              <h1>Experiment analysis is too large</h1>
              <p>The bounded query limit was exceeded.</p>
            </main>
          </ProductShell>
        )
      }
      if (result.reason === 'invalid_request' || result.reason === 'lifecycle_unavailable') {
        return (
          <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
            <main>
              <h1>Experiment analysis unavailable</h1>
              <p>This version has no valid observation window at the requested snapshot.</p>
            </main>
          </ProductShell>
        )
      }
      notFound()
    }
    return (
      <GovernedAnalysis
        result={result}
        canManage={isOwner({ projectId: membership.projectId, role: membership.role })}
      />
    )
  }

  await requireDashboardAccess(projectSlug)
  const metricEvent = scalar(raw.metricEvent)?.trim()

  if (!metricEvent) {
    return (
      <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
        <main>
          <h1>
            Experiment — {experimentKey} <small>({projectSlug})</small>
          </h1>
          <p>
            Add a <code>?metricEvent=&lt;event name&gt;</code> query param naming the event that counts as a
            conversion for this experiment.
          </p>
        </main>
      </ProductShell>
    )
  }

  const result = await getExperimentComparison(projectSlug, experimentKey, metricEvent)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Experiment comparison lookup failed')
    notFound()
  }

  const { comparison } = result

  return (
    <ProductShell projectSlug={projectSlug} section="ship" railActive={'experiments'}>
      <main>
        <h1>
          Experiment — {experimentKey} <small>({projectSlug})</small>
        </h1>
        <p>Metric: {metricEvent}</p>
        {comparison.variants.length === 0 ? (
          <p>No exposure events yet for this experiment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Variant</th>
                <th>Exposures</th>
                <th>Conversions</th>
                <th>Conversion rate</th>
                <th>Lift vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {comparison.variants.map((variant) => (
                <tr key={variant.key}>
                  <td>
                    {variant.key}
                    {variant.key === comparison.baseline ? ' (baseline)' : ''}
                  </td>
                  <td>{variant.exposures}</td>
                  <td>{variant.conversions}</td>
                  <td>{(variant.conversionRate * 100).toFixed(1)}%</td>
                  <td>
                    {variant.lift === null
                      ? '—'
                      : `${variant.lift >= 0 ? '+' : ''}${(variant.lift * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          <em>Basic lift only — no statistical-significance engine (that&rsquo;s a later epic).</em>
        </p>
      </main>
    </ProductShell>
  )
}
