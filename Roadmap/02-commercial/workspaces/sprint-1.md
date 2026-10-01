---
epic: workspaces
sprint: 1
title: "The tenant exists"
risk: high
phase: Shaping
stories_total: 4
stories:
  - id: S1.1
    title: "The workspace tables exist (expand)"
    as_a: "the platform"
    i_want: "`workspaces` and `workspace_members` tables and a nullable `projects.workspace_id`, RLS on with no policies, service-role only"
    so_that: "a tenant row exists above projects without changing any read path yet"
    risk: high
    status: planned
  - id: S1.2
    title: "Every project is backfilled into exactly one workspace (contract)"
    as_a: "an existing project owner"
    i_want: "my projects backfilled into my workspace by a deterministic rule (created_by → earliest owner → the platform workspace), then `workspace_id` made NOT NULL"
    so_that: "nobody loses or gains access and no project is orphaned"
    risk: high
    status: planned
  - id: S1.3
    title: "A new signup is born with a workspace"
    as_a: "a new self-serve user"
    i_want: "my first project to be created inside a new workspace that I own"
    so_that: "every tenant has the boundary from row one"
    risk: high
    status: planned
  - id: S1.4
    title: "AGENTS.md states the invariant at workspace level"
    as_a: "any agent working in this repo"
    i_want: "the tenancy rule to read \"no tenant (workspace) observes another's data; projects within a workspace may be read together by its members, only through `getWorkspaceProjects()`\""
    so_that: "D5 is enacted in the same change that introduces the table"
    risk: high
    status: planned
---
# Workspaces become the tenant: one person, many products, one boundary — Sprint 1: The tenant exists

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
- D1–D5 from the README, verified against live code and **live row counts** (projects by created_by / owner-only / neither).
- Migration order: S1.1 (expand) applied → S1.2 backfill applied and verified → NOT NULL migration → only then any code that reads `workspace_id` (S2). Never the reverse (LEARNINGS: env → migration → merge).
- Every function created or re-created re-REVOKEs from `PUBLIC, anon, authenticated` and re-GRANTs `service_role`.

## Stories

### Story 1.1 — The workspace tables exist (expand)
**As** the platform, **I want** `workspaces` and `workspace_members` tables and a nullable `projects.workspace_id`, RLS on with no policies, service-role only, **so that** a tenant row exists above projects without changing any read path yet.
**Acceptance:** Migration applies cleanly on a fresh local Supabase and on production; `workspace_members.role` is `owner|member` with a CHECK; anon and authenticated get no access (api spec asserts a denial); existing `*.authed.spec.ts` suite stays green.
**Risk:** high — DB migration + tenancy

### Story 1.2 — Every project is backfilled into exactly one workspace (contract)
**As** an existing project owner, **I want** my projects backfilled into my workspace by a deterministic rule (created_by → earliest owner → the platform workspace), then `workspace_id` made NOT NULL, **so that** nobody loses or gains access and no project is orphaned.
**Acceptance:** Before NOT NULL: `select count(*) from projects where workspace_id is null` = 0 in production (recorded in the PR). The rule is a pure function with a unit spec covering all three branches and a two-owner project. A pre-existing API key and a pre-existing connector token still authenticate (api spec).
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
