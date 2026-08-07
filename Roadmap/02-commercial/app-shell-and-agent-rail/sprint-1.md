# App shell and agent rail — Sprint 1: The read seam and the shell

**Status:** 🟨 in progress

> **Build contract (locked by the architect before the builder started).** Cite the epic README's
> decisions; do not re-derive them. Binding here: **D1** (render `PROJECT_ROUTE_INVENTORY`, never a
> second list), **D2** (allow-listed actions, never `select *`), **D3** (`metadata.via` for
> attribution, never an actor string), **D7** (use `Icon`; do not weaken the drift guard),
> **D10** (order by `created_at`, never `id`).
>
> **This is the shared-surface sprint — architect, first, not delegated.** Two new `lib/` seams and
> a guard change; every later branch inherits them (LEARNINGS: do the shared-surface work yourself
> and first).
>
> **Tenancy is the risk in this sprint, not the UI.** Both new reads take a **required** `projectId`
> resolved server-side via `lib/membership.ts` / `lib/dashboard-auth.ts`. There is no cross-project
> variant of either function, and none may be added. AGENTS: no request-derived read path may cross
> projects. **No migration** — both tables already exist.

## Stories

### Story 1.1 — `lib/agent-activity.ts`, the project-scoped activity read
**As a** PM, **I want** the engine to be able to tell me what happened on my project recently,
**so that** the rail in Sprint 2 has something true to show.
**Acceptance:** given two projects with audit rows, a read for project A returns only A's rows,
newest first; each row carries an actor (agent or human) derived from `metadata.via`; an action
outside the allow-list is not returned even though it exists in the table.
**Risk:** high
**Notes:** model on `lib/task-lifecycle-facts.ts` — same shape, same tenancy discipline. Return
`null`, not `[]`, when the read fails, so "we couldn't look" stays distinguishable from "nothing
happened" (the `not_instrumented` vs `not_met` distinction this repo already draws). The index
`audit_log_project_created_idx (project_id, created_at DESC)` already backs the query.

### Story 1.2 — `lib/pending-confirmations.ts`, the staged-proposal read
**As a** PM, **I want** the engine to know which agent proposals are waiting on me, **so that** the
rail can surface them instead of leaving them invisible until someone reads the database.
**Acceptance:** returns only unspent, unexpired confirmations for the given project; a confirmation
minted under project A is absent from project B's read; each row carries the task, the action
(`claim`/`resolve`/`dismiss`) and the frozen parameters, not a re-derived preview.
**Risk:** high
**Notes:** read-only. **This story must not call `consume_write_confirmation`** — spending is the
agent's path, not the dashboard's. Per D8 the result is task-scoped; that is what the table models.

### Story 1.3 — the section nav
**As a** PM, **I want** to reach and relate every feature area from the shell, **so that** I stop
needing to know URLs.
**Acceptance:** every surface in `PROJECT_ROUTE_INVENTORY` the signed-in user is entitled to is
reachable from the header on desktop and from the existing narrow-width pattern on mobile; a gated
surface is presented per its `status` rather than 404ing; no route list is hardcoded in the shell.
**Risk:** low
**Notes:** `ProductShell.tsx` currently ships three links plus a static "Engine ready" pill. Keep the
mobile bottom-tab instinct and extend it with an overflow. `AGENT_RAIL_ENABLED` does **not** gate
this (D6).

### Story 1.4 — extend the drift guard to the component directories
**As a** builder, **I want** the design-drift guard to cover the directories the new primitives land
in, **so that** Sprint 2 can't introduce raw hex or pictographs where nothing is watching.
**Acceptance:** `npm run check:design-drift` walks `apps/web/components/ui` and
`apps/web/components/product` in addition to today's roots; the existing suite still passes; a
deliberately-introduced `#ff0000` in a `components/ui` file fails the guard.
**Risk:** low
**Notes:** keep the inline-style rule landing-only — `/app` needs dynamic bar widths in S3.

## Sprint QA
- **api spec(s):** 1.1 + 1.2 → one new `e2e/agent-activity.spec.ts` asserting the cross-project
  isolation directly (two projects, one read, assert the other's rows are absent). 1.4 → covered by
  `scripts/check-design-drift.test.mjs`.
- **browser smoke owed:** no — 1.3 is anonymous-testable via the existing
  `project-navigation.authed.spec.ts` pattern; no money or auth step in this sprint.
- **deterministic gate:** `npm run typecheck` + `npm run lint` + `npm run test:unit` +
  `npm run build` + `npm run test:e2e` + `npm run check:design-drift`, green before merge. Invoke
  CI's own npm scripts, never a hand-written subset (LEARNINGS: a local gate that is a subset of
  CI's produces a green that doesn't mean what CI means).
- **mutation check:** the isolation spec must be observed failing — drop the `project_id` filter,
  confirm red, revert, re-verify clean. A spec that can't fail is worse than no spec.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: the branch preview (pre-merge) · production `https://golden-beans-gamma.vercel.app` once merged

1. Sign in and go to `/app`.
   → The header shows the full section nav, not just *Projects · Connect · Agent notes*.
2. From the header, open each feature area for a project you belong to.
   → Every one resolves; none 404s; a flag-gated surface reads as gated rather than broken.
3. Narrow the window to a phone width (or open on a phone).
   → Navigation is still usable — the bottom-tab pattern with an overflow, no horizontal scroll.
4. Sign in as a user who belongs to a different project and open `/app`.
   → You see only your own projects, and nothing referencing the other tenant.

If any step fails, note the step number + what you saw — that's the bug report.
