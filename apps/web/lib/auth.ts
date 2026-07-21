import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { hashApiKey } from './api-keys'

export type AuthResult = { ok: true; projectId: string } | { ok: false; status: number; error: string }

// Resolves the request's Authorization: Bearer <key> header to a project_id. The key is never
// compared in plaintext — only its sha256 hash is looked up. As of multi-tenant-activation Story
// 1.3 this reads the api_keys table (many revocable keys per project) instead of the single
// projects.api_key_hash column: a REVOKED key (revoked_at set) resolves no row and 401s
// immediately, with no cache window. The migration backfilled every existing project's key into
// api_keys, so no currently-valid key stopped working. The resolved project_id is the ONLY source
// of tenant scoping for the insert that follows — no request body field can override it.
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
    .select('project_id')
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
  return { ok: true, projectId: data.project_id }
}
