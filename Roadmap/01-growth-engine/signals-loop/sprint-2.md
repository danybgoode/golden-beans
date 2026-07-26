# Signals loop — Sprint 2: Tasks out (structuring + the read surface)

**Status:** ⬜ not started

> Amended 2026-07-26 (see the epic README). Story 2.1 absorbs two approved additions: task lifecycle
> events ride the existing destination router, and the first task a project ever creates fires one
> Telegram line.

## Stories

### Story 2.1 — Signal→task promotion, the evidence bundle, and the fan-out
**As a** PM, **I want** signals promoted to structured `tasks` — promotion thresholds as data;
dedupe (an open task absorbs new matching signals) — each carrying the **evidence bundle**:
feature, flag state, funnel position, experiment variant, scrubbed sample events, **so that** what
reaches an agent is actionable, not raw. Lifecycle: open → claimed → resolved/dismissed.
**Addition (Amendment 4.1):** every lifecycle transition emits a subject-bearing event
(`task_opened` / `task_claimed` / `task_resolved`) through the **existing** event-destination-router,
with the task id as `context.subject`. A tenant routes their queue into Linear/Slack/anything via
their own signed destination; we build zero integrations.
**Addition (Amendment 4.4):** the first task a project ever creates fires one `lib/telegram.ts` line.
**Acceptance:** a signal crossing threshold → exactly one task; every evidence field traces to an
engine query; below threshold → no task; a second signal matching an open task absorbs into it
rather than creating a second; a lifecycle transition produces exactly one outbox row whether or
not delivery is enabled (the outbox contract — turning delivery off must lose no events, only stop
them moving).
**Risk:** MEDIUM — architect-owned (promotion is a write path with a dedupe race).

### Story 2.2 — Dashboard task views (humans see what agents see)
**As a** team member, **I want** dashboard task views — list ranked by impact, detail with the
full evidence bundle, lifecycle actions — in the design language
(`references/design-direction.md`), **so that** the task queue is inspectable without an agent.
**Acceptance:** statuses transition; a real foreign `projectSlug` → 404 with no existence oracle
(the house pattern — slug-guessing must not distinguish "not yours" from "not there"); the page
404s entirely while `SIGNALS_ENABLED` is OFF; heuristics checklist run and noted in the PR.
**Risk:** LOW — delegable (bounded, clear acceptance).

### Story 2.3 — Connector read tools: `list_tasks` / `get_task`
**As a** PM's agent, **I want** connector read tools — `list_tasks` (ranked) and `get_task` (full
evidence) — additive siblings of the existing funnel/north-star/experiment/journey tools, same
tokens, **so that** my agent pulls work items, not raw logs. Plain tools, **not** the MCP tasks
extension (Amendment 1: it is SEP-2663, out of core; revisit on promotion into core, not on a
version bump).
**Registration requires BOTH gates** — `isConnectorEnabled() && isSignalsEnabled()` — following the
`isJourneyMcpToolEnabled()` precedent already in `lib/flags.ts`. Neither tool accepts a project
parameter; scope comes from the resolved token and has nowhere else to come from.
**`list_tasks` is the lazy friction trigger** (Amendment 3): it evaluates the resolved project's
detectors before ranking, throttled and locked. **This story owes the FIRST production caller of
`evaluateFrictionForProject()`** — Sprint 1 shipped the function with no read surface to call it
from, recorded as a known gap in `sprint-1.md`. Acceptance is not met until a `list_tasks` call
materialises a `$friction` signal that did not exist before it.
**Acceptance:** a fresh Claude session reads the demo project's tasks via the connector; a token
sees only its own project's tasks (spec uses a **real** foreign token, not a fabricated one); with
`SIGNALS_ENABLED` OFF the tools are absent from `tools/list` entirely, not merely erroring.
**Carried over from Sprint 1 (cross-review, Codex 2026-07-26):** the S1 cross-tenant spec could only
assert isolation from the *data* side, because Sprint 1 ships no HTTP read surface for signals — an
end-to-end authenticated cross-tenant read was unreachable by construction there. **This story owes
that spec**: tenant A's connector token issuing `list_tasks`/`get_task` must never return tenant B's
rows, asserted through the real authenticated path with a real foreign token.
**Risk:** LOW — delegable.

## Sprint QA
- **api spec(s):** 2.1 → promotion threshold + dedupe race + evidence traceability + outbox row on
  each transition · 2.2 → foreign-tenant 404 + dark-flag 404 · 2.3 → tool round-trip with a
  disposable token + cross-tenant scope assertion (real foreign token) + tools-absent-while-dark
- **browser smoke owed:** yes — S2 agent-read smoke in a fresh Claude session (connector →
  `list_tasks` → evidence sanity), **owed to Daniel by name**
- **deterministic gate:** `npm run typecheck` + `lint` + `build` + `test:unit` + Playwright `api`
- **mutation check:** the cross-tenant and dark-flag specs, broken once each and observed red — a
  spec that cannot fail is worse than an absent one because the next reader stops there

## Sprint 2 — Smoke walkthrough (do these in order)
_Written at sprint close (real URLs, one action + one expected result per step)._
