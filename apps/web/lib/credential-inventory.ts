// console-ia-overhaul · Sprint 2, Story 2.3 — one answer to "what has access to this project?"
//
// ── Why a projection module and not four tables on a page ─────────────────────────────────────
// The four credential kinds have four different row shapes (`ApiKeyRow` has no expiry at all;
// `FlagReadKeyRow` carries an environment; `FlagSyncKeyRow` carries a source). Rendering them as
// four tables would be the four existing pages stacked vertically, which answers "which subsystem
// minted this" — the question the story says nobody should have to ask. One list needs one shape.
//
// It is pure and lives here so the WORDS are testable. The story's actual deliverable is the
// "what it may do" column in plain language, and words on a credential surface belong where the
// merge gate can read them, not inside a client island only a signed-in browser can reach
// (`flags-console-parity` put its load-bearing sentences in `lib/flag-console-copy.ts` for exactly
// this reason).

import type { ApiKeyRow } from './api-keys'
import type { FlagReadKeyRow } from './flag-read-keys'
import type { FlagSyncKeyRow } from './flag-sync-keys'
import type { AgentWriteKeyRow } from './agent-write-keys'

/**
 * The credential kinds this page lists.
 *
 * A CLOSED union, and `share` is deliberately absent — see `CREDENTIAL_KINDS_NOT_LISTED`. Adding a
 * fifth kind is a compile error at `CREDENTIAL_COPY`, which is the point: a credential that reaches
 * this page without a plain-language description of what it may do would defeat the page.
 */
export type CredentialKind = 'ingest' | 'flag_read' | 'flag_sync' | 'agent_write'

export type CredentialRow = {
  id: string
  kind: CredentialKind
  /** The operator's own name for it. `''` renders as "untitled" — never as an empty cell. */
  label: string
  /** Plain words: what holding this key lets someone do. Never the scope name. */
  capability: string
  /** Where it applies — an environment, a sync source — or null when the kind has no scope. */
  scope: string | null
  createdAt: string
  /**
   * `null` means **no expiry**, which is a different fact from "unknown" and must render as words.
   *
   * Three of the five live scopes on the production tenant carry no expiry at all, so an empty cell
   * here would be the common case — and an empty cell reads as missing data. Unknown-versus-never is
   * exactly the distinction an owner scans this column to make.
   */
  expiresAt: string | null
}

/**
 * What each kind may actually do, in the words an operator would use.
 *
 * These are the story's deliverable. Each says what the key AUTHORIZES, not which table it lives in
 * or which subsystem minted it — "sends events into this project" rather than "ingest scope".
 */
const CREDENTIAL_COPY: Record<CredentialKind, { title: string; capability: string }> = {
  ingest: {
    title: 'API key',
    capability: 'Send events into this project, and read its funnels through the SDK.',
  },
  flag_read: {
    title: 'Flag snapshot key',
    capability: 'Read the flag snapshot for one environment. Cannot change what any flag serves.',
  },
  flag_sync: {
    title: 'Catalog sync key',
    capability:
      'Create flag definitions from an outside catalog. Cannot turn a flag on or off in any environment.',
  },
  agent_write: {
    title: 'Agent write key',
    capability: 'Let your own agent claim, resolve and dismiss tasks in this project over MCP.',
  },
}

export function credentialTitle(kind: CredentialKind): string {
  return CREDENTIAL_COPY[kind].title
}

export function credentialCapability(kind: CredentialKind): string {
  return CREDENTIAL_COPY[kind].capability
}

/**
 * ⚠️ What this page does NOT list, named rather than left to be noticed.
 *
 * The page's promise is "everything that has access to this project", and share links are access —
 * a bearer token that renders this project's Pod Report to whoever holds the URL. They are not here
 * because they have their own Setup surface (`/app/shares`) with their own lens and audience
 * controls, and folding them in would mean either duplicating that surface or truncating it.
 *
 * So the page SAYS SO. A page claiming completeness while omitting live bearer tokens is worse than
 * one that scopes its claim honestly — and production carries two active share links on the tenant
 * this was designed against, so this is a real omission and not a hypothetical one.
 *
 * `flag_admin` exists in the schema's scope CHECK constraint but has no minting surface and no rows
 * in production; it is listed here so the next reader knows it was considered rather than missed.
 */
export const CREDENTIAL_KINDS_NOT_LISTED = [
  {
    // ⚠️ THE ONE THIS PAGE MOST NEEDED, and it was missing until cross-review found it (fresh
    // reviewer, PR #123, Blocking). A `connector_tokens` row is a bearer credential that reads the
    // WHOLE project through `/api/v1/public/mcp/c/<token>`; it is stored plaintext, it is a URL (so
    // it travels through history, Referer headers, proxy logs and screenshots), and **this very
    // sprint made it self-serve mintable by any project owner.**
    //
    // It was invisible to the completeness test because that test was keyed on `api_keys.scope`, and
    // connector tokens live in a different table — the universe was wrong, not the list. An owner
    // investigating a suspected leak would have read "everything that can reach this project",
    // seen four rows and one exclusion, and concluded nothing else had access.
    kind: 'connector',
    label: 'Connector URLs',
    where: '/app/setup/connect',
    why: 'A bearer URL that reads this whole project over MCP — managed on its own Setup surface.',
  },
  {
    kind: 'share',
    label: 'Share links',
    where: '/app/shares',
    why: 'A public report link with its own audience lens — managed on its own Setup surface.',
  },
  {
    kind: 'flag_admin',
    label: 'Flag admin keys',
    where: null,
    why: 'Exists in the schema but has no minting surface and no live rows.',
  },
] as const

/**
 * Is this credential currently able to authenticate?
 *
 * Revoked is not the only way a key stops working. Every serving path requires
 * `expires_at IS NULL OR expires_at > now()` — the flag-serving and agent-write migrations both
 * spell it out — so an expired-but-unrevoked row has exactly zero access.
 *
 * This page's lede is "Revoked keys are not shown — this is what has access **now**", and its
 * caption counts what it lists. Counting a key that cannot authenticate makes that sentence false
 * (fresh reviewer, PR #123). It was graded a Nit while the console was dark and re-graded once A19
 * put this page in front of every owner on day one — the surface whose entire job is being an
 * accurate access inventory.
 *
 * The row still RENDERS, saying "Expired" in its own column: an owner cleaning up wants to see it.
 * It is the COUNT that must not claim it.
 */
export function isCurrentlyUsable(row: CredentialRow, now: Date = new Date()): boolean {
  if (row.expiresAt === null) return true
  const at = new Date(row.expiresAt)
  // An unparseable expiry counts as usable: we cannot prove it is dead, and over-counting errs
  // toward showing an owner something to check rather than hiding live access.
  if (Number.isNaN(at.getTime())) return true
  return at.getTime() > now.getTime()
}

/**
 * Merge the four reads into one list, newest first.
 *
 * REVOKED ROWS ARE DROPPED. Each source list may contain them (`revokedAt` is on every row shape),
 * and this page answers "what has access to this project *now*" — a revoked key has none. The
 * per-kind pages keep showing their own history; this one is a live inventory, and mixing the two
 * would make the answer to "who can read my data" require reading a date column.
 */
export function buildCredentialInventory(input: {
  apiKeys: readonly ApiKeyRow[]
  flagReadKeys: readonly FlagReadKeyRow[]
  flagSyncKeys: readonly FlagSyncKeyRow[]
  agentWriteKeys: readonly AgentWriteKeyRow[]
}): CredentialRow[] {
  const rows: CredentialRow[] = [
    ...input.apiKeys
      .filter((key) => key.revokedAt === null)
      .map((key) => ({
        id: key.id,
        kind: 'ingest' as const,
        label: key.label,
        capability: CREDENTIAL_COPY.ingest.capability,
        scope: null,
        createdAt: key.createdAt,
        // `ApiKeyRow` has no `expiresAt` field at all — ingest keys live until revoked. Written as
        // an explicit `null` rather than an omission so the column reads "no expiry", not blank.
        expiresAt: null,
      })),
    ...input.flagReadKeys
      .filter((key) => key.revokedAt === null)
      .map((key) => ({
        id: key.id,
        kind: 'flag_read' as const,
        label: key.label,
        capability: CREDENTIAL_COPY.flag_read.capability,
        scope: key.environment,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      })),
    ...input.flagSyncKeys
      .filter((key) => key.revokedAt === null)
      .map((key) => ({
        id: key.id,
        kind: 'flag_sync' as const,
        label: key.label,
        capability: CREDENTIAL_COPY.flag_sync.capability,
        scope: key.source,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      })),
    ...input.agentWriteKeys
      .filter((key) => key.revokedAt === null)
      .map((key) => ({
        id: key.id,
        kind: 'agent_write' as const,
        label: key.label,
        capability: CREDENTIAL_COPY.agent_write.capability,
        scope: null,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      })),
  ]

  // Newest first, so the thing you just minted is at the top — the state a reader is most often
  // here to check. Ties broken by id so the order is total and a render cannot reshuffle.
  return rows.sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt)
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id)
  })
}

/**
 * How an expiry renders. Words in every case, never an empty cell.
 *
 * `null` is "No expiry", which is a deliberate state an owner chose (or the kind does not support
 * one) — not missing information. An expiry already in the past says so plainly rather than showing
 * a date the reader has to compare against today: a key that has expired is not access, and the
 * whole column exists to be scanned.
 */
export function formatExpiry(expiresAt: string | null, now: Date = new Date()): string {
  if (expiresAt === null) return 'No expiry'
  const at = new Date(expiresAt)
  if (Number.isNaN(at.getTime())) return 'Unknown'
  return at.getTime() <= now.getTime() ? 'Expired' : `Expires ${at.toISOString().slice(0, 10)}`
}
