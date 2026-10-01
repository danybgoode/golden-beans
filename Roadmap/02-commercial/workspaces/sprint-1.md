---
epic: workspaces
sprint: 1
title: "The tenant exists"
risk: high
phase: Shipped
stories_total: 4
stories:
  - id: S1.1
    title: "The workspace tables exist (expand)"
    as_a: "the platform"
    i_want: "`workspaces` and `workspace_members` tables and a nullable `projects.workspace_id`, RLS on with no policies, service-role only"
    so_that: "a tenant row exists above projects without changing any read path yet"
    risk: high
    status: done
  - id: S1.2
    title: "Every project is backfilled into exactly one workspace (contract)"
    as_a: "an existing project owner"
    i_want: "my projects backfilled into my workspace by a deterministic rule (created_by → earliest owner → abort, lock D3), with `workspace_id` made NOT NULL at the head of Sprint 2 (lock D4)"
    so_that: "nobody loses or gains access and no project is orphaned"
    risk: high
    status: done
  - id: S1.3
    title: "A new signup is born with a workspace"
    as_a: "a new self-serve user"
    i_want: "my first project to be created inside a new workspace that I own"
    so_that: "every tenant has the boundary from row one"
    risk: high
    status: done
  - id: S1.4
    title: "AGENTS.md states the invariant at workspace level"
    as_a: "any agent working in this repo"
    i_want: "the tenancy rule to read \"no tenant (workspace) observes another's data; projects within a workspace may be read together by its members, only through `getWorkspaceProjects()`\""
    so_that: "D5 is enacted in the same change that introduces the table"
    risk: high
    status: done
---
# Workspaces become the tenant: one person, many products, one boundary — Sprint 1: The tenant exists

**Status:** ✅ Shipped — #220 (`4ee9bb1`), merged 2026-10-01; migration `20261001100000` applied to production **before** the merge and verified row by row (PR #220 comments)

## Build contract (locked by the architect before the builder started, 2026-10-01)
Cite the README's **Architecture lock** (D1–D12); don't restate it. This sprint owns:
- **Migration A** `20261001100000_workspaces.sql` (expand): the tables (D2), the nullable `projects.workspace_id`,
  and `backfill_project_workspaces()` (D3: creator → earliest owner → abort; every project member becomes a
  workspace member). The migration calls it once. The function is `REVOKE ALL … FROM PUBLIC, anon, authenticated` +
  `GRANT EXECUTE … TO service_role`. No request path calls it (it's not a scheduler exemption: it writes and
  returns `void`), and migration B drops it.
- **Applied to prod before S1 merges**, then verified row by row: `miyagisanchez`, `golden-beans-demo` and
  `golden-beans` → "Daniel's products"; `miyagi` → "miyagi's products"; `0` nulls; one owner membership each.
- **S1.2's acceptance, as locked:** the rule lives in ONE place, the SQL function, so there's no TS copy that could
  drift. Its spec (`e2e/workspaces.spec.ts`) inserts projects with a null workspace for each branch (creator,
  owner-only, two owners, a non-owner member, neither), calls the function, and asserts the outcome. That's
  possible only while the column is nullable, so the backfill tests are deleted with the function in S2. NOT NULL
  moves to S2 (D4).
- **S1.3:** `lib/workspace-tenancy.ts` (no `server-only`; it takes the client as a parameter) holds `claimWorkspace` (reuse
  by `created_by` or insert; recover from a race on the unique index; ensure the owner membership) and
  `releaseWorkspace` (deletes only a workspace this call created; RESTRICT protects one that holds projects).
  `provisionTenantForUser` claims before the project insert, writes `workspace_id`, and releases on every
  `ok: false` path. The adopt-the-winner path never releases. The api spec drives both helpers against the real
  local DB, including the failure path.
- **The auth teardown** deletes the disposable tenant's workspace too.
- Every function created or re-created re-REVOKEs from `PUBLIC, anon, authenticated` and re-GRANTs `service_role`.

## Stories

### Story 1.1 — The workspace tables exist (expand)
**As** the platform, **I want** `workspaces` and `workspace_members` tables and a nullable `projects.workspace_id`, RLS on with no policies, service-role only, **so that** a tenant row exists above projects without changing any read path yet.
**Acceptance:** Migration applies cleanly on a fresh local Supabase and on production; `workspace_members.role` is `owner|member` with a CHECK; anon and authenticated get no access (api spec asserts a denial); existing `*.authed.spec.ts` suite stays green.
**Risk:** high — DB migration + tenancy

### Story 1.2 — Every project is backfilled into exactly one workspace (contract)
**As** an existing project owner, **I want** my projects backfilled into my workspace by a deterministic rule (created_by → earliest owner → abort, lock D3), with `workspace_id` made NOT NULL at the head of Sprint 2 (lock D4), **so that** nobody loses or gains access and no project is orphaned.
**Acceptance:** Before NOT NULL: `select count(*) from projects where workspace_id is null` = 0 in production (recorded in the PR). The rule is ONE SQL function with a spec covering all three branches, a two-owner project and a non-owner member (lock D3; NOT NULL itself lands at the head of S2, lock D4). A pre-existing API key and a pre-existing connector token still authenticate (api spec).
**Risk:** high — migration on live tenant data

### Story 1.3 — A new signup is born with a workspace
**As** a new self-serve user, **I want** my first project to be created inside a new workspace that I own, **so that** every tenant has the boundary from row one.
**Acceptance:** `provisionTenantForUser()` inserts the workspace, the owner membership and the project, and cleans all three up on failure (spec on the failure path). A second signup by the same user reuses their workspace.
**Risk:** high — auth/provisioning

### Story 1.4 — AGENTS.md states the invariant at workspace level
**As** any agent working in this repo, **I want** the tenancy rule to read "no tenant (workspace) observes another's data; projects within a workspace may be read together by its members, only through `getWorkspaceProjects()`", **so that** D5 is enacted in the same change that introduces the table.
**Acceptance:** Lands in the same PR as S1.1. The scheduler exemption keeps its six conditions and its registry, with "tenant" now defined as the workspace. Rule #2 (public routes are demo-only) is unchanged and says so.
**Risk:** high — architecture rule

## Sprint QA
- **api spec(s):** S1.1 `e2e/workspaces.spec.ts` (denial to anon/authenticated); S1.2 pure backfill-rule unit spec + pre-existing-credential api spec; S1.3 provisioning spec incl. failure cleanup.
- **browser smoke owed:** yes, to Daniel: sign in and confirm every project still opens (auth path).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge. Migrations are applied through the Supabase MCP **before** merge, verified live, then merged.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. Go to https://goldenfrijoles.com/app and sign in. **(auth path — owed to Daniel by name)**
   → Today loads your default project, as before.
2. Use the project switcher to open each of your projects in turn.
   → Every project you could open yesterday still opens; none is missing.
3. In a terminal, run `gf projects`.
   → The same list of projects as before.
4. In the Supabase dashboard SQL editor, run `select count(*) from projects where workspace_id is null;`
   → `0`.
5. Sign up with a fresh test email at https://goldenfrijoles.com/signup (only while `SIGNUP_ENABLED` is on in that env).
   → The new account lands on Today with one project; the SQL `select name from workspaces order by created_at desc limit 1;` shows its new workspace.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results (2026-10-01, production, `main` @ `4ee9bb1`)
1. ⬜ **Owed to Daniel** (auth path): sign in at https://goldenfrijoles.com/app and confirm Today loads your default project.
2. ⬜ **Owed to Daniel**: open each project from the switcher. Expected: unchanged. The data says so: 0 prod project
   members sit outside their project's workspace (measured before S2's migration).
3. ⬜ **Owed to Daniel**: `npx -y @golden-frijoles/cli@0.3.0 projects` (not `gf`, which is aliased to `git fetch` on
   this machine) lists your same 3 projects: `golden-beans`, `golden-beans-demo` and `miyagisanchez`.
4. ✅ `select count(*) from projects where workspace_id is null` → **0** (run through `supabase db query --linked`).
   `miyagisanchez`, `golden-beans-demo` and `golden-beans` → "Daniel's products"; `miyagi` → "miyagi's products".
5. ⬜ **Owed to Daniel** (signup mints a real tenant, and I don't create prod accounts unasked): sign up a fresh test email.
   The provisioning path itself is proven in CI. The authed fixture signs up through the real `/app/provision`, and
   `auth.setup.ts` asserts the new project sits in its creator's own workspace (observed red with `workspace_id: null`).

Also verified live: `/app` → `/login` (307) unauthed; `POST /api/v1/track` with no key → 401, not 500; `self-visit`, which
ingests with the pre-existing production self key server-side, → 200, and the event persisted.
