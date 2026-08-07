// app-shell-and-agent-rail · Sprint 2, Story 2.2 — whether the rail exists on this render.
//
// ── Why a one-line predicate gets its own zero-import module ───────────────────────────────────
// The OFF path is the thing this epic's kill-switch promises, and it is NOT reachable from the
// always-on api gate: every /app route the rail appears on requires a session, and the two surfaces
// an anonymous request CAN reach (the demo project's dashboards) render no rail in either flag
// state, because there is no member to render one for. A dark spec pointed at those would pass for
// the wrong reason — the exact false green this repo has been burned by.
//
// CODE-QUALITY rule 5 names the remedy: when a guard sits behind state the harness cannot reach,
// extract it into a pure module and assert it directly. So the decision lives here, the component
// only renders it, and apps/web/lib/agent-rail-visibility.test.ts can mutation-check the polarity.

export type AgentRailVisibility = {
  enabled: boolean
  projectId: string | null
}

/**
 * Should the agent rail render at all?
 *
 * Both conditions, spelled out rather than inherited from a helper, so a reader asking "can this
 * surface show me a tenant's activity?" sees every condition in one expression:
 *
 *   • the enablement gate is explicitly ON (`AGENT_RAIL_ENABLED === 'true'`, D6), and
 *   • a project was resolved server-side from the session user's memberships.
 *
 * The second condition is not decoration. It is what makes the flag safe to flip: the rail cannot
 * be shown to a viewer for whom no membership was resolved, so turning the switch on grants nobody
 * access to anything they could not already see on the surface the data came from.
 */
export function shouldRenderAgentRail({ enabled, projectId }: AgentRailVisibility): boolean {
  return enabled && Boolean(projectId)
}

/**
 * What the rail's summary chip must say about staged proposals.
 *
 * Three states, because two of them look identical if you let them (fresh-reviewer finding). The
 * first version of this was `pending?.length ?? 0` with a chip rendered only when `> 0`, so an
 * UNREADABLE proposals table and an empty one produced the same silent summary.
 *
 * That matters more here than anywhere else in the epic: `RailDisclosure` server-renders the panel
 * CLOSED, and only opens it via JS at >=1100px. On a phone, and everywhere before hydration, the
 * summary chip is the ONLY thing the reader sees — the honest "couldn't read staged proposals"
 * sentence is behind a disclosure they have no reason to open. A count that quietly reads as zero
 * is therefore a claim that nothing is waiting, made on the strength of a query that never answered.
 *
 * Pure and here rather than in the component so all three states are assertable directly; a failing
 * Supabase read is not something the browser harness can produce.
 */
export type PendingChip = { kind: 'unreadable' } | { kind: 'empty' } | { kind: 'count'; value: number }

export function pendingChipState(pending: readonly unknown[] | null): PendingChip {
  if (pending === null) return { kind: 'unreadable' }
  if (pending.length === 0) return { kind: 'empty' }
  return { kind: 'count', value: pending.length }
}
