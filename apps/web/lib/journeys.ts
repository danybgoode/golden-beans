import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { JourneyDefinition } from './journey-definition'
import {
  JOURNEY_REGISTRY_RELATIONAL_SELECT,
  mapJourneyRegistryRows,
  type JourneyRegistryRelationRow,
  type JourneyRegistryView,
  type JourneyVersionView,
} from './journey-registry-view'

// entity-journeys-projections · Sprint 1, Story 1.1 — the registry's server-only adapter.
// Every mutation is one database RPC: version allocation/state change + actor/time audit commit or
// roll back together. The project id and actor id come from requireProjectOwnership in the action.

export type JourneyVersionRow = JourneyVersionView
export type JourneyRegistryRow = JourneyRegistryView

export async function listJourneyRegistries(projectId: string): Promise<JourneyRegistryRow[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('journey_registries')
    .select(JOURNEY_REGISTRY_RELATIONAL_SELECT)
    .eq('project_id', projectId)
    .order('key')
  if (error) {
    console.error('[journeys] list failed:', error)
    throw new Error('Could not load journey definitions')
  }
  return mapJourneyRegistryRows((data ?? []) as unknown as JourneyRegistryRelationRow[])
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
