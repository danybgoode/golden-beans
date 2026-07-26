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
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, project_id, share_lens, projects(slug)')
    .eq('key_hash', hashCredential(token))
    .eq('scope', 'share')
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle()

  if (error) {
    console.error('[report-shares] resolve failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!data) return { ok: false, reason: 'not_found' }

  // supabase-js types a to-one embedded relation loosely without a generated Database type — the
  // same cast lib/membership.ts and lib/connector-tokens.ts already use.
  const project = data.projects as unknown as { slug: string } | null

  // Both of these should be impossible: the FK is ON DELETE CASCADE, and the CHECK constraint makes
  // a scope='share' row without a valid lens unstorable. They are checked anyway because the
  // failure mode of guessing is picking a default audience for a token whose audience is unknown —
  // and the widest default is the one a tired reader would reach for.
  if (!project) {
    console.error(`[report-shares] share ${data.id} resolved no project row`)
    return { ok: false, reason: 'not_found' }
  }
  const lens = parseLens(data.share_lens)
  if (!lens) {
    console.error(`[report-shares] share ${data.id} carries an unrecognised lens`)
    return { ok: false, reason: 'not_found' }
  }

  return { ok: true, projectId: data.project_id as string, projectSlug: project.slug, lens, shareId: data.id as string }
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
