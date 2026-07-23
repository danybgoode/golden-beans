export const JOURNEY_MATERIALIZATION_P95_MS = 2_000
export const JOURNEY_MATERIALIZATION_EVENT_COUNT = 1_000_000
export const JOURNEY_QUERY_SAMPLE_LIMIT = 100

export type JourneyQueryKind = 'subject' | 'cohort'
export type JourneyMaterializationDecision =
  | 'keep_query_time'
  | 'materialization_tripwire_reached'
  | 'telemetry_unavailable'

export type JourneyQueryDiagnostics = {
  queryKind: JourneyQueryKind
  queryDurationMs: number
  relevantEventCount: number
  telemetryStatus: 'available' | 'unavailable'
  sampleCount: number | null
  p50QueryDurationMs: number | null
  p95QueryDurationMs: number | null
  maxRelevantEventCount: number | null
  materializationDecision: JourneyMaterializationDecision
  thresholds: {
    p95QueryDurationMs: number
    relevantEventCount: number
  }
}

export type JourneyQueryTelemetryAggregate = {
  sampleCount: number
  p50QueryDurationMs: number
  p95QueryDurationMs: number
  maxRelevantEventCount: number
}

export function assessJourneyMaterialization(
  p95QueryDurationMs: number,
  maxRelevantEventCount: number,
): Exclude<JourneyMaterializationDecision, 'telemetry_unavailable'> {
  return p95QueryDurationMs > JOURNEY_MATERIALIZATION_P95_MS ||
    maxRelevantEventCount > JOURNEY_MATERIALIZATION_EVENT_COUNT
    ? 'materialization_tripwire_reached'
    : 'keep_query_time'
}

export function buildJourneyQueryDiagnostics(
  current: {
    queryKind: JourneyQueryKind
    queryDurationMs: number
    relevantEventCount: number
  },
  aggregate: JourneyQueryTelemetryAggregate | null,
): JourneyQueryDiagnostics {
  return {
    ...current,
    telemetryStatus: aggregate ? 'available' : 'unavailable',
    sampleCount: aggregate?.sampleCount ?? null,
    p50QueryDurationMs: aggregate?.p50QueryDurationMs ?? null,
    p95QueryDurationMs: aggregate?.p95QueryDurationMs ?? null,
    maxRelevantEventCount: aggregate?.maxRelevantEventCount ?? null,
    materializationDecision: aggregate
      ? assessJourneyMaterialization(
          aggregate.p95QueryDurationMs,
          aggregate.maxRelevantEventCount,
        )
      : 'telemetry_unavailable',
    thresholds: {
      p95QueryDurationMs: JOURNEY_MATERIALIZATION_P95_MS,
      relevantEventCount: JOURNEY_MATERIALIZATION_EVENT_COUNT,
    },
  }
}
