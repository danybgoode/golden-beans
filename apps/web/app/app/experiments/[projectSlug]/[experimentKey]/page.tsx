import { notFound } from 'next/navigation'
import { getExperimentComparison } from '@/lib/ab-query'
import { requireDashboardAccess, requireProjectMembership } from '@/lib/dashboard-auth'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import type { GovernedExperimentAnalysisResult } from '@/lib/experiment-analysis-query'

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

function MetricTable({
  title,
  metric,
}: {
  title: string
  metric: GovernedMetric
}) {
  return (
    <section>
      <h2>{title}: <code>{metric.event}</code></h2>
      <p>Declared direction: <strong>{metric.direction}</strong></p>
      <table>
        <thead>
          <tr>
            <th>Variant</th><th>Assigned</th><th>Converted</th><th>Rate</th>
            <th>Absolute delta</th><th>Relative lift</th><th>Direction</th>
          </tr>
        </thead>
        <tbody>
          {metric.variants.map((variant) => (
            <tr key={variant.key}>
              <td><code>{variant.key}</code></td>
              <td>{variant.exposedSubjects}</td>
              <td>{variant.convertedSubjects}</td>
              <td>{percentage(variant.conversionRate)}</td>
              <td>{signedPercentage(variant.absoluteDeltaFromControl)}</td>
              <td>{signedPercentage(variant.liftFromControl)}</td>
              <td>{variant.directionalStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Metric source events: {metric.addressability.candidateEvents}
        {' · '}subject-addressable: {metric.addressability.addressableEvents}
        {' · '}attributed subjects: {metric.addressability.attributedSubjects}
        {' · '}addressability: {percentage(metric.addressability.coverage)}
      </p>
    </section>
  )
}

function GovernedAnalysis({
  result,
}: {
  result: GovernedSuccess
}) {
  const { experiment, analysis } = result
  return (
    <main>
      <h1>
        Governed experiment — {experiment.key}{' '}
        <small>v{experiment.definitionVersion} ({result.project.slug})</small>
      </h1>
      <p>
        Lifecycle: <strong>{experiment.lifecycle}</strong>
        {' · '}snapshot: <time>{analysis.window.asOf}</time>
      </p>
      <p>
        Observation window: <time>{analysis.window.startAt}</time>
        {' → '}<time>{analysis.window.endAt}</time> (end exclusive)
      </p>
      <p>
        Human-review readiness: <strong>{analysis.decisionReady ? 'ready' : 'not ready'}</strong>
        {' · '}integrity: {analysis.integrityReady ? 'clear' : 'blocked'}
        {' · '}minimum sample: {analysis.sampleStatus}
      </p>
      {analysis.blockers.length > 0 && (
        <p role="alert">Open blockers: {analysis.blockers.join(', ')}</p>
      )}

      <details>
        <summary>Immutable plan</summary>
        <p>{experiment.definition.hypothesis}</p>
        <pre>{JSON.stringify(experiment.definition, null, 2)}</pre>
      </details>

      <h2>Allocation and sample guidance</h2>
      <table>
        <thead>
          <tr><th>Variant</th><th>Observed subjects</th><th>Expected subjects</th><th>Minimum sample</th></tr>
        </thead>
        <tbody>
          {analysis.variants.map((variant) => (
            <tr key={variant.key}>
              <td>
                <code>{variant.key}</code>
                {variant.key === experiment.definition.controlVariantKey ? ' (control)' : ''}
              </td>
              <td>{variant.observedSubjects}</td>
              <td>{variant.expectedSubjects.toFixed(2)}</td>
              <td>{variant.minimumSampleStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Trust diagnostics</h2>
      <p>
        SRM: <strong>{analysis.diagnostics.srm.status}</strong>
        {' · '}alpha {analysis.diagnostics.srm.alpha}
        {' · '}χ² {analysis.diagnostics.srm.chiSquare?.toFixed(4) ?? '—'}
        {' · '}p {analysis.diagnostics.srm.pValue?.toPrecision(4) ?? '—'}
      </p>
      {analysis.diagnostics.integrity.length === 0 ? (
        <p>No exposure-integrity defects observed.</p>
      ) : (
        <ul>
          {analysis.diagnostics.integrity.map((diagnostic) => (
            <li key={diagnostic.code}>
              {diagnostic.code}: {diagnostic.count} ({diagnostic.severity})
            </li>
          ))}
        </ul>
      )}
      <p>
        Latest effective fact: {analysis.freshness.latestEffectiveFactAt ?? 'none'}
        {' · '}latest receipt: {analysis.freshness.latestReceiptAt ?? 'none'}
        {' · '}source: {analysis.freshness.isStale === null ? 'unknown' : analysis.freshness.isStale ? 'stale' : 'fresh'}
      </p>
      <p>Segment cut: {analysis.segment.status}</p>

      <MetricTable title="Primary metric" metric={analysis.primaryMetric} />
      {analysis.guardrailMetrics.map((metric) => (
        <MetricTable key={metric.event} title="Guardrail" metric={metric} />
      ))}
      <p>
        <em>
          Descriptive counts and basic lift only. Golden Beans does not declare a winner,
          stop this experiment, or change a product flag.
        </em>
      </p>
    </main>
  )
}

// Growth Engine v1 · Sprint 4, Story 4.3 — the side-by-side variant comparison page (v1's
// headline case: /experiments/miyagisanchez/checkout-cta-copy?metricEvent=checkout_completed).
// Behind per-tenant authorization (multi-tenant-activation Story 1.2) — same gate as /funnel and
// /impact: demo is anonymous, every other slug requires a signed-in member.
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
      return <main><h1>Invalid experiment analysis request</h1><p>{parsed.error}</p></main>
    }
    const result = await getExperimentAnalysisByProjectId(
      membership.projectId,
      projectSlug,
      experimentKey,
      parsed.request,
    )
    if (!result.ok) {
      if (result.reason === 'query_failed') throw new Error('Experiment analysis lookup failed')
      if (result.reason === 'resource_limit') {
        return <main><h1>Experiment analysis is too large</h1><p>The bounded query limit was exceeded.</p></main>
      }
      if (result.reason === 'invalid_request' || result.reason === 'lifecycle_unavailable') {
        return <main><h1>Experiment analysis unavailable</h1><p>This version has no valid observation window at the requested snapshot.</p></main>
      }
      notFound()
    }
    return <GovernedAnalysis result={result} />
  }

  await requireDashboardAccess(projectSlug)
  const metricEvent = scalar(raw.metricEvent)?.trim()

  if (!metricEvent) {
    return (
      <main>
        <h1>
          Experiment — {experimentKey} <small>({projectSlug})</small>
        </h1>
        <p>
          Add a <code>?metricEvent=&lt;event name&gt;</code> query param naming the event that
          counts as a conversion for this experiment.
        </p>
      </main>
    )
  }

  const result = await getExperimentComparison(projectSlug, experimentKey, metricEvent)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Experiment comparison lookup failed')
    notFound()
  }

  const { comparison } = result

  return (
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
                  {variant.lift === null ? '—' : `${variant.lift >= 0 ? '+' : ''}${(variant.lift * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <em>Basic lift only — no statistical-significance engine (that's a later epic).</em>
      </p>
    </main>
  )
}
