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
