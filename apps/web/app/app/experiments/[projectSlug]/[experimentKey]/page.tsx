import { notFound } from 'next/navigation'
import { getExperimentComparison } from '@/lib/ab-query'
import { requireDashboardAccess } from '@/lib/dashboard-auth'

// Growth Engine v1 · Sprint 4, Story 4.3 — the side-by-side variant comparison page (v1's
// headline case: /experiments/miyagisanchez/checkout-cta-copy?metricEvent=checkout_completed).
// Behind per-tenant authorization (multi-tenant-activation Story 1.2) — same gate as /funnel and
// /impact: demo is anonymous, every other slug requires a signed-in member.
export default async function ExperimentComparisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; experimentKey: string }>
  searchParams: Promise<{ metricEvent?: string }>
}) {
  const { projectSlug, experimentKey } = await params
  await requireDashboardAccess(projectSlug)
  const metricEvent = (await searchParams).metricEvent?.trim()

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
