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

/**
 * Await a rail read, collapsing ANY failure to `null`.
 *
 * The rail's two reads already return `null` for a Postgrest error, which the copy handles. They can
 * still THROW: `getSupabaseServiceClient()` throws when `SUPABASE_URL` or the service-role key is
 * missing, and supabase-js can reject on a transport failure. An uncaught throw in a server
 * component fails the whole render — and `AgentRail` sits inside `ProductShell`, so **one missing
 * env var would take down every signed-in route rather than one sidebar**.
 *
 * `null` is not a swallowed error: it is the input the "we couldn't read this" copy is already
 * written for, so a thrown read and a failed query reach the reader as the same honest sentence.
 * The throw is still logged.
 *
 * Here rather than inline in the component because the epic shipped this guarantee STATED and
 * untested — the failure needs a broken service-role client, which the browser harness cannot
 * produce without breaking every other spec in the run. A pure wrapper can be handed a rejecting
 * read directly (CODE-QUALITY rule 5: when a guard sits behind state the harness cannot reach,
 * extract it and assert it).
 *
 * ── Why it takes a THUNK and not a promise (cross-review, Agy on PR #78) ──────────────────────
 * The first version took `Promise<T | null>`, which meant the call was evaluated by the CALLER
 * before this function was entered — so a SYNCHRONOUS throw would sail straight past the try/catch
 * and crash the render this exists to protect.
 *
 * Not reachable today: both reads are `async function`s, and an async function returns a rejected
 * promise rather than throwing. But that makes the guarantee depend on those two keeping the
 * `async` keyword, which nothing enforces — turn either into a plain function returning a promise
 * and the protection silently disappears. "Not currently reachable" is not the property to rest a
 * guarantee on; the thunk makes it independent of the callee's shape.
 */
export async function settleRailRead<T>(
  read: () => Promise<T | null>,
  label: string,
  onError: (message: string, error: unknown) => void = console.error
): Promise<T | null> {
  try {
    // Invoked INSIDE the try, which is the whole point — see the thunk note above.
    return await read()
  } catch (error) {
    onError(`[agent-rail] ${label} read threw:`, error)
    return null
  }
}
