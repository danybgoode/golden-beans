import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listShareLinks } from '@/lib/report-shares'
import { isReportSharesEnabled } from '@/lib/flags'
import { Answer, PageHead } from '@/design-system/primitives'
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
        {/* ── design-system-rails · Sprint 4, Story 4.6 — reference state `setup-shares` ────────
            ⚠️ **The second paragraph MOVED rather than being deleted.** It said every lens keeps the
            report's caveats and its "not instrumented" rows — which is a promise about what a
            narrower lens does NOT hide, and it belongs where the lens is chosen. It is the hint on
            the audience field now, so it is read at the moment it matters instead of two paragraphs
            above a form. */}
        <PageHead
          title="Share links"
          lede={
            <>
              A link that shows one thing to somebody who has no account here. It is a bearer token: anyone
              holding the URL can read the report, so treat it like a password and revoke it when the
              conversation ends — revocation takes effect on the next request, no deploy.
            </>
          }
        />
        <Answer>
          <b>Also reachable as “Share this” from any report</b> — which is where you will actually want it.
          This page is for seeing every link that exists, and killing one.
        </Answer>
        <ShareManager slug={projectSlug} shares={shares} enabled={isReportSharesEnabled()} />
      </main>
    </ProductShell>
  )
}
