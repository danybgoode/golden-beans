---
epic: workspaces
sprint: 2
title: "Every path checks it"
risk: high
phase: Shaping
stories_total: 4
stories:
  - id: S2.1
    title: "One helper reads several projects, and only within a workspace"
    as_a: "a feature that needs several projects at once (the board, the portfolio)"
    i_want: "`getUserWorkspaces(userId)` and `getWorkspaceProjects(userId, workspaceId)` in `lib/workspace.ts`, with the intersect (same workspace ∩ your project memberships) as a pure function"
    so_that: "there is exactly one legal multi-project read on a request path"
    risk: high
    status: planned
  - id: S2.2
    title: "Every access path re-checks the workspace"
    as_a: "a tenant"
    i_want: "`getMembership`/`getMembershipByProjectId` to deny when the project's workspace is not one of mine"
    so_that: "a slug from another workspace is a 404 on every path family"
    risk: high
    status: planned
  - id: S2.3
    title: "I can see my workspace"
    as_a: "the product owner"
    i_want: "the console switcher to group my projects under their workspace name, and `gf whoami` to print the workspace"
    so_that: "the tenant is visible where I already look"
    risk: low
    status: planned
  - id: S2.4
    title: "A guard watches for cross-project reads"
    as_a: "a reviewer"
    i_want: "a semantic-lint rule that selects request-path code reading several projects outside `getWorkspaceProjects()`, running in shadow"
    so_that: "the invariant has a check, not just a sentence"
    risk: low
    status: planned
---
# Workspaces become the tenant: one person, many products, one boundary — Sprint 2: Every path checks it

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
- D6: `getWorkspaceProjects()` is the ONLY multi-project read on a request path. Cite it; don't restate it.
- `getMembership*` keep their fail-closed contract (null on error).
- The switcher state is an approved design: the `surface` blocks in the seed are the contract.

## Stories

### Story 2.1 — One helper reads several projects, and only within a workspace
**As** a feature that needs several projects at once (the board, the portfolio), **I want** `getUserWorkspaces(userId)` and `getWorkspaceProjects(userId, workspaceId)` in `lib/workspace.ts`, with the intersect (same workspace ∩ your project memberships) as a pure function, **so that** there is exactly one legal multi-project read on a request path.
**Acceptance:** Unit spec on the pure intersect. Api spec: a user in workspace A asking for workspace B gets an empty list, never rows. It fails closed (null/empty) on a query error.
**Risk:** high — tenancy

### Story 2.2 — Every access path re-checks the workspace
**As** a tenant, **I want** `getMembership`/`getMembershipByProjectId` to deny when the project's workspace is not one of mine, **so that** a slug from another workspace is a 404 on every path family.
**Acceptance:** Api specs per family: console route (`requireDashboardAccess`), `/api/v1/cli/*` (PAT) and the MCP connector each return 404 for a slug in another workspace; the existing member-vs-non-member specs stay green. A deliberate mutation (removing the workspace check) turns the new specs red.
**Risk:** high — auth boundary

### Story 2.3 — I can see my workspace
**As** the product owner, **I want** the console switcher to group my projects under their workspace name, and `gf whoami` to print the workspace, **so that** the tenant is visible where I already look.
**Acceptance:** `/app` shows the `switcher-grouped` state from the seed (approved surface); the empty state shows "Your workspace has no projects yet."; `gf whoami` prints `workspace: <name>`; no extra click to switch project.
**Risk:** low

### Story 2.4 — A guard watches for cross-project reads
**As** a reviewer, **I want** a semantic-lint rule that selects request-path code reading several projects outside `getWorkspaceProjects()`, running in shadow, **so that** the invariant has a check, not just a sentence.
**Acceptance:** Rule added to `golden-frijoles.config.json → lint.rules` with its own measured question (`jev-eval --rail lint`); shadow mode; fixtures include one violation and one clean `getWorkspaceProjects` call.
**Risk:** low

## Sprint QA
- **api spec(s):** S2.1 intersect unit spec + api spec; S2.2 one cross-workspace 404 spec per path family (console, CLI, MCP); S2.3 `console-shell.authed.spec.ts` extended for grouping; S2.4 lint fixtures.
- **browser smoke owed:** yes, to Daniel: the grouped switcher (approved design) and `gf whoami`.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. Go to https://goldenfrijoles.com/app and open the project switcher. **(auth path — owed to Daniel by name)**
   → Projects are grouped under workspace names ("Daniel's products", "Golden Frijoles (platform)").
2. Run `gf whoami`.
   → A line `workspace: <your workspace name>` appears.
3. While signed in, open https://goldenfrijoles.com/app/funnel/<a-slug-from-another-workspace> (use the test tenant the spec seeds).
   → A 404 page, not a 403 and not their data.
4. Open the PR's checks.
   → The cross-workspace denial specs (console, CLI, MCP) are green; the semantic-lint tenancy rule reports in shadow.

If any step fails, note the step number + what you saw — that's the bug report.
