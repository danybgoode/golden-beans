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
  // ── Reads the VIEW, not the table (pod-report S3, 20260803100000_report_shares.sql) ─────────
  // `active_ingest_keys` has `scope = 'ingest' AND revoked_at IS NULL AND not expired` welded into
  // its definition, and joins the project row. That is deliberate and it is the security property,
  // not a tidiness preference: share-link tokens now live in this same `api_keys` table and travel
  // in URLs — browser history, Referer headers, a screenshot in a chat thread. If the scope filter
  // lived here as a `.eq('scope','ingest')` chain link, a refactor or a badly-resolved merge could
  // drop it and turn every share link ever pasted anywhere into a write credential.
  //
  // There is no filter here to drop. Do not "optimise" this back onto `api_keys` directly.
  const { data, error } = await supabase
    .from('active_ingest_keys')
    .select('id, project_id, monthly_event_quota, ingest_rate_per_min, created_by, first_event_at')
    .eq('key_hash', hashApiKey(key))
    .maybeSingle()

  if (error) {
    console.error('[auth] api key lookup failed:', error)
    return { ok: false, status: 500, error: 'Auth lookup failed' }
  }
  if (!data) {
    // Covers all five rejections identically — unknown hash, revoked, expired, wrong scope, and a
    // key whose project has vanished (the view's INNER JOIN drops it, which is what the old
    // explicit orphan branch did by hand). One answer, so a caller cannot distinguish "revoked"
    // from "never existed" by probing.
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  return {
    ok: true,
    projectId: data.project_id as string,
    apiKeyId: data.id as string,
    monthlyEventQuota: data.monthly_event_quota as number,
    ingestRatePerMin: data.ingest_rate_per_min as number,
    createdBy: (data.created_by as string | null) ?? null,
    firstEventAt: (data.first_event_at as string | null) ?? null,
  }
}
