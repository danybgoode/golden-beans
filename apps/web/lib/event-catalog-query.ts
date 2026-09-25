import 'server-only'
import type { EventCatalog } from './event-catalog'
import { readEventCatalog } from './event-catalog-read'
import { getSupabaseServiceClient } from './supabase'

/**
 * The canonical event catalog read (AGENTS rule #1). `projectId` is resolved by the caller from
 * server-side credentials or membership; accepting a slug here would make isolation optional.
 */
export function getEventCatalog(projectId: string, asOf: Date = new Date()): Promise<EventCatalog> {
  return readEventCatalog(getSupabaseServiceClient(), projectId, asOf)
}
