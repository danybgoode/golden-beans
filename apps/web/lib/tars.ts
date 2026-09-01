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
//     the feature — within `retentionDays` of their EARLIEST ADOPTING event (the event
//     matching `adoptedEvent`, fallback: any event). The window is anchored to adoption,
//     not to the user's first-ever event for the feature — anchoring to an earlier
//     target/exposure event would only ever undercount Retained (a real repeat shortly
//     after a late adoption could fall outside a window measured from a much earlier
//     view).

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

function earliestQualifyingByUser(events: TarsEvent[], eventName: string | null): Map<string, number> {
  const earliest = new Map<string, number>()
  for (const e of events) {
    if (eventName !== null && e.event !== eventName) continue
    const t = new Date(e.createdAt).getTime()
    const seen = earliest.get(e.userId)
    if (seen === undefined || t < seen) earliest.set(e.userId, t)
  }
  return earliest
}

export function computeTars(events: TarsEvent[], feature: TarsFeature): TarsResult {
  const targetedUsers = feature.enabled ? distinctUsersFor(events, feature.targetEvent) : new Set<string>()
  const adoptedUsers = distinctUsersFor(events, feature.adoptedEvent)

  // The retention window is anchored to each user's earliest ADOPTING event, not their
  // earliest event of any kind — see the module comment above.
  const adoptionBaseline = earliestQualifyingByUser(events, feature.adoptedEvent)
  const retentionMs = feature.retentionDays * 24 * 60 * 60 * 1000
  const retainedUsers = new Set<string>()

  for (const userId of adoptedUsers) {
    const baseline = adoptionBaseline.get(userId)
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

// ── design-system-rails · Sprint 5, Story 5.3 — *Times served, last 14 days* ──────────────────
//
// ⚠️ **No new query and no migration** (sprint L7). `getFeatureFunnelByProjectId` already selects
// EVERY event for the feature — `user_id, event, created_at` — and hands the array to `computeTars`.
// This is a second pure pass over the same array, so the fourteen bars cost one more `map` and zero
// round trips. It lives here rather than in a route because AGENTS rule #1 says reads stay on the
// canonical path: nothing outside `lib/*-query.ts` re-queries `events` ad hoc, and nothing needs to.

/** One day's count. `date` is a UTC `YYYY-MM-DD`, which is also what it is labelled with. */
export interface ServedDay {
  date: string
  value: number
}

/** The UTC day an ISO timestamp falls in, or `null` when it is not a timestamp at all. */
function utcDay(iso: string): string | null {
  const milliseconds = Date.parse(iso)
  if (!Number.isFinite(milliseconds)) return null
  return new Date(milliseconds).toISOString().slice(0, 10)
}

/**
 * How many times this feature was served on each of the last `days` days, ending on `asOf`.
 *
 * ⚠️ **Every day in the window is present, including the ones with nothing in them.** That is the
 * whole point of the chart the sprint's own copy states: *"if this drops to zero without anybody
 * turning it off, something upstream stopped asking."* A series that omitted its empty days would
 * draw fourteen bars of roughly equal height over a feature that stopped being served a week ago —
 * the gap is the signal, and dropping it would delete exactly the reading the chart exists for.
 *
 * ⚠️ **Counts EVENTS, not distinct users**, and the label says so ("times served"). Distinct users
 * is the funnel's question and it is answered three inches above this on the same page; two
 * different numbers under two different labels is information, two different numbers under one
 * label is a bug report.
 *
 * A malformed `created_at` is skipped rather than bucketed under an "Invalid Date" key — the same
 * rule `lib/format-utc.ts` states for display, applied to arithmetic.
 */
export function computeServedDaily(events: TarsEvent[], days: number, asOf: Date = new Date()): ServedDay[] {
  const window = Math.max(1, Math.floor(days))
  const end = Date.parse(asOf.toISOString().slice(0, 10))
  const counts = new Map<string, number>()
  for (const event of events) {
    const day = utcDay(event.createdAt)
    if (day === null) continue
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  const series: ServedDay[] = []
  for (let offset = window - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 86_400_000).toISOString().slice(0, 10)
    series.push({ date, value: counts.get(date) ?? 0 })
  }
  return series
}
