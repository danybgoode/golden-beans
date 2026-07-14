// Growth Engine v1 · Sprint 2, Story 2.2 (Roadmap/01-growth-engine/growth-engine-v1) —
// pure TARS (Targeted/Adopted/Retained) aggregation. Zero DB/network import (Roadmap/
// LEARNINGS.md: keep pure logic import-free of framework/runtime-only modules), so it's
// unit-testable directly against a synthetic event sequence — no Supabase, no fixtures.
//
// Targeted / Adopted / Retained are labeled **registry-declared, not gateway-observed**
// (v1's honest boundary — flags are served by Miyagi, not this engine):
//   - Targeted is gated by `feature.enabled` — a disabled/never-enabled feature reports
//     Targeted = 0 regardless of historical events. When `targetEvent` is declared,
//     Targeted counts distinct users who fired it; otherwise it falls back to "any
//     event for this feature" (the sprint doc's literal fallback reading).
//   - Adopted counts distinct users who fired `adoptedEvent` (fallback: "first event" —
//     any event at all), independent of the enabled gate (an event that already
//     happened is a fact, not a declaration).
//   - Retained counts distinct users (from Adopted) who additionally fired a qualifying
//     "repeat" event — `retainedEvent` if declared, else any second distinct event for
//     the feature — within `retentionDays` of their EARLIEST qualifying event.

export interface TarsEvent {
  userId: string
  event: string
  createdAt: string
}

export interface TarsFeature {
  enabled: boolean
  targetEvent: string | null
  adoptedEvent: string | null
  retainedEvent: string | null
  retentionDays: number
}

export interface TarsResult {
  targeted: number
  adopted: number
  retained: number
}

function distinctUsersFor(events: TarsEvent[], eventName: string | null): Set<string> {
  const users = new Set<string>()
  for (const e of events) {
    if (eventName === null || e.event === eventName) users.add(e.userId)
  }
  return users
}

function earliestByUser(events: TarsEvent[]): Map<string, number> {
  const earliest = new Map<string, number>()
  for (const e of events) {
    const t = new Date(e.createdAt).getTime()
    const seen = earliest.get(e.userId)
    if (seen === undefined || t < seen) earliest.set(e.userId, t)
  }
  return earliest
}

export function computeTars(events: TarsEvent[], feature: TarsFeature): TarsResult {
  const targetedUsers = feature.enabled ? distinctUsersFor(events, feature.targetEvent) : new Set<string>()
  const adoptedUsers = distinctUsersFor(events, feature.adoptedEvent)

  const firstSeen = earliestByUser(events)
  const retentionMs = feature.retentionDays * 24 * 60 * 60 * 1000
  const retainedUsers = new Set<string>()

  for (const userId of adoptedUsers) {
    const baseline = firstSeen.get(userId)
    if (baseline === undefined) continue

    const qualifyingEvents = events.filter(
      (e) => e.userId === userId && (feature.retainedEvent === null || e.event === feature.retainedEvent),
    )
    const hasRepeat = qualifyingEvents.some((e) => {
      const t = new Date(e.createdAt).getTime()
      return t > baseline && t - baseline <= retentionMs
    })
    if (hasRepeat) retainedUsers.add(userId)
  }

  return { targeted: targetedUsers.size, adopted: adoptedUsers.size, retained: retainedUsers.size }
}
