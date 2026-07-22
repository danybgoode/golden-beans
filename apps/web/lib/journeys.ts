import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { JourneyDefinition } from './journey-definition'

// entity-journeys-projections · Sprint 1, Story 1.1 — the registry's server-only adapter.
// Every mutation is one database RPC: version allocation/state change + actor/time audit commit or
// roll back together. The project id and actor id come from requireProjectOwnership in the action.

export type JourneyVersionRow = {
  id: string
  version: number
  definition: JourneyDefinition
  createdBy: string
  createdAt: string
  activatedBy: string | null
  activatedAt: string | null
  state: 'draft' | 'active' | 'superseded'
}

export type JourneyRegistryRow = {
  id: string
  key: string
  activeVersionId: string | null
  createdBy: string
  createdAt: string
  versions: JourneyVersionRow[]
}

export async function listJourneyRegistries(projectId: string): Promise<JourneyRegistryRow[]> {
  const supabase = getSupabaseServiceClient()
  const [{ data: registries, error: registryError }, { data: versions, error: versionError }] =
    await Promise.all([
      supabase
        .from('journey_registries')
        .select('id, key, active_version_id, created_by, created_at')
        .eq('project_id', projectId)
        .order('key'),
      supabase
        .from('journey_definition_versions')
        .select('id, journey_id, version, definition, created_by, created_at, activated_by, activated_at')
        .eq('project_id', projectId)
        .order('version', { ascending: false }),
    ])
  if (registryError || versionError) {
    console.error('[journeys] list failed:', registryError ?? versionError)
    throw new Error('Could not load journey definitions')
  }

  const byJourney = new Map<string, NonNullable<typeof versions>>()
  for (const version of versions ?? []) {
    const rows = byJourney.get(version.journey_id as string) ?? []
    rows.push(version)
    byJourney.set(version.journey_id as string, rows)
  }

  return (registries ?? []).map((registry) => ({
    id: registry.id as string,
    key: registry.key as string,
    activeVersionId: (registry.active_version_id as string | null) ?? null,
    createdBy: registry.created_by as string,
    createdAt: registry.created_at as string,
    versions: (byJourney.get(registry.id as string) ?? []).map((version) => ({
      id: version.id as string,
      version: version.version as number,
      definition: version.definition as JourneyDefinition,
      createdBy: version.created_by as string,
      createdAt: version.created_at as string,
      activatedBy: (version.activated_by as string | null) ?? null,
      activatedAt: (version.activated_at as string | null) ?? null,
      state:
        registry.active_version_id === version.id
          ? 'active'
          : version.activated_at
            ? 'superseded'
            : 'draft',
    })),
  }))
}

export async function createJourneyVersion(
  projectId: string,
  journeyKey: string,
  definition: JourneyDefinition,
  actorUserId: string,
): Promise<
  | { ok: true; journeyId: string; versionId: string; version: number }
  | { ok: false; error: string }
> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('create_journey_version', {
    p_project_id: projectId,
    p_journey_key: journeyKey,
    p_definition: definition,
    p_actor_user_id: actorUserId,
  })
  if (error || !data?.[0]) {
    console.error('[journeys] create version failed:', error)
    return { ok: false, error: 'Could not create this journey version.' }
  }
  return {
    ok: true,
    journeyId: data[0].journey_id as string,
    versionId: data[0].version_id as string,
    version: data[0].version as number,
  }
}

export async function activateJourneyVersion(
  projectId: string,
  journeyId: string,
  versionId: string,
  actorUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase.rpc('activate_journey_version', {
    p_project_id: projectId,
    p_journey_id: journeyId,
    p_version_id: versionId,
    p_actor_user_id: actorUserId,
  })
  if (error) {
    console.error('[journeys] activation failed:', error)
    return { ok: false, error: 'Could not activate this version.' }
  }
  return data === true
    ? { ok: true }
    : { ok: false, error: 'Only a newer draft from this project can be activated.' }
}
