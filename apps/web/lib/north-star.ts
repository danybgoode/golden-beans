// Growth Engine v1 · Sprint 3, Story 3.4 (Roadmap/01-growth-engine/growth-engine-v1) —
// pure daily-series aggregation for a 'telemetry_event'-sourced leading input. Zero
// DB/network import (Roadmap/LEARNINGS.md: keep pure logic import-free of framework/
// runtime-only modules), mirroring lib/tars.ts's pure/impure split — unit-testable
// directly against a synthetic event sequence.

export interface DailySeriesEvent {
  event: string
  createdAt: string
}

export interface DailySeriesPoint {
  date: string // YYYY-MM-DD, UTC
  value: number
}

// Counts occurrences of `sourceEvent` per UTC calendar day. Only days with at least one
// matching event are returned (sorted ascending) — a day with zero events isn't a
// meaningful "0" data point to plot differently from "no data yet".
export function computeDailySeries(events: DailySeriesEvent[], sourceEvent: string): DailySeriesPoint[] {
  const countsByDay = new Map<string, number>()
  for (const e of events) {
    if (e.event !== sourceEvent) continue
    const day = new Date(e.createdAt).toISOString().slice(0, 10)
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1)
  }
  return [...countsByDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }))
}
