import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { hashApiKey } from './api-keys'

export type AuthSuccess = {
  ok: true
  projectId: string
  /** The api_keys row id — the per-KEY rate limit is scoped to this, not to the project, so one
   *  runaway integration can't starve a tenant's other integrations (Story 2.2). */
  apiKeyId: string
  /** Per-project isolation limits, read as data from the project row so raising a real customer's
   *  ceiling is an UPDATE and never a deploy (Story 2.2 acceptance). */
  monthlyEventQuota: number
  ingestRatePerMin: number
  /** The auth user whose signup provisioned this project — null for the hand-seeded tenants that
   *  predate self-serve. Used as the activation funnel's user id (Story 3.3). */
  createdBy: string | null
  /** Null until this project's first event ever lands; the ingest route stamps it exactly once. */
  firstEventAt: string | null
}

export type AuthResult = AuthSuccess | { ok: false; status: number; error: string }

// Resolves the request's Authorization: Bearer <key> header to a project_id. The key is never
// compared in plaintext — only its sha256 hash is looked up. As of multi-tenant-activation Story
// 1.3 this reads the api_keys table (many revocable keys per project) instead of the single
// projects.api_key_hash column: a REVOKED key (revoked_at set) resolves no row and 401s
// immediately, with no cache window. The migration backfilled every existing project's key into
// api_keys, so no currently-valid key stopped working. The resolved project_id is the ONLY source
// of tenant scoping for the insert that follows — no request body field can override it.
//
// Story 2.2 widens the RESULT, not the query count: the joined project row rides along on the
// same round-trip the key lookup already made, so the new ingest guards (quota, per-key rate
// limit, first-event stamp) cost zero extra queries on the hot path.
export async function resolveProjectFromAuthHeader(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Missing or malformed Authorization header' }
  }
  const key = authHeader.slice('Bearer '.length).trim()
  if (!key) {
    return { ok: false, status: 401, error: 'Empty API key' }
  }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select(
      'id, project_id, projects(monthly_event_quota, ingest_rate_per_min, created_by, first_event_at)',
    )
    .eq('key_hash', hashApiKey(key))
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('[auth] api key lookup failed:', error)
    return { ok: false, status: 500, error: 'Auth lookup failed' }
  }
  if (!data) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  // supabase-js types a to-one embedded relation loosely without a generated Database type — the
  // same cast lib/membership.ts / lib/connector-tokens.ts already use.
  const project = data.projects as unknown as {
    monthly_event_quota: number
    ingest_rate_per_min: number
    created_by: string | null
    first_event_at: string | null
  } | null
  if (!project) {
    // A key row whose project has vanished. The FK is ON DELETE CASCADE so this should be
    // unreachable — but resolving it to "authorized, with default limits" would be an entirely
    // unguarded ingest path, so deny instead of inventing limits.
    console.error(`[auth] api key ${data.id} resolved no project row`)
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  return {
    ok: true,
    projectId: data.project_id,
    apiKeyId: data.id as string,
    monthlyEventQuota: project.monthly_event_quota,
    ingestRatePerMin: project.ingest_rate_per_min,
    createdBy: project.created_by,
    firstEventAt: project.first_event_at,
  }
}
