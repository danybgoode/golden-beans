import { notFound } from 'next/navigation'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isConsoleShellEnabled, isFlagConsoleEnabled } from '@/lib/flags'
import { listProjectKeys } from '@/lib/api-keys'
import { listFlagReadKeys } from '@/lib/flag-read-keys'
import { listFlagSyncKeys } from '@/lib/flag-sync-keys'
import { listAgentWriteKeys } from '@/lib/agent-write-keys'
import {
  buildCredentialInventory,
  type CredentialKind,
  credentialTitle,
  formatExpiry,
  isCurrentlyUsable,
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

/**
 * Where each kind is minted and revoked, or `null` when that surface is currently unreachable.
 *
 * ── Why this returns null, and why that is not over-engineering ───────────────────────────────
 * `/app/flag-credentials` is `if (!isFlagConsoleEnabled()) notFound()`. Until the S1 fix, the flag
 * rows were suppressed whenever that gate was closed, so their link was never rendered in the state
 * where it 404s. Removing the suppression was correct — those credentials SERVE on different gates
 * (`FLAG_SERVING_ENABLED`, `FLAG_DEFINITION_SYNC_ENABLED`) and belong on a page listing what has
 * access — but it traded an omission for a dead link (fresh reviewer, PR #123, Blocking).
 *
 * The ROW must stay: the credential is live, and a page answering "what has access" that hides live
 * access is the defect S1 fixed. So the LINK is what goes. `project-route-inventory.test.ts` calls
 * this exact shape "the exact defect this epic exists to remove" and carries a regression test for
 * it in the nav; this is the same rule one level down, where nothing was checking.
 *
 * `CredentialKind`, not `string` (cross-review, vibe): the union is closed so a fifth kind is a
 * compile error at every consumer, and `string` opted this function out of that.
 */
function manageHref(kind: CredentialKind, slug: string, flagConsoleOpen: boolean): string | null {
  if (kind === 'ingest') return `/app/keys/${slug}`
  if (kind === 'agent_write') return `/app/agent-keys/${slug}`
  // flag_read and flag_sync are both managed on the flags console's credentials route.
  return flagConsoleOpen ? `/app/flag-credentials/${slug}` : null
}

export default async function SetupKeysPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  if (!isConsoleShellEnabled()) notFound()
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)

  // ⚠️ ALWAYS read, and keying this on `FLAG_CONSOLE_ENABLED` was wrong (fresh reviewer, PR #123).
  //
  // That flag gates the flags *UI*. It does not gate whether these credentials SERVE: `flag_read`
  // serves via `/api/v1/flags/snapshot` behind `FLAG_SERVING_ENABLED`, and `flag_sync` via
  // `/api/v1/flags/sync` behind `FLAG_DEFINITION_SYNC_ENABLED`. Neither reads the console flag.
  //
  // So suppressing them meant a project with live, serving flag credentials rendered a page that
  // listed none of them, under a heading claiming to list everything, with a count that said
  // "3 active credentials" when there were five. The original justification — avoiding "an empty
  // section that implies this project has no flag keys" — did not survive the four kinds being
  // merged into ONE table: there is no empty section to avoid, the rows simply vanish.
  const [apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys] = await Promise.all([
    listProjectKeys(projectId),
    listFlagReadKeys(projectId),
    listFlagSyncKeys(projectId),
    listAgentWriteKeys(projectId),
  ])

  const rows = buildCredentialInventory({ apiKeys, flagReadKeys, flagSyncKeys, agentWriteKeys })
  // Read once for the whole table: whether the surface that manages flag credentials is reachable.
  const flagConsoleOpen = isFlagConsoleEnabled()
  const usableCount = rows.filter((row) => isCurrentlyUsable(row)).length

  return (
    <ProductShell projectSlug={projectSlug} section="setup">
      <main>
        <h1>Keys</h1>
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
                    {/* Counts what can actually AUTHENTICATE, not what is merely unrevoked. An
                        expired key is rejected on every serving path, so counting it would make
                        this page's own "what has access now" false. Expired rows still render — an
                        owner cleaning up wants to see them — they just are not counted. */}
                    {usableCount} active credential{usableCount === 1 ? '' : 's'}
                    {rows.length > usableCount ? `, ${rows.length - usableCount} expired` : ''}
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
                    {rows.map((row) => {
                      // Derived once per row: the IIFE version called `manageHref` twice, and the
                      // second call is the kind of thing that later drifts from the first.
                      const href = manageHref(row.kind, projectSlug, flagConsoleOpen)
                      const name = row.label === '' ? 'untitled' : row.label
                      return (
                        <tr key={`${row.kind}:${row.id}`}>
                          <td className="credential-cell">
                            {/* A link only where it leads somewhere. When the managing surface is
                              gated off, the name is plain text and the note below says why — the
                              credential is still listed, because it is still live. */}
                            {href === null ? <span>{name}</span> : <a href={href}>{name}</a>}
                            {/* The kind and what it may do, together, because they answer one
                              question. The link above goes to the surface that mints and revokes
                              this kind — which is why "Manage" no longer needs a column of its own. */}
                            <small>
                              {credentialTitle(row.kind)} — {row.capability}
                              {href === null && (
                                <>
                                  {' '}
                                  <strong>
                                    Managed on the flags console, which is switched off for this deployment —
                                    this credential is still live.
                                  </strong>
                                </>
                              )}
                            </small>
                          </td>
                          {/* An em dash, not a blank: this kind has no scope, which is a fact rather
                            than missing data — the same reasoning as the expiry column. */}
                          <td>{row.scope ?? '—'}</td>
                          <td>{formatUtc(row.createdAt)}</td>
                          <td>{formatExpiry(row.expiresAt)}</td>
                        </tr>
                      )
                    })}
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

        {/* ⚠️ Every minting surface, listed UNCONDITIONALLY — not only the kinds that already have
            a row (fresh reviewer, PR #123). With the console lit, `/app/keys`, `/app/agent-keys` and
            `/app/flag-credentials` leave the nav, Command Center and ⌘K (A7), and the only inbound
            links left were the per-row `Manage` links above — which exist only once you already
            hold that kind of credential. So minting a FIRST agent-write key meant typing the URL:
            the exact "you have to know the URL" defect this epic exists to remove, reintroduced one
            level down.
            It matters now rather than at the flip: A19 ships this console ENABLED, so there is no
            dark period in which the gap would have gone unnoticed. */}
        <p className="data-table__count">
          Minting and revoking happen on each kind&apos;s own page — the forms take genuinely different
          inputs, so this sprint merged the list rather than half-merging the forms. Issue a new credential:{' '}
          <a href={`/app/keys/${projectSlug}`}>API key</a>
          {flagConsoleOpen ? (
            <>
              {' · '}
              <a href={`/app/flag-credentials/${projectSlug}`}>flag snapshot or catalog sync key</a>
            </>
          ) : null}
          {' · '}
          <a href={`/app/agent-keys/${projectSlug}`}>agent write key</a>.
        </p>
      </main>
    </ProductShell>
  )
}
