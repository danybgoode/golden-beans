import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'
import { getSiteUrl } from './site-url'

// Story 2.1 (commercial-shell/sprint-2.md) — the MCP connector's per-project credential.
// Plaintext by design (see the migration's header comment): the value is meant to be openly
// re-displayed on the public install page, not kept secret.

const TOKEN_PREFIX = 'gb_connector_'
// Cheap, pre-DB shape check — matches the prefix + a base64url body, mirroring mb's
// `^[A-Za-z0-9_-]{16,64}$` shape check (rejects garbage before it ever reaches a query).
export const TOKEN_FORMAT = /^gb_connector_[A-Za-z0-9_-]{32,64}$/

export function generateConnectorToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString('base64url')}`
}

export type ResolvedConnectorToken = { ok: true; projectId: string; projectSlug: string } | { ok: false }

// Same 401 for "malformed", "unknown", and "revoked" — no oracle on which reason, matching the
// mb pattern this is lifted from.
export async function resolveConnectorToken(token: string): Promise<ResolvedConnectorToken> {
  if (!TOKEN_FORMAT.test(token)) return { ok: false }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('project_id, revoked_at, projects(slug)')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) {
    console.error('[connector-tokens] lookup failed:', error)
    return { ok: false }
  }
  if (!data) return { ok: false }

  // supabase-js types a to-one joined relation loosely without a generated Database type —
  // same workaround lib/tars-query.ts/lib/north-star-query.ts already use.
  const project = data.projects as unknown as { slug: string } | null
  if (!project) return { ok: false }

  return { ok: true, projectId: data.project_id, projectSlug: project.slug }
}

// Story 2.2 — the install page's copy-your-URL field. Read-only by design: v1 has no self-serve
// token minting, so a page render must never mint a token as a side effect (a bot crawl or
// prerender hitting this page shouldn't create credentials). Returns null if the project has no
// live token yet — e.g. scripts/seed-demo-project.mjs hasn't run — so the page can render an
// honest "not seeded yet" state instead of a broken URL.
export async function getActiveConnectorUrl(projectSlug: string): Promise<string | null> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .maybeSingle()
  if (projectError || !project) return null

  const { data: tokenRow, error: tokenError } = await supabase
    .from('connector_tokens')
    .select('token')
    .eq('project_id', project.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (tokenError || !tokenRow) return null

  return `${getSiteUrl()}/api/v1/public/mcp/c/${tokenRow.token}`
}

// console-ia-overhaul · Sprint 2, Story 2.1 (epic README, A10) — the signed-in Connect surface.

export type ActiveConnector = { url: string; createdAt: string; tokenId: string }

export type ConnectorStatus =
  | { state: 'absent' }
  /**
   * ⚠️ `unreadable` is NOT `absent`, and collapsing them is how a duplicate credential gets minted.
   *
   * A failed read used to return `absent`, which reads as "this project has no connector" — so the
   * page offered to mint one, and `mintConnectorToken` (which asks this same question) would have
   * agreed. A transient database error could therefore produce a SECOND live token while the first
   * was merely unread. Cross-review (agy) raised this as the compounding half of the race below.
   */
  | { state: 'unreadable' }
  /**
   * EVERY active token, not just the newest — and that is the fix for the race, not a nicety.
   *
   * Nothing at the database level stops two active tokens for one project: there is no unique index
   * on `(project_id) WHERE revoked_at IS NULL` (checked against production 2026-08-27 — the table
   * has exactly three indexes, none of them this), and `mintConnectorToken` is a check-then-act.
   *
   * The old shape returned only the newest, which turned that race into something far worse than a
   * duplicate: the older token stayed **valid for API access and invisible on every screen**, so no
   * owner could ever revoke it. A credential you cannot see is a credential you cannot revoke.
   *
   * Returning all of them makes the race survivable rather than preventing it — an owner sees two
   * URLs and can kill one. Preventing it needs a partial unique index, which is a migration.
   */
  | { state: 'active'; tokens: ActiveConnector[] }

/**
 * What `Setup › Connect` can honestly say about this project's connector.
 *
 * ── "Last used" is deliberately NOT one of the states (A10) ───────────────────────────────────
 * The story originally asked for "Connected · last used <when>". There is no source of truth for
 * that anywhere in this product: `connector_tokens` has five columns (`id, project_id, token,
 * revoked_at, created_at`), the MCP route resolves a token and writes nothing, and `audit_log` had
 * no connector action at all before this sprint. Answering it would need a migration plus a write on
 * a public read path.
 *
 * Daniel's decision (2026-08-27) was to drop it rather than build it, so this returns what the data
 * supports. **The page must say, in words, that a URL existing is not the same as Claude having used
 * it** — a status line that blurs those is the `CODE-QUALITY` rule 3 defect of prose asserting a
 * property the system cannot observe.
 *
 * Read-only, like `getActiveConnectorUrl` above and for the same reason: a page render must never
 * mint a credential as a side effect.
 */
export async function getConnectorStatus(projectId: string): Promise<ConnectorStatus> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('id, token, created_at')
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  // A failed read is `unreadable`, NOT `absent`. The page says it could not check rather than
  // claiming there is nothing, and `mintConnectorToken` refuses rather than minting a second token
  // on the strength of a question that was never answered.
  if (error) {
    console.error('[connector-tokens] status lookup failed:', error)
    return { state: 'unreadable' }
  }
  if (!data || data.length === 0) return { state: 'absent' }
  return {
    state: 'active',
    tokens: data.map((row) => ({
      url: `${getSiteUrl()}/api/v1/public/mcp/c/${row.token}`,
      createdAt: row.created_at as string,
      tokenId: row.id as string,
    })),
  }
}

export type MintedConnectorToken =
  | { ok: true; url: string; tokenId: string }
  | { ok: false; reason: 'already-active' | 'unreadable' | 'write-failed' }

/**
 * Mint this project's connector token — the FIRST self-serve connector credential in the product.
 *
 * `getActiveConnectorUrl`'s comment says "v1 has no self-serve token minting", and that was true
 * until Daniel authorized this (A10). Building the surface is this epic's work; **pressing it
 * against production is his, by name.**
 *
 * ── Refuses when one is already active, and that is not politeness ────────────────────────────
 * Rotation is revoke-then-mint, two deliberate acts, rather than a mint that quietly leaves a live
 * key behind it.
 *
 * ⚠️ **This check is NOT atomic, and the application cannot make it so.** It is a check-then-act
 * with no unique index behind it: two concurrent mints both see "none active" and both insert.
 * Cross-review (agy) raised this as Blocking, correctly.
 *
 * What makes it survivable is on the READ side — `getConnectorStatus` returns every active token, so
 * a duplicate is *visible and revocable* rather than a live credential hidden behind a `LIMIT 1`.
 * That was the actual danger; two visible URLs is a mess an owner can clean up, one invisible one is
 * not. A credential you cannot see is a credential you cannot revoke.
 *
 * ✅ **CLOSED at the database, 2026-08-27.** Daniel authorized the migration;
 * `20260827120000_connector_token_uniqueness.sql` adds a PARTIAL unique index on `(project_id)
 * WHERE revoked_at IS NULL`, applied to production BEFORE the merge that deploys this code. Verified
 * by attempting the forbidden write against production and watching it be rejected — and by
 * confirming rotation (revoke, then mint) is still permitted, which a plain `UNIQUE (project_id)`
 * would have broken.
 *
 * So the race is now impossible rather than merely survivable. The `already-active` pre-check stays
 * because it produces a readable sentence; the index is what makes the guarantee true.
 * The caller re-checks ownership AND `CONNECTOR_ENABLED` before reaching here (AGENTS rule #3: the
 * two kill switches are independent, and minting the second must never route around the first).
 */
export async function mintConnectorToken(projectId: string): Promise<MintedConnectorToken> {
  const supabase = getSupabaseServiceClient()
  const existing = await getConnectorStatus(projectId)
  if (existing.state === 'active') return { ok: false, reason: 'already-active' }
  // Refuse on a failed read rather than minting. "I could not check" is not "there is none", and
  // treating them the same is what let a transient error create a second live credential.
  if (existing.state === 'unreadable') return { ok: false, reason: 'unreadable' }

  const token = generateConnectorToken()
  const { data, error } = await supabase
    .from('connector_tokens')
    .insert({ project_id: projectId, token })
    .select('id')
    .single()
  if (error || !data) {
    // 23505 is the partial unique index doing its job: another request won the race between our
    // pre-check and this insert. That is the ONE outcome here that is not a failure — the project
    // has exactly one active token, which is what the caller wanted, so it reports `already-active`
    // and the page tells the reader to reload rather than showing a raw constraint error.
    //
    // The pre-check above is not redundant with the index. The index guarantees correctness under
    // concurrency; the check turns the common case into a sentence an operator can act on. They
    // answer different questions, which is why both are here.
    if (error?.code === '23505') return { ok: false, reason: 'already-active' }
    console.error('[connector-tokens] mint failed:', error)
    return { ok: false, reason: 'write-failed' }
  }
  return { ok: true, url: `${getSiteUrl()}/api/v1/public/mcp/c/${token}`, tokenId: data.id as string }
}

/**
 * Revoke a connector token, scoped to the project that owns it.
 *
 * `project_id` is in the WHERE clause, not just the id: pod-report S3's cross-review established
 * that an endpoint whose mutation is not discriminator-scoped lets a caller revoke a row they can
 * name while the audit trail records the wrong thing. Here it means a token id from another project
 * matches nothing rather than being revoked under this project's audit label.
 */
export async function revokeConnectorToken(projectId: string, tokenId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('connector_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .select('id')
  if (error) {
    console.error('[connector-tokens] revoke failed:', error)
    return false
  }
  return (data?.length ?? 0) > 0
}
