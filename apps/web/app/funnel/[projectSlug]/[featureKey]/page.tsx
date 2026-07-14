import { notFound } from 'next/navigation'
import { getFeatureFunnel } from '@/lib/tars-query'

// Growth Engine v1 · Sprint 2, Story 2.3 — the funnel page for a registered feature
// (v1's headline case: /funnel/miyagisanchez/setup_guide). No auth — golden-beans has
// no admin-auth system yet, and this is an early-stage internal tool with one viewer.
export default async function FunnelPage({
  params,
}: {
  params: Promise<{ projectSlug: string; featureKey: string }>
}) {
  const { projectSlug, featureKey } = await params
  const result = await getFeatureFunnel(projectSlug, featureKey)
  if (!result.ok) notFound()

  const { feature, tars } = result

  return (
    <main>
      <h1>
        Funnel — {feature.key} <small>({projectSlug})</small>
      </h1>
      <p>
        Registry: {feature.enabled ? 'enabled' : 'disabled'}, last synced{' '}
        {new Date(feature.syncedAt).toLocaleString('en-US')}
      </p>
      <dl>
        <dt>Targeted</dt>
        <dd>{tars.targeted}</dd>
        <dt>Adopted</dt>
        <dd>{tars.adopted}</dd>
        <dt>Retained</dt>
        <dd>{tars.retained}</dd>
      </dl>
      <p>
        <em>Targeted/Adopted/Retained are registry-declared, not gateway-observed — flags are served
        by Miyagi, not this engine.</em>
      </p>
    </main>
  )
}
