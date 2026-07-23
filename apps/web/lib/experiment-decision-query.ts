import 'server-only'
import {
  MAX_DECISION_HISTORY_RECORDS,
  ExperimentDecisionResourceLimitError,
  mapExperimentDecisionRows,
  type ExperimentDecisionHistory,
  type ExperimentDecisionRow,
  type ParsedExperimentDecisionCommand,
} from './experiment-decision-contract'
import { getSupabaseServiceClient } from './supabase'

export type ExperimentDecisionHistoryResult =
  | { ok: true; decisions: ExperimentDecisionHistory }
  | { ok: false; reason: 'query_failed' | 'resource_limit' }

/**
 * The only decision-ledger read resolver. Callers must resolve `projectId` server-side from an API
 * key, membership, or connector token. The experiment/version identifiers are always combined
 * with that tenant predicate, so a foreign stable id cannot widen this read.
 */
export async function getExperimentDecisionHistoryByProjectId(
  projectId: string,
  experimentId: string,
  versionId: string,
): Promise<ExperimentDecisionHistoryResult> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('experiment_decision_records')
    .select(`
      id,
      ordinal,
      definition_version,
      record_kind,
      outcome,
      chosen_variant_key,
      rationale,
      analysis_snapshot,
      integrity_snapshot,
      actor_user_id,
      created_at,
      supersedes_record_id
    `)
    .eq('project_id', projectId)
    .eq('experiment_id', experimentId)
    .eq('version_id', versionId)
    .order('ordinal', { ascending: true })
    .limit(MAX_DECISION_HISTORY_RECORDS + 1)
  if (error || !Array.isArray(data)) {
    console.error('[experiment-decision-query] history lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (data.length > MAX_DECISION_HISTORY_RECORDS) {
    return { ok: false, reason: 'resource_limit' }
  }
  try {
    return {
      ok: true,
      decisions: mapExperimentDecisionRows(data as unknown as ExperimentDecisionRow[]),
    }
  } catch (error) {
    console.error('[experiment-decision-query] malformed decision history:', error)
    return {
      ok: false,
      reason: error instanceof ExperimentDecisionResourceLimitError
        ? 'resource_limit'
        : 'query_failed',
    }
  }
}

export async function recordExperimentDecision(
  projectId: string,
  experimentId: string,
  versionId: string,
  actorUserId: string,
  command: ParsedExperimentDecisionCommand,
  analysisSnapshot: Record<string, unknown>,
): Promise<
  | { ok: true; decisions: ExperimentDecisionHistory }
  | { ok: false; error: string }
> {
  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.rpc('record_experiment_decision', {
    p_project_id: projectId,
    p_experiment_id: experimentId,
    p_version_id: versionId,
    p_record_kind: command.recordKind,
    p_outcome: command.outcome,
    p_chosen_variant_key: command.chosenVariantKey,
    p_rationale: command.rationale,
    p_analysis_snapshot: analysisSnapshot,
    p_actor_user_id: actorUserId,
    p_idempotency_key: command.idempotencyKey,
    p_supersedes_record_id: command.supersedesRecordId,
  })
  if (error) {
    console.error('[experiment-decision-query] record failed:', error)
    return { ok: false, error: 'This experiment decision could not be recorded.' }
  }
  const refreshed = await getExperimentDecisionHistoryByProjectId(
    projectId,
    experimentId,
    versionId,
  )
  if (!refreshed.ok || refreshed.decisions.current === null) {
    return { ok: false, error: 'The decision was recorded but could not be reloaded.' }
  }
  return { ok: true, decisions: refreshed.decisions }
}
