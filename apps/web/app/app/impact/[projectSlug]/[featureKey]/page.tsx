import { notFound } from 'next/navigation'
import { getFeatureImpact } from '@/lib/north-star-query'
import { requireDashboardAccess } from '@/lib/dashboard-auth'

// Growth Engine v1 · Sprint 3, Story 3.4 — the per-feature input-impact report (v1's
// headline case: /impact/miyagisanchez/setup_guide). Behind per-tenant authorization
// (multi-tenant-activation Story 1.2) — same gate as /funnel: demo is anonymous, every other
// slug requires a signed-in member.
export default async function ImpactPage({
  params,
}: {
  params: Promise<{ projectSlug: string; featureKey: string }>
}) {
  const { projectSlug, featureKey } = await params
  await requireDashboardAccess(projectSlug)
  const result = await getFeatureImpact(projectSlug, featureKey)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Impact lookup failed')
    notFound()
  }

  const { feature, inputs } = result

  return (
    <main>
      <h1>
        Impact — {feature.key} <small>({projectSlug})</small>
      </h1>
      {inputs.map((input) => (
        <section key={input.key}>
          <h2>
            {input.name} <small>({input.valueSource})</small>
          </h2>
          {input.series.length === 0 ? (
            <p>No data yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {input.series.map((point) => (
                  <tr key={point.date}>
                    <td>{point.date}</td>
                    <td>{point.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </main>
  )
}
