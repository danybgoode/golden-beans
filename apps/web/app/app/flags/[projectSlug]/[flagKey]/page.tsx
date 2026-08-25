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
import { FLAG_ENVIRONMENTS } from '@/lib/flag-definition'
import { projectFlagRows } from '@/lib/flag-list-view'
import { formatUtc } from '@/lib/format-utc'
import { Panel } from '@/components/ui/Panel'
import { Badge } from '@/components/ui/Badge'
import { ProductShell } from '@/components/product/ProductShell'
import { FlagInsight } from '../flag-insight'
import { FlagPreview } from '../flag-preview'
import { FlagAuthoring } from './flag-authoring'
import { FlagSwitch, type FlagSwitchEnvironment } from './flag-switch'
import { FlagVersionServe, type ServeTarget } from './flag-version-serve'
import { FLAG_STATE_PRESENTATION, TYPE_LABEL, CRITICALITY_LABEL } from '../flag-vocabulary'

export const dynamic = 'force-dynamic'

const TABS = ['value', 'history', 'settings'] as const
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

  // Decoded because a flag key travels through the URL and `checkout.stripe_enabled` is only the
  // easy case — the key grammar allows characters a browser will percent-encode.
  const wanted = decodeURIComponent(flagKey)
  const flag = registry.flags.find((row) => row.key === wanted)
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
  const serveTargets: ServeTarget[] = FLAG_ENVIRONMENTS.map((environment) => ({
    environment,
    servingVersionId: flag.activations.find((row) => row.environment === environment)?.versionId ?? null,
    snapshotVersion: snapshotByEnvironment.get(environment) ?? 0,
  }))

  return (
    <ProductShell projectSlug={projectSlug}>
      <main>
        <h1>
          <code>{flag.key}</code>
        </h1>
        <p>
          <a href={`/app/flags/${projectSlug}`}>← All features</a>
        </p>

        {/* Story 2.3 reaching this surface: one line per environment, and the three states named.
            The same `projectFlagRows` the list uses, asked once per environment — so this page and
            the list can never disagree about what "on" means. */}
        <Panel className="stack-sm">
          {FLAG_ENVIRONMENTS.map((environment) => {
            const [row] = projectFlagRows([flag], environment)
            const presentation = FLAG_STATE_PRESENTATION[row.state]
            return (
              <p key={environment} className="row-wrap">
                <strong>{environment}</strong>
                <Badge status={presentation.badge}>{presentation.label}</Badge>
                <span className="data-table__count">{presentation.detail(row)}</span>
              </p>
            )
          })}
        </Panel>

        {/* Tabs are links, not client state — same reason the list's filters are (Story 1.3): a tab
            worth reading is a tab worth sending someone. */}
        <div className="row-wrap" role="group" aria-label="Feature sections">
          {TABS.map((candidateTab) => (
            <a
              key={candidateTab}
              className={`tag ${candidateTab === tab ? 'tag-live' : 'tag-next'}`}
              aria-current={candidateTab === tab ? 'true' : undefined}
              href={candidateTab === 'value' ? basePath : `${basePath}?tab=${candidateTab}`}
            >
              {TAB_LABEL[candidateTab]}
            </a>
          ))}
        </div>

        {tab === 'value' && (
          <Panel className="stack">
            <h2>Value</h2>
            {/* Story 2.2 — ONE control per environment, naming the environment, with the confirm on
                the destructive direction only. Money path: this is how a live checkout gets killed. */}
            <FlagSwitch
              slug={projectSlug}
              flagId={flag.id}
              flagKey={flag.key}
              environments={switchEnvironments}
              latestVersionId={latest?.id ?? null}
              latestVersion={latest?.version ?? null}
              canManage={canManage}
              servingEnabled={servingEnabled}
            />
            {/* MOVED, not rewritten — same component, same props, same behaviour as on the list
                page. It answers "what would this user get, and why", which is the question Value
                exists for. */}
            {ruleBuilderEnabled ? (
              <FlagPreview slug={projectSlug} flagId={flag.id} />
            ) : (
              <p className="data-table__count">
                Preview is unavailable while <code>FLAG_RULE_BUILDER_ENABLED</code> is off.
              </p>
            )}
            {canManage && ruleBuilderEnabled && <FlagAuthoring slug={projectSlug} flagKey={flag.key} />}
            {canManage && !ruleBuilderEnabled && (
              <p className="data-table__count">
                The rule builder is off. Definition JSON can still be authored on the{' '}
                <a href={`/app/flags/${projectSlug}`}>features list</a>.
              </p>
            )}
          </Panel>
        )}

        {tab === 'history' && (
          <Panel className="stack">
            <h2>History</h2>
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
                                latestVersion={latest?.version ?? version.version}
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
          </Panel>
        )}

        {tab === 'settings' && (
          <Panel className="stack">
            <h2>Settings</h2>
            <div className="data-table">
              <div className="data-table__scroll">
                <table>
                  <caption>Feature settings</caption>
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
                        {(() => {
                          const [row] = projectFlagRows([flag], FLAG_ENVIRONMENTS[0])
                          return row.description === '' ? 'No description recorded.' : row.description
                        })()}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Type</th>
                      <td>{TYPE_LABEL[projectFlagRows([flag], FLAG_ENVIRONMENTS[0])[0].polarity]}</td>
                    </tr>
                    <tr>
                      <th scope="row">Criticality</th>
                      <td>
                        {CRITICALITY_LABEL[projectFlagRows([flag], FLAG_ENVIRONMENTS[0])[0].criticality]}
                      </td>
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
                editable; activation changes are unavailable until <code>FLAG_SERVING_ENABLED</code> is
                enabled in a new deployment.
              </p>
            )}
          </Panel>
        )}
      </main>
    </ProductShell>
  )
}
