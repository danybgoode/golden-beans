import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled, isFlagRuleBuilderEnabled, isFlagServingEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import { parseFlagListParams } from '@/lib/flag-list-view'
import { FlagManager } from './flag-manager'
import { DEFAULT_FLAG_ENVIRONMENT, FlagConsole } from './flag-console'
import { ProductShell } from '@/components/product/ProductShell'

export const dynamic = 'force-dynamic'

export default async function FlagsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
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

  // flags-console-parity · Story 1.1 — the gate is resolved HERE, server-side, and passed down. One
  // resolver covers the list, the environment selector and (from Sprint 3) both new routes; no
  // client ever reads `process.env`. Same boundary `isFlagRuleBuilderEnabled()` already uses.
  const consoleEnabled = isFlagConsoleEnabled()
  // Parsed unconditionally so the parse itself cannot differ between the two branches — but it is
  // only ever READ by the console. With the gate off this is a few microseconds of allow-list
  // checking and nothing reaches the page, which keeps D6's "byte-for-byte" claim about markup
  // rather than about control flow.
  const listParams = parseFlagListParams(await searchParams, FLAG_ENVIRONMENTS, DEFAULT_FLAG_ENVIRONMENT)

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
        {/* D6 / Amendment 1: with the gate OFF this renders exactly what it rendered before the
            epic — `showDefinitions` defaults to true and no other prop changed. The console is an
            additional tree, not a rewrite of the one below it. */}
        {consoleEnabled && <FlagConsole slug={projectSlug} flags={registry.flags} params={listParams} />}
        <FlagManager
          slug={projectSlug}
          {...registry}
          keys={keys}
          syncKeys={syncKeys}
          canManage={canManage}
          servingEnabled={isFlagServingEnabled()}
          ruleBuilderEnabled={isFlagRuleBuilderEnabled()}
          showDefinitions={!consoleEnabled}
        />
      </main>
    </ProductShell>
  )
}
