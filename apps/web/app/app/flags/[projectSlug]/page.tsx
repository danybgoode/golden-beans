import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled, isFlagRuleBuilderEnabled, isFlagServingEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import { parseFlagListParams } from '@/lib/flag-list-view'
import { featureAreas } from '@/lib/new-feature-draft'
import { FlagManager } from './flag-manager'
import { DEFAULT_FLAG_ENVIRONMENT, FlagConsole } from './flag-console'
import { FlagCompare } from './flag-compare'
import { EnvironmentPicker } from './environment-picker'
import { NewFeature } from './new-feature'
import { PageHead } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'

export const dynamic = 'force-dynamic'

/**
 * The two views of this route.
 *
 * ⚠️ Read here rather than added to `FlagListParams`, and that is deliberate. That type is the
 * FILTER — what subset of features you are looking at — and every one of its fields is carried
 * through `buildFlagListQuery` into every link on the list. A view is not a filter: carrying it in
 * that record would put `view=compare` on the summary cards, the search form and the dormant
 * disclosure, so a reader who filtered from the grid would land back on the grid with a filter that
 * the grid does not render.
 *
 * Unknown values fall back to the list, for the same reason `parseFlagListParams` allow-lists
 * everything else: a query parameter is attacker-supplied, and an unrecognised one must not change
 * what renders.
 */
function readView(raw: string | string[] | undefined): 'list' | 'compare' {
  const first = Array.isArray(raw) ? raw[0] : raw
  return first === 'compare' ? 'compare' : 'list'
}

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
  // Credential metadata is operationally sensitive. Definitions and audit are member-readable, but
  // only an owner may enumerate the keys they are allowed to mint or revoke.
  //
  // With the console on, the key tables live on Setup › Keys and nothing here displays them — so
  // fetching them would be two dead DB round-trips per owner page load, and would put key ids,
  // labels, environments and created/expiry/revoked timestamps into the RSC payload of a page that
  // no longer shows them.
  const wantsKeys = canManage && !consoleEnabled
  const [registry, keys, syncKeys] = await Promise.all([
    getFlagRegistryView(membership.projectId),
    wantsKeys ? listFlagReadKeys(membership.projectId) : Promise.resolve([]),
    wantsKeys ? listFlagSyncKeys(membership.projectId) : Promise.resolve([]),
  ])

  // The gate is resolved HERE, server-side, and passed down. One resolver covers the list, the
  // environment selector and both views; no client ever reads `process.env`.
  const query = await searchParams
  const listParams = parseFlagListParams(query, FLAG_ENVIRONMENTS, DEFAULT_FLAG_ENVIRONMENT)
  const view = consoleEnabled ? readView(query.view) : 'list'
  const basePath = `/app/flags/${projectSlug}`

  return (
    <ProductShell
      projectSlug={projectSlug}
      section="ship"
      railActive="flags"
      // ⚠️ Gated. The picker only means anything when `FlagConsole` renders — it is the ONLY reader
      // of `listParams.environment` — so with the console off its three links reloaded the identical
      // legacy page: a control that does nothing, in the rail.
      railTop={consoleEnabled ? <EnvironmentPicker basePath={basePath} params={listParams} /> : undefined}
    >
      <main>
        {/* ── The page head ───────────────────────────────────────────────────────────────────
            ⚠️ **Gated, and the reason is the guarantee below.** This head sat OUTSIDE
            `consoleEnabled` once, so with the console off the page rendered the NEW h1 and subtitle
            above the LEGACY body — a hybrid that is neither state.

            ── What the head says, and why (each a Do-not in CONSOLE-CONTRACT.md) ──────────────
            The TITLE is "Features". It was "Feature flags — <slug>", which at 48px wrapped to four
            lines on a real tenant slug and spent ~200px before any content. The project is already
            named in the top bar's switcher.

            The SUBTITLE no longer describes STORAGE (Do-not #7). "← Your projects" is gone with it:
            the top bar's switcher is the way back.

            ── design-system-rails S4.1 — TWO page actions now, which is what the design has ────
            "Compare environments" was missing because there was no comparison surface, and a
            previous head shipped it as a button pointing at this same page with the filters reset —
            a control labelled as a feature that does not exist. `FlagCompare` is that feature, and
            the button lands with it. */}
        {consoleEnabled ? (
          <PageHead
            title={view === 'compare' ? 'Compare environments' : 'Features'}
            lede={
              view === 'compare'
                ? `All ${registry.flags.length} features against all three environments. The short answer to “which of these are on, and where”.`
                : `Everything this project can switch, and what ${listParams.environment} is doing with it. What customers are getting right now.`
            }
            actions={
              view === 'compare' ? (
                <a className="ds-btn ds-btn--secondary" href={basePath}>
                  Back to the list
                </a>
              ) : (
                <>
                  <a className="ds-btn ds-btn--secondary" href={`${basePath}?view=compare`}>
                    Compare environments
                  </a>
                  {/* Owner-only, because `createFlagDefinitionVersionAction` calls
                      `requireProjectOwnership`. A member who saw the button would get a rejection
                      from the server for a control the page offered them. The action re-resolves
                      ownership itself either way — this hides a control it would refuse, it does not
                      enforce anything. */}
                  {canManage && (
                    <NewFeature
                      slug={projectSlug}
                      areas={featureAreas(registry.flags.map((flag) => flag.key))}
                      existingKeys={registry.flags.map((flag) => flag.key)}
                    />
                  )}
                </>
              )
            }
          />
        ) : (
          <>
            <h1>Feature flags — {projectSlug}</h1>
            <p>
              <a href="/app">← Your projects</a>
            </p>
            <p>
              Definitions, immutable versions and their audit remain visible while flag serving is dark.
              Activating or deactivating a flag changes one environment snapshot with optimistic revision
              protection.
            </p>
          </>
        )}
        {/* With the gate OFF this renders exactly what it rendered before the epic.
            `flag-manager.tsx` takes ONE optional prop, `showDefinitions`, defaulting to `true`, so
            the gate-off render is unchanged. The console is an additional tree, not a rewrite of the
            one below it.

            ── Why this is NOT gated on `canManage`, stated here because two review passes asked ──
            "Key" means two different things on this page, and the boundary follows the second one.
            A FLAG key (`checkout.stripe_enabled`) is a definition identifier and is deliberately
            MEMBER-READABLE — `getFlagRegistryView` is documented as exactly that. An API key (a
            snapshot or catalog-sync credential) is operationally sensitive, and THOSE are what
            `canManage` gates.

            `<FlagConsole>` renders strictly LESS about a definition than the stack below it already
            showed members, which included every version's full JSON. So gating it on `canManage`
            would not tighten any boundary — it would newly HIDE member-readable data from members.

            Cross-review (Codex) raised this as Blocking in two consecutive rounds. It was wrong both
            times, but a finding a reader reaches twice is a readability defect in the code, not just
            a reviewer error — so the distinction is written down here rather than re-argued. */}
        {consoleEnabled &&
          (view === 'compare' ? (
            <FlagCompare flags={registry.flags} />
          ) : (
            <FlagConsole
              slug={projectSlug}
              flags={registry.flags}
              params={listParams}
              // The selected environment's snapshot revision, for the row switch's optimistic
              // concurrency check. Straight off the registry read above — no query is added. A
              // missing row means this environment has never had a snapshot, whose revision is 0.
              snapshotVersion={
                registry.environments.find((row) => row.environment === listParams.environment)
                  ?.snapshotVersion ?? 0
              }
              // What this decides is whether a member is offered a switch `requireProjectOwnership`
              // would refuse them. Nothing about the DATA changes: keys, descriptions and states
              // stay member-readable.
              canManage={canManage}
              servingEnabled={isFlagServingEnabled()}
            />
          ))}
        <FlagManager
          slug={projectSlug}
          {...registry}
          keys={keys}
          syncKeys={syncKeys}
          canManage={canManage}
          servingEnabled={isFlagServingEnabled()}
          ruleBuilderEnabled={isFlagRuleBuilderEnabled()}
          // The two free-key creation paths (the raw-JSON textarea and `RuleBuilder`'s own key
          // field) leave the console branch, and their replacement is the `<NewFeature>` control in
          // the head above. Both go in ONE prop because the product had TWO of them, and gating them
          // separately is how a branch ends up with one creation path and no other. With the gate
          // off this is `true` and the file below renders what it always did.
          showAuthoring={!consoleEnabled}
          showDefinitions={!consoleEnabled}
          showCredentials={!consoleEnabled}
          showAudit={!consoleEnabled}
        />
      </main>
    </ProductShell>
  )
}
