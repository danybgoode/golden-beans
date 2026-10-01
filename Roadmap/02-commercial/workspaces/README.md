---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
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

# Epic: Workspaces become the tenant: one person, many products, one boundary

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
1. S1.1 migration applied (expand) → S1.2 backfill applied and verified → NOT NULL migration applied → merge S1 (code
   for provisioning + AGENTS amendment).
2. S2 merges after S1 is live; it reads `workspace_id`, which is NOT NULL by then.
3. Unblocks `board-sinks-and-scrumban` S4 and seed `portfolio-view`.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] Kill-switch: none planned (D7 carve-out recorded at grooming)
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — run `node scripts/build-order.mjs`)
