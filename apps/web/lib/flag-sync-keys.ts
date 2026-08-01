import 'server-only'
import { generateApiKey } from './api-keys'
import { hashCredential } from './credential-hash'
import { getSupabaseServiceClient } from './supabase'

export type FlagSyncKeyRow = {
  id: string
  label: string
  source: string
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

/** Mint a project-scoped catalog publisher credential. Plaintext is returned exactly once. */
export async function mintFlagSyncKey(input: {
  projectId: string
  label: string
  source: string
  actorUserId: string
  expiresAt?: Date | null
}): Promise<{ ok: true; id: string; plaintext: string } | { ok: false; error: string }> {
  const plaintext = generateApiKey()
  const { data, error } = await getSupabaseServiceClient().rpc('create_flag_sync_key', {
    p_project_id: input.projectId,
    p_key_hash: hashCredential(plaintext),
    p_label: input.label,
    p_source: input.source,
    p_expires_at: input.expiresAt?.toISOString() ?? null,
    p_actor_user_id: input.actorUserId,
  })
  const row = data?.[0] as { id?: string } | undefined
  if (error || !row?.id) {
    console.error('[flag-sync-keys] mint failed:', error)
    return { ok: false, error: 'Could not mint catalog sync key' }
  }
  return { ok: true, id: row.id, plaintext }
}

export async function revokeFlagSyncKey(
  projectId: string,
  keyId: string,
  actorUserId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient().rpc('revoke_flag_sync_key', {
    p_project_id: projectId,
    p_key_id: keyId,
    p_actor_user_id: actorUserId,
  })
  if (error) {
    console.error('[flag-sync-keys] revoke failed:', error)
    return false
  }
  return data === true
}

export async function listFlagSyncKeys(projectId: string): Promise<FlagSyncKeyRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from('api_keys')
    .select('id,label,flag_sync_source,created_at,expires_at,revoked_at')
    .eq('project_id', projectId)
    .eq('scope', 'flag_sync')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Could not load catalog sync keys')
  return (data ?? []).flatMap((row) => {
    if (typeof row.flag_sync_source !== 'string') return []
    return [
      {
        id: row.id as string,
        label: row.label as string,
        source: row.flag_sync_source,
        createdAt: row.created_at as string,
        expiresAt: (row.expires_at as string | null) ?? null,
        revokedAt: (row.revoked_at as string | null) ?? null,
      },
    ]
  })
}
