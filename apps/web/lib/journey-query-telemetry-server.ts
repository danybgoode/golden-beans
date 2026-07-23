import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import {
  buildJourneyQueryDiagnostics,
  JOURNEY_QUERY_SAMPLE_LIMIT,
  type JourneyQueryDiagnostics,
  type JourneyQueryKind,
  type JourneyQueryTelemetryAggregate,
} from './journey-query-telemetry'

type TelemetryRow = {
  sample_count?: unknown
  p50_ms?: unknown
  p95_ms?: unknown
  max_relevant_event_count?: unknown
}

export async function recordJourneyQueryTelemetry(input: {
  projectId: string
  journeyId: string
  definitionVersion: number
  queryKind: JourneyQueryKind
  queryDurationMs: number
  relevantEventCount: number
}): Promise<JourneyQueryDiagnostics> {
  const current = {
    queryKind: input.queryKind,
    queryDurationMs: roundMilliseconds(input.queryDurationMs),
    relevantEventCount: input.relevantEventCount,
  }
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('record_journey_query_observation', {
    p_project_id: input.projectId,
    p_journey_id: input.journeyId,
    p_definition_version: input.definitionVersion,
    p_query_kind: input.queryKind,
    p_duration_ms: current.queryDurationMs,
    p_relevant_event_count: input.relevantEventCount,
  })
  if (error) {
    console.error('[journey-query] telemetry unavailable:', error)
    return buildJourneyQueryDiagnostics(current, null)
  }

  const row = Array.isArray(data) ? data[0] as TelemetryRow | undefined : undefined
  const aggregate = parseAggregate(row)
  if (!aggregate) {
    console.error('[journey-query] telemetry returned an invalid aggregate')
    return buildJourneyQueryDiagnostics(current, null)
  }
  return buildJourneyQueryDiagnostics(current, aggregate)
}

function parseAggregate(row: TelemetryRow | undefined): JourneyQueryTelemetryAggregate | null {
  if (!row) return null
  const sampleCount = Number(row.sample_count)
  const p50QueryDurationMs = Number(row.p50_ms)
  const p95QueryDurationMs = Number(row.p95_ms)
  const maxRelevantEventCount = Number(row.max_relevant_event_count)
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < 1 ||
    sampleCount > JOURNEY_QUERY_SAMPLE_LIMIT ||
    !Number.isFinite(p50QueryDurationMs) ||
    p50QueryDurationMs < 0 ||
    !Number.isFinite(p95QueryDurationMs) ||
    p95QueryDurationMs < 0 ||
    !Number.isSafeInteger(maxRelevantEventCount) ||
    maxRelevantEventCount < 0
  ) {
    return null
  }
  return {
    sampleCount,
    p50QueryDurationMs: roundMilliseconds(p50QueryDurationMs),
    p95QueryDurationMs: roundMilliseconds(p95QueryDurationMs),
    maxRelevantEventCount,
  }
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 100) / 100
}
