import { notFound } from 'next/navigation'
import { getExperimentComparison } from '@/lib/ab-query'
import { requireDashboardAccess, requireProjectMembership } from '@/lib/dashboard-auth'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import type { GovernedExperimentAnalysisResult } from '@/lib/experiment-analysis-query'
import { DecisionRecorder } from './decision-recorder'
import { ProductShell } from '@/components/product/ProductShell'

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

function MetricTable({ title, metric }: { title: string; metric: GovernedMetric }) {
  return (
    <section>
      <h2>
        {title}: <code>{metric.event}</code>
      </h2>
      <p>
        Declared direction: <strong>{metric.direction}</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Variant</th>
            <th>Assigned</th>
            <th>Converted</th>
            <th>Rate</th>
            <th>Absolute delta</th>
            <th>Relative lift</th>
            <th>Direction</th>
          </tr>
        </thead>
        <tbody>
          {metric.variants.map((variant) => (
            <tr key={variant.key}>
              <td>
                <code>{variant.key}</code>
              </td>
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

function GovernedAnalysis({ result, canManage }: { result: GovernedSuccess; canManage: boolean }) {
  const { experiment, analysis, decisions } = result
  return (
    <ProductShell projectSlug={result.project.slug} section="ship">
      <main>
        <h1>
          Governed experiment — {experiment.key}{' '}
          <small>
            v{experiment.definitionVersion} ({result.project.slug})
          </small>
        </h1>
        <p>
          Lifecycle: <strong>{experiment.lifecycle}</strong>
          {' · '}snapshot: <time>{analysis.window.asOf}</time>
        </p>
        <p>
          Observation window: <time>{analysis.window.startAt}</time>
          {' → '}
          <time>{analysis.window.endAt}</time> (end exclusive)
        </p>
        <p>
          Human-review readiness: <strong>{analysis.decisionReady ? 'ready' : 'not ready'}</strong>
          {' · '}integrity: {analysis.integrityReady ? 'clear' : 'blocked'}
          {' · '}minimum sample: {analysis.sampleStatus}
        </p>
        {analysis.blockers.length > 0 && <p role="alert">Open blockers: {analysis.blockers.join(', ')}</p>}

        <details>
          <summary>Immutable plan</summary>
          <p>{experiment.definition.hypothesis}</p>
          <pre>{JSON.stringify(experiment.definition, null, 2)}</pre>
        </details>

        <h2>Allocation and sample guidance</h2>
        <table>
          <thead>
            <tr>
              <th>Variant</th>
              <th>Observed subjects</th>
              <th>Expected subjects</th>
              <th>Minimum sample</th>
            </tr>
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
          {' · '}source:{' '}
          {analysis.freshness.isStale === null ? 'unknown' : analysis.freshness.isStale ? 'stale' : 'fresh'}
        </p>
        <p>Segment cut: {analysis.segment.status}</p>

        <MetricTable title="Primary metric" metric={analysis.primaryMetric} />
        {analysis.guardrailMetrics.map((metric) => (
          <MetricTable key={metric.event} title="Guardrail" metric={metric} />
        ))}

        <section>
          <h2>Human decision ledger</h2>
          <p>
            State: <strong>{decisions.state}</strong>
            {decisions.current && (
              <>
                {' · '}current outcome: <strong>{decisions.current.outcome}</strong>
                {decisions.current.chosenVariantKey && (
                  <>
                    {' '}
                    (<code>{decisions.current.chosenVariantKey}</code>)
                  </>
                )}
              </>
            )}
          </p>
          {decisions.history.length === 0 ? (
            <p>No human decision has been recorded for this immutable version.</p>
          ) : (
            <ol>
              {decisions.history.map((decision) => (
                <li key={decision.id}>
                  <strong>
                    #{decision.ordinal} {decision.recordKind}: {decision.outcome}
                  </strong>
                  {decision.chosenVariantKey && (
                    <>
                      {' '}
                      — <code>{decision.chosenVariantKey}</code>
                    </>
                  )}
                  <p>{decision.rationale}</p>
                  <p>
                    Recorded by <code>{decision.actorUserId}</code>
                    {' at '}
                    <time>{decision.createdAt}</time>
                    {' · '}definition v{decision.definitionVersion}
                    {decision.supersedesRecordId && (
                      <>
                        {' '}
                        · supersedes <code>{decision.supersedesRecordId}</code>
                      </>
                    )}
                  </p>
                  <details>
                    <summary>Captured analysis and integrity evidence</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          analysis: decision.analysisSnapshot,
                          integrity: decision.integritySnapshot,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </details>
                </li>
              ))}
            </ol>
          )}
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
            <p>
              <strong>Read-only access.</strong> A project owner records decisions and corrections.
            </p>
          )}
        </section>
        <p>
          <em>
            Descriptive counts and basic lift only. Golden Frijoles does not declare a winner, stop this
            experiment, or change a product flag.
          </em>
        </p>
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
        <ProductShell projectSlug={projectSlug} section="ship">
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
          <ProductShell projectSlug={projectSlug} section="ship">
            <main>
              <h1>Experiment analysis is too large</h1>
              <p>The bounded query limit was exceeded.</p>
            </main>
          </ProductShell>
        )
      }
      if (result.reason === 'invalid_request' || result.reason === 'lifecycle_unavailable') {
        return (
          <ProductShell projectSlug={projectSlug} section="ship">
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
      <ProductShell projectSlug={projectSlug} section="ship">
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
    <ProductShell projectSlug={projectSlug} section="ship">
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
