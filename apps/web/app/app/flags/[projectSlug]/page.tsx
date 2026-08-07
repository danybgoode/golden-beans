import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagServingEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { FlagManager } from './flag-manager'
import { ProductShell } from '@/components/product/ProductShell'

export const dynamic = 'force-dynamic'

export default async function FlagsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const canManage = isOwner({ projectId: membership.projectId, role: membership.role })
  // Credential metadata is operationally sensitive. Definitions and audit are member-readable,
  // but only an owner may enumerate the keys they are allowed to mint or revoke.
  const [registry, keys, syncKeys] = await Promise.all([
    getFlagRegistryView(membership.projectId),
    canManage ? listFlagReadKeys(membership.projectId) : Promise.resolve([]),
    canManage ? listFlagSyncKeys(membership.projectId) : Promise.resolve([]),
  ])
  return (
    <ProductShell projectSlug={projectSlug}>
      <main>
        <h1>Feature flags — {projectSlug}</h1>
        <p>
          <a href="/app">← Your projects</a>
        </p>
        <p>
          Definitions, immutable versions and their audit remain visible while flag serving is dark.
          Activating or deactivating a flag changes one environment snapshot with optimistic revision
          protection.
        </p>
        <FlagManager
          slug={projectSlug}
          {...registry}
          keys={keys}
          syncKeys={syncKeys}
          canManage={canManage}
          servingEnabled={isFlagServingEnabled()}
        />
      </main>
    </ProductShell>
  )
}
