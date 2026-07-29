import 'server-only'
import { getExperimentAnalysisByProjectId } from './experiment-analysis-query'
import { buildScenarioImpactEvidence, type ScenarioImpactEvidence } from './scenario-impact'
import type { ScenarioImpactCaptureRequest } from './scenario-impact-request'
import { getSupabaseServiceClient } from './supabase'

type Source = {
  projectId: string
  projectSlug: string
  scenarioId: string
  scenarioVersionId: string
  scenarioKey: string
  scenarioVersion: number
  runRevision: number
  cohort: 'synthetic' | 'internal' | 'external'
  flagId: string
  flagVersionId: string
  flagKey: string
  flagDefinitionVersion: number
  experimentId: string
  experimentVersionId: string
  experimentKey: string
  experimentDefinitionVersion: number
  technical: {
    control: { attempts: number; failures: number; latencyP95Ms: number | null }
    fault: { attempts: number; failures: number; latencyP95Ms: number | null }
  }
  relatedEvidence: {
    errorSignalIds: string[]
    frictionSignalIds: string[]
    taskIds: string[]
  }
}

export type StoredScenarioImpactEvidence = {
  id: string
  runId: string
  scenarioKey: string
  scenarioVersion: number
  evidence: ScenarioImpactEvidence
  reason: string
  externalActorId: string
  createdAt: string
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function counterArm(value: unknown): value is Source['technical']['control'] {
  return (
    record(value) &&
    Number.isSafeInteger(value.attempts) &&
    Number(value.attempts) >= 0 &&
    Number.isSafeInteger(value.failures) &&
    Number(value.failures) >= 0 &&
    Number(value.failures) <= Number(value.attempts) &&
    (value.latencyP95Ms === null ||
      (typeof value.latencyP95Ms === 'number' &&
        Number.isFinite(value.latencyP95Ms) &&
        value.latencyP95Ms >= 0))
  )
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every((item) => typeof item === 'string')
}

function mapSource(row: unknown): Source | null {
  if (!record(row) || !record(row.technical) || !record(row.related_evidence)) return null
  if (
    !counterArm(row.technical.control) ||
    !counterArm(row.technical.fault) ||
    !stringArray(row.related_evidence.errorSignalIds) ||
    !stringArray(row.related_evidence.frictionSignalIds) ||
    !stringArray(row.related_evidence.taskIds)
  ) return null
  const strings = [
    'project_id',
    'project_slug',
    'scenario_id',
    'scenario_version_id',
    'scenario_key',
    'flag_id',
    'flag_version_id',
    'flag_key',
    'experiment_id',
    'experiment_version_id',
    'experiment_key',
  ] as const
  if (strings.some((key) => typeof row[key] !== 'string')) return null
  if (
    !Number.isSafeInteger(row.scenario_version) ||
    !Number.isSafeInteger(row.run_revision) ||
    !Number.isSafeInteger(row.flag_definition_version) ||
    !Number.isSafeInteger(row.experiment_definition_version) ||
    (row.cohort !== 'synthetic' && row.cohort !== 'internal' && row.cohort !== 'external')
  ) return null
  return {
    projectId: row.project_id as string,
    projectSlug: row.project_slug as string,
    scenarioId: row.scenario_id as string,
    scenarioVersionId: row.scenario_version_id as string,
    scenarioKey: row.scenario_key as string,
    scenarioVersion: Number(row.scenario_version),
    runRevision: Number(row.run_revision),
    cohort: row.cohort,
    flagId: row.flag_id as string,
    flagVersionId: row.flag_version_id as string,
    flagKey: row.flag_key as string,
    flagDefinitionVersion: Number(row.flag_definition_version),
    experimentId: row.experiment_id as string,
    experimentVersionId: row.experiment_version_id as string,
    experimentKey: row.experiment_key as string,
    experimentDefinitionVersion: Number(row.experiment_definition_version),
    technical: {
      control: row.technical.control,
      fault: row.technical.fault,
    },
    relatedEvidence: {
      errorSignalIds: row.related_evidence.errorSignalIds,
      frictionSignalIds: row.related_evidence.frictionSignalIds,
      taskIds: row.related_evidence.taskIds,
    },
  }
}

function mutationStatus(code: string | undefined): 400 | 401 | 409 | 500 {
  if (code === '22023') return 400
  if (code === '23505' || code === '55000') return 409
  return 500
}

export async function captureScenarioImpactEvidence(input: {
  keyHash: string
  actor: string
  request: ScenarioImpactCaptureRequest
}): Promise<
  | { ok: true; evidenceId: string; createdAt: string; created: boolean; evidence: ScenarioImpactEvidence }
  | { ok: false; status: 400 | 401 | 409 | 500 }
> {
  const supabase = getSupabaseServiceClient()
  const { data: sourceRows, error: sourceError } = await supabase.rpc('get_scenario_impact_source', {
    p_key_hash: input.keyHash,
    p_run_id: input.request.runId,
    p_as_of: input.request.asOf,
  })
  if (sourceError) {
    const status = mutationStatus(sourceError.code)
    if (status === 500) console.error('[scenario-impact] source failed', { code: sourceError.code })
    return { ok: false, status }
  }
  const source = mapSource(sourceRows?.[0])
  if (!source) return { ok: false, status: sourceRows?.length ? 500 : 401 }

  const analysis = await getExperimentAnalysisByProjectId(
    source.projectId,
    source.projectSlug,
    source.experimentKey,
    { version: source.experimentDefinitionVersion, asOf: input.request.asOf }
  )
  if (!analysis.ok) {
    if (analysis.reason === 'invalid_request') return { ok: false, status: 400 }
    console.error('[scenario-impact] canonical experiment analysis unavailable', {
      reason: analysis.reason,
    })
    return { ok: false, status: 500 }
  }
  if (
    analysis.experiment.id !== source.experimentId ||
    analysis.experiment.versionId !== source.experimentVersionId
  ) return { ok: false, status: 409 }

  const evidence = buildScenarioImpactEvidence({
    generatedAt: input.request.asOf,
    scenario: {
      key: source.scenarioKey,
      definitionVersion: source.scenarioVersion,
      runId: input.request.runId,
      runRevision: source.runRevision,
    },
    flag: {
      key: source.flagKey,
      definitionVersion: source.flagDefinitionVersion,
    },
    experiment: {
      key: source.experimentKey,
      definitionVersion: source.experimentDefinitionVersion,
    },
    cohort: source.cohort,
    technical: source.technical,
    canonicalAnalysis: analysis.analysis,
    relatedEvidence: source.relatedEvidence,
  })
  const { data, error } = await supabase.rpc('record_scenario_impact_evidence', {
    p_key_hash: input.keyHash,
    p_run_id: input.request.runId,
    p_evidence: evidence,
    p_reason: input.request.reason,
    p_external_actor_id: input.actor,
    p_idempotency_key: input.request.idempotencyKey,
  })
  if (error) {
    const status = mutationStatus(error.code)
    if (status === 500) console.error('[scenario-impact] record failed', { code: error.code })
    return { ok: false, status }
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (
    !row ||
    typeof row.evidence_id !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.created !== 'boolean'
  ) return { ok: false, status: row ? 500 : 401 }
  return {
    ok: true,
    evidenceId: row.evidence_id,
    createdAt: row.created_at,
    created: row.created,
    evidence,
  }
}

export async function getScenarioImpactEvidence(
  keyHash: string
): Promise<StoredScenarioImpactEvidence[] | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('get_scenario_impact_evidence', {
    p_key_hash: keyHash,
  })
  if (error) {
    console.error('[scenario-impact] list failed', { code: error.code })
    throw new Error('Could not load scenario impact evidence')
  }
  if (!Array.isArray(data)) return null
  const result: StoredScenarioImpactEvidence[] = []
  for (const item of data) {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      typeof item.run_id !== 'string' ||
      typeof item.scenario_key !== 'string' ||
      !Number.isSafeInteger(item.scenario_version) ||
      !record(item.evidence) ||
      typeof item.reason !== 'string' ||
      typeof item.external_actor_id !== 'string' ||
      typeof item.created_at !== 'string'
    ) throw new Error('Malformed scenario impact evidence')
    result.push({
      id: item.id,
      runId: item.run_id,
      scenarioKey: item.scenario_key,
      scenarioVersion: Number(item.scenario_version),
      evidence: item.evidence as ScenarioImpactEvidence,
      reason: item.reason,
      externalActorId: item.external_actor_id,
      createdAt: item.created_at,
    })
  }
  return result
}
