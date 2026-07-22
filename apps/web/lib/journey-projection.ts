import type { SourceFreshness } from './entity-contract'
import type { JourneyDefinition, JourneyStage } from './journey-definition'

// entity-journeys-projections · Sprint 1, Story 1.2 — deterministic, query-time subject
// projection. This module deliberately has no runtime/framework import: a lifecycle answer must be
// reproducible from canonical facts in a unit test, and the database wrapper must not own semantics.

export type JourneyProjectionEvent = {
  id: string
  event: string
  tags: Record<string, unknown>
  occurredAt: string | null
  createdAt: string
  subjectId: string
}

export type JourneyStageHistory = {
  key: string
  enteredAt: string
}

export type JourneySubjectProjection = {
  currentStage: JourneyStageHistory | null
  history: JourneyStageHistory[]
  freshness: SourceFreshness
}

type OrderedEvent = JourneyProjectionEvent & { effectiveAt: string; effectiveAtMs: number; createdAtMs: number }

/**
 * Evaluates one opaque subject against one immutable definition version. The caller has already
 * constrained events to its server-resolved project and the definition's entity type; retaining
 * subjectId on the input makes accidental mixed-subject calls fail closed instead of merging facts.
 */
export function projectJourneySubject(
  definition: JourneyDefinition,
  subjectId: string,
  events: JourneyProjectionEvent[],
): JourneySubjectProjection {
  const scoped = events.filter((event) => event.subjectId === subjectId)
  const ordered = uniqueCanonicalEvents(scoped)
  const firstReached = new Map<string, string>()

  for (const event of ordered) {
    for (const stage of definition.stages) {
      if (!firstReached.has(stage.key) && eventMatchesStage(event, stage)) {
        // This is a source-fact timestamp, never the time evaluation ran. Because events are
        // ordered by effective fact time then canonical id, the first write is deterministic.
        firstReached.set(stage.key, event.effectiveAt)
      }
    }
  }

  // History deliberately follows DEFINITION stage order, not receipt/completion order. A late
  // lower-stage fact therefore repairs that stage's first-reached time without regressing the
  // current highest stage or making the returned lifecycle look cyclic.
  const history = definition.stages.flatMap((stage): JourneyStageHistory[] => {
    const enteredAt = firstReached.get(stage.key)
    return enteredAt === undefined ? [] : [{ key: stage.key, enteredAt }]
  })

  return {
    currentStage: history.length === 0 ? null : history[history.length - 1],
    history,
    freshness: sourceFreshness(ordered),
  }
}

export function eventMatchesStage(event: JourneyProjectionEvent, stage: JourneyStage): boolean {
  if (event.event !== stage.event) return false
  for (const [key, expected] of Object.entries(stage.tags ?? {})) {
    // Exact is exact: do not coerce 42/"42", false/"false", or accept an object/array that merely
    // contains the expected value. Registry validation limits numeric predicates to bounded safe
    // integers, so strict equality remains exact after JSON/Postgres round-trips.
    if (event.tags[key] !== expected) return false
  }
  return true
}

function uniqueCanonicalEvents(events: JourneyProjectionEvent[]): OrderedEvent[] {
  const ordered = events
    .map((event) => ({
      ...event,
      effectiveAt: event.occurredAt ?? event.createdAt,
      effectiveAtMs: Date.parse(event.occurredAt ?? event.createdAt),
      createdAtMs: Date.parse(event.createdAt),
    }))
    .sort((a, b) => a.effectiveAtMs - b.effectiveAtMs || compareCanonicalIds(a.id, b.id))

  // Events.id is a primary key, so a DB query cannot return a conflicting duplicate. The pure
  // evaluator still makes an at-least-once fixture converge: after the deterministic sort, retain
  // one fact for each canonical id.
  const seen = new Set<string>()
  return ordered.filter((event) => {
    if (seen.has(event.id)) return false
    seen.add(event.id)
    return true
  })
}

function compareCanonicalIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sourceFreshness(events: OrderedEvent[]): SourceFreshness {
  if (events.length === 0) return { latestEffectiveFactAt: null, latestReceiptAt: null }

  let latestFact = events[0]
  let latestReceipt = events[0]
  for (const event of events.slice(1)) {
    if (event.effectiveAtMs > latestFact.effectiveAtMs ||
      (event.effectiveAtMs === latestFact.effectiveAtMs && compareCanonicalIds(event.id, latestFact.id) > 0)) {
      latestFact = event
    }
    if (event.createdAtMs > latestReceipt.createdAtMs ||
      (event.createdAtMs === latestReceipt.createdAtMs && compareCanonicalIds(event.id, latestReceipt.id) > 0)) {
      latestReceipt = event
    }
  }
  return { latestEffectiveFactAt: latestFact.effectiveAt, latestReceiptAt: latestReceipt.createdAt }
}
