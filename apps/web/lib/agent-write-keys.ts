import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { hashCredential } from './credential-hash'
import { generateApiKey } from './api-keys'

// signals-loop · Sprint 3, Story 3.1 — the `agent_write` credential scope.
//
// Rows in the api_keys taxonomy with `scope = 'agent_write'` (migration 20260806100000). This module
// owns mint / resolve / list / revoke for the credential that authorizes the engine's FIRST public
// mutation surface — Story 3.2's staged write tools.
//
// ── Why this credential exists at all (epic README, Amendment 2) ───────────────────────────────
// The obvious design was "let the connector token authorize writes too." It is unsafe for a reason
// specific to this codebase: `connector_tokens` are stored in PLAINTEXT by design and are
// deliberately re-displayed on the public `/install` page. A URL-borne credential travels through
// browser history, Referer headers, proxy logs and screenshots — the report_shares migration wrote
// that down at length. Adding writes to it would hand a mutation credential to everything that has
// ever seen an install page.
//
// So a write requires TWO credentials that must agree:
//   • the `gb_connector_…` token in the MCP URL path — identifies the project, authorizes reads
//   • a `gb_key_…` with scope='agent_write' in an Authorization: Bearer header — authorizes writes
// and BOTH must resolve to the same project_id (see `authorizeAgentWrite`).
//
// ── Why revocation IS reimplemented here, when report-shares deliberately did not ──────────────
// lib/report-shares.ts documents the opposite decision — it reuses `revokeApiKey` — and then a
// cross-review finding forced `revokeShareLink` into existence anyway, for the reason that applies
// here a fortiori: `revokeApiKey` WOULD revoke ANY row in api_keys scoped to the project (it is
// scoped to `ingest` since design-system-rails S4.5 — see its own comment), so the
// caller's chosen ENDPOINT decides what the audit trail says. An operator searching
// `agent_write_key_revoked` for "why did the agent stop writing?" must not find the answer filed
// under `api_key_revoked`, and vice versa. The scope predicate makes the mislabel impossible rather
// than unlikely (Roadmap/LEARNINGS.md: an audit label that can be chosen by picking an endpoint is
// worse than no audit log).

/** The write key reuses the ingest key's generator and prefix — one credential shape, one hash. */
export { generateApiKey } from './api-keys'

export type AgentWriteKeyRow = {
  id: string
  label: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export type AgentWriteResolution =
  | { ok: true; projectId: string; projectSlug: string; keyId: string }
  // One reason for every rejection at the route: a caller must not be able to tell a revoked key
  // from an expired one from a wrong guess. `query_failed` is separate so a database outage never
  // renders as "your credential is dead" — those deserve different responses.
  | { ok: false; reason: 'not_found' | 'query_failed' }

/**
 * Resolve an `agent_write` Bearer key to the tenant it belongs to.
 *
 * Reads the VIEW, never the table. `active_agent_write_keys` has scope, revocation AND expiry
 * welded in, so the scope filter is not a line of application code that a refactor can drop — there
 * is no filter in application code to drop. That matters more here than for either sibling: this
 * table now holds three credential kinds in one `key_hash` namespace, and if the WRITE lookup ever
 * stopped filtering by scope, every ingest key ever issued and every share token ever pasted into a
 * Slack thread would become a mutation credential for that tenant.
 *
 * Expiry is compared in DATABASE time, inside the view, for the same reason `active_share_links`
 * exists: two credential kinds judged live by two different clocks makes any app-vs-database skew a
 * window in which a dead credential still works.
 */
export async function resolveAgentWriteKey(key: string): Promise<AgentWriteResolution> {
  if (!key || typeof key !== 'string') return { ok: false, reason: 'not_found' }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('active_agent_write_keys')
    .select('id, project_id, project_slug')
    .eq('key_hash', hashCredential(key))
    .maybeSingle()

  if (error) {
    console.error('[agent-write-keys] resolve failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!data) return { ok: false, reason: 'not_found' }

  const projectSlug = data.project_slug as string | null
  if (!projectSlug) {
    console.error(`[agent-write-keys] key ${data.id} resolved no project slug`)
    return { ok: false, reason: 'not_found' }
  }

  return {
    ok: true,
    projectId: data.project_id as string,
    projectSlug,
    keyId: data.id as string,
  }
}

/**
 * The two-credential check, in one place.
 *
 * `connectorProjectId` is the project the MCP route ALREADY resolved from the URL token. This
 * function does not re-resolve it, and that is deliberate: pod-report S3's cross-review found a
 * share route re-resolving its tenant from a mutable `slug` instead of carrying the `project_id`
 * its credential had already resolved. The caller holds the id; passing it is free.
 *
 * The comparison is the whole security property of Amendment 2. A connector token for project A
 * plus a write key for project B must NOT authorize a write to either — not to A (the write key
 * does not belong to A) and not to B (the reader never proved it may touch B). So the mismatch is a
 * flat refusal, never a fallback to one side.
 */
export async function authorizeAgentWrite(
  connectorProjectId: string,
  bearerKey: string | null | undefined
): Promise<
  | { ok: true; keyId: string }
  | { ok: false; reason: 'missing' | 'not_found' | 'project_mismatch' | 'query_failed' }
> {
  if (!bearerKey) return { ok: false, reason: 'missing' }

  const resolved = await resolveAgentWriteKey(bearerKey)
  if (!resolved.ok) return { ok: false, reason: resolved.reason }

  if (resolved.projectId !== connectorProjectId) {
    // Logged because a genuine cross-project attempt is worth seeing in operations, and there is no
    // legitimate flow that produces it. NOT distinguished in the caller's response — see the route.
    console.warn(
      `[agent-write-keys] refused: write key resolves to a different project than the connector token`
    )
    return { ok: false, reason: 'project_mismatch' }
  }

  return { ok: true, keyId: resolved.keyId }
}

/**
 * Mint an `agent_write` key. Returns the plaintext EXACTLY once — it is never stored or recoverable.
 *
 * The caller must already have authorized the acting user as an OWNER of `projectId`. Minting a
 * credential that can mutate a tenant's task queue is a credential-administration act, not an
 * ordinary member action — the least-privilege split multi-tenant-activation S1 had to learn twice
 * (LEARNINGS: a role column in the schema is not an access rule; grep for who reads it).
 */
export async function mintAgentWriteKey(input: {
  projectId: string
  label: string
  expiresAt?: Date | null
}): Promise<{ ok: true; plaintext: string; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient()
  const plaintext = generateApiKey()

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      project_id: input.projectId,
      key_hash: hashCredential(plaintext),
      label: input.label.trim() || 'untitled agent key',
      scope: 'agent_write',
      // No share_lens. A lens is an audience for a READ; a write credential has no audience, and
      // the CHECK constraint rejects the row if one is set anyway.
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[agent-write-keys] mint failed:', error)
    return { ok: false, error: 'Could not mint agent write key' }
  }
  // Returns the row id so the caller can AUDIT which credential was minted. A label alone is not an
  // identifier — nothing stops two keys being called "claude", and an audit trail whose job is "who
  // minted the credential that resolved this task?" cannot answer it from a non-unique string.
  return { ok: true, plaintext, id: data.id as string }
}

/**
 * Revoke an `agent_write` row, and only an agent_write row.
 *
 * Returns true only when an ACTIVE row was actually revoked, so the caller audits real events and
 * never no-ops. Idempotent: revoking twice returns false the second time.
 */
export async function revokeAgentWriteKey(projectId: string, keyId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    // Scoping by project is the property that stops a member of one project revoking another
    // project's credential by guessing its id.
    .eq('project_id', projectId)
    // ...and scoping by SCOPE is the property that stops this endpoint revoking an ingest key while
    // the trail records `agent_write_key_revoked`. See this module's header.
    .eq('scope', 'agent_write')
    .is('revoked_at', null)
    .select('id')

  if (error) {
    console.error('[agent-write-keys] revoke failed:', error)
    return false
  }
  return (data ?? []).length > 0
}

/**
 * A project's agent-write keys, newest first. Throws on a query failure rather than returning [].
 *
 * An empty list renders as "no agent credentials", which during an outage would invite minting a
 * duplicate — or, worse, concluding that a credential someone is trying to kill is already gone.
 * A thrown error surfaces the real operational failure (the rule lib/api-keys.ts established).
 */
export async function listAgentWriteKeys(projectId: string): Promise<AgentWriteKeyRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, created_at, expires_at, revoked_at')
    .eq('project_id', projectId)
    .eq('scope', 'agent_write')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[agent-write-keys] list failed:', error)
    throw new Error('Could not load agent write keys')
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }))
}
