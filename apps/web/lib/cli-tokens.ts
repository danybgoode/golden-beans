import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'
import { hashCredential } from './credential-hash'

// golden-frijoles-cli · Sprint 1, Story 1.2 — mint / resolve / list / revoke for the CLI's
// personal access token (`cli_tokens`, migration 20260917100000).
//
// ── The one thing to understand before changing anything here ─────────────────────────────────
// This is the first credential in the system bound to a USER rather than a project, and that is
// exactly as far as it goes. It authenticates; it authorizes NOTHING. Every project-scoped thing
// the CLI does re-resolves `user_id -> project_members -> owner/member` through the same helpers
// `lib/dashboard-auth.ts` uses for a browser session (see `lib/cli-auth.ts`), so a PAT can never
// reach a project its holder's console session could not.
//
// If you are about to add a "which project is this token for?" column: don't. That is the design
// that was rejected in D1 — a project-scoped credential cannot answer `gf projects ls`, and a
// credential that carries its own authorization is one that outlives a membership change.
//
// ── Why a different prefix from `gb_key_` ─────────────────────────────────────────────────────
// `gf_pat_`, not `gb_key_`, and not because of the rebrand. The prefix is what tells a human — and
// a secret scanner — which lifecycle a leaked string belongs to and which screen kills it. An
// ingest key and an account-wide CLI token are revoked from different places and have very
// different blast radii; giving them the same shape would make the difference invisible in a paste.

const TOKEN_PREFIX = 'gf_pat_'

/**
 * The shape a CLI token has. Exported so the CLI and `gf doctor` can reject an obviously malformed
 * paste locally instead of spending a round-trip on it, and so this repo's specs can assert the
 * shape without minting one.
 *
 * 32 random bytes, base64url — the same entropy `generateApiKey` uses, plus a third.
 */
export const CLI_TOKEN_FORMAT = /^gf_pat_[A-Za-z0-9_-]{20,64}$/

export function generateCliToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

export type CliTokenRow = {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

export type CliTokenResolution =
  | { ok: true; userId: string; tokenId: string; label: string }
  // ONE reason for every rejection at the route: a caller must not be able to tell a revoked token
  // from an expired one from a wrong guess. `query_failed` is separate so a database outage never
  // renders as "your credential is dead" — those deserve different responses, and an agent that
  // treats an outage as a dead credential will go and mint another one.
  | { ok: false; reason: 'not_found' | 'query_failed' }

/**
 * Resolve a `gf_pat_…` Bearer token to the account it belongs to.
 *
 * **Reads the VIEW, never the table.** `active_cli_tokens` has revocation AND expiry welded in, and
 * expiry is compared in DATABASE time — so there is no liveness predicate in application code for a
 * refactor to drop, and no app-vs-database clock skew window in which a dead credential still
 * works. Same rule as `active_ingest_keys` and `active_agent_write_keys`.
 *
 * The shape check runs first and costs nothing: it keeps a garbage string out of the index lookup,
 * and it is NOT an oracle — a malformed token and an unknown one return the same `not_found`.
 */
export async function resolveCliToken(token: string): Promise<CliTokenResolution> {
  if (typeof token !== 'string' || !CLI_TOKEN_FORMAT.test(token)) return { ok: false, reason: 'not_found' }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('active_cli_tokens')
    .select('id, user_id, label')
    .eq('token_hash', hashCredential(token))
    .maybeSingle()

  if (error) {
    console.error('[cli-tokens] resolve failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!data) return { ok: false, reason: 'not_found' }

  return { ok: true, userId: data.user_id as string, tokenId: data.id as string, label: data.label as string }
}

/**
 * Stamp `last_used_at`. Best-effort: a failure here must never fail the request it describes.
 *
 * This column is credential hygiene, not telemetry — the console lists it so a human deciding
 * whether to revoke a token can see whether anything still uses it. A request that succeeded but
 * whose stamp failed is a slightly stale list; a request that FAILED because a stamp failed would
 * be an outage caused by bookkeeping. Same trade `recordAudit` makes, for the same reason.
 *
 * Awaited by the caller rather than fired and forgotten: an un-awaited promise in a serverless
 * function can be killed when the response is sent, which would make the column silently useless.
 */
export async function touchCliToken(tokenId: string): Promise<void> {
  try {
    const { error } = await getSupabaseServiceClient()
      .from('cli_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenId)
    if (error) console.error('[cli-tokens] touch failed:', error)
  } catch (err) {
    console.error('[cli-tokens] touch threw:', err)
  }
}

/**
 * Mint a token for `userId`. Returns the plaintext EXACTLY once; only its hash is stored.
 *
 * The caller must already have established that `userId` is the acting session's own user. There
 * is no project to authorize against — the authorization question for minting is simply "are you
 * this user?", which `getSessionUser()` answers, and the server action passes that id rather than
 * accepting one from the request (the rule AGENTS states for tenancy, applied to identity).
 */
export async function mintCliToken(input: {
  userId: string
  label: string
  expiresAt?: Date | null
}): Promise<{ ok: true; id: string; plaintext: string } | { ok: false; error: string }> {
  const plaintext = generateCliToken()
  const label = input.label.trim() || 'cli'

  const { data, error } = await getSupabaseServiceClient()
    .from('cli_tokens')
    .insert({
      user_id: input.userId,
      token_hash: hashCredential(plaintext),
      label: label.slice(0, 120),
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[cli-tokens] mint failed:', error)
    return { ok: false, error: 'Could not mint a CLI token' }
  }
  // The row id comes back so the caller can AUDIT which credential was minted. A label alone is not
  // an identifier — nothing stops two tokens being called "laptop" — and an audit trail whose job
  // is "which credential did this?" cannot answer it from a non-unique string.
  return { ok: true, id: data.id as string, plaintext }
}

/**
 * Revoke a token — but only one belonging to `userId`.
 *
 * Scoping the UPDATE by `user_id` is the security property, exactly as `revokeApiKey` scopes by
 * `project_id`: it stops one account revoking another's credential by guessing an id. Returns true
 * only when an ACTIVE row was really revoked, so the caller audits real events; idempotent, so
 * revoking twice returns false the second time rather than logging a second kill.
 */
export async function revokeCliToken(userId: string, tokenId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient()
    .from('cli_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .select('id')

  if (error) {
    console.error('[cli-tokens] revoke failed:', error)
    return false
  }
  return (data ?? []).length > 0
}

/**
 * An account's CLI tokens, newest first. **Throws** on a query failure rather than returning `[]`.
 *
 * An empty list renders as "no CLI tokens", which during an outage would invite minting a duplicate
 * — or, worse, concluding that a token someone is trying to kill is already gone. The rule
 * `lib/api-keys.ts` established, and the reason it is stated again here rather than referenced: the
 * tempting `?? []` is written at the call site, not at the reference.
 */
export async function listCliTokens(userId: string): Promise<CliTokenRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from('cli_tokens')
    .select('id, label, created_at, last_used_at, expires_at, revoked_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[cli-tokens] list failed:', error)
    throw new Error('Could not load CLI tokens')
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  }))
}
