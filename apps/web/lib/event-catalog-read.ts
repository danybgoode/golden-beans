import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildEventCatalog,
  EVENT_CATALOG_ROW_CAP,
  EVENT_CATALOG_WINDOW_DAYS,
  type EventCatalog,
  type EventCatalogRow,
} from './event-catalog'

// The read half of D11, with the client INJECTED so the paging can be tested against real PostgREST
// (a Playwright spec cannot import a `server-only` module). Product code never calls this directly:
// it goes through `getEventCatalog` in ./event-catalog-query, which supplies the service client.

/**
 * PostgREST answers at most `max_rows` rows per request (1,000 on hosted Supabase and in
 * `supabase/config.toml`), whatever `.limit()` asks for. A single `.limit(50000)` therefore returns
 * 1,000 rows and reports `truncated: false` — a silent undercount that reads exactly like a quiet
 * product. So the snapshot is read in pages of this size, newest first, until a short page or the cap.
 */
export const EVENT_CATALOG_PAGE_SIZE = 1_000

/**
 * Reads one tenant's bounded event snapshot. `projectId` is resolved by the caller from server-side
 * credentials or membership; accepting a slug here would make that isolation guarantee optional.
 */
export async function readEventCatalog(
  client: SupabaseClient,
  projectId: string,
  asOf: Date = new Date()
): Promise<EventCatalog> {
  const windowStart = new Date(asOf.getTime() - EVENT_CATALOG_WINDOW_DAYS * 86_400_000)
  const rows: EventCatalogRow[] = []
  // Ordered by (created_at, id) so a page boundary cannot fall between two equally-timed rows and
  // either repeat or drop one — `created_at` alone is not unique.
  while (rows.length < EVENT_CATALOG_ROW_CAP) {
    const from = rows.length
    const to = Math.min(from + EVENT_CATALOG_PAGE_SIZE, EVENT_CATALOG_ROW_CAP) - 1
    const { data, error } = await client
      .from('events')
      .select('event, tags, subject_type, subject_id, created_at')
      .eq('project_id', projectId)
      .gte('created_at', windowStart.toISOString())
      .lte('created_at', asOf.toISOString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) {
      console.error('[event-catalog-query] event snapshot failed:', error)
      throw new Error('could not read event catalog')
    }
    const page = (data ?? []) as EventCatalogRow[]
    rows.push(...page)
    if (page.length < to - from + 1) break
  }

  return buildEventCatalog(rows, {
    asOf,
    rowCap: EVENT_CATALOG_ROW_CAP,
    windowDays: EVENT_CATALOG_WINDOW_DAYS,
  })
}
