import type { SourceFreshness } from './entity-contract'
import type { JourneyDefinition } from './journey-definition'
import {
  eventMatchesStage,
  projectJourneySubject,
  type JourneyProjectionEvent,
  type JourneySubjectProjection,
} from './journey-projection'
import {
  compareJourneyTimestamps,
  parseJourneyTimestamp,
  type JourneyTimestamp,
} from './journey-timestamp'

// Import-free cohort semantics shared by the server resolver and deterministic specs. Every subject
// remains an opaque id; no event tags or other source fields leave this evaluator.

export const DEFAULT_DRILLDOWN_PAGE_SIZE = 25
export const MAX_DRILLDOWN_PAGE_SIZE = 100
export const DEFAULT_STALE_AFTER_HOURS = 24
export const MAX_COHORT_WINDOW_DAYS = 366

export type JourneyCohortOptions = {
  definitionVersion: number
  from: string
  to: string
  asOf: string
  timezone: string
  staleAfterHours: number
  drilldown?: string
  cursor?: string
  pageSize: number
}

export type JourneyPopulationStatus =
  | 'nonzero'
  | 'zero_subjects'
  | 'no_qualifying_events'

export type JourneyStageAggregate = {
  key: string
  satisfiedCount: number
  cohortConversionRate: number | null
  continuationFromPreviousRate: number | null
  atOrBeyondCount: number
  atOrBeyondShare: number | null
  currentCount: number
  missingNextStageCount: number | null
  medianAgeHours: number | null
  p90AgeHours: number | null
  drilldowns: {
    satisfied: string
    atOrBeyond: string
    current: string
    missingNext: string | null
  }
}

export type JourneyRetentionAggregate = {
  stageKey: string
  anchorStageKey: string
  withinDays: number
  eligibleCount: number
  maturedCount: number
  metCount: number
  missedCount: number
  pendingCount: number
  rate: number | null
  drilldowns: {
    eligible: string
    met: string
    missed: string
    pending: string
  }
}

export type JourneyDrilldownPage = {
  key: string
  total: number
  subjectIds: string[]
  nextCursor: string | null
}

export type JourneyCohortAggregate = {
  populationStatus: JourneyPopulationStatus
  cohort: {
    entryMode: 'configured_stage_1' | 'first_qualifying_event'
    entryStageKey: string | null
    from: string
    to: string
    asOf: string
    timezone: string
    subjectCount: number
    drilldown: string
  }
  stages: JourneyStageAggregate[]
  retention: JourneyRetentionAggregate | null
  freshness: SourceFreshness & {
    staleAfterHours: number
    isStale: boolean | null
    status: 'unknown' | 'fresh' | 'stale'
  }
  diagnostics: {
    relevantEventCount: number
  }
  drilldown: JourneyDrilldownPage | null
}

type ProjectedSubject = {
  id: string
  projection: JourneySubjectProjection
  events: JourneyProjectionEvent[]
  currentIndex: number
  entryAt: JourneyTimestamp
}

type RetentionState = 'eligible' | 'met' | 'missed' | 'pending'

export function computeJourneyCohort(
  definition: JourneyDefinition,
  events: JourneyProjectionEvent[],
  options: JourneyCohortOptions,
): JourneyCohortAggregate {
  if (!isValidJourneyDrilldown(definition, options.drilldown)) {
    throw new Error('drilldown is not valid for this journey definition')
  }
  const from = parseJourneyTimestamp(options.from)
  const to = parseJourneyTimestamp(options.to)
  const asOf = parseJourneyTimestamp(options.asOf)
  const seenEventIds = new Set<string>()
  const relevant = events.filter((event) => {
    if (compareJourneyTimestamps(parseJourneyTimestamp(event.createdAt), asOf) > 0) return false
    if (compareJourneyTimestamps(
      parseJourneyTimestamp(event.occurredAt ?? event.createdAt),
      asOf,
    ) > 0) return false
    if (seenEventIds.has(event.id)) return false
    seenEventIds.add(event.id)
    return definition.stages.some((stage) => eventMatchesStage(event, stage))
  })
  const grouped = new Map<string, JourneyProjectionEvent[]>()
  for (const event of relevant) {
    const current = grouped.get(event.subjectId)
    if (current) current.push(event)
    else grouped.set(event.subjectId, [event])
  }

  const projected: ProjectedSubject[] = []
  for (const [subjectId, subjectEvents] of grouped) {
    const projection = projectJourneySubject(definition, subjectId, subjectEvents)
    const entry = cohortEntryTimestamp(definition, projection)
    if (!entry || compareJourneyTimestamps(entry, from) < 0 || compareJourneyTimestamps(entry, to) >= 0) {
      continue
    }
    const currentIndex = projection.currentStage
      ? definition.stages.findIndex((stage) => stage.key === projection.currentStage?.key)
      : -1
    if (currentIndex >= 0) {
      projected.push({ id: subjectId, projection, events: subjectEvents, currentIndex, entryAt: entry })
    }
  }
  projected.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

  const satisfiedBuckets = new Map<string, string[]>()
  const atOrBeyondBuckets = new Map<string, string[]>()
  const currentBuckets = new Map<string, string[]>()
  const missingBuckets = new Map<string, string[]>()
  const stages = definition.stages.map((stage, index): JourneyStageAggregate => {
    const satisfied = projected.filter((subject) =>
      subject.projection.history.some((item) => item.key === stage.key))
    // "At or beyond" is positional occupancy under S1's highest-independently-satisfied-stage
    // contract. It deliberately
    // does NOT claim that this stage's own event occurred; actual satisfaction stays in history.
    const atOrBeyond = projected.filter((subject) => subject.currentIndex >= index)
    const current = projected.filter((subject) => subject.currentIndex === index)
    const missing = index === definition.stages.length - 1 ? [] : current
    satisfiedBuckets.set(stage.key, satisfied.map((subject) => subject.id))
    atOrBeyondBuckets.set(stage.key, atOrBeyond.map((subject) => subject.id))
    currentBuckets.set(stage.key, current.map((subject) => subject.id))
    missingBuckets.set(stage.key, missing.map((subject) => subject.id))
    const ages = current.map((subject) => {
      const enteredAt = parseJourneyTimestamp(subject.projection.currentStage!.enteredAt)
      return timestampDifferenceHours(asOf, enteredAt)
    }).sort((a, b) => a - b)
    const previousSatisfiedSubjects = index === 0
      ? projected
      : projected.filter((subject) =>
          subject.projection.history.some((item) => item.key === definition.stages[index - 1].key))
    const continuedFromPrevious = index === 0
      ? satisfied.length
      : satisfied.filter((subject) =>
          subject.projection.history.some((item) => item.key === definition.stages[index - 1].key)
        ).length
    return {
      key: stage.key,
      satisfiedCount: satisfied.length,
      cohortConversionRate: rate(satisfied.length, projected.length),
      continuationFromPreviousRate: rate(continuedFromPrevious, previousSatisfiedSubjects.length),
      atOrBeyondCount: atOrBeyond.length,
      atOrBeyondShare: rate(atOrBeyond.length, projected.length),
      currentCount: current.length,
      missingNextStageCount: index === definition.stages.length - 1 ? null : missing.length,
      medianAgeHours: median(ages),
      p90AgeHours: percentileNearestRank(ages, 0.9),
      drilldowns: {
        satisfied: `satisfied:${stage.key}`,
        atOrBeyond: `at_or_beyond:${stage.key}`,
        current: `current:${stage.key}`,
        missingNext: index === definition.stages.length - 1 ? null : `missing_next:${stage.key}`,
      },
    }
  })

  const retentionStates = new Map<RetentionState, string[]>()
  for (const state of ['eligible', 'met', 'missed', 'pending'] as const) retentionStates.set(state, [])
  const retention = definition.retention
    ? computeRetention(definition, projected, asOf, retentionStates)
    : null

  const latest = aggregateFreshness(relevant)
  const isStale = latest.latestReceiptAt === null
    ? null
    : timestampDifferenceMicroseconds(
        asOf,
        parseJourneyTimestamp(latest.latestReceiptAt),
      ) > options.staleAfterHours * 3_600_000_000
  const hasQualifyingEventBeforeWindowEnd = relevant.some((event) =>
    compareJourneyTimestamps(
      parseJourneyTimestamp(event.occurredAt ?? event.createdAt),
      to,
    ) < 0)
  const populationStatus: JourneyPopulationStatus =
    !hasQualifyingEventBeforeWindowEnd ? 'no_qualifying_events'
      : projected.length === 0 ? 'zero_subjects'
        : 'nonzero'

  const drilldownBuckets = new Map<string, string[]>([
    ['cohort', projected.map((subject) => subject.id)],
  ])
  for (const [key, ids] of satisfiedBuckets) drilldownBuckets.set(`satisfied:${key}`, ids)
  for (const [key, ids] of atOrBeyondBuckets) drilldownBuckets.set(`at_or_beyond:${key}`, ids)
  for (const [key, ids] of currentBuckets) drilldownBuckets.set(`current:${key}`, ids)
  for (const [key, ids] of missingBuckets) drilldownBuckets.set(`missing_next:${key}`, ids)
  for (const [state, ids] of retentionStates) drilldownBuckets.set(`retention:${state}`, ids)

  return {
    populationStatus,
    cohort: {
      entryMode: definition.cohortEntry ? 'configured_stage_1' : 'first_qualifying_event',
      entryStageKey: definition.cohortEntry?.stageKey ?? null,
      from: from.canonical,
      to: to.canonical,
      asOf: asOf.canonical,
      timezone: options.timezone,
      subjectCount: projected.length,
      drilldown: 'cohort',
    },
    stages,
    retention,
    freshness: {
      ...latest,
      staleAfterHours: options.staleAfterHours,
      isStale,
      status: isStale === null ? 'unknown' : isStale ? 'stale' : 'fresh',
    },
    diagnostics: { relevantEventCount: relevant.length },
    drilldown: buildDrilldownPage(
      options.drilldown,
      drilldownBuckets,
      options,
    ),
  }
}

function cohortEntryTimestamp(
  definition: JourneyDefinition,
  projection: JourneySubjectProjection,
): JourneyTimestamp | null {
  if (definition.cohortEntry) {
    const item = projection.history.find((stage) => stage.key === definition.cohortEntry!.stageKey)
    return item ? parseJourneyTimestamp(item.enteredAt) : null
  }
  let earliest: JourneyTimestamp | null = null
  for (const stage of projection.history) {
    const entered = parseJourneyTimestamp(stage.enteredAt)
    if (!earliest || compareJourneyTimestamps(entered, earliest) < 0) earliest = entered
  }
  return earliest
}

function computeRetention(
  definition: JourneyDefinition,
  subjects: ProjectedSubject[],
  to: JourneyTimestamp,
  buckets: Map<RetentionState, string[]>,
): JourneyRetentionAggregate {
  const retention = definition.retention!
  for (const subject of subjects) {
    const anchor = subject.projection.history.find((stage) => stage.key === retention.anchorStageKey)
    if (!anchor) continue
    buckets.get('eligible')!.push(subject.id)
    const anchorAt = parseJourneyTimestamp(anchor.enteredAt)
    const targetStage = definition.stages.find((stage) => stage.key === retention.stageKey)!
    const deadlineMicroseconds = retention.withinDays * 86_400_000_000
    const met = subject.events.some((event) => {
      if (!eventMatchesStage(event, targetStage)) return false
      const targetDelta = timestampDifferenceMicroseconds(
        parseJourneyTimestamp(event.occurredAt ?? event.createdAt),
        anchorAt,
      )
      return targetDelta >= 0 && targetDelta <= deadlineMicroseconds
    })
    if (met) {
      buckets.get('met')!.push(subject.id)
    } else if (timestampDifferenceMicroseconds(to, anchorAt) >= deadlineMicroseconds) {
      buckets.get('missed')!.push(subject.id)
    } else {
      buckets.get('pending')!.push(subject.id)
    }
  }
  const eligible = buckets.get('eligible')!.length
  const met = buckets.get('met')!.length
  const missed = buckets.get('missed')!.length
  const matured = met + missed
  return {
    stageKey: retention.stageKey,
    anchorStageKey: retention.anchorStageKey,
    withinDays: retention.withinDays,
    eligibleCount: eligible,
    maturedCount: matured,
    metCount: met,
    missedCount: missed,
    pendingCount: buckets.get('pending')!.length,
    rate: rate(met, matured),
    drilldowns: {
      eligible: 'retention:eligible',
      met: 'retention:met',
      missed: 'retention:missed',
      pending: 'retention:pending',
    },
  }
}

export function isValidJourneyDrilldown(
  definition: JourneyDefinition,
  key: string | undefined,
): boolean {
  if (!key || key === 'cohort') return true
  const [kind, bucket] = key.split(':', 2)
  if (kind === 'retention') {
    return definition.retention !== undefined &&
      (bucket === 'eligible' || bucket === 'met' || bucket === 'missed' || bucket === 'pending')
  }
  const stageIndex = definition.stages.findIndex((stage) => stage.key === bucket)
  if (stageIndex < 0) return false
  if (kind === 'missing_next') return stageIndex < definition.stages.length - 1
  return kind === 'satisfied' || kind === 'at_or_beyond' || kind === 'current'
}

function aggregateFreshness(events: JourneyProjectionEvent[]): SourceFreshness {
  if (events.length === 0) return { latestEffectiveFactAt: null, latestReceiptAt: null }
  let latestFact = parseJourneyTimestamp(events[0].occurredAt ?? events[0].createdAt)
  let latestReceipt = parseJourneyTimestamp(events[0].createdAt)
  for (const event of events.slice(1)) {
    const fact = parseJourneyTimestamp(event.occurredAt ?? event.createdAt)
    const receipt = parseJourneyTimestamp(event.createdAt)
    if (compareJourneyTimestamps(fact, latestFact) > 0) latestFact = fact
    if (compareJourneyTimestamps(receipt, latestReceipt) > 0) latestReceipt = receipt
  }
  return {
    latestEffectiveFactAt: latestFact.canonical,
    latestReceiptAt: latestReceipt.canonical,
  }
}

function timestampDifferenceHours(later: JourneyTimestamp, earlier: JourneyTimestamp): number {
  return round(timestampDifferenceMicroseconds(later, earlier) / 3_600_000_000)
}

function timestampDifferenceMicroseconds(later: JourneyTimestamp, earlier: JourneyTimestamp): number {
  return (later.epochSecond - earlier.epochSecond) * 1_000_000 +
    later.microsecond - earlier.microsecond
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : round(numerator / denominator)
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 1
    ? round(values[middle])
    : round((values[middle - 1] + values[middle]) / 2)
}

function percentileNearestRank(values: number[], percentile: number): number | null {
  if (values.length === 0) return null
  return round(values[Math.max(0, Math.ceil(percentile * values.length) - 1)])
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function buildDrilldownPage(
  key: string | undefined,
  buckets: Map<string, string[]>,
  options: JourneyCohortOptions,
): JourneyDrilldownPage | null {
  if (!key) return null
  const ids = buckets.get(key)
  if (!ids) return null
  const scope = journeyCursorScope({ ...options, drilldown: key })
  const lastId = decodeCursor(options.cursor, scope)
  const start = lastId === null ? 0 : ids.findIndex((id) => id > lastId)
  const safeStart = start < 0 ? ids.length : start
  const subjectIds = ids.slice(safeStart, safeStart + options.pageSize)
  return {
    key,
    total: ids.length,
    subjectIds,
    nextCursor: safeStart + subjectIds.length < ids.length && subjectIds.length > 0
      ? encodeCursor(subjectIds[subjectIds.length - 1], scope)
      : null,
  }
}

export function journeyCursorScope(options: JourneyCohortOptions): string {
  return [
    options.definitionVersion,
    options.from,
    options.to,
    options.asOf,
    options.timezone,
    options.drilldown ?? '',
  ].join('\u001f')
}

export function encodeCursor(lastSubjectId: string, scope: string): string {
  return `v1.${hashScope(scope)}.${Buffer.from(lastSubjectId, 'utf8').toString('base64url')}`
}

export function decodeCursor(cursor: string | undefined, scope: string): string | null {
  if (!cursor) return null
  try {
    const match = /^v1\.([0-9a-f]{8})\.([A-Za-z0-9_-]{1,512})$/.exec(cursor)
    if (!match || match[1] !== hashScope(scope)) return null
    const decoded = Buffer.from(match[2], 'base64url').toString('utf8')
    return decoded.length >= 1 && decoded.length <= 128 ? decoded : null
  } catch {
    return null
  }
}

function hashScope(value: string): string {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(value, 'utf8')) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
