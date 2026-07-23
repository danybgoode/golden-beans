import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { projectJourneySubject, type JourneyProjectionEvent, type JourneySubjectProjection } from './journey-projection'
import type { JourneyDefinition } from './journey-definition'

// DB-touching counterpart to journey-projection.ts. It owns tenant/version/subject constraints;
// callers receive an already-evaluated result and never assemble their own unscoped event query.

export type JourneySubjectQueryResult =
  | { ok: true; journey: { key: string; definitionVersion: number; entityType: string }; subject: { id: string } & JourneySubjectProjection }
  | { ok: false; reason: 'journey_not_found' | 'version_not_found' | 'query_failed' }

type JourneyEventRow = {
  id: unknown
  event: unknown
  tags: unknown
  occurred_at: unknown
  created_at: unknown
  subject_id: unknown
}

export async function getJourneySubjectByProjectId(
  projectId: string,
  journeyKey: string,
  version: number,
  subjectId: string,
): Promise<JourneySubjectQueryResult> {
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

  const definition = definitionVersion.definition as JourneyDefinition
  // The RPC performs one project/entity/subject-scoped SELECT and aggregates the result into one
  // JSONB value. That gives the evaluator one database snapshot without PostgREST's row cap or a
  // cross-page concurrent-ingest gap.
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
    journey: { key: registry.key as string, definitionVersion: definitionVersion.version as number, entityType: definition.entityType },
    subject: { id: subjectId, ...projection },
  }
}
