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
    <ProductShell>
      <main>
        <h1>Share links — {projectSlug}</h1>
        <p>
          <a href="/app">← Your projects</a>
        </p>
        <p>
          A share link renders this project&apos;s Pod Report at a public URL, through one audience
          lens. It is a bearer token: anyone holding the URL can read it, so treat it like a
          password and revoke it when the conversation ends. Revocation takes effect on the next
          request, no deploy needed.
        </p>
        <p>
          Every lens keeps the report&apos;s caveats and its &ldquo;not instrumented&rdquo; rows — a
          narrower lens shows less <em>detail</em>, never less honesty.
        </p>
        <ShareManager slug={projectSlug} shares={shares} enabled={isReportSharesEnabled()} />
      </main>
    </ProductShell>
  )
}
