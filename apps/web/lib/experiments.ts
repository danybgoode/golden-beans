import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { ExperimentDefinition } from './experiment-definition'
import {
  EXPERIMENT_REGISTRY_RELATIONAL_SELECT,
  mapExperimentRegistryRows,
  type ExperimentLifecycleState,
  type ExperimentRegistryRelationRow,
  type ExperimentRegistryView,
} from './experiment-registry-view'

export type ExperimentRegistryRow = ExperimentRegistryView
export type ExperimentTransitionTarget = 'running' | 'stopped' | 'invalid'

export async function listExperimentRegistries(projectId: string): Promise<ExperimentRegistryRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('experiment_registries')
    .select(EXPERIMENT_REGISTRY_RELATIONAL_SELECT)
    .eq('project_id', projectId)
    .order('key')
  if (error) {
    console.error('[experiments] registry list failed:', error)
    throw new Error('Could not load experiment definitions')
  }
  return mapExperimentRegistryRows((data ?? []) as unknown as ExperimentRegistryRelationRow[])
}

export async function createExperimentVersion(
  projectId: string,
  experimentKey: string,
  definition: ExperimentDefinition,
  actorUserId: string,
): Promise<
  | { ok: true; projectId: string; experimentId: string; versionId: string; version: number; status: 'draft' }
  | { ok: false; error: string }
> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: experimentKey,
    p_definition: definition,
    p_actor_user_id: actorUserId,
  })
  if (error || !data?.[0]) {
    console.error('[experiments] create version failed:', error)
    return { ok: false, error: 'Could not create this experiment version.' }
  }
  return {
    ok: true,
    projectId: data[0].project_id as string,
    experimentId: data[0].experiment_id as string,
    versionId: data[0].version_id as string,
    version: Number(data[0].version),
    status: 'draft',
  }
}

export async function transitionExperimentVersion(
  projectId: string,
  experimentId: string,
  versionId: string,
  targetStatus: ExperimentTransitionTarget,
  actorUserId: string,
): Promise<
  | {
      ok: true
      projectId: string
      experimentId: string
      versionId: string
      version: number
      status: ExperimentLifecycleState
      changed: boolean
      startedAt: string | null
      endedAt: string | null
      invalidatedAt: string | null
    }
  | { ok: false; error: string }
> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('transition_experiment_version', {
    p_project_id: projectId,
    p_experiment_id: experimentId,
    p_version_id: versionId,
    p_target_status: targetStatus,
    p_actor_user_id: actorUserId,
  })
  if (error || !data?.[0]) {
    console.error('[experiments] lifecycle transition failed:', error)
    return { ok: false, error: 'This experiment lifecycle transition is not allowed.' }
  }
  const row = data[0]
  return {
    ok: true,
    projectId: row.project_id as string,
    experimentId: row.experiment_id as string,
    versionId: row.version_id as string,
    version: Number(row.version),
    status: row.status as ExperimentLifecycleState,
    changed: row.changed === true,
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    invalidatedAt: (row.invalidated_at as string | null) ?? null,
  }
}
