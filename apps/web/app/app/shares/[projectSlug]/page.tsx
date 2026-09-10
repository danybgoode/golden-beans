import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listShareLinks } from '@/lib/report-shares'
import { isReportSharesEnabled } from '@/lib/flags'
import { ShareManager } from './share-manager'
import { ProductShell } from '@/components/product/ProductShell'

// pod-report · Sprint 3, Story 3.1 — the share-link dashboard. OWNER-only, no demo carve-out, for
// the same reason the API-key screen is: handing a tenant's internal delivery numbers to an outside
// audience is credential administration, and an ordinary member gets a 404 here even for a project
// they can otherwise read.
export const dynamic = 'force-dynamic'

export default async function SharesPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const shares = await listShareLinks(projectId)

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'shares'}>
      <main>
        {/* ── reference state `setup-shares` ───────────────────────────────────────────────
            ⚠️ **The head and the answer moved INTO `ShareManager`** — mockups-as-built Story 4.2.
            The approved head carries a primary action, and that control shares one piece of state
            with the mint form and the shown-once URL: whether a bearer token is on screen right now.
            `keys-surface.tsx` made the same move one surface over, for the same reason.

            ⚠️ **The lede's second paragraph MOVED rather than being deleted** (Story 4.6, kept). It
            said every lens keeps the report's caveats and its "not instrumented" rows — a promise
            about what a narrower lens does NOT hide — and it belongs where the lens is chosen. It is
            the hint on the audience field now. */}
        <ShareManager slug={projectSlug} shares={shares} enabled={isReportSharesEnabled()} />
      </main>
    </ProductShell>
  )
}
