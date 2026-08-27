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

export type ConnectorStatus =
  | { state: 'absent' }
  /** `tokenId` is the row id, for the revoke path. NOT the token — that is the credential itself. */
  | { state: 'active'; url: string; createdAt: string; tokenId: string }

/**
 * What `Setup › Connect` can honestly say about this project's connector.
 *
 * ── Two states, and "last used" is deliberately NOT one of them (A10) ─────────────────────────
 * The story originally asked for "Connected · last used <when>". There is no source of truth for
 * that anywhere in this product: `connector_tokens` has five columns (`id, project_id, token,
 * revoked_at, created_at`), the MCP route resolves a token and writes nothing, and `audit_log` has
 * no connector action among its thirteen. Answering it would need a migration plus a write on a
 * public read path.
 *
 * Daniel's decision (2026-08-27) was to drop it rather than build it, so this returns what the data
 * supports: a URL exists since a date, or it does not exist. **The page must say, in words, that a
 * URL existing is not the same as Claude having used it** — a status line that blurs those is the
 * `CODE-QUALITY` rule 3 defect of prose asserting a property the system cannot observe.
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
    .limit(1)
    .maybeSingle()
  // A failed read is `absent`, which is the safe direction: the page offers to mint, and minting is
  // an explicit owner action that would surface its own error. Reporting `active` on a failed read
  // would show a reader a URL that is not there.
  if (error) {
    console.error('[connector-tokens] status lookup failed:', error)
    return { state: 'absent' }
  }
  if (!data) return { state: 'absent' }
  return {
    state: 'active',
    url: `${getSiteUrl()}/api/v1/public/mcp/c/${data.token}`,
    createdAt: data.created_at as string,
    tokenId: data.id as string,
  }
}

export type MintedConnectorToken =
  { ok: true; url: string; tokenId: string } | { ok: false; reason: 'already-active' | 'write-failed' }

/**
 * Mint this project's connector token — the FIRST self-serve connector credential in the product.
 *
 * `getActiveConnectorUrl`'s comment says "v1 has no self-serve token minting", and that was true
 * until Daniel authorized this (A10). Building the surface is this epic's work; **pressing it
 * against production is his, by name.**
 *
 * ── Refuses when one is already active, and that is not politeness ────────────────────────────
 * `getActiveConnectorUrl` and `getConnectorStatus` both take the NEWEST unrevoked row, so minting a
 * second would silently orphan the first: still valid, still authorizing reads, and no longer
 * visible on any screen. A credential you cannot see is a credential you cannot revoke. Rotation is
 * therefore revoke-then-mint, two deliberate acts, rather than a mint that quietly leaves a live key
 * behind it.
 *
 * The caller re-checks ownership AND `CONNECTOR_ENABLED` before reaching here (AGENTS rule #3: the
 * two kill switches are independent, and minting the second must never route around the first).
 */
export async function mintConnectorToken(projectId: string): Promise<MintedConnectorToken> {
  const supabase = getSupabaseServiceClient()
  const existing = await getConnectorStatus(projectId)
  if (existing.state === 'active') return { ok: false, reason: 'already-active' }

  const token = generateConnectorToken()
  const { data, error } = await supabase
    .from('connector_tokens')
    .insert({ project_id: projectId, token })
    .select('id')
    .single()
  if (error || !data) {
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
