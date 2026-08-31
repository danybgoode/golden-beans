import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listAgentWriteKeys } from '@/lib/agent-write-keys'
import { isConnectorWritesEnabled } from '@/lib/flags'
import { AgentKeyManager } from './agent-key-manager'
import { ProductShell } from '@/components/product/ProductShell'

// signals-loop · Sprint 3, Story 3.1 — the agent-write credential dashboard.
//
// OWNER-only, no demo carve-out, matching the API-key and share-link screens. This is the strongest
// credential of the three: it authorizes mutation of the task queue through a public MCP surface,
// so an ordinary member gets a 404 here even for a project they can otherwise read.
export const dynamic = 'force-dynamic'

// ── console-ia-overhaul · Sprint 2, Story 2.3: this route STAYS, and keeps its forms ──────────
// With `CONSOLE_SHELL_ENABLED` on, `/app/setup/keys/[projectSlug]` is the one place that answers
// "what has access to this project", and this route leaves the nav at that same instant (A7's
// derived `legacy-keys` gate). It is NOT redirected: minting and revoking still live here, because
// the four kinds take materially different inputs and merging the forms was explicitly out of
// scope. A redirect would send an owner away from the only surface that can issue this kind.
//
// So: the LIST moved, the CONTROLS did not. Both surfaces work in both gate states.
//
// ⚠️ "Neither is ever the only route to a control" was briefly FALSE for this route, and the fix is
// on the other side: with the console lit this leaves the nav, Command Center and ⌘K, and the only
// inbound links were the per-row `Manage` links on the merged page — which exist only once you
// already hold an agent-write key. Minting the FIRST one meant typing the URL. `Setup › Keys` now
// links every minting surface unconditionally (fresh reviewer, PR #123).
export default async function AgentKeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const keys = await listAgentWriteKeys(projectId)

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'agent-keys'}>
      <main>
        <h1>Agent write keys</h1>
        <p>
          An agent write key lets your own agent <em>claim</em>, <em>resolve</em> and <em>dismiss</em> tasks
          in this project over MCP. It is the second half of a write: your agent also needs this
          project&apos;s connector URL, and both must belong to <strong>this same project</strong> or the
          write tools are not offered at all.
        </p>
        <p>
          This is deliberately <em>not</em> the connector token. That token is displayed openly on the install
          page — it travels through browser history, proxy logs and screenshots — so it identifies your
          project and authorizes reads, and nothing more. A key minted here is stored only as a hash, is never
          shown again, and can be revoked or expired independently.
        </p>
        <p>
          Nothing here can read or write anything outside this project, and nothing can change a task without
          a second confirmation step: your agent proposes a change, sees exactly what would happen, and
          applies it with a single-use token.
        </p>
        <AgentKeyManager slug={projectSlug} keys={keys} enabled={isConnectorWritesEnabled()} />
      </main>
    </ProductShell>
  )
}
