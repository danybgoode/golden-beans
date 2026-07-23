import 'server-only'
import {
  computeExperimentAnalysis,
  type ExperimentAnalysisFact,
  type ExperimentAnalysisResult,
} from './experiment-analysis'
import type { ExperimentAnalysisRequest } from './experiment-analysis-request'
import {
  getExperimentDecisionHistoryByProjectId,
  type ExperimentDecisionHistoryResult,
} from './experiment-decision-query'
import type { ExperimentDefinition } from './experiment-definition'
import {
  compareJourneyTimestamps,
  parseJourneyTimestamp,
  type JourneyTimestamp,
} from './journey-timestamp'
import { getSupabaseServiceClient } from './supabase'

export type GovernedExperimentAnalysisResult =
  | {
      ok: true
      project: { slug: string }
      experiment: {
        id: string
        versionId: string
        key: string
        definitionVersion: number
        lifecycle: 'running' | 'stopped' | 'decided'
        definition: ExperimentDefinition
      }
      analysis: ExperimentAnalysisResult
      decisions: Extract<ExperimentDecisionHistoryResult, { ok: true }>['decisions']
    }
  | {
      ok: false
      reason:
        | 'experiment_not_found'
        | 'version_not_found'
        | 'lifecycle_unavailable'
        | 'invalid_request'
        | 'resource_limit'
        | 'query_failed'
    }

type ExperimentVersionRow = {
  id: unknown
  version: unknown
  definition: unknown
  status: unknown
  started_at: unknown
  ended_at: unknown
}

type ExperimentEventRow = {
  id: unknown
  event: unknown
  feature_id: unknown
  tags: unknown
  subject_type: unknown
  subject_id: unknown
  occurred_at: unknown
  created_at: unknown
}

type AnalysisWindow = {
  start: JourneyTimestamp
  end: JourneyTimestamp
  asOf: JourneyTimestamp
}

function chooseEarlier(a: JourneyTimestamp, b: JourneyTimestamp): JourneyTimestamp {
  return compareJourneyTimestamps(a, b) <= 0 ? a : b
}

function resolveAnalysisWindow(
  definition: ExperimentDefinition,
  lifecycle: 'running' | 'stopped' | 'decided',
  endedAt: string | null,
  asOfValue: string,
): AnalysisWindow | null {
  const start = parseJourneyTimestamp(definition.plannedWindow.startAt)
  const plannedEnd = parseJourneyTimestamp(definition.plannedWindow.endAt)
  const asOf = parseJourneyTimestamp(asOfValue)
  const lifecycleEnd = lifecycle === 'running'
    ? asOf
    : endedAt === null
      ? null
      : parseJourneyTimestamp(endedAt)
  if (lifecycleEnd === null) return null
  const end = chooseEarlier(chooseEarlier(plannedEnd, lifecycleEnd), asOf)
  return compareJourneyTimestamps(start, end) < 0 ? { start, end, asOf } : null
}

function mapFact(row: ExperimentEventRow): ExperimentAnalysisFact {
  if (
    typeof row.id !== 'string' ||
    typeof row.event !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    throw new Error('malformed experiment analysis event snapshot')
  }
  return {
    id: row.id,
    event: row.event,
    featureId: typeof row.feature_id === 'string' ? row.feature_id : null,
    tags: row.tags !== null && typeof row.tags === 'object' && !Array.isArray(row.tags)
      ? row.tags as Record<string, unknown>
      : null,
    subjectType: typeof row.subject_type === 'string' ? row.subject_type : null,
    subjectId: typeof row.subject_id === 'string' ? row.subject_id : null,
    occurredAt: typeof row.occurred_at === 'string' ? row.occurred_at : null,
    createdAt: row.created_at,
  }
}

/**
 * The only governed experiment read resolver. The project id has already been resolved server-side
 * by an API key, project membership, or connector token; no request-controlled tenant identifier
 * reaches a database predicate below.
 */
export async function getExperimentAnalysisByProjectId(
  projectId: string,
  projectSlug: string,
  experimentKey: string,
  request: ExperimentAnalysisRequest,
): Promise<GovernedExperimentAnalysisResult> {
  const supabase = getSupabaseServiceClient()
  const { data: registry, error: registryError } = await supabase
    .from('experiment_registries')
    .select('id, key')
    .eq('project_id', projectId)
    .eq('key', experimentKey)
    .maybeSingle()
  if (registryError) {
    console.error('[experiment-analysis-query] registry lookup failed:', registryError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!registry) return { ok: false, reason: 'experiment_not_found' }

  const { data: version, error: versionError } = await supabase
    .from('experiment_definition_versions')
    .select('id, version, definition, status, started_at, ended_at')
    .eq('project_id', projectId)
    .eq('experiment_id', registry.id)
    .eq('version', request.version)
    .maybeSingle()
  if (versionError) {
    console.error('[experiment-analysis-query] version lookup failed:', versionError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!version) return { ok: false, reason: 'version_not_found' }

  const row = version as ExperimentVersionRow
  if (row.status !== 'running' && row.status !== 'stopped' && row.status !== 'decided') {
    return { ok: false, reason: 'lifecycle_unavailable' }
  }
  if (typeof row.started_at !== 'string') {
    return { ok: false, reason: 'lifecycle_unavailable' }
  }
  if (typeof registry.id !== 'string' || typeof row.id !== 'string') {
    return { ok: false, reason: 'query_failed' }
  }

  const definition = row.definition as ExperimentDefinition
  let window: AnalysisWindow | null
  try {
    window = resolveAnalysisWindow(
      definition,
      row.status,
      typeof row.ended_at === 'string' ? row.ended_at : null,
      request.asOf,
    )
  } catch (error) {
    console.error('[experiment-analysis-query] invalid stored analysis window:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!window) return { ok: false, reason: 'invalid_request' }

  const metricEvents = [
    definition.primaryMetric.event,
    ...definition.guardrailMetrics.map((metric) => metric.event),
  ]
  const { data, error } = await supabase.rpc('get_experiment_analysis_events', {
    p_project_id: projectId,
    p_experiment_key: experimentKey,
    p_definition_version: request.version,
    p_metric_events: metricEvents,
    p_analysis_start: window.start.canonical,
    p_analysis_end: window.end.canonical,
    p_as_of: window.asOf.canonical,
  })
  if (error || !Array.isArray(data)) {
    console.error('[experiment-analysis-query] event snapshot failed:', error)
    return { ok: false, reason: error?.code === '54000' ? 'resource_limit' : 'query_failed' }
  }

  try {
    const facts = (data as ExperimentEventRow[]).map(mapFact)
    const analysis = computeExperimentAnalysis({
      experimentKey,
      definitionVersion: request.version,
      definition,
      lifecycle: {
        status: row.status,
        startedAt: row.started_at,
        endedAt: typeof row.ended_at === 'string' ? row.ended_at : null,
      },
      asOf: window.asOf.canonical,
      facts,
      ...(request.segment ? { segment: request.segment } : {}),
    })
    const decisionHistory = await getExperimentDecisionHistoryByProjectId(
      projectId,
      registry.id,
      row.id,
    )
    if (!decisionHistory.ok) return { ok: false, reason: decisionHistory.reason }
    return {
      ok: true,
      project: { slug: projectSlug },
      experiment: {
        id: registry.id,
        versionId: row.id,
        key: registry.key as string,
        definitionVersion: row.version as number,
        lifecycle: row.status,
        definition,
      },
      analysis,
      decisions: decisionHistory.decisions,
    }
  } catch (error) {
    console.error('[experiment-analysis-query] evaluation failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
}
