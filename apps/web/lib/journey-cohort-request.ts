import {
  DEFAULT_DRILLDOWN_PAGE_SIZE,
  DEFAULT_STALE_AFTER_HOURS,
  MAX_COHORT_WINDOW_DAYS,
  MAX_DRILLDOWN_PAGE_SIZE,
  decodeCursor,
  journeyCursorScope,
  type JourneyCohortOptions,
} from './journey-cohort'
import { compareJourneyTimestamps, parseJourneyTimestamp } from './journey-timestamp'

export type JourneyCohortRequestResult =
  | { ok: true; version: number; options: JourneyCohortOptions }
  | { ok: false; error: string }

const MAX_POSTGRES_INTEGER = 2_147_483_647
const DRILLDOWN = /^(cohort|(?:satisfied|at_or_beyond|current|missing_next):[a-z][a-z0-9_]{0,63}|retention:(?:eligible|met|missed|pending))$/
const CURSOR = /^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{1,512}$/

export function parseJourneyCohortRequest(
  input: Record<string, string | null | undefined>,
  now: number = Date.now(),
): JourneyCohortRequestResult {
  const rawVersion = input.version
  const version = rawVersion === null || rawVersion === undefined ? Number.NaN : Number(rawVersion)
  if (!Number.isSafeInteger(version) || version < 1 || version > MAX_POSTGRES_INTEGER ||
      String(version) !== rawVersion) {
    return { ok: false, error: 'version must be a positive integer' }
  }
  if (!input.from || !input.to) {
    return { ok: false, error: 'from and to are required explicit-offset timestamps' }
  }

  let from
  let to
  let asOf
  try {
    from = parseJourneyTimestamp(input.from)
    to = parseJourneyTimestamp(input.to)
    asOf = parseJourneyTimestamp(input.asOf ?? new Date(now).toISOString())
  } catch {
    return { ok: false, error: 'from, to and asOf must be real explicit-offset timestamps' }
  }
  if (compareJourneyTimestamps(from, to) >= 0) return { ok: false, error: 'from must be before to' }
  if (compareJourneyTimestamps(to, asOf) > 0) return { ok: false, error: 'to must not be after asOf' }
  const latestAllowedAsOf = parseJourneyTimestamp(new Date(now).toISOString())
  if (compareJourneyTimestamps(asOf, latestAllowedAsOf) > 0) {
    return { ok: false, error: 'asOf must not be in the future' }
  }
  const windowMicroseconds =
    (to.epochSecond - from.epochSecond) * 1_000_000 +
    to.microsecond - from.microsecond
  if (windowMicroseconds > MAX_COHORT_WINDOW_DAYS * 86_400 * 1_000_000) {
    return { ok: false, error: `cohort window may not exceed ${MAX_COHORT_WINDOW_DAYS} days` }
  }

  const timezone = input.timezone ?? 'UTC'
  if (!isIanaTimezone(timezone)) return { ok: false, error: 'timezone must be a valid IANA display timezone' }

  const rawPageSize = input.pageSize
  const pageSize = rawPageSize ? Number(rawPageSize) : DEFAULT_DRILLDOWN_PAGE_SIZE
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_DRILLDOWN_PAGE_SIZE ||
      (rawPageSize !== null && rawPageSize !== undefined && String(pageSize) !== rawPageSize)) {
    return { ok: false, error: `pageSize must be an integer from 1 to ${MAX_DRILLDOWN_PAGE_SIZE}` }
  }

  const rawStale = input.staleAfterHours
  const staleAfterHours = rawStale ? Number(rawStale) : DEFAULT_STALE_AFTER_HOURS
  if (!Number.isSafeInteger(staleAfterHours) || staleAfterHours < 1 || staleAfterHours > 8_760 ||
      (rawStale !== null && rawStale !== undefined && String(staleAfterHours) !== rawStale)) {
    return { ok: false, error: 'staleAfterHours must be an integer from 1 to 8760' }
  }

  const drilldown = input.drilldown ?? undefined
  if (drilldown !== undefined && !DRILLDOWN.test(drilldown)) {
    return { ok: false, error: 'drilldown is not a supported bounded bucket' }
  }
  const cursor = input.cursor ?? undefined
  if (cursor !== undefined && drilldown === undefined) {
    return { ok: false, error: 'cursor requires a drilldown' }
  }

  const options: JourneyCohortOptions = {
    definitionVersion: version,
    from: from.canonical,
    to: to.canonical,
    asOf: asOf.canonical,
    timezone,
    staleAfterHours,
    pageSize,
    ...(drilldown ? { drilldown } : {}),
    ...(cursor ? { cursor } : {}),
  }
  if (
    cursor !== undefined &&
    (!CURSOR.test(cursor) || decodeCursor(cursor, journeyCursorScope(options)) === null)
  ) {
    return { ok: false, error: 'cursor is invalid for this version, window, asOf and drilldown' }
  }

  return {
    ok: true,
    version,
    options,
  }
}

function isIanaTimezone(value: string): boolean {
  if (value.length < 1 || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}
