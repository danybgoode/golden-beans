import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listProjectKeys } from '@/lib/api-keys'
import { KeyManager } from './key-manager'

// multi-tenant-activation · Sprint 1, Story 1.3 — the per-project API-key dashboard. OWNER-only (no
// demo carve-out): credential administration is least-privilege, so an ordinary member gets a 404
// here even for a project they can otherwise read (cross-review round 2, 2026-07-20).
export const dynamic = 'force-dynamic'

export default async function KeysPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const keys = await listProjectKeys(projectId)

  return (
    <main>
      <h1>API keys — {projectSlug}</h1>
      <p>
        <a href="/app">← Your projects</a>
      </p>
      <p>
        Keys authorize <code>POST /api/v1/track</code> and the SDK. Issue one per integration;
        revoke a leaked key instantly (revocation takes effect on the next request, no deploy).
      </p>
      <KeyManager slug={projectSlug} keys={keys} />
    </main>
  )
}
