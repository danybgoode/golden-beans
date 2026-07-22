import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { projectJourneySubject, type JourneyProjectionEvent, type JourneySubjectProjection } from './journey-projection'
import type { JourneyDefinition } from './journey-definition'

// DB-touching counterpart to journey-projection.ts. It owns tenant/version/subject constraints;
// callers receive an already-evaluated result and never assemble their own unscoped event query.

export type JourneySubjectQueryResult =
  | { ok: true; journey: { key: string; definitionVersion: number; entityType: string }; subject: { id: string } & JourneySubjectProjection }
  | { ok: false; reason: 'journey_not_found' | 'version_not_found' | 'query_failed' }

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
  const { data: rows, error: eventsError } = await supabase
    .from('events')
    .select('id, event, tags, occurred_at, created_at, subject_id')
    .eq('project_id', projectId)
    .eq('subject_type', definition.entityType)
    .eq('subject_id', subjectId)
  if (eventsError) {
    console.error('[journey-query] subject events lookup failed:', eventsError)
    return { ok: false, reason: 'query_failed' }
  }

  const events: JourneyProjectionEvent[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    event: row.event as string,
    tags: (row.tags as Record<string, unknown>) ?? {},
    // PostgREST may serialize the same timestamptz as `+00:00` while ingest stored `Z`. Normalize
    // at the one DB boundary so pure fixtures and API results share a stable UTC representation.
    occurredAt: row.occurred_at ? new Date(row.occurred_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
    subjectId: row.subject_id as string,
  }))
  const projection = projectJourneySubject(definition, subjectId, events)

  return {
    ok: true,
    journey: { key: registry.key as string, definitionVersion: definitionVersion.version as number, entityType: definition.entityType },
    subject: { id: subjectId, ...projection },
  }
}
