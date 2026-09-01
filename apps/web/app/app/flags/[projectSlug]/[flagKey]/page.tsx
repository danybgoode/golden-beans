// flags-console-parity · Sprint 2, Story 2.1 — one feature, in its own place.
//
// ── Why a route rather than a modal ───────────────────────────────────────────────────────────
// Flagsmith uses a modal; this uses a URL. The epic's outcome test is answered by SHOWING someone a
// screen, and a modal has no address to send. A per-feature URL is linkable in a Slack thread, in an
// incident note and in the lifecycle audit — which is most of what "its own place" is worth.
//
// ── Gate: dark means nonexistent, before auth ─────────────────────────────────────────────────
// Same shape as every gated route in the product (`app/app/journeys/[projectSlug]/page.tsx`): the
// flag check runs BEFORE `requireProjectMembership`, so while the console is dark this segment 404s
// for everyone rather than leaking its existence through a login redirect. This is the assertion
// Sprint 1's corrected QA note promised the `api` Playwright project could actually make.
//
// ── A4 / D1: no query is added ────────────────────────────────────────────────────────────────
// `getFlagRegistryView()` already returns every definition, version and activation for the project.
// This page selects ONE row out of what the list page already reads. There is no per-flag fetch.

import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isFlagConsoleEnabled, isFlagRuleBuilderEnabled, isFlagServingEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getFlagRegistryView } from '@/lib/flag-registry'
import { getFeatureFunnelByProjectId } from '@/lib/tars-query'
import { getFeatureImpactByProjectId } from '@/lib/north-star-query'
import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import { projectFlagRows } from '@/lib/flag-list-view'
import { evaluateVersionDefault } from '@/lib/flag-environment-view'
import { formatUtc } from '@/lib/format-utc'
import { PageHead, PageTab, PageTabs, Pane, Pill, Tag } from '@/design-system/primitives'
import { ProductShell } from '@/components/product/ProductShell'
import { FlagInsight } from '../flag-insight'
import { FlagPreview } from '../flag-preview'
import { FlagAuthoring } from './flag-authoring'
import { FlagSwitch, type FlagSwitchEnvironment } from './flag-switch'
import { FlagVersionServe, type ServeTarget } from './flag-version-serve'
import { FLAG_STATE_PRESENTATION, TYPE_LABEL, CRITICALITY_LABEL } from '../flag-vocabulary'
import { FunnelPane, ImpactPane } from './feature-panes'

export const dynamic = 'force-dynamic'

// design-system-rails · Story 4.2 — SEVEN tabs, and `environments` is the one that arrived.
//
// ⚠️ It used to render ABOVE the strip as the page's standing answer to "is this on, and where",
// recorded there as a deliberate deviation from the approved design. That deviation is WITHDRAWN,
// and by the rule rather than by taste: WAYS-OF-WORKING now says an approved design IS the contract
// where the product owner has approved one, and this story's acceptance cites reference state
// `feature-environments` — the design's own Environments TAB — by name. Keeping the table above the
// tabs would also have made every tab pay ~150px of table it did not ask for, on the surface whose
// contract says it must not scroll.
const TABS = ['value', 'targeting', 'environments', 'funnel', 'impact', 'history', 'settings'] as const
type Tab = (typeof TABS)[number]

// Flagsmith's Edit Feature modal is tabbed Value · Segment Overrides · Identity Overrides · Usage ·
// Health · History · Settings. Three of those are kept, because three of them have a Golden backend.
// Segment and Identity overrides describe a targeting model Golden does not have (its rules are
// clause-based, and the rule builder is where they live). Usage and Health need per-flag evaluation
// telemetry that this control plane does not collect. Rendering an empty tab for each would be five
// promises the product cannot keep — the epic's no-gos say so, and this is where that decision
// becomes code.
const TAB_LABEL: Record<Tab, string> = {
  value: 'Value',
  // console-ia-overhaul · Story 3.2 — four of the design's seven tabs, and each earns its place.
  //
  // `Targeting` holds what used to be crammed onto Value: the rule builder and "preview as a user".
  // Both answer "WHO gets this", which is what targeting means, and moving them is what makes Value
  // the one-screen answer to "is it on" that the contract's no-scroll assertion requires — measured
  // at 3346px in a 960px viewport before this split.
  //
  // `Funnel` and `Impact` used to be ROUTES whose own nav descriptions told the reader to edit the
  // URL — the single line the epic's outcome test is written against.
  //
  // `Environments` is the design's seventh; it renders ABOVE the tabs here instead, because "is this
  // on, and where" is the question somebody opening a feature arrives with, and a tab you have to
  // find first is not an answer.
  targeting: 'Targeting',
  environments: 'Environments',
  funnel: 'Funnel',
  impact: 'Impact',
  history: 'History',
  settings: 'Settings',
}

function readMetadata(definition: unknown): Array<[string, string]> {
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) return []
  const metadata = (definition as { metadata?: unknown }).metadata
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  return Object.entries(metadata as Record<string, unknown>).map(([key, value]) => [key, String(value)])
}

export default async function FlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; flagKey: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!isFlagConsoleEnabled()) notFound()
  const { projectSlug, flagKey } = await params
  const membership = await requireProjectMembership(projectSlug)
  const registry = await getFlagRegistryView(membership.projectId)

  // ── NOT decoded here — Next.js already did it ─────────────────────────────────────────────────
  // An earlier version called `decodeURIComponent(flagKey)`, reasoning that a key travels through a
  // URL segment. The App Router already decodes route params, so that was a SECOND decode, and it
  // turned a bad URL into a 500: `decodeURIComponent` throws `URIError` on a lone `%` or a malformed
  // escape, and an uncaught throw in a server component is a crash, not the `notFound()` this route
  // means. `/app/flags/miyagisanchez/100%` was a 500. No sibling route double-decodes; this one was
  // alone in doing it (cross-review, Agy, PR #120, Blocking).
  const flag = registry.flags.find((row) => row.key === flagKey)
  // A key this project does not have is a 404, not an empty page. It is also the honest answer for a
  // member of a DIFFERENT project guessing at URLs: the membership check above already resolved the
  // tenant server-side, so this can only ever miss within a project the caller can read.
  if (!flag) notFound()

  const rawTab = (await searchParams).tab
  const candidate = Array.isArray(rawTab) ? rawTab[0] : rawTab
  const tab: Tab = TABS.includes(candidate as Tab) ? (candidate as Tab) : 'value'

  const canManage = isOwner({ projectId: membership.projectId, role: membership.role })
  const ruleBuilderEnabled = isFlagRuleBuilderEnabled()
  const servingEnabled = isFlagServingEnabled()
  const latest = flag.versions.reduce<(typeof flag.versions)[number] | undefined>(
    (best, row) => (best === undefined || row.version > best.version ? row : best),
    undefined
  )
  const basePath = `/app/flags/${projectSlug}/${encodeURIComponent(flag.key)}`
  // ⚠️ These fields DO vary by version. `projectFlagRows` describes whatever version the given
  // environment SERVES, falling back to the newest only when nothing is — so this is NOT
  // environment-independent, as an earlier comment here claimed. With development on v1 and
  // production on v5, the Description/Type/Criticality rows described v1 while the generic metadata
  // rows beside them read v5, and nothing on screen named either (fresh reviewer, PR #120).
  //
  // Settings now describes ONE version throughout — the latest — and the caption says which, so a
  // reader is never silently shown two.
  const describedVersion = latest?.version ?? null
  const [descriptive] = projectFlagRows([{ ...flag, activations: [] }], FLAG_ENVIRONMENTS[0])
  // What "turn on" would actually serve. ACTIVATED IS NOT ON: a version whose default variant is
  // falsey serves `false` while the page would otherwise report the feature as on — the latest
  // version of 34 of 42 live flags. Asked of the SDK's evaluator, server-side, so the label and
  // production cannot disagree (fresh reviewer, PR #120, Blocking).
  const latestDefault =
    latest === undefined ? { value: undefined, readable: false } : evaluateVersionDefault(flag.key, latest)
  // The snapshot revision per environment, for the actions' optimistic-concurrency check. Straight
  // off `getFlagRegistryView()` — no query is added (D1). A missing row means the environment has
  // never had a snapshot, whose revision is 0; that is the same default the legacy surface uses, and
  // the RPC rejects a mismatch either way, so a wrong guess fails loudly rather than overwriting.
  const snapshotByEnvironment = new Map(
    registry.environments.map((row) => [row.environment, row.snapshotVersion])
  )
  const switchEnvironments: FlagSwitchEnvironment[] = FLAG_ENVIRONMENTS.map((environment) => ({
    environment,
    state: projectFlagRows([flag], environment)[0].state,
    snapshotVersion: snapshotByEnvironment.get(environment) ?? 0,
  }))
  // Rollback's targets. Same source, one extra field: WHICH version each environment serves, so a
  // row can say "serving in production" instead of offering to re-serve what is already live.
  const serveTargets: ServeTarget[] = FLAG_ENVIRONMENTS.map((environment) => {
    const servingVersionId =
      flag.activations.find((row) => row.environment === environment)?.versionId ?? null
    return {
      environment,
      servingVersionId,
      // Resolved server-side rather than in the client component: the version NUMBER is what the
      // confirmation reasons about ("going back" is relative to what this environment RUNS), and
      // looking it up here keeps the component free of registry shape.
      servingVersion:
        servingVersionId === null
          ? null
          : (flag.versions.find((row) => row.id === servingVersionId)?.version ?? null),
      snapshotVersion: snapshotByEnvironment.get(environment) ?? 0,
    }
  })

  // ── Story 3.2 — read ONLY the tab that is open ──────────────────────────────────────────────
  // Both reads are real queries, so they are paid for only when their pane is being rendered. A
  // page that fetched a funnel AND an impact on every visit would put two round trips behind the
  // Value tab, which is the one nearly every visit is for.
  //
  // ⚠️ **`…ByProjectId`, not the slug-taking wrapper.** `getFeatureFunnel(slug, key)` resolves the
  // project from the slug all over again; `requireProjectMembership` above already resolved it
  // server-side, and re-resolving a tenant from a URL string when you are holding its id is the
  // shape AGENTS rule #1 exists to keep out of this codebase. Same id, one fewer query, and no
  // second place where a slug becomes a tenant.
  const funnel =
    tab === 'funnel' ? await getFeatureFunnelByProjectId(membership.projectId, projectSlug, flag.key) : null
  const impact =
    tab === 'impact' ? await getFeatureImpactByProjectId(membership.projectId, projectSlug, flag.key) : null

  return (
    <ProductShell projectSlug={projectSlug} section="ship" railActive={'flags'}>
      <main>
        {/* ── The page header ────────────────────────────────────────────────────────────────
            A short title then one sentence of subtitle, `h1` at 23/700 — not the `display` clamp,
            which rendered a real flag key at 48px across four lines. The key is mono because it is
            a key; the sentence under it is what the feature DOES, which is the line the list shows.

            "← All features" is gone: the rail's Features entry is the way back, and it is on
            screen. */}
        <PageHead
          title={<code>{flag.key}</code>}
          lede={
            descriptive.description === ''
              ? 'No description recorded for this feature yet.'
              : descriptive.description
          }
          actions={
            <>
              <Tag tone={descriptive.polarity === 'killswitch' ? 'kill' : undefined} label="Type">
                {TYPE_LABEL[descriptive.polarity]}
              </Tag>
              <Tag tone={descriptive.criticality === 'high' ? 'risk-high' : undefined} label="Risk">
                {CRITICALITY_LABEL[descriptive.criticality]}
              </Tag>
            </>
          }
        />

        {/* Tabs are links, not client state — same reason the list's filters are: a tab worth
            reading is a tab worth sending someone. `PageTabs` is a `<nav>` with `aria-current`, NOT
            a `role="tablist"`: activating one of these is a full navigation, and promising a JS
            widget with arrow-key movement behind it is an ARIA claim this page cannot keep. */}
        <PageTabs label="Feature sections">
          {TABS.map((candidateTab) => (
            <PageTab
              key={candidateTab}
              current={candidateTab === tab}
              href={candidateTab === 'value' ? basePath : `${basePath}?tab=${candidateTab}`}
            >
              {TAB_LABEL[candidateTab]}
            </PageTab>
          ))}
        </PageTabs>

        {tab === 'value' && (
          <Pane>
            {/* Story 2.2 — ONE control per environment, naming the environment, with the confirm on
                the destructive direction only. Money path: this is how a live checkout gets killed.

                ⚠️ **This pane holds ONE thing now.** It used to carry the preview and the rule
                builder as well, which made the feature page 3346px tall in a 960px viewport — the
                contract's no-scroll promise broken on the second-most-visited surface in the
                console. Both moved to Targeting, where they answer the question they were always
                answering. No heading: the tab above IS the heading, and a 34px `<h2>Value</h2>`
                under a tab reading "Value" said the same word twice at four times the size. */}
            <FlagSwitch
              slug={projectSlug}
              flagId={flag.id}
              flagKey={flag.key}
              environments={switchEnvironments}
              latestVersionId={latest?.id ?? null}
              latestVersion={latest?.version ?? null}
              latestDefaultValue={latestDefault.value}
              latestReadable={latestDefault.readable}
              canManage={canManage}
              servingEnabled={servingEnabled}
            />
          </Pane>
        )}

        {tab === 'targeting' && (
          <Pane>
            {/* MOVED, not rewritten — same components, same props, same behaviour. "Preview as a
                user" answers *what would this person see, and why*, and the rule builder decides
                *who matches*. Those are one question asked twice, which is what a Targeting tab is
                for; splitting them across Value and Targeting is what the design does too. */}
            {ruleBuilderEnabled ? (
              <FlagPreview slug={projectSlug} flagId={flag.id} />
            ) : (
              <p className="ds-hint">
                Preview is unavailable while <code>FLAG_RULE_BUILDER_ENABLED</code> is off.
              </p>
            )}
            {canManage && ruleBuilderEnabled && <FlagAuthoring slug={projectSlug} flagKey={flag.key} />}
            {canManage && !ruleBuilderEnabled && (
              <p className="ds-hint">
                The rule builder is off, so this feature&apos;s rules cannot be changed from here. Its
                versions are still readable on History.
              </p>
            )}
            {!canManage && (
              <p className="ds-hint">
                <strong>Read-only access.</strong> A project owner changes who a feature is served to.
              </p>
            )}
          </Pane>
        )}

        {/* ── The Environments tab — reference state `feature-environments` ────────────────────
            One line per environment, the three states named, and the same `projectFlagRows` the
            list uses asked once per environment — so this page and the list can never disagree
            about what "on" means.

            ⚠️ **"Never turned on here" is not "off"**, and this is the screen where that
            distinction is worth the most. Off means somebody decided, and there is a name and a
            reason beside it. Never means nothing has ever happened to this feature in that
            environment. Rendering them the same is what made the old page unanswerable. */}
        {tab === 'environments' && (
          <Pane>
            <table className="ds-envtable">
              <caption className="ds-label">Where this is on</caption>
              <thead>
                <tr>
                  <th scope="col">Environment</th>
                  <th scope="col">State</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {FLAG_ENVIRONMENTS.map((environment) => {
                  const [row] = projectFlagRows([flag], environment)
                  const presentation = FLAG_STATE_PRESENTATION[row.state]
                  return (
                    <tr key={environment}>
                      <td>
                        <span className="ds-envname">
                          <span className="ds-env-dot" data-env={environment} />
                          {environment}
                        </span>
                      </td>
                      <td>
                        <Pill state={row.state}>{presentation.label}</Pill>
                      </td>
                      <td>
                        <span className="ds-envwho">{presentation.detail(row)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Pane>
        )}

        {/* ⚠️ **Neither pane may call `notFound()`** — A4. The pages these came from do exactly that
            on `feature_not_found`, and a tab that 404s the whole feature page because the OTHER
            registry has no row would be a regression caused by a missing measurement. The panes take
            the result and render the absence. */}
        {tab === 'funnel' && funnel !== null && (
          <Pane>
            <FunnelPane flagKey={flag.key} result={funnel} />
          </Pane>
        )}

        {tab === 'impact' && impact !== null && (
          <Pane>
            <ImpactPane flagKey={flag.key} result={impact} />
          </Pane>
        )}

        {tab === 'history' && (
          <Pane>
            {/* MOVED, not rewritten. FlagInsight carries BOTH the rollout bars and the
                plain-language version diff, and it is one component — so it lands whole, here,
                because the diff is what someone opening History came for. The bars appearing under
                History rather than Value is the cost of not rewriting a cross-review-hardened
                component to split it; noted in sprint-2.md rather than fixed by quietly forking it. */}
            {ruleBuilderEnabled ? (
              <FlagInsight flag={flag} />
            ) : (
              <p className="data-table__count">
                Plain-language change history is unavailable while <code>FLAG_RULE_BUILDER_ENABLED</code> is
                off. The immutable versions are still listed below.
              </p>
            )}
            <div className="data-table">
              <div className="data-table__scroll">
                <table>
                  <caption>Immutable versions</caption>
                  <thead>
                    <tr>
                      <th scope="col">Version</th>
                      <th scope="col">Created</th>
                      <th scope="col">Definition</th>
                      {canManage && <th scope="col">Serve</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {[...flag.versions]
                      .sort((a, b) => b.version - a.version)
                      .map((version) => (
                        <tr key={version.id}>
                          <td>v{version.version}</td>
                          <td>
                            {formatUtc(version.createdAt)} by <code>{version.createdBy}</code>
                          </td>
                          <td>
                            {/* "One click deeper", literally: the raw JSON does not disappear, it
                                stops being the primary answer to "what changed". */}
                            <details>
                              <summary>Inspect immutable JSON</summary>
                              <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                            </details>
                          </td>
                          {/* Rollback. The legacy stack's per-version buttons are the ONLY way to
                              serve a version other than the newest, so this must exist before that
                              stack can be retired — see sprint-2.md. Owner-only, same boundary as
                              every other write on this page. */}
                          {canManage && (
                            <td>
                              <FlagVersionServe
                                slug={projectSlug}
                                flagKey={flag.key}
                                flagId={flag.id}
                                versionId={version.id}
                                version={version.version}
                                targets={serveTargets}
                                servingEnabled={servingEnabled}
                              />
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Pane>
        )}

        {tab === 'settings' && (
          <Pane>
            <div className="data-table">
              <div className="data-table__scroll">
                <table>
                  <caption>
                    Feature settings
                    {describedVersion === null ? '' : ` — as defined in v${describedVersion}`}
                  </caption>
                  <tbody>
                    <tr>
                      <th scope="row">Name</th>
                      <td>
                        <code>{flag.key}</code>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Description</th>
                      <td>
                        {descriptive.description === ''
                          ? 'No description recorded.'
                          : descriptive.description}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Type</th>
                      <td>{TYPE_LABEL[descriptive.polarity]}</td>
                    </tr>
                    <tr>
                      <th scope="row">Criticality</th>
                      <td>{CRITICALITY_LABEL[descriptive.criticality]}</td>
                    </tr>
                    <tr>
                      <th scope="row">Created</th>
                      <td>
                        {formatUtc(flag.createdAt)} by <code>{flag.createdBy}</code>
                      </td>
                    </tr>
                    {/* Everything else the definition carries, shown rather than hidden: `source`
                        and `enforcement` are how the Miyagi catalog sync labels what publishes a
                        flag and where it is enforced, and an operator asking "why is this here"
                        is asking about exactly those. They are rendered generically because the bag
                        is open — a key this page has never heard of still appears. */}
                    {readMetadata(latest?.definition).map(([key, value]) => (
                      <tr key={key}>
                        <th scope="row">{key}</th>
                        <td>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {!servingEnabled && (
              <p role="status">
                <strong>Flag serving is currently switched off.</strong> Definitions stay readable and
                editable; turning features on and off is unavailable until <code>FLAG_SERVING_ENABLED</code>{' '}
                is enabled in a new deployment.
              </p>
            )}
          </Pane>
        )}
      </main>
    </ProductShell>
  )
}
