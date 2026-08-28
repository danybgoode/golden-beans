import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listProjectKeys } from '@/lib/api-keys'
import { KeyManager } from './key-manager'
import { ProductShell } from '@/components/product/ProductShell'

// multi-tenant-activation · Sprint 1, Story 1.3 — the per-project API-key dashboard. OWNER-only (no
// demo carve-out): credential administration is least-privilege, so an ordinary member gets a 404
// here even for a project they can otherwise read (cross-review round 2, 2026-07-20).
export const dynamic = 'force-dynamic'

// ── console-ia-overhaul · Sprint 2, Story 2.3: this route STAYS, and keeps its forms ──────────
// With `CONSOLE_SHELL_ENABLED` on, `/app/setup/keys/[projectSlug]` is the one place that answers
// "what has access to this project", and this route leaves the nav at that same instant (A7's
// derived `legacy-keys` gate). It is NOT redirected: minting and revoking still live here, because
// the four kinds take materially different inputs and merging the forms was explicitly out of
// scope. A redirect would send an owner away from the only surface that can issue this kind.
//
// So: the LIST moved, the CONTROLS did not. Both surfaces work in both gate states, and neither is
// ever the only route to a control — the ordering rule this epic exists to respect.
export default async function KeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const keys = await listProjectKeys(projectId)

  return (
    <ProductShell projectSlug={projectSlug} section="setup">
      <main>
        <h1>API keys</h1>
        <p>
          Keys authorize <code>POST /api/v1/track</code> and the SDK. Issue one per integration; revoke a
          leaked key instantly (revocation takes effect on the next request, no deploy).
        </p>
        <KeyManager slug={projectSlug} keys={keys} />
      </main>
    </ProductShell>
  )
}
