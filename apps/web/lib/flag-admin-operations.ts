import 'server-only'
import { flagAdminMutationErrorStatus } from './flag-admin-operation'
import { getSupabaseServiceClient } from './supabase'

function logUnexpectedFlagAdminError(operation: string, error: { code?: string }) {
  // SQLSTATE is a safe, compact diagnostic; avoid logging tenant or credential-derived values.
  console.error(`[flag-admin] ${operation} failed`, { code: error.code ?? 'unknown' })
}

export type FlagAdminSnapshotFlag = {
  key: string
  value: boolean
  definitionVersion: number
  criticality: 'low' | 'medium' | 'high'
  polarity: 'killswitch' | 'enablement'
  description: string
  reason: 'STATIC'
}

export type FlagAdminSnapshot = {
  environment: 'development' | 'preview' | 'production'
  snapshotVersion: number
  snapshotUpdatedAt: string | null
  flags: FlagAdminSnapshotFlag[]
}

function validEnvironment(value: unknown): value is FlagAdminSnapshot['environment'] {
  return value === 'development' || value === 'preview' || value === 'production'
}

function validFlag(value: unknown): value is FlagAdminSnapshotFlag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const flag = value as Record<string, unknown>
  return (
    typeof flag.key === 'string' &&
    typeof flag.value === 'boolean' &&
    Number.isSafeInteger(flag.definitionVersion) &&
    (flag.criticality === 'low' || flag.criticality === 'medium' || flag.criticality === 'high') &&
    (flag.polarity === 'killswitch' || flag.polarity === 'enablement') &&
    typeof flag.description === 'string' &&
    flag.reason === 'STATIC'
  )
}

/** Credential scope resolves project + environment inside the SQL function, never from a request. */
export async function getFlagAdminSnapshot(keyHash: string): Promise<FlagAdminSnapshot | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('get_flag_admin_snapshot', {
    p_key_hash: keyHash,
  })
  if (error) {
    logUnexpectedFlagAdminError('snapshot lookup', error)
    throw new Error('Could not load flag administration snapshot')
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (
    !row ||
    !validEnvironment(row.environment) ||
    !Number.isSafeInteger(row.snapshot_version) ||
    Number(row.snapshot_version) < 0 ||
    (row.snapshot_updated_at !== null && typeof row.snapshot_updated_at !== 'string') ||
    !Array.isArray(row.flags) ||
    !row.flags.every(validFlag)
  ) {
    return null
  }
  return {
    environment: row.environment,
    snapshotVersion: Number(row.snapshot_version),
    snapshotUpdatedAt: row.snapshot_updated_at as string | null,
    flags: row.flags,
  }
}

export async function setFlagAdminBoolean(input: {
  keyHash: string
  key: string
  enabled: boolean
  expectedSnapshotVersion: number
  reason: string
  externalActorId: string
}): Promise<
  | { ok: true; snapshotVersion: number; definitionVersion: number; changed: boolean }
  | { ok: false; status: 400 | 401 | 409 | 500 }
> {
  const { data, error } = await getSupabaseServiceClient().rpc('set_flag_admin_boolean', {
    p_key_hash: input.keyHash,
    p_flag_key: input.key,
    p_enabled: input.enabled,
    p_expected_snapshot_version: input.expectedSnapshotVersion,
    p_reason: input.reason,
    p_external_actor_id: input.externalActorId,
  })
  if (error) {
    const status = flagAdminMutationErrorStatus(error.code)
    if (status === 400 || status === 409) return { ok: false, status }
    logUnexpectedFlagAdminError('mutation', error)
    return { ok: false, status: 500 }
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (!row) return { ok: false, status: 401 }
  if (
    !Number.isSafeInteger(row.snapshot_version) ||
    !Number.isSafeInteger(row.definition_version) ||
    typeof row.changed !== 'boolean'
  ) {
    console.error('[flag-admin] mutation returned malformed result')
    return { ok: false, status: 500 }
  }
  return {
    ok: true,
    snapshotVersion: Number(row.snapshot_version),
    definitionVersion: Number(row.definition_version),
    changed: row.changed,
  }
}
