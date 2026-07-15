# Signals loop — Sprint 2: Tasks out (structuring + the read surface)

**Status:** ⬜ not started

## Stories

### Story 2.1 — Signal→task promotion with the evidence bundle
**As a** PM, **I want** signals promoted to structured `tasks` — promotion thresholds as data;
dedupe (an open task absorbs new matching signals) — each carrying the **evidence bundle**:
feature, flag state, funnel position, experiment variant, scrubbed sample events, **so that** what
reaches an agent is actionable, not raw. Additive `tasks` migration; lifecycle
open → claimed → resolved/dismissed.
**Acceptance:** a signal crossing threshold → exactly one task; every evidence field traces to an
engine query; below threshold → no task.
**Risk:** LOW

### Story 2.2 — Dashboard task views (humans see what agents see)
**As a** team member, **I want** dashboard task views — list ranked by impact, detail with the
full evidence bundle, lifecycle actions — in the design language (`references/design-direction.md`,
frontend-design heuristics rail), **so that** the task queue is inspectable without an agent.
**Acceptance:** statuses transition; a real foreign projectSlug → 403/404 (S4 realistic-input
lesson); heuristics checklist run and noted in the PR.
**Risk:** LOW

### Story 2.3 — Connector read tools: `list_tasks` / `get_task`
**As a** PM's agent, **I want** connector read tools — `list_tasks` (ranked) and `get_task` (full
evidence) — additive siblings of E1's funnel/north-star/experiments tools, same tokens, **so that**
my agent pulls work items, not raw logs. Plain tools, not the MCP tasks extension (re-verify its
status at build; groom decision stands).
**Acceptance:** a fresh Claude session reads the demo project's tasks via the connector; a token
sees only its own project's tasks (spec uses a real foreign token).
**Risk:** LOW

## Sprint QA
- **api spec(s):** 2.1 → promotion threshold + dedupe + evidence traceability · 2.2 →
  foreign-tenant 403 · 2.3 → tool round-trip with a disposable token + cross-tenant scope
  assertion (real foreign token)
- **browser smoke owed:** yes — S2 agent-read smoke in a fresh Claude session (connector →
  `list_tasks` → evidence sanity), owed to Daniel by name
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs, one action + one
expected result per step)._
