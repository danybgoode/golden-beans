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
  const consoleEnabled = isFlagConsoleEnabled()
  // Credential metadata is operationally sensitive. Definitions and audit are member-readable,
  // but only an owner may enumerate the keys they are allowed to mint or revoke.
  //
  // ── ...and only while this page still RENDERS them ────────────────────────────────────────────
  // With the console on, the key tables live on /app/flag-credentials and `showCredentials={false}`
  // means nothing here displays them — so fetching them was two dead DB round-trips per owner page
  // load, and it put key ids, labels, environments and created/expiry/revoked timestamps into the
  // RSC payload of a page that no longer shows them. Not a privilege leak (the fetch is owner-gated
  // and the data is the owner's own), but dead credential payload on the sprint whose entire point
  // is that credentials moved (fresh reviewer, PR #121).
  const wantsKeys = canManage && !consoleEnabled
  const [registry, keys, syncKeys] = await Promise.all([
    getFlagRegistryView(membership.projectId),
    wantsKeys ? listFlagReadKeys(membership.projectId) : Promise.resolve([]),
    wantsKeys ? listFlagSyncKeys(membership.projectId) : Promise.resolve([]),
  ])

  // flags-console-parity · Story 1.1 — the gate is resolved HERE, server-side, and passed down. One
  // resolver covers the list, the environment selector and (from Sprint 3) both new routes; no
  // client ever reads `process.env`. Same boundary `isFlagRuleBuilderEnabled()` already uses.
  // Parsed unconditionally so the parse itself cannot differ between the two branches — but it is
  // only ever READ by the console. With the gate off this is a few microseconds of allow-list
  // checking and nothing reaches the page, which keeps D6's "byte-for-byte" claim about markup
  // rather than about control flow.
  const listParams = parseFlagListParams(await searchParams, FLAG_ENVIRONMENTS, DEFAULT_FLAG_ENVIRONMENT)

  return (
    <ProductShell projectSlug={projectSlug} section="ship">
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
            epic. `flag-manager.tsx` takes ONE new optional prop, `showDefinitions`, defaulting to
            `true`, so the gate-off render is unchanged — which is the guarantee. (This said the file
            was "byte-identical and takes no new prop": true while Sprint 1 had the prop reverted,
            false once Sprint 2 legitimately reintroduced it 45 lines below. Fresh reviewer, PR #120.
            The behavioural guarantee holds; the stronger wording did not.) The console is an
            additional tree, not a rewrite of the one below it.

            ── Why this is NOT gated on `canManage`, stated here because two review passes asked ──
            "Key" means two different things on this page, and the boundary follows the second one.
            A FLAG key (`checkout.stripe_enabled`) is a definition identifier and is deliberately
            MEMBER-READABLE — `getFlagRegistryView` is documented as exactly that, `registry` is
            spread into <FlagManager> below with no role check, and the comment on the Promise.all
            above says so in as many words. An API key (a snapshot or catalog-sync credential) is
            operationally sensitive, and THOSE are what `canManage` gates — see `keys`/`syncKeys`.

            `<FlagConsole>` receives `flags` and nothing else: no `keys`, no `syncKeys`, no
            `canManage`. It renders strictly LESS about a definition than the stack below it already
            showed members, which included every version's full JSON. So gating it on `canManage`
            would not tighten any boundary — it would newly HIDE member-readable data from members,
            which is a behaviour change this epic has no mandate to make.

            Cross-review (Codex) raised this as Blocking in two consecutive rounds. It was wrong both
            times, but a finding a reader reaches twice is a readability defect in the code, not just
            a reviewer error — so the distinction is written down here rather than re-argued in a
            third PR comment. If the credentials route (Story 3.1) ever renders here, it needs
            `requireProjectOwnership`; the feature list does not.

            ── The legacy stack is retired WITH THE CONSOLE ON, and only now ─────────────────────
            Sprint 1 was additive on purpose: its list was read-only, every activate/deactivate
            control lived in <FlagManager>'s per-flag stack, and hiding that stack would have
            removed the only way to kill a live flag (cross-review, Codex, round 3). The ordering
            written down then was: destination → control on it → rollback → then the stack.

            All three exist now — `[flagKey]/page.tsx` carries the insight, the preview, the version
            list, the JSON, on/off per environment and serve-any-version — so the destination is a
            strict superset and `showDefinitions={false}` removes a duplicate rather than a
            capability. With the gate OFF, `showDefinitions` defaults to true and this page is
            byte-for-byte pre-epic (D6/Amendment 1); the authoring textarea and the credential forms
            are untouched in BOTH branches, because moving those is Sprint 3. */}
        {consoleEnabled && (
          <FlagConsole slug={projectSlug} flags={registry.flags} params={listParams} canManage={canManage} />
        )}
        <FlagManager
          slug={projectSlug}
          {...registry}
          keys={keys}
          syncKeys={syncKeys}
          canManage={canManage}
          servingEnabled={isFlagServingEnabled()}
          ruleBuilderEnabled={isFlagRuleBuilderEnabled()}
          showDefinitions={!consoleEnabled}
          showCredentials={!consoleEnabled}
          showAudit={!consoleEnabled}
        />
      </main>
    </ProductShell>
  )
}
