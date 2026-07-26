import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { parseLens, type PodReportLens } from './pod-report-lens'
import { hashCredential } from './credential-hash'
import { generateShareToken } from './share-token'

// pod-report · Sprint 3, Story 3.1 — scoped, revocable share links.
//
// Rows in the api_keys taxonomy with `scope = 'share'` (migration 20260803100000). This module owns
// mint / resolve / list; REVOCATION is deliberately NOT reimplemented here — `revokeApiKey` in
// lib/api-keys.ts already does it, already audits it, and already appears on the dashboard's key
// screen. A second revoke path is the one that gets forgotten when a link needs killing urgently.
//
// ── What a share token is and is not ──────────────────────────────────────────────────────────
// It authenticates NOTHING except "render this tenant's report through this lens". It cannot ingest
// (lib/auth.ts reads the `active_ingest_keys` view, whose definition excludes scope='share'), it
// grants no session, and it maps to no user. It is a bearer capability in a URL, treated as such:
// stored hashed, revocable, optionally expiring.

// The token's pure half lives in lib/share-token.ts (generation, shape) and lib/credential-hash.ts
// (hashing, shared with ingest keys), so a spec can reach both without loading this module's
// 'server-only' import — the lib/flags.ts pattern from Roadmap/LEARNINGS.md.
export { generateShareToken } from './share-token'
export { hashCredential } from './credential-hash'

export type ShareRow = {
  id: string
  label: string
  lens: PodReportLens
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

export type ShareResolution =
  | { ok: true; projectId: string; projectSlug: string; lens: PodReportLens; shareId: string }
  // One reason for every rejection at the route: a caller must not be able to tell a revoked link
  // from a wrong guess. `query_failed` is separate so a database outage never renders as "this link
  // is dead" — a revoked link and a broken engine deserve different pages.
  | { ok: false; reason: 'not_found' | 'query_failed' }

/**
 * Resolve a share token from a URL to a tenant and a lens.
 *
 * ── The two properties this function exists to hold ───────────────────────────────────────────
 * 1. The LENS comes from the stored row, never from the request. There is no lens parameter here
 *    and no caller-supplied default — the acceptance criterion is met by there being nowhere else
 *    for the value to originate.
 * 2. The PROJECT comes from the stored row too, so a share route never accepts a project slug at
 *    all (AGENTS: no request-derived read path may cross projects). The URL carries one opaque
 *    string and nothing else that means anything.
 *
 * Expiry and revocation are both enforced in the query rather than in a branch afterwards, so an
 * expired row cannot be resolved and then conditionally used.
 */
export async function resolveShareToken(token: string): Promise<ShareResolution> {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'not_found' }

  const supabase = getSupabaseServiceClient()
  // ── Reads the VIEW, in database time ────────────────────────────────────────────────────────
  // `active_share_links` (20260803120000) has scope, revocation AND expiry welded in, exactly as
  // `active_ingest_keys` does for the other credential kind in this table. The previous version
  // compared expiry in JavaScript by interpolating this process's clock into a PostgREST filter
  // string, which meant the two credential kinds were judged live by two different clocks — any
  // app-vs-database skew was a window where an expired link still rendered (cross-review, Agy,
  // PR #33). One clock, and no filter built by string concatenation.
  const { data, error } = await supabase
    .from('active_share_links')
    .select('id, project_id, share_lens, project_slug')
    .eq('key_hash', hashCredential(token))
    .maybeSingle()

  if (error) {
    console.error('[report-shares] resolve failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!data) return { ok: false, reason: 'not_found' }

  // The view's JOIN is INNER, so a row whose project vanished simply is not returned — the same way
  // `active_ingest_keys` absorbs that case. The lens check below stays: it should be impossible
  // (the CHECK constraint makes a scope='share' row without a valid lens unstorable), but the
  // failure mode of guessing is picking a default AUDIENCE for a token whose audience is unknown,
  // and the widest default is the one a tired reader reaches for.
  const projectSlug = data.project_slug as string | null
  if (!projectSlug) {
    console.error(`[report-shares] share ${data.id} resolved no project slug`)
    return { ok: false, reason: 'not_found' }
  }
  const lens = parseLens(data.share_lens)
  if (!lens) {
    console.error(`[report-shares] share ${data.id} carries an unrecognised lens`)
    return { ok: false, reason: 'not_found' }
  }

  return { ok: true, projectId: data.project_id as string, projectSlug, lens, shareId: data.id as string }
}

/**
 * Mint a share link. Returns the plaintext token EXACTLY once — it is never stored or recoverable.
 *
 * The caller must already have authorized the acting user as an OWNER of `projectId`
 * (requireProjectOwnership). Minting a link that shows internal delivery data to an outsider is a
 * credential-administration act, not an ordinary member action — the same least-privilege split
 * multi-tenant-activation S1 had to learn twice (LEARNINGS: a role column is not an access rule).
 */
export async function mintShareLink(input: {
  projectId: string
  lens: PodReportLens
  label: string
  expiresAt?: Date | null
}): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient()
  const token = generateShareToken()

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      project_id: input.projectId,
      key_hash: hashCredential(token),
      label: input.label.trim() || 'untitled share',
      scope: 'share',
      share_lens: input.lens,
      expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[report-shares] mint failed:', error)
    return { ok: false, error: 'Could not mint share link' }
  }
  return { ok: true, token, id: data.id as string }
}

/**
 * Revoke a SHARE row, and only a share row.
 *
 * ── Why this is not just `revokeApiKey` (cross-review, Codex, PR #33) ─────────────────────────
 * `revokeApiKey` revokes any row in `api_keys` scoped to the project, which is correct for the key
 * screen and wrong here. The share action accepted any row id, so an owner submitting a forged
 * request with an INGEST key's id would have revoked that key — and the audit trail would record
 * `report_share_revoked`. The key is one an owner may revoke anyway, so the privilege boundary held;
 * what broke is the trail. An incident responder searching `api_key_revoked` for "why did ingest
 * stop?" would find nothing, because the row describing it is filed under share links.
 *
 * An audit log whose entries can be mislabelled by choosing which endpoint to call is worse than no
 * audit log, because it is read as authoritative. The scope predicate makes the mislabel impossible
 * rather than merely unlikely.
 *
 * Returns true only when an ACTIVE share row was actually revoked — so the caller audits real
 * events, never no-ops (the same rule lib/api-keys.ts's revoke already follows).
 */
export async function revokeShareLink(projectId: string, shareId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('project_id', projectId)
    // The predicate this function exists for. Without it, the id decides what gets revoked and the
    // ENDPOINT decides what the audit says — two facts that must not be able to disagree.
    .eq('scope', 'share')
    .is('revoked_at', null)
    .select('id')
  if (error) {
    console.error('[report-shares] revoke failed:', error)
    return false
  }
  return (data ?? []).length > 0
}

/**
 * A project's share links. Throws on a query failure rather than returning [].
 *
 * An empty list renders as "no links exist", which during an outage would invite concluding that a
 * leaked link is already gone — the exact reasoning `listProjectKeys` was hardened against on
 * 2026-07-20. Revoked rows are INCLUDED, because "was this killed?" is the question this list is
 * most often opened to answer.
 */
export async function listShareLinks(projectId: string): Promise<ShareRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, share_lens, created_at, expires_at, revoked_at')
    .eq('project_id', projectId)
    .eq('scope', 'share')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[report-shares] list failed:', error)
    throw new Error('Could not load share links')
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    // The CHECK constraint makes an invalid lens unstorable, so this fallback should be dead code.
    // It falls back to the NARROWEST lens rather than the widest, so that if it ever does fire, a
    // display bug shows less than the truth instead of implying a link grants more than it does.
    lens: (parseLens(r.share_lens) ?? 'investor') as PodReportLens,
    createdAt: r.created_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }))
}
