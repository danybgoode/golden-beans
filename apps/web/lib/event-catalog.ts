/**
 * The catalog is deliberately a pure projection of the bounded events snapshot. Keeping the
 * aggregate out of the query module makes its calendar boundaries and tenant-independent math
 * directly testable; the query module is the sole place that scopes the snapshot to a project.
 */

export const EVENT_CATALOG_WINDOW_DAYS = 14
export const EVENT_CATALOG_ROW_CAP = 50_000

const RESERVED_EVENTS = new Set(['experiment_exposed', 'flag_evaluated', '$error', 'scenario_executed'])

const SEGMENT_FIELDS = ['source', 'channel', 'campaign', 'plan', 'region'] as const

export type EventCatalogScalar = string | number | boolean

export type EventCatalogRow = {
  event: string
  tags: Record<string, unknown> | null
  subject_type: string | null
  subject_id: string | null
  created_at: string
}

export type EventCatalog = {
  events: Array<{
    event: string
    count14d: number
    count24h: number
    daily: number[]
    reserved: boolean
  }>
  entities: Array<{ type: string; subjects14d: number }>
  baselines: Array<{ event: string; type: string; baseline: number | null }>
  segments: Array<{
    field: (typeof SEGMENT_FIELDS)[number]
    coverage: number
    values: Array<{ value: EventCatalogScalar; share: number }>
  }>
  flagEvaluations: Array<{ flagKey: string; evaluations: number }>
  truncated: boolean
  rowCap: number
  windowDays: number
  asOf: string
}

export type EventCatalogOptions = {
  asOf: Date
  rowCap: number
  windowDays: number
}

type ParsedRow = EventCatalogRow & { createdAt: number }

function isScalar(value: unknown): value is EventCatalogScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function dayKeys(asOf: Date): string[] {
  const dayStart = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
  return Array.from({ length: EVENT_CATALOG_WINDOW_DAYS }, (_, index) =>
    new Date(dayStart - (EVENT_CATALOG_WINDOW_DAYS - 1 - index) * 86_400_000).toISOString().slice(0, 10)
  )
}

function compareScalars(a: EventCatalogScalar, b: EventCatalogScalar): number {
  const valueOrder = String(a).localeCompare(String(b))
  if (valueOrder !== 0) return valueOrder
  // Values with the same display string (for example, 1 and "1") are still distinct tag values.
  // The type tie-break keeps the catalog stable even though Postgres returns equally timed rows
  // in no guaranteed order.
  return (typeof a).localeCompare(typeof b)
}

/** Builds the D11 catalog from the project's already-scoped, bounded event snapshot. */
export function buildEventCatalog(rows: EventCatalogRow[], options: EventCatalogOptions): EventCatalog {
  const { asOf, rowCap, windowDays } = options
  if (!Number.isFinite(asOf.getTime())) throw new Error('event catalog asOf must be a valid Date')
  if (!Number.isInteger(rowCap) || rowCap < 1)
    throw new Error('event catalog rowCap must be a positive integer')
  if (windowDays !== EVENT_CATALOG_WINDOW_DAYS) {
    throw new Error(`event catalog windowDays must be ${EVENT_CATALOG_WINDOW_DAYS}`)
  }

  const asOfTime = asOf.getTime()
  // The window is the 14 UTC days the `daily` series draws — today (partial, up to asOf) and the 13
  // before it — so `count14d` always equals the sum of `daily` (fresh reviewer, PR #169: a rolling
  // 14×24h window counted the oldest partial day in the total and in no bucket).
  const windowStart =
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()) -
    (EVENT_CATALOG_WINDOW_DAYS - 1) * 86_400_000
  const dayKeysInOrder = dayKeys(asOf)
  const dayIndex = new Map(dayKeysInOrder.map((day, index) => [day, index]))
  const parsedRows: ParsedRow[] = []

  for (const row of rows) {
    const createdAt = Date.parse(row.created_at)
    if (!Number.isNaN(createdAt) && createdAt >= windowStart && createdAt <= asOfTime) {
      parsedRows.push({ ...row, createdAt })
    }
  }

  const eventCounts = new Map<string, { count14d: number; count24h: number; daily: number[] }>()
  const subjectsByType = new Map<string, Set<string>>()
  const eventSubjectsByType = new Map<string, Map<string, Set<string>>>()
  const segmentCounts = new Map<
    (typeof SEGMENT_FIELDS)[number],
    {
      carrying: number
      values: Map<string, { value: EventCatalogScalar; count: number }>
    }
  >()
  const flagEvaluations = new Map<string, number>()
  for (const field of SEGMENT_FIELDS) segmentCounts.set(field, { carrying: 0, values: new Map() })

  for (const row of parsedRows) {
    let event = eventCounts.get(row.event)
    if (!event) {
      event = { count14d: 0, count24h: 0, daily: Array(EVENT_CATALOG_WINDOW_DAYS).fill(0) }
      eventCounts.set(row.event, event)
    }
    event.count14d += 1
    if (row.createdAt >= asOfTime - 86_400_000) event.count24h += 1
    const index = dayIndex.get(utcDay(row.createdAt))
    if (index !== undefined) event.daily[index] += 1

    if (row.subject_type !== null) {
      let subjects = subjectsByType.get(row.subject_type)
      if (!subjects) {
        subjects = new Set()
        subjectsByType.set(row.subject_type, subjects)
      }
      if (row.subject_id !== null) {
        subjects.add(row.subject_id)

        let eventSubjects = eventSubjectsByType.get(row.event)
        if (!eventSubjects) {
          eventSubjects = new Map()
          eventSubjectsByType.set(row.event, eventSubjects)
        }
        let subjectsForEvent = eventSubjects.get(row.subject_type)
        if (!subjectsForEvent) {
          subjectsForEvent = new Set()
          eventSubjects.set(row.subject_type, subjectsForEvent)
        }
        subjectsForEvent.add(row.subject_id)
      }
    }

    for (const field of SEGMENT_FIELDS) {
      const value = row.tags?.[field]
      if (!isScalar(value)) continue
      const segment = segmentCounts.get(field)!
      segment.carrying += 1
      const key = `${typeof value}:${String(value)}`
      const entry = segment.values.get(key)
      if (entry) entry.count += 1
      else segment.values.set(key, { value, count: 1 })
    }

    if (
      row.event === 'flag_evaluated' &&
      row.createdAt >= asOfTime - 86_400_000 &&
      row.tags?.environment === 'production' &&
      typeof row.tags.flag_key === 'string'
    ) {
      flagEvaluations.set(row.tags.flag_key, (flagEvaluations.get(row.tags.flag_key) ?? 0) + 1)
    }
  }

  return {
    events: [...eventCounts.entries()]
      .map(([event, counts]) => ({ event, ...counts, reserved: RESERVED_EVENTS.has(event) }))
      .sort((a, b) => a.event.localeCompare(b.event)),
    entities: [...subjectsByType.entries()]
      .map(([type, subjects]) => ({ type, subjects14d: subjects.size }))
      .sort((a, b) => a.type.localeCompare(b.type)),
    baselines: [...eventCounts.keys()]
      .flatMap((event) =>
        [...subjectsByType.entries()].map(([type, subjects]) => ({
          event,
          type,
          baseline:
            subjects.size === 0
              ? null
              : (eventSubjectsByType.get(event)?.get(type)?.size ?? 0) / subjects.size,
        }))
      )
      .sort((a, b) => a.event.localeCompare(b.event) || a.type.localeCompare(b.type)),
    segments: SEGMENT_FIELDS.map((field) => {
      const segment = segmentCounts.get(field)!
      return {
        field,
        coverage: parsedRows.length === 0 ? 0 : segment.carrying / parsedRows.length,
        values: [...segment.values.values()]
          .sort((a, b) => b.count - a.count || compareScalars(a.value, b.value))
          .slice(0, 20)
          .map(({ value, count }) => ({ value, share: count / segment.carrying })),
      }
    }),
    flagEvaluations: [...flagEvaluations.entries()]
      .map(([flagKey, evaluations]) => ({ flagKey, evaluations }))
      .sort((a, b) => a.flagKey.localeCompare(b.flagKey)),
    // At exactly the cap we cannot tell "exactly 50,000" from "more", so it reads as "at least".
    truncated: rows.length >= rowCap,
    rowCap,
    windowDays,
    asOf: asOf.toISOString(),
  }
}
