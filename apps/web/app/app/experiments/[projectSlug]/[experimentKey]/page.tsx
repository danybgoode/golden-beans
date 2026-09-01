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
import { Answer, Card, Crumb, Crumbs, PageHead, Pill } from '@/design-system/primitives'
import { ChartUnreadable, ComparisonBars, IntervalBar } from '@/design-system/charts'

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
 * The variant comparison — reference state `experiment-ready` / `experiment-blocked`.
 *
 * ⚠️ **The interval bar is DA2**, and it draws a real statistic. Daniel decided on 2026-09-01 to
 * build the significance layer rather than ship the card in an honest "no interval" state; the
 * method and its limits are in `lib/experiment-interval.ts`, and it is computed on the same two arms
 * as the lift it brackets so the picture and the number cannot describe different data.
 */
function VariantComparison({
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
  if (!control) return null

  return (
    <Card>
      <p className="ds-label">Who saw what</p>
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

      {treatments.map((variant) => {
        const interval = variant.liftInterval
        return (
          <div key={variant.key} className="ds-field">
            {/* ⚠️ NOT `.ds-label`, which uppercases. An event name is an IDENTIFIER — the same
                reason `RowMain` renders a feature key in `<code>` — and `GB_E2E_CHECKOUT_COMPLETED`
                is not what anybody typed. The approved state's label is a human metric name
                ("Completed checkouts"); this engine stores only the event, so it is shown as the
                event, in mono, in the case it was written in. */}
            <p className="ds-metric-label">
              <code>{metric.event}</code> <span>· {variant.key}</span>
            </p>
            <p className="ds-chart-hero">
              <span
                className="ds-chart-hero-value"
                data-tone={
                  variant.liftFromControl === null ? undefined : variant.liftFromControl >= 0 ? 'up' : 'down'
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
      })}
    </Card>
  )
}

/** What is in the way, in plain words — sprint contract #9. */
function Blockers({ blockers }: { blockers: GovernedSuccess['analysis']['blockers'] }) {
  if (blockers.length === 0) return null
  return (
    <Card>
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
    </Card>
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
          actions={
            <Pill state={analysis.decisionReady ? 'on' : 'never'}>
              {analysis.decisionReady ? 'Ready to decide' : 'Still gathering'}
            </Pill>
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

        <Blockers blockers={analysis.blockers} />

        <VariantComparison
          metric={analysis.primaryMetric}
          controlKey={experiment.definition.controlVariantKey}
          minimumSample={minimumSample}
        />

        {analysis.guardrailMetrics.length > 0 ? (
          <>
            <p className="ds-label">Guardrails</p>
            {analysis.guardrailMetrics.map((metric) => (
              <VariantComparison
                key={metric.event}
                metric={metric}
                controlKey={experiment.definition.controlVariantKey}
                minimumSample={minimumSample}
              />
            ))}
          </>
        ) : null}

        {/* ⚠️ **The whole governance layer is KEPT, behind a disclosure.** The immutable plan, the
            allocation table, the trust diagnostics, the freshness read and the append-only decision
            ledger are what `experiment-governance-v2` shipped, and the approved state draws none of
            them. Deleting a governance surface to satisfy a geometry assertion is the least
            defensible version of that trade — so it moves one keystroke away and loses nothing. */}
        <details className="ds-gaps">
          <summary>The plan, the diagnostics and the decision ledger</summary>
          <div className="ds-disclosure-body">
            <GovernanceDetail result={result} canManage={canManage} />
          </div>
        </details>
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
