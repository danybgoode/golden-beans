import 'server-only'
import { createHash } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'

export type AuthResult = { ok: true; projectId: string } | { ok: false; status: number; error: string }

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Resolves the request's Authorization: Bearer <key> header to a project_id. The key
// is never compared in plaintext against anything stored — only its hash is looked up
// (see projects.api_key_hash), and the resolved project_id is the ONLY source of
// tenant scoping for the insert that follows. No request body field can override it.
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
    .from('projects')
    .select('id')
    .eq('api_key_hash', hashApiKey(key))
    .maybeSingle()

  if (error) {
    console.error('[auth] project lookup failed:', error)
    return { ok: false, status: 500, error: 'Auth lookup failed' }
  }
  if (!data) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }
  return { ok: true, projectId: data.id }
}
