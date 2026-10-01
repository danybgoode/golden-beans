---
epic: workspaces
sprint: 2
title: "Every path checks it"
risk: high
phase: Shipped
stories_total: 4
stories:
  - id: S2.1
    title: "One helper reads several projects, and only within a workspace"
    as_a: "a feature that needs several projects at once (the board, the portfolio)"
    i_want: "`getUserWorkspaces(userId)` and `getWorkspaceProjects(userId, workspaceId)` in `lib/workspace.ts`, with the intersect (same workspace ∩ your project memberships) as a pure function"
    so_that: "there is exactly one legal multi-project read on a request path"
    risk: high
    status: done
  - id: S2.2
    title: "Every access path re-checks the workspace"
    as_a: "a tenant"
    i_want: "`getMembership`/`getMembershipByProjectId` to deny when the project's workspace is not one of mine"
    so_that: "a slug from another workspace is a 404 on every path family"
    risk: high
    status: done
  - id: S2.3
    title: "I can see my workspace"
    as_a: "the product owner"
    i_want: "the console switcher to group my projects under their workspace name, and `gf whoami` to print the workspace"
    so_that: "the tenant is visible where I already look"
    risk: low
    status: done
  - id: S2.4
    title: "A guard watches for cross-project reads"
    as_a: "a reviewer"
    i_want: "a semantic-lint rule that selects request-path code reading several projects outside `getWorkspaceProjects()`, running in shadow"
    so_that: "the invariant has a check, not just a sentence"
    risk: low
    status: done
---
# Workspaces become the tenant: one person, many products, one boundary — Sprint 2: Every path checks it

**Status:** ✅ Shipped — #221 (`68b9974`), merged 2026-10-01; migration `20261001110000` applied to production **before** the merge and verified (PR #221 comments). CLI **0.4.0** is built; its npm publish is owed to Daniel (2FA).

## Build contract (locked by the architect before the builder started, 2026-10-01)
Cite the README's **Architecture lock** (D1–D12); don't restate it. This sprint owns:
- **Head commit = the contract step (D4, D11):** migration B `20261001110000_workspaces_not_null.sql` re-runs
  `backfill_project_workspaces()`, raises if any null remains, runs `SET NOT NULL`, and drops the function. Every
  fixture that writes `projects` (39 spec inserts, `supabase/seed.sql`, `scripts/seed-{demo,self}-project.mjs`) gains
  a workspace through `e2e/helpers/spec-workspace.ts` (the seed scripts keep an existing project's workspace and
  create one only for a new project). It's applied to prod before S2 merges.
- **D6:** `getWorkspaceProjects()` is the ONLY multi-project read on a request path. Cite it; don't restate it.
- **D9:** the workspace re-check sits in all three reads of `lib/membership.ts`, through the pure predicate in
  `lib/workspace-access.ts`. `getMembership*` keep their fail-closed contract (null on error); `getUserProjects`
  keeps throwing.
- **D10:** the MCP family's assertion is "write tools absent", not a 404.
- **Teeth:** each cross-workspace spec seeds the state that ONLY the workspace check denies: a `project_members` row
  for a project in a workspace the user doesn't belong to. Deleting the check has to turn those specs red. A spec
  that a plain non-member would also fail proves nothing.
- The switcher state is an approved design: the `surface` blocks in the seed are the contract. Group names are the
  live workspace names (D3: no platform workspace).
- **`gf whoami`:** the route adds `workspaces: [{ name, role }]` and the CLI prints `workspace: <name>`. A CLI
  release (npm publish) is Daniel's 2FA step and is owed by name.

## Stories

### Story 2.1 — One helper reads several projects, and only within a workspace
**As** a feature that needs several projects at once (the board, the portfolio), **I want** `getUserWorkspaces(userId)` and `getWorkspaceProjects(userId, workspaceId)` in `lib/workspace.ts`, with the intersect (same workspace ∩ your project memberships) as a pure function, **so that** there is exactly one legal multi-project read on a request path.
**Acceptance:** Unit spec on the pure intersect. Api spec: a user in workspace A asking for workspace B gets an empty list, never rows. It fails closed (null/empty) on a query error.
**Risk:** high — tenancy

### Story 2.2 — Every access path re-checks the workspace
**As** a tenant, **I want** `getMembership`/`getMembershipByProjectId` to deny when the project's workspace is not one of mine, **so that** a slug from another workspace is a 404 on every path family.
**Acceptance:** Api specs per family: console route (`requireDashboardAccess`), `/api/v1/cli/*` (PAT) each return 404 for a slug in another workspace, and the MCP connector registers no write tools for a PAT whose project sits in another workspace (lock D10); the existing member-vs-non-member specs stay green. A deliberate mutation (removing the workspace check) turns the new specs red.
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
   → Projects are grouped under the workspace name "Daniel's products" (lock D3: no platform workspace exists; demo and self are Daniel's).
2. Run `gf whoami`.
   → A line `workspace: <your workspace name>` appears.
3. While signed in, open https://goldenfrijoles.com/app/funnel/<a-slug-from-another-workspace> (use the test tenant the spec seeds).
   → A 404 page, not a 403 and not their data.
4. Open the PR's checks.
   → The cross-workspace denial specs (console, CLI, MCP) are green; the semantic-lint tenancy rule reports in shadow.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results (2026-10-01, production, `main` @ `68b9974`)
1. ⬜ **Owed to Daniel** (auth path): the switcher at https://goldenfrijoles.com/app shows "Daniel's products" with
   `golden-beans`, `golden-beans-demo` and `miyagisanchez`, each row with its role, plus the boundary note. The same render
   is asserted in CI (`console-shell.authed.spec.ts`, the grouped switcher; observed red with a flat list).
2. ⬜ **Owed to Daniel**: `npm publish` of `@golden-frijoles/cli@0.4.0`, then `npx -y @golden-frijoles/cli@0.4.0 whoami`
   prints `workspace: Daniel's products`. (`gf` is aliased to `git fetch` on Daniel's machine, so call it by its package
   name.) The route already sends `workspaces` in prod. 0.3.0 ignores the field.
3. ➖ **n/a in production, replaced by CI.** There is no seeded test tenant in prod, and probing `miyagi` would only exercise
   the pre-existing non-member 404, not the workspace check. The cross-workspace denial is proven per path family in CI
   instead: console (both guards), CLI and MCP. Each test was observed red with its read's check removed (PR #221).
4. ✅ CI green with the denial specs on the PR head `5f6c4a3` (#221's final run; the squash merge is `68b9974`). The
   tenancy lint reported in shadow from a local `semantic-lint --range origin/main...HEAD` run
   (`lint:tenancy — 1 candidate(s): 1 clear`); no CI workflow runs semantic-lint.

Also verified live: `/app/funnel/golden-beans-demo/setup_guide` and `/hub/golden-beans-demo` still answer 200 anonymously
(rule #2's demo carve-out sits before the re-checked seam). `/app/funnel/miyagisanchez/…` → `/login`. A bad CLI token
→ 401 `unauthorized`. `self-visit` → 200, and the event persisted after NOT NULL.
