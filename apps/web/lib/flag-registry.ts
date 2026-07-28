import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { FlagDefinition, FlagEnvironment } from './flag-definition'

export type FlagVersionRow = {
  id: string
  version: number
  definition: FlagDefinition
  createdBy: string
  createdAt: string
}

export type FlagActivationRow = {
  environment: FlagEnvironment
  versionId: string | null
  updatedBy: string
  updatedAt: string
}

export type FlagRegistryRow = {
  id: string
  key: string
  createdBy: string
  createdAt: string
  versions: FlagVersionRow[]
  activations: FlagActivationRow[]
}

export type FlagEnvironmentStateRow = {
  environment: FlagEnvironment
  snapshotVersion: number
  updatedAt: string
}

export type FlagLifecycleAuditRow = {
  id: string
  environment: FlagEnvironment | null
  flagId: string
  oldVersionId: string | null
  newVersionId: string | null
  action: 'definition_created' | 'activated' | 'deactivated'
  actorUserId: string
  reason: string
  createdAt: string
}

type RawRegistry = { id: string; key: string; created_by: string; created_at: string }
type RawVersion = {
  id: string
  flag_id: string
  version: number
  definition: FlagDefinition
  created_by: string
  created_at: string
}
type RawActivation = {
  environment: FlagEnvironment
  flag_id: string
  version_id: string | null
  updated_by: string
  updated_at: string
}
type RawState = { environment: FlagEnvironment; snapshot_version: number; updated_at: string }
type RawAudit = {
  id: string
  environment: FlagEnvironment | null
  flag_id: string
  old_version_id: string | null
  new_version_id: string | null
  action: FlagLifecycleAuditRow['action']
  actor_user_id: string
  reason: string
  created_at: string
}

/** Member-readable, project-scoped immutable control-plane inspection. */
export async function getFlagRegistryView(projectId: string): Promise<{
  flags: FlagRegistryRow[]
  environments: FlagEnvironmentStateRow[]
  audit: FlagLifecycleAuditRow[]
}> {
  const supabase = getSupabaseServiceClient()
  const { data: registryData, error: registryError } = await supabase
    .from('flag_registries')
    .select('id,key,created_by,created_at')
    .eq('project_id', projectId)
    .order('key')
  if (registryError) throw new Error('Could not load flag definitions')

  const registries = (registryData ?? []) as unknown as RawRegistry[]
  const flagIds = registries.map((row) => row.id)
  const [versionsResult, activationsResult, statesResult, auditResult] = await Promise.all([
    flagIds.length === 0
      ? Promise.resolve({ data: [] as RawVersion[], error: null })
      : supabase
          .from('flag_definition_versions')
          .select('id,flag_id,version,definition,created_by,created_at')
          .eq('project_id', projectId)
          .in('flag_id', flagIds)
          .order('version'),
    flagIds.length === 0
      ? Promise.resolve({ data: [] as RawActivation[], error: null })
      : supabase
          .from('flag_environment_activations')
          .select('environment,flag_id,version_id,updated_by,updated_at')
          .eq('project_id', projectId)
          .in('flag_id', flagIds),
    supabase
      .from('flag_environment_states')
      .select('environment,snapshot_version,updated_at')
      .eq('project_id', projectId)
      .order('environment'),
    supabase
      .from('flag_lifecycle_audit')
      .select('id,environment,flag_id,old_version_id,new_version_id,action,actor_user_id,reason,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200),
  ])
  if (versionsResult.error || activationsResult.error || statesResult.error || auditResult.error) {
    console.error(
      '[flag-registry] view query failed:',
      versionsResult.error ?? activationsResult.error ?? statesResult.error ?? auditResult.error
    )
    throw new Error('Could not load flag lifecycle data')
  }

  const versionsByFlag = new Map<string, FlagVersionRow[]>()
  for (const row of (versionsResult.data ?? []) as unknown as RawVersion[]) {
    const values = versionsByFlag.get(row.flag_id) ?? []
    values.push({
      id: row.id,
      version: Number(row.version),
      definition: row.definition,
      createdBy: row.created_by,
      createdAt: row.created_at,
    })
    versionsByFlag.set(row.flag_id, values)
  }
  const activationsByFlag = new Map<string, FlagActivationRow[]>()
  for (const row of (activationsResult.data ?? []) as unknown as RawActivation[]) {
    const values = activationsByFlag.get(row.flag_id) ?? []
    values.push({
      environment: row.environment,
      versionId: row.version_id,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })
    activationsByFlag.set(row.flag_id, values)
  }

  return {
    flags: registries.map((row) => ({
      id: row.id,
      key: row.key,
      createdBy: row.created_by,
      createdAt: row.created_at,
      versions: versionsByFlag.get(row.id) ?? [],
      activations: activationsByFlag.get(row.id) ?? [],
    })),
    environments: ((statesResult.data ?? []) as unknown as RawState[]).map((row) => ({
      environment: row.environment,
      snapshotVersion: Number(row.snapshot_version),
      updatedAt: row.updated_at,
    })),
    audit: ((auditResult.data ?? []) as unknown as RawAudit[]).map((row) => ({
      id: row.id,
      environment: row.environment,
      flagId: row.flag_id,
      oldVersionId: row.old_version_id,
      newVersionId: row.new_version_id,
      action: row.action,
      actorUserId: row.actor_user_id,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  }
}

export async function createFlagDefinitionVersion(input: {
  projectId: string
  flagKey: string
  definition: FlagDefinition
  reason: string
  actorUserId: string
}) {
  const { data, error } = await getSupabaseServiceClient().rpc('create_flag_definition_version', {
    p_project_id: input.projectId,
    p_flag_key: input.flagKey,
    p_definition: input.definition,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
  })
  const row = data?.[0] as { flag_id?: string; version_id?: string; version?: number } | undefined
  if (error || !row?.flag_id || !row.version_id) {
    console.error('[flag-registry] create failed:', error)
    return { ok: false as const, error: 'Could not create this flag definition version.' }
  }
  return { ok: true as const, flagId: row.flag_id, versionId: row.version_id, version: Number(row.version) }
}

/**
 * Imports a checked catalog atomically. The database rejects any semantic drift
 * from an existing immutable version and this function never activates a flag.
 */
export async function importFlagDefinitionCatalog(input: {
  projectId: string
  entries: Array<{ key: string; definition: FlagDefinition }>
  reason: string
  actorUserId: string
}) {
  const { data, error } = await getSupabaseServiceClient().rpc('import_flag_definition_catalog', {
    p_project_id: input.projectId,
    p_entries: input.entries,
    p_reason: input.reason,
    p_actor_user_id: input.actorUserId,
  })
  const rows = (data ?? []) as Array<{
    flag_key?: string
    flag_id?: string
    version_id?: string
    version?: number
    created?: boolean
  }>
  if (
    error ||
    rows.length !== input.entries.length ||
    rows.some(
      (row) => !row.flag_key || !row.flag_id || !row.version_id || !Number.isSafeInteger(Number(row.version))
    )
  ) {
    console.error('[flag-registry] catalog import failed:', error)
    return { ok: false as const, error: 'Could not import this flag catalog.' }
  }
  return {
    ok: true as const,
    entries: rows.map((row) => ({
      key: row.flag_key!,
      flagId: row.flag_id!,
      versionId: row.version_id!,
      version: Number(row.version),
      created: row.created === true,
    })),
  }
}

async function changeActivation(
  functionName: 'set_flag_activation' | 'deactivate_flag',
  input: {
    projectId: string
    environment: FlagEnvironment
    flagId: string
    versionId?: string
    expectedSnapshotVersion: number
    reason: string
    actorUserId: string
  }
) {
  const parameters =
    functionName === 'set_flag_activation'
      ? {
          p_project_id: input.projectId,
          p_environment: input.environment,
          p_flag_id: input.flagId,
          p_version_id: input.versionId,
          p_expected_snapshot_version: input.expectedSnapshotVersion,
          p_reason: input.reason,
          p_actor_user_id: input.actorUserId,
        }
      : {
          p_project_id: input.projectId,
          p_environment: input.environment,
          p_flag_id: input.flagId,
          p_expected_snapshot_version: input.expectedSnapshotVersion,
          p_reason: input.reason,
          p_actor_user_id: input.actorUserId,
        }
  const { data, error } = await getSupabaseServiceClient().rpc(functionName, parameters)
  const row = data?.[0] as { snapshot_version?: number; changed?: boolean } | undefined
  if (error || !row || !Number.isSafeInteger(Number(row.snapshot_version))) {
    console.error('[flag-registry] activation change failed:', error)
    return { ok: false as const, error: 'This flag lifecycle change is not allowed.' }
  }
  return { ok: true as const, snapshotVersion: Number(row.snapshot_version), changed: row.changed === true }
}

export function setFlagActivation(input: {
  projectId: string
  environment: FlagEnvironment
  flagId: string
  versionId: string
  expectedSnapshotVersion: number
  reason: string
  actorUserId: string
}) {
  return changeActivation('set_flag_activation', input)
}

export function deactivateFlag(input: {
  projectId: string
  environment: FlagEnvironment
  flagId: string
  expectedSnapshotVersion: number
  reason: string
  actorUserId: string
}) {
  return changeActivation('deactivate_flag', input)
}
