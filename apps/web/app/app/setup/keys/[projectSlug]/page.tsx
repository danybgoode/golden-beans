import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isConsoleShellEnabled, isFlagConsoleEnabled } from '@/lib/flags'
import { listProjectKeys } from '@/lib/api-keys'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { listAgentWriteKeys } from '@/lib/agent-write-keys'
import {
  buildCredentialInventory,
  credentialTitle,
  formatExpiry,
  CREDENTIAL_KINDS_NOT_LISTED,
} from '@/lib/credential-inventory'
import { formatUtc } from '@/lib/format-utc'
import { Panel } from '@/components/ui/Panel'
import { ProductShell } from '@/components/product/ProductShell'

// console-ia-overhaul · Sprint 2, Story 2.3 — one page listing everything with access.
//
// ── The authorization boundary moves TIGHTER or identical, never looser (D5 / A5) ─────────────
// All three routes this merges already call `requireProjectOwnership` at the route, so a member
// gets a flat 404 from each of them today. This calls the same gate, at the route, before any list
// read — identical, not looser. A5 corrected the story's original wording ("each section re-asserts
// its own check"): there are not three different checks to preserve, there is ONE applied three
// times. What each mint/revoke action re-asserts independently is ownership again, as they already
// do — so the page's guard is never the only thing between a member and a mint.
//
// ── Listing only, in this sprint, and that is a decision rather than a shortfall ──────────────
// The story anticipated this: "if the three pages' minting forms turn out to have materially
// different shapes, ship the LIST merged and leave minting on the existing routes — and say so."
// They do differ materially: `flag_read` needs an environment, `flag_sync` needs a source string,
// `agent_write` needs an expiry from an allow-list, and ingest keys need none of those. Merging four
// forms is a bigger job than merging four lists and it is not what makes the page worth having.
//
// So this page answers "what has access to this project" — the question the story is named after —
// and each row links to the surface that mints and revokes that kind. Those surfaces keep working
// and keep their own forms; they simply stop being the only way to see the whole picture.
export const dynamic = 'force-dynamic'

/** Where each kind is minted and revoked, until the forms are merged. */
function manageHref(kind: string, slug: string): string {
  if (kind === 'ingest') return `/app/keys/${slug}`
  if (kind === 'agent_write') return `/app/agent-keys/${slug}`
  return `/app/flag-credentials/${slug}`
}

export default async function SetupKeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isConsoleShellEnabled()) notFound()
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)

  // The flag credential lists exist only while the flags console does — the same condition
  // `/app/flag-credentials` itself checks. With it off we do not read them at all rather than
  // rendering an empty section that implies this project has no flag keys.
  const flagsAvailable = isFlagConsoleEnabled()
  const [apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys] = await Promise.all([
    listProjectKeys(projectId),
    flagsAvailable ? listFlagReadKeys(projectId) : Promise.resolve([]),
    flagsAvailable ? listFlagSyncKeys(projectId) : Promise.resolve([]),
    listAgentWriteKeys(projectId),
  ])

  const rows = buildCredentialInventory({ apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys })

  return (
    <ProductShell projectSlug={projectSlug} section="setup">
      <main>
        <h1>Keys — {projectSlug}</h1>
        <p>
          <a href="/app">← Your projects</a>
        </p>
        <p>
          Everything that can reach this project with a credential, in one list. Revoked keys are not shown —
          this is what has access <strong>now</strong>.
        </p>

        <Panel className="stack">
          {rows.length === 0 ? (
            <p role="status">
              Nothing has a credential for this project yet.{' '}
              <a href={`/app/keys/${projectSlug}`}>Issue an API key</a> to start sending events.
            </p>
          ) : (
            <div className="data-table">
              <div className="data-table__scroll">
                <table>
                  <caption>
                    {rows.length} active credential{rows.length === 1 ? '' : 's'}
                  </caption>
                  <thead>
                    <tr>
                      {/* FOUR columns, not seven, and that is a layout decision made by opening the
                          page. Seven put "Manage" off the right edge: this route renders between the
                          section rail and the agent rail, so `main` is ~540px at 1440 and the
                          capability sentence is the widest thing on it. On a phone the same table
                          was unreadable.

                          The capability now sits UNDER the name — the same shape the rail uses for
                          its descriptions — which reads better at every width and is the natural
                          place for a sentence anyway. A green gate does not see this; a screenshot
                          does. */}
                      <th scope="col">Credential</th>
                      <th scope="col">Where</th>
                      <th scope="col">Created</th>
                      <th scope="col">Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.kind}:${row.id}`}>
                        <td className="credential-cell">
                          <a href={manageHref(row.kind, projectSlug)}>
                            {row.label === '' ? 'untitled' : row.label}
                          </a>
                          {/* The kind and what it may do, together, because they answer one
                              question. The link above goes to the surface that mints and revokes
                              this kind — which is why "Manage" no longer needs a column of its own. */}
                          <small>
                            {credentialTitle(row.kind)} — {row.capability}
                          </small>
                        </td>
                        {/* An em dash, not a blank: this kind has no scope, which is a fact rather
                            than missing data — the same reasoning as the expiry column. */}
                        <td>{row.scope ?? '—'}</td>
                        <td>{formatUtc(row.createdAt)}</td>
                        <td>{formatExpiry(row.expiresAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ⚠️ What this page does NOT list, said out loud on the page itself.
              Its promise is "everything that has access", and share links ARE access — a bearer
              token rendering this project's report to whoever holds the URL. Claiming completeness
              while omitting live bearer tokens would be worse than scoping the claim honestly. */}
          <p className="data-table__count">
            Not listed here:{' '}
            {CREDENTIAL_KINDS_NOT_LISTED.filter((entry) => entry.where !== null).map((entry, index) => (
              <span key={entry.kind}>
                {index > 0 ? ', ' : ''}
                <a href={`${entry.where}/${projectSlug}`}>{entry.label}</a> — {entry.why}
              </span>
            ))}
          </p>
        </Panel>

        <p className="data-table__count">
          Minting and revoking still happen on each kind&apos;s own page — the four forms take genuinely
          different inputs, so this sprint merged the list rather than half-merging the forms. Every row above
          links to its own.
        </p>
      </main>
    </ProductShell>
  )
}
