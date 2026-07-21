import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'

// multi-tenant-activation · Sprint 1, Story 1.3 — API keys as a lifecycle (issue / list / revoke).
// The one place a key is generated and hashed; lib/auth.ts imports hashApiKey so ingest and the
// dashboard agree byte-for-byte on the stored hash.

const KEY_PREFIX = 'gb_key_'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// An opaque, prefixed random key. The plaintext is returned to the caller exactly once (at issue
// time) and never stored — only its hash lands in the DB.
export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`
}

export type ApiKeyRow = { id: string; label: string; createdAt: string; revokedAt: string | null }

export async function listProjectKeys(projectId: string): Promise<ApiKeyRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, label, created_at, revoked_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[api-keys] list failed:', error)
    return []
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    createdAt: r.created_at as string,
    revokedAt: (r.revoked_at as string | null) ?? null,
  }))
}

// Issues a new key for the project and returns the PLAINTEXT once. Callers must have already
// authorized the acting user against `projectId` (see requireProjectMembership).
export async function issueApiKey(
  projectId: string,
  label: string,
): Promise<{ ok: true; plaintext: string } | { ok: false; error: string }> {
  const supabase = getSupabaseServiceClient()
  const plaintext = generateApiKey()
  const { error } = await supabase.from('api_keys').insert({
    project_id: projectId,
    key_hash: hashApiKey(plaintext),
    label: label.trim() || 'untitled',
  })
  if (error) {
    console.error('[api-keys] issue failed:', error)
    return { ok: false, error: 'Could not issue key' }
  }
  return { ok: true, plaintext }
}

// Revokes a key — but ONLY within `projectId`. Scoping the UPDATE by project_id is the security
// property that stops a member of one project revoking another project's key by guessing its id.
// Returns true iff an active key was actually revoked (idempotent: revoking twice returns false).
export async function revokeApiKey(projectId: string, keyId: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('project_id', projectId)
    .is('revoked_at', null)
    .select('id')
  if (error) {
    console.error('[api-keys] revoke failed:', error)
    return false
  }
  return (data ?? []).length > 0
}
