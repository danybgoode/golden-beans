import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listProjectKeys } from '@/lib/api-keys'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { listAgentWriteKeys } from '@/lib/agent-write-keys'
import { buildCredentialInventory } from '@/lib/credential-inventory'
import { ProductShell } from '@/components/product/ProductShell'
import { KeysSurface } from './keys-surface'

// Setup › Keys — the one page that owns this project's credentials.
//
// ── design-system-rails · Sprint 4, Story 4.5 ✳ Daniel's complaint ────────────────────────────
// This page listed credentials and sent you somewhere else to make one. The previous sprint said so
// out loud and gave an honest reason — *"the four forms take materially different inputs, so this
// sprint merged the list rather than half-merging the forms"* — and then the page named for the job
// could not do the job. **Minting moves here in the same commit that retires `/app/keys`,
// `/app/flag-credentials` and `/app/agent-keys`**, which is the ordering rule this epic keeps: land
// the replacement and retire the original together, never as a cleanup story.
//
// ── The gate: OWNER, at the route, unchanged — and no longer console-gated ────────────────────
// ⚠️ `isConsoleShellEnabled()` is GONE from this page, and dropping it was forced by the retirement
// rather than chosen. While the three legacy routes minted, this page was an additional surface and
// gating it cost nothing. Now it is the ONLY surface: a `CONSOLE_SHELL_ENABLED=false` rollback would
// have left a project unable to issue any credential at all, and the legacy routes redirect HERE, so
// the rollback would have produced a redirect loop into a 404. The auth boundary is untouched —
// `requireProjectOwnership` at the route, exactly as all four surfaces have always had it, and a
// member still gets a flat 404 (`lib/setup-route-guards.test.ts` pins that).
export const dynamic = 'force-dynamic'

export default async function SetupKeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)

  // ⚠️ ALWAYS read all four, and keying any of them on a flag was wrong. `FLAG_CONSOLE_ENABLED`
  // gates the flags *UI*; it does not gate whether these credentials SERVE. `flag_read` serves via
  // `/api/v1/flags/snapshot` behind `FLAG_SERVING_ENABLED`, and `flag_sync` via
  // `/api/v1/flags/sync` behind `FLAG_DEFINITION_SYNC_ENABLED`. Suppressing them meant a project
  // with live, serving flag credentials rendered a page that listed none of them, under a heading
  // claiming to list everything.
  const [apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys] = await Promise.all([
    listProjectKeys(projectId),
    listFlagReadKeys(projectId),
    listFlagSyncKeys(projectId),
    listAgentWriteKeys(projectId),
  ])

  const rows = buildCredentialInventory({ apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys })

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'setup/keys'}>
      <main>
        {/* ⚠️ The head, the mint flow and the list are ONE client component — see `keys-surface.tsx`.
            They share a single piece of state (is a credential on screen right now?), and sprint
            contract #7's "on a screen of its own" is a claim about the whole page rather than about
            one panel. */}
        <KeysSurface slug={projectSlug} rows={rows} />
      </main>
    </ProductShell>
  )
}
