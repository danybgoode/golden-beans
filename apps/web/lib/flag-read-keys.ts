import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { hashCredential } from './credential-hash'
import { generateApiKey } from './api-keys'
import type { FlagEnvironment } from './flag-definition'

export type FlagReadKeyRow = {
  id: string
  label: string
  environment: FlagEnvironment
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
}

/** Mint a project-and-environment scoped snapshot key. Plaintext is returned exactly once. */
export async function mintFlagReadKey(input: {
  projectId: string
  environment: FlagEnvironment
  label: string
  actorUserId: string
  expiresAt?: Date | null
}): Promise<{ ok: true; id: string; plaintext: string } | { ok: false; error: string }> {
  const plaintext = generateApiKey()
  const { data, error } = await getSupabaseServiceClient().rpc('create_flag_read_key', {
    p_project_id: input.projectId,
    p_environment: input.environment,
    p_key_hash: hashCredential(plaintext),
    p_label: input.label,
    p_expires_at: input.expiresAt?.toISOString() ?? null,
    p_actor_user_id: input.actorUserId,
  })
  const row = data?.[0] as { id?: string } | undefined
  if (error || !row?.id) {
    console.error('[flag-read-keys] mint failed:', error)
    return { ok: false, error: 'Could not mint flag read key' }
  }
  return { ok: true, id: row.id, plaintext }
}

export async function revokeFlagReadKey(
  projectId: string,
  keyId: string,
  actorUserId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient().rpc('revoke_flag_read_key', {
    p_project_id: projectId,
    p_key_id: keyId,
    p_actor_user_id: actorUserId,
  })
  if (error) {
    console.error('[flag-read-keys] revoke failed:', error)
    return false
  }
  return data === true
}

export async function listFlagReadKeys(projectId: string): Promise<FlagReadKeyRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from('api_keys')
    .select('id,label,flag_environment,created_at,expires_at,revoked_at')
    .eq('project_id', projectId)
    .eq('scope', 'flag_read')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Could not load flag read keys')
  return (data ?? []).flatMap((row) => {
    if (
      row.flag_environment !== 'development' &&
      row.flag_environment !== 'preview' &&
      row.flag_environment !== 'production'
    )
      return []
    return [
      {
        id: row.id as string,
        label: row.label as string,
        environment: row.flag_environment,
        createdAt: row.created_at as string,
        expiresAt: (row.expires_at as string | null) ?? null,
        revokedAt: (row.revoked_at as string | null) ?? null,
      },
    ]
  })
}
