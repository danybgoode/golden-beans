// signals-loop · Sprint 2, Story 2.1 — the task lifecycle's event vocabulary. ZERO imports.
//
// Same reasoning as lib/signal-events.ts: these constants are imported by specs and by
// framework-touching modules alike, so they live in a file that imports nothing. A module that
// pulls in `server-only` cannot be loaded by the test runner at all (Roadmap/LEARNINGS.md), and the
// error it produces names the missing framework module rather than the real cause.

/**
 * Task lifecycle events — emitted through the EXISTING event pipeline (Amendment 4.1).
 *
 * ── Why these are ordinary events and not a bespoke webhook ──────────────────────────────────
 * The engine already has a transactional outbox, tenant-managed signed destinations, bounded
 * retries, dead-lettering and operator replay — the whole event-destination-router epic. Emitting
 * task transitions as events means a tenant routes their task queue into Linear, Slack, or anything
 * else **through their own destination**, and we build zero integrations. Adding a second delivery
 * path for tasks would duplicate all of that machinery, and the duplicate is the one that gets
 * forgotten when a delivery starts failing at 2am.
 *
 * They are NOT `$`-prefixed. The `$` namespace marks events the engine INGESTS as reserved input
 * (`$error`, `$friction`); these are events the engine EMITS as output, and a tenant is meant to
 * filter and route them exactly like their own `checkout_completed`.
 */
export const TASK_OPENED_EVENT = 'task_opened'
export const TASK_CLAIMED_EVENT = 'task_claimed'
export const TASK_RESOLVED_EVENT = 'task_resolved'
export const TASK_DISMISSED_EVENT = 'task_dismissed'

/** The subject type every task lifecycle event carries, so a consumer can join on it. */
export const TASK_SUBJECT_TYPE = 'task'

export type TaskStatus = 'open' | 'claimed' | 'resolved' | 'dismissed'

/**
 * The event a given status transition emits.
 *
 * A total function over the status vocabulary rather than a lookup that can return undefined: the
 * caller emits on every transition, and a silent `undefined` would mean a lifecycle change nobody
 * downstream ever hears about — the class of bug where the queue looks healthy and a tenant's
 * automation simply stops firing.
 */
export function taskEventForStatus(status: TaskStatus): string {
  switch (status) {
    case 'open':
      return TASK_OPENED_EVENT
    case 'claimed':
      return TASK_CLAIMED_EVENT
    case 'resolved':
      return TASK_RESOLVED_EVENT
    case 'dismissed':
      return TASK_DISMISSED_EVENT
  }
}

/** Every lifecycle event name, for a filter UI or a spec that asserts the set is complete. */
export const TASK_LIFECYCLE_EVENTS = [
  TASK_OPENED_EVENT,
  TASK_CLAIMED_EVENT,
  TASK_RESOLVED_EVENT,
  TASK_DISMISSED_EVENT,
] as const
