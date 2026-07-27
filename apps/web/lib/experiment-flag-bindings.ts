import 'server-only'
import { getSupabaseServiceClient } from './supabase'

export type ExperimentFlagBinding = {
  id: string
  experimentId: string
  experimentVersionId: string
  flagId: string
  flagVersionId: string
  createdBy: string
  createdAt: string
}

export async function listExperimentFlagBindings(projectId: string): Promise<ExperimentFlagBinding[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from('experiment_flag_version_bindings')
    .select('id,experiment_id,experiment_version_id,flag_id,flag_version_id,created_by,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[experiment-flag-bindings] list failed:', error)
    throw new Error('Could not load experiment flag bindings')
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    experimentId: row.experiment_id as string,
    experimentVersionId: row.experiment_version_id as string,
    flagId: row.flag_id as string,
    flagVersionId: row.flag_version_id as string,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  }))
}

export async function bindExperimentFlagVersion(input: {
  projectId: string
  experimentId: string
  experimentVersionId: string
  flagId: string
  flagVersionId: string
  actorUserId: string
}): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { data, error } = await getSupabaseServiceClient().rpc('bind_experiment_flag_version', {
    p_project_id: input.projectId,
    p_experiment_id: input.experimentId,
    p_experiment_version_id: input.experimentVersionId,
    p_flag_id: input.flagId,
    p_flag_version_id: input.flagVersionId,
    p_actor_user_id: input.actorUserId,
  })
  if (error || !data?.[0]) {
    console.error('[experiment-flag-bindings] bind failed:', error)
    return { ok: false, error: 'This flag version cannot be bound to that experiment version.' }
  }
  return { ok: true, created: data[0].created === true }
}
