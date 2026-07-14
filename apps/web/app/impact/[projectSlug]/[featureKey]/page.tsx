import { notFound } from 'next/navigation'
import { getFeatureImpact } from '@/lib/north-star-query'

// Growth Engine v1 · Sprint 3, Story 3.4 — the per-feature input-impact report (v1's
// headline case: /impact/miyagisanchez/setup_guide). No auth — same rationale as
// /funnel/[projectSlug]/[featureKey] (no admin-auth system exists yet in golden-beans).
export default async function ImpactPage({
  params,
}: {
  params: Promise<{ projectSlug: string; featureKey: string }>
}) {
  const { projectSlug, featureKey } = await params
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
