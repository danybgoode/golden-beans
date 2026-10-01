---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: workspaces
title: "Workspaces become the tenant: one person, many products, one boundary"
area: 02-commercial
risk: high
type: feature
sprints_total: 2
stories_total: 8   # the sum of every sprint's stories_total — keep it in step when a story is added
intent_match: null   # copied from the seed by scaffold-epic (intent-match); the reader at the lock may update it
build_order: 38      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Workspaces become the tenant: one person, many products, one boundary ✅

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Appetite:** M · **Scope seed:** [`00-ideas/seeds/workspaces.md`](../../00-ideas/seeds/workspaces.md)
> **Visual review:** https://claude.ai/artifact/A7qv2qeBsmewdCkHXnf2UW (private to the product owner)

## Why
One person now holds several products, and the portfolio view, the workspace-wide board, FinOps budgets and future
billing all need a place that may read across them. Today the only tenant is a project, and AGENTS.md forbids any
request path from crossing projects. This epic makes the **workspace** the tenant (audit decision D5), restates the
rule at that level in the same change, and gives later epics exactly one legal way to read several projects at once.
Nobody gains or loses access on day one.

## Platform-first note
The system of record already models membership: `project_members`, read only through `lib/membership.ts`, the
single seam that every console guard, the CLI and the MCP tools pass through. This epic adds one entity above
`projects` and one check at that seam. None of the ~50 project-scoped tables change, and API keys and connector
tokens stay project-scoped.

## Decisions carried from grooming (the lock verifies each against live code and live data)
- **D1 — Access model A: the workspace is the boundary; projects keep their members.** `project_members` stays the
  access list. A workspace member can't open a project they aren't a member of. (Product owner, 2026-10-01.)
- **D2 — Schema:** `workspaces (id, name, created_by, created_at)`, `workspace_members (workspace_id, user_id, role
  owner|member, created_at, PK(workspace_id,user_id))`, `projects.workspace_id uuid references workspaces`. RLS on,
  no policies, service-role only. `workspace_members.role` gates workspace administration only, and nothing in v1
  reads it for project access (LEARNINGS: a role column is not an access rule).
- **D3 — Backfill rule:** a project with `created_by` goes to that user's workspace; else the earliest `owner`'s; else
  (`demo`, `self`) one **platform** workspace owned by Daniel's user. One workspace per user, named "<display
  name>'s products". **The lock queries live counts first** and may revise this rule out loud.
- **D4 — Rollout order:** expand → backfill (verify `0` nulls live) → NOT NULL → code that reads it. Migrations are
  applied before merge (WAYS-OF-WORKING, Supabase is a separate step).
- **D5 — AGENTS.md amendment in the same PR as the tables** (D5 of the audit says so). The scheduler exemption keeps
  its six conditions and registry. Rule #2 (public routes are demo-only) is untouched.
- **D6 — `getWorkspaceProjects(userId, workspaceId)` is the only multi-project read on a request path**: same
  workspace ∩ your project memberships, failing closed.
- **D7 — No runtime flag (carve-out):** a DB migration plus a behaviour-neutral seam check under D1. Rollback is
  expand/contract + `git revert`.
- **D8 — No-gos:** billing, moving quotas to the workspace, moving projects between workspaces, workspace invites,
  access model B, workspace rename/delete UI, the portfolio view itself.

## Architecture lock (2026-10-01, verified against live code and live data)

The decisions above were checked against `main` @ `c2bf849` and the production database (`slweidgffcfndnskcskc`).
Builders cite these numbers; the grooming list above stays as the record of what was asked.

**Live data at the lock (production):** 4 projects. 1 has `created_by` (`miyagi` → `miyagi@`, its sole owner).
3 have no creator and one owner, Daniel (`miyagisanchez`, `golden-beans-demo`, `golden-beans`). **0 have
neither.** Every project has exactly one member, and every member is an owner. `SIGNUP_ENABLED` is on
(`/signup` answers 200).

- **D1 — Access model A, confirmed.** `project_members` is the only access list. The only code that writes it is
  `lib/provisioning.ts` (no invite path exists), and the SQL RPCs re-check `project_members` only after the app
  seam has already passed.
- **D2 — Schema, with one correction.** It follows grooming's D2, except `workspaces.created_by` is **nullable**
  (`ON DELETE SET NULL`, the same as `projects.created_by`). Seed scripts and fixtures create workspaces with no
  auth user behind them, and deleting a user must not delete a tenant. Two additions: a partial unique index
  `workspaces_one_per_creator_idx ON workspaces(created_by) WHERE created_by IS NOT NULL` closes the
  double-confirm race, the same way `projects_one_per_creator_idx` does; and `projects.workspace_id` is
  `ON DELETE RESTRICT`, so a tenant that still holds projects can't be deleted. RLS is on with no policies, and the
  tables are `REVOKE ALL … FROM anon, authenticated` plus `GRANT … TO service_role`.
- **D3 — Backfill rule, revised by the live data (deviation).** The order is `created_by`, then the earliest owner
  (`ORDER BY created_at, user_id`, deterministic for a two-owner project). **The third branch (neither) aborts the
  migration** with `RAISE EXCEPTION` instead of inventing a "platform" workspace owned by a hardcoded user id: it
  has 0 live rows, and on every fresh database the backfill sees 0 projects (`seed.sql` runs after migrations).
  **So there is no platform workspace.** `golden-beans-demo` and `golden-beans` belong to Daniel and go into
  **"Daniel's products"** with `miyagisanchez`. `miyagi` goes into **"miyagi's products"**: that account has no
  display name, so its email local part is used. The seed's data sample and S2's smoke step 1 ("Golden Frijoles
  (platform)") are corrected in the sprint files. **One addition:** the backfill also makes *every* project member a
  member of that project's workspace (`owner` for the workspace's creator, otherwise `member`). Without it, S2.2's
  check would lock out any non-owner member, which breaks "nobody gains or loses access". Prod has no such member
  today, but the rule has to be right regardless.
- **D4 — Rollout order, corrected (deviation).** `SET NOT NULL` can't land before S1's provisioning code deploys.
  Signup is live, and the provisioning code running in prod today inserts projects without a workspace, so every
  signup in that window would fail. Order: **migration A** (tables + nullable column + backfill function + its
  first run), applied before S1 merges → **S1 merged and deployed** (provisioning writes `workspace_id`) →
  **migration B** (re-runs the backfill for stragglers, asserts 0 nulls, `SET NOT NULL`, drops the backfill
  function), applied before S2 merges → **S2 merged** (the code that reads it). Every PR still has its migration
  applied before its own merge. S1.2's NOT NULL step therefore ships at the head of S2.
- **D5 — The AGENTS.md amendment ships in S1's PR**, alongside the tables. The scheduler exemption's six conditions
  and registry don't change; "tenant" is now defined as the workspace. Rule #2 doesn't change and says so.
- **D6 — `getWorkspaceProjects(userId, workspaceId)` (`lib/workspace.ts`) is the only multi-project read on a
  request path**: the projects in that workspace ∩ your `project_members` rows, and only if you're a member of that
  workspace. On a query error it returns empty, so it fails closed. *(Amended after round-2 review of #220:)* the
  caller's own membership list, `getUserProjects`, is a named carve-out in AGENTS. It returns which projects you
  belong to, never data from inside them.
- **D7 — No runtime flag (carve-out, unchanged).** Rollback is expand/contract plus `git revert`.
- **D8 — No-gos, unchanged.**
- **D9 — The seam check covers all three reads, not two (scope correction).** `getUserProjects` feeds the switcher,
  `/app`, `gf projects` and `gf whoami`. If only `getMembership*` re-checked the workspace, the switcher would list
  projects that 404. So `getUserProjects`, `getMembership` and `getMembershipByProjectId` all require the project's
  workspace to be one of the viewer's `workspace_members` rows. `getUserProjects` still throws on a query error,
  and the two `getMembership*` reads still return null. The predicate is one pure function in
  `lib/workspace-access.ts` (zero imports), and each of the three reads calls it.
- **D10 — The MCP family's "404" is "write tools absent" (scope correction).** The connector path takes no slug. Its
  project comes from the connector token, and the one user-attributed check is `resolveFlagWriteActor` →
  `getMembershipByProjectId`. S2.2's MCP spec asserts that a PAT holder whose project sits in a foreign workspace
  gets no write tools: the existing non-member outcome. Connector tokens and API keys stay project-scoped
  (unchanged).
- **D11 — Fixture debt is part of S2's contract step.** 39 spec inserts, `supabase/seed.sql` and both seed scripts
  write `projects` without a workspace. NOT NULL breaks them all, including the seed scripts' `upsert` on an
  existing slug, because NOT NULL is checked before the conflict arbiter. They gain a workspace through one helper,
  in the same PR as migration B, which is where CI proves them.
- **D12 — Who builds (deviation from the routing above).** Only one session uses this checkout, and the stories
  share hot files (`membership.ts`, `provisioning.ts`, the fixtures). So the architect builds every story in place
  on stacked branches. The fresh `pr-reviewer` and the routed external passes do the reviewing. No builder
  subagent is spawned.

### Lock amendments made while building Sprint 2 (2026-10-01, stated out loud)
- **D13 — A project member is always inside the project's workspace (new).** The `project_members_join_workspace`
  trigger (migration B) inserts a `workspace_members` row (`member`, never `owner`) whenever a `project_members` row
  is written. Without it, D9's re-check would deny every project grant that doesn't come through provisioning:
  today that's specs; one day it's an invite flow. It grants nothing by itself (D1). It also amends D8's "rows only
  from backfill and provisioning": rows now come from the backfill, provisioning, and project membership itself,
  and never from a workspace invite or UI. Existing rows get the same guarantee by construction: migration B
  inserts every current project member into their workspace before it creates the trigger (fresh reviewer, #221;
  correct by inspection, since a fresh DB has no members when migrations run). What the re-check still defends is a
  person REMOVED from a workspace, who reaches nothing inside it.
- **D6, as built:** `getWorkspaceProjects` and `getUserWorkspaces` live in `lib/workspace.ts` (`server-only`, per-request
  `cache`). Their queries are in `lib/workspace-projects.ts`, and the two decisions (the seam predicate and the intersect)
  are in `lib/workspace-access.ts`, which has zero imports and is unit-tested.
- **S2.4, as built:** rule id `tenancy`, severity `blocking` (shadow, so it never blocks today), measured 33/34 decided,
  all right (the rule's `$measured` field in the config).

## What already exists (reuse, don't rebuild)
- `apps/web/lib/membership.ts`: `getUserProjects`, `getMembership`, `getMembershipByProjectId` (the seam).
- `apps/web/lib/dashboard-auth.ts`, `lib/cli-auth.ts`, `lib/mcp-flag-tools.ts`: the three callers that inherit the check.
- `apps/web/lib/auth.ts` (API key → project), `lib/connector-tokens.ts` (per project), `lib/cli-tokens.ts` (per user).
- `apps/web/lib/provisioning.ts` → `provisionTenantForUser()`: where a tenant is born.
- `apps/web/lib/shell-nav.ts`, `lib/active-project.ts`: the switcher data.
- `supabase/migrations/20260720120000_project_members.sql`, `20260721100000_self_serve_tenants.sql`: the expand/contract pattern.
- `golden-frijoles.config.json → lint.rules` + semantic-lint scripts: the rail for the tenancy guard.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| [S1 The tenant exists](sprint-1.md) | S1.1 tables (expand) · S1.2 backfill + NOT NULL · S1.3 provisioning · S1.4 AGENTS amendment | high |
| [S2 Every path checks it](sprint-2.md) | S2.1 `getWorkspaceProjects` · S2.2 the seam re-check + denial specs · S2.3 switcher + `gf whoami` · S2.4 shadow lint rule | high |

## Model routing
S1 (schema + backfill on live tenant data) and S2.2 (the auth seam) go to the strongest builder. S2.3 and S2.4 are
mechanical. Each PR gets the fresh reviewer subagent on top of the routed external review (HIGH tier).

## Deploy order
1. ~~S1.1 migration applied (expand) → S1.2 backfill applied and verified → NOT NULL migration applied → merge S1~~
   **Superseded by lock D4:** migration A (expand + backfill) applied and verified → merge S1 (provisioning writes
   `workspace_id`, AGENTS amendment) → deploy confirmed → migration B (NOT NULL) applied → merge S2.
2. S2 merges after S1 is live; it reads `workspace_id`, which is NOT NULL by then.
3. Unblocks `board-sinks-and-scrumban` S4 and seed `portfolio-view`.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated): #220 `4ee9bb1`, #221 `68b9974`. Both migrations were
      applied to production before their merges and verified live. The signed-in walkthroughs and the CLI publish are
      owed to Daniel by name (each sprint file).
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs) and dated results
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (sharpened, not appended)
- [ ] ~~Kill-switch~~ n/a: no flag; the D7 carve-out was recorded at grooming and held (nobody gained or lost access)
- [x] Feature branches deleted; **this README's frontmatter `status: shipped`**
