// revenue-sync-payload.mjs — pure mapping from Miyagi's `financial_event` ledger rows
// (medusa-bonsai apps/backend/src/modules/profit/models/financial-event.ts) into a
// daily-aggregate payload for POST /v1/inputs/:key/values. Zero imports (Roadmap/
// LEARNINGS.md: keep pure logic import-free of framework/runtime-only modules) — used by
// scripts/sync-revenue-from-miyagi.mjs and unit-tested directly, no network/DB involved.
//
// Aggregates by CALENDAR DAY (UTC) of `capturedAt`, summing `amountCents` and converting
// to dollars (single-currency assumption — `currency_code` isn't reconciled, a known v1
// limitation, same style as Sprint 2's "no pagination" note). The caller is responsible
// for having already filtered rows to `event_type = 'revenue'` — this module has no
// opinion on event_type, it just sums whatever amounts it's given.

/**
 * @param {{ amountCents: number, capturedAt: string }[]} revenueEvents
 * @returns {{ occurredOn: string, value: number }[]} one entry per day with activity, sorted ascending
 */
export function aggregateDailyRevenue(revenueEvents) {
  const totalsByDay = new Map()
  for (const event of revenueEvents) {
    const day = new Date(event.capturedAt).toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
    totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + event.amountCents)
  }
  return [...totalsByDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([occurredOn, cents]) => ({ occurredOn, value: Math.round(cents) / 100 }))
}
