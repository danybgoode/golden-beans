import { notFound } from 'next/navigation'
import { getFeatureFunnel } from '@/lib/tars-query'
import { requireDashboardAccess } from '@/lib/dashboard-auth'
import { ProductShell } from '@/components/product/ProductShell'

// Growth Engine v1 · Sprint 2, Story 2.3 — the funnel page for a registered feature
// (v1's headline case: /funnel/miyagisanchez/setup_guide). Behind per-tenant authorization
// (multi-tenant-activation Story 1.2): the demo project renders anonymously; every other slug
// requires a signed-in member (unauthed → /login, non-member → 404).
// ProductShell now reads the session cookie on every render (lib/shell-nav.ts), so this route is
// request-time by nature. Declared rather than inferred: LEARNINGS records a feature gate's required
// 404 turning into a 200 when a parent streamed, and an implicit-dynamic route is the same class of
// surprise — the behaviour should be in the file, not in a rule about generateStaticParams.
export const dynamic = 'force-dynamic'

export default async function FunnelPage({
  params,
}: {
  params: Promise<{ projectSlug: string; featureKey: string }>
}) {
  const { projectSlug, featureKey } = await params
  await requireDashboardAccess(projectSlug)
  const result = await getFeatureFunnel(projectSlug, featureKey)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Funnel lookup failed')
    notFound()
  }

  const { feature, tars } = result

  return (
    <ProductShell projectSlug={projectSlug} section="measure" railActive={null}>
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
          <em>
            Targeted/Adopted/Retained are registry-declared, not gateway-observed — flags are served by
            Miyagi, not this engine.
          </em>
        </p>
      </main>
    </ProductShell>
  )
}
