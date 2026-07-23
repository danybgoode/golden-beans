import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { projectJourneySubject, type JourneyProjectionEvent, type JourneySubjectProjection } from './journey-projection'
import type { JourneyDefinition } from './journey-definition'
import {
  computeJourneyCohort,
  type JourneyCohortAggregate,
  type JourneyCohortOptions,
} from './journey-cohort'

// DB-touching counterpart to journey-projection.ts. It owns tenant/version/subject constraints;
// callers receive an already-evaluated result and never assemble their own unscoped event query.

export type JourneySubjectQueryResult =
  | { ok: true; journey: { key: string; definitionVersion: number; entityType: string }; subject: { id: string } & JourneySubjectProjection }
  | { ok: false; reason: 'journey_not_found' | 'version_not_found' | 'query_failed' }

export type JourneyCohortQueryResult =
  | {
      ok: true
      journey: { key: string; definitionVersion: number; entityType: string }
      cohort: JourneyCohortAggregate
      diagnostics: { queryDurationMs: number; relevantEventCount: number }
    }
  | {
      ok: false
      reason: 'journey_not_found' | 'version_not_found' | 'query_failed' | 'resource_limit'
    }

type JourneyEventRow = {
  id: unknown
  event: unknown
  tags: unknown
  occurred_at: unknown
  created_at: unknown
  subject_id: unknown
}

type JourneyDefinitionLookup =
  | {
      ok: true
      registry: { id: string; key: string; active_version_id?: string | null }
      version: number
      definition: JourneyDefinition
    }
  | { ok: false; reason: 'journey_not_found' | 'version_not_found' | 'query_failed' }

export async function getJourneySubjectByProjectId(
  projectId: string,
  journeyKey: string,
  version: number,
  subjectId: string,
): Promise<JourneySubjectQueryResult> {
  const lookup = await lookupJourneyDefinition(projectId, journeyKey, version)
  if (!lookup.ok) return lookup
  const supabase = getSupabaseServiceClient()
  const definition = lookup.definition
  // The RPC performs one project/entity/subject-scoped SELECT and aggregates the result into one
  // bounded JSONB value. That gives the evaluator one database snapshot without PostgREST's row cap
  // or a cross-page concurrent-ingest gap, while oversized subject histories fail closed.
  const { data, error: eventsError } = await supabase.rpc('get_journey_subject_events', {
    p_project_id: projectId,
    p_subject_type: definition.entityType,
    p_subject_id: subjectId,
  })
  if (eventsError || !Array.isArray(data)) {
    console.error('[journey-query] subject events lookup failed:', eventsError)
    return { ok: false, reason: 'query_failed' }
  }
  const rows = data as JourneyEventRow[]

  const events: JourneyProjectionEvent[] = rows.map((row) => ({
    id: row.id as string,
    event: row.event as string,
    tags: (row.tags as Record<string, unknown>) ?? {},
    // Do not round-trip through Date here: PostgreSQL retains six fractional digits and lifecycle
    // facts within one millisecond must remain distinct. The pure evaluator normalizes these exact
    // strings to canonical UTC while retaining their microseconds.
    occurredAt: row.occurred_at ? row.occurred_at as string : null,
    createdAt: row.created_at as string,
    subjectId: row.subject_id as string,
  }))
  const projection = projectJourneySubject(definition, subjectId, events)

  return {
    ok: true,
    journey: { key: lookup.registry.key, definitionVersion: lookup.version, entityType: definition.entityType },
    subject: { id: subjectId, ...projection },
  }
}

export async function getJourneyCohortByProjectId(
  projectId: string,
  journeyKey: string,
  version: number,
  options: JourneyCohortOptions,
): Promise<JourneyCohortQueryResult> {
  const startedAt = performance.now()
  const lookup = await lookupJourneyDefinition(projectId, journeyKey, version)
  if (!lookup.ok) return lookup
  const eventNames = [...new Set(lookup.definition.stages.map((stage) => stage.event))]
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('get_journey_cohort_events', {
    p_project_id: projectId,
    p_subject_type: lookup.definition.entityType,
    p_event_names: eventNames,
    p_to: options.to,
    p_as_of: options.asOf,
  })
  if (error || !Array.isArray(data)) {
    console.error('[journey-query] cohort snapshot failed:', error)
    return { ok: false, reason: error?.code === '54000' ? 'resource_limit' : 'query_failed' }
  }

  try {
    const events = (data as JourneyEventRow[]).map(mapJourneyEvent)
    const cohort = computeJourneyCohort(lookup.definition, events, options)
    return {
      ok: true,
      journey: {
        key: lookup.registry.key,
        definitionVersion: lookup.version,
        entityType: lookup.definition.entityType,
      },
      cohort,
      diagnostics: {
        queryDurationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        relevantEventCount: cohort.diagnostics.relevantEventCount,
      },
    }
  } catch (error) {
    console.error('[journey-query] cohort evaluation failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
}

export async function getActiveJourneyVersionByProjectId(
  projectId: string,
  journeyKey: string,
): Promise<
  | { ok: true; version: number }
  | { ok: false; reason: 'journey_not_found' | 'version_not_found' | 'query_failed' }
> {
  const supabase = getSupabaseServiceClient()
  const { data: registry, error } = await supabase
    .from('journey_registries')
    .select('id, active_version_id')
    .eq('project_id', projectId)
    .eq('key', journeyKey)
    .maybeSingle()
  if (error) {
    console.error('[journey-query] active registry lookup failed:', error)
    return { ok: false, reason: 'query_failed' }
  }
  if (!registry) return { ok: false, reason: 'journey_not_found' }
  if (!registry.active_version_id) return { ok: false, reason: 'version_not_found' }
  const { data: version, error: versionError } = await supabase
    .from('journey_definition_versions')
    .select('version')
    .eq('project_id', projectId)
    .eq('journey_id', registry.id)
    .eq('id', registry.active_version_id)
    .maybeSingle()
  if (versionError) {
    console.error('[journey-query] active version lookup failed:', versionError)
    return { ok: false, reason: 'query_failed' }
  }
  return version
    ? { ok: true, version: version.version as number }
    : { ok: false, reason: 'version_not_found' }
}

async function lookupJourneyDefinition(
  projectId: string,
  journeyKey: string,
  version: number,
): Promise<JourneyDefinitionLookup> {
  const supabase = getSupabaseServiceClient()
  const { data: registry, error: registryError } = await supabase
    .from('journey_registries')
    .select('id, key')
    .eq('project_id', projectId)
    .eq('key', journeyKey)
    .maybeSingle()
  if (registryError) {
    console.error('[journey-query] registry lookup failed:', registryError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!registry) return { ok: false, reason: 'journey_not_found' }

  const { data: definitionVersion, error: versionError } = await supabase
    .from('journey_definition_versions')
    .select('version, definition')
    .eq('project_id', projectId)
    .eq('journey_id', registry.id)
    .eq('version', version)
    .maybeSingle()
  if (versionError) {
    console.error('[journey-query] version lookup failed:', versionError)
    return { ok: false, reason: 'query_failed' }
  }
  if (!definitionVersion) return { ok: false, reason: 'version_not_found' }
  return {
    ok: true,
    registry: { id: registry.id as string, key: registry.key as string },
    version: definitionVersion.version as number,
    definition: definitionVersion.definition as JourneyDefinition,
  }
}

function mapJourneyEvent(row: JourneyEventRow): JourneyProjectionEvent {
  return {
    id: row.id as string,
    event: row.event as string,
    tags: (row.tags as Record<string, unknown>) ?? {},
    occurredAt: row.occurred_at ? row.occurred_at as string : null,
    createdAt: row.created_at as string,
    subjectId: row.subject_id as string,
  }
}
