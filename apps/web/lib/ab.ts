// Growth Engine v1 · Sprint 4, Story 4.3 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md) —
// pure basic-lift comparison. Zero DB/network import (Roadmap/LEARNINGS.md: keep pure logic
// import-free of framework/runtime-only modules), so it's unit-testable directly against a
// synthetic event sequence — no Supabase, no fixtures.
//
// No separate experiments registry — a variant only exists in the output if it has at least one
// `experiment_exposed` event (Story 4.2 is explicitly the denominator). "Basic lift, no
// statistical-significance engine" (the sprint doc's acceptance line) means: lift is a plain %
// difference in conversion rate against a baseline variant — the alphabetically-first exposed
// variant key, chosen for determinism, not because it's meaningfully "control." A baseline
// conversion rate of 0 makes a % difference undefined, so lift is `null` in that case (and for the
// baseline row itself).

export interface AbEvent {
  userId: string
  event: string
  /** tags.variant, only meaningful on 'experiment_exposed' rows — null otherwise. */
  variant: string | null
}

export interface VariantComparisonRow {
  key: string
  exposures: number
  conversions: number
  conversionRate: number
  lift: number | null
}

export interface VariantComparisonResult {
  variants: VariantComparisonRow[]
  baseline: string | null
}

export function computeVariantComparison(events: AbEvent[], metricEvent: string): VariantComparisonResult {
  const exposedByVariant = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.event !== 'experiment_exposed' || e.variant === null) continue
    if (!exposedByVariant.has(e.variant)) exposedByVariant.set(e.variant, new Set())
    exposedByVariant.get(e.variant)!.add(e.userId)
  }
  if (exposedByVariant.size === 0) return { variants: [], baseline: null }

  const convertedUsers = new Set(events.filter((e) => e.event === metricEvent).map((e) => e.userId))

  const sortedKeys = [...exposedByVariant.keys()].sort()
  const baseline = sortedKeys[0]

  const rows = sortedKeys.map((key) => {
    const exposed = exposedByVariant.get(key)!
    const conversions = [...exposed].filter((userId) => convertedUsers.has(userId)).length
    return { key, exposures: exposed.size, conversions, conversionRate: conversions / exposed.size }
  })

  const baselineRate = rows.find((r) => r.key === baseline)!.conversionRate

  const variants: VariantComparisonRow[] = rows.map((row) => ({
    ...row,
    lift: row.key === baseline ? null : baselineRate > 0 ? (row.conversionRate - baselineRate) / baselineRate : null,
  }))

  return { variants, baseline }
}
