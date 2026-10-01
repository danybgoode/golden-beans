---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: portfolio-view
title: "Portfolio view: every product in a workspace on one page, placed on the Consider · Operate · Exit loop"
area: 02-commercial
risk: high
type: feature
appetite: M
sprints_total: 2
stories_total: 7    # the sum of every sprint's stories_total — keep it in step when a story is added
intent_match: null   # could not look at grooming (Jev unreachable, 2026-10-01) — copied from the seed by scaffold-epic (intent-match); the reader at the lock may update it
build_order: 41      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Portfolio view — every product in a workspace on one page, placed on the Consider · Operate · Exit loop

> **Area:** 02-commercial · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/portfolio-view.md`](../../00-ideas/seeds/portfolio-view.md)
> **Appetite:** M (one wave — architect session + builder fan-out + one review round) · **Bet:** not yet placed (`underwritten_by: null`).
> **Groomed together with** [`finops`](../../09-platform-infra/finops/README.md) (2026-10-01). **Build order: after finops (41).**
> The one seam: the `Spend vs quote` column reads `quote_*` / `actual_*` from the roadmap push (finops 3.2). If finops
> Sprint 3 hasn't merged when this builds, the column ships in its "no quotes yet" state — **this epic never waits on it.**

## Why
One person now runs several products, each behind its own project switch. Deciding which one needs the next wave means
opening each, reading its North Star, funnel, experiments and roadmap, and holding the comparison in your head. This
epic puts every product in the workspace on one page — health, place on the Consider · Operate · Exit loop, delivery
speed and spend against quote — and makes it the front door for anyone holding two or more products.

## Platform-first note
**Composition, not a new pipeline.** `workspaces` (shipped 2026-10-01) created the one legal multi-project read,
`getWorkspaceProjects(userId, workspaceId)`, and every figure on the page already has a per-project read. The only new
storage is the written loop stage. Nothing here reads a project the caller isn't a member of (access model A), and
nothing here touches the public/demo allow-list (rule #2).

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — One seam for the multi-project read.** `getPortfolio(userId, workspaceId)` calls `getWorkspaceProjects()` and
  then per-project reads only; no `.in('project_id', …)` built any other way (AGENTS § tenancy invariant; the `tenancy`
  lint rule).
- **D2 — Unknown is not zero.** Each cell is a value, `null` + a reason ("no North Star set", "no quotes yet", "WoW not
  yet"), or "couldn't load" for that cell alone. Never a fabricated 0.
- **D3 — Loop stage is written, never inferred.** `projects.loop_stage` — nullable enum `consider | operate | exit`;
  unset shows "Not placed". Only a project **owner** writes it (`isOwner`).
- **D4 — Pushed figures say when they were pushed.** Lead time (pod report artifact `delivery.epicLeadTime`) and spend
  (roadmap artifact) carry "as of <date>".
- **D5 — Front door:** `/app` opens on `/app/portfolio` when the caller has **2+ projects in the workspace**; with one,
  `/app` is unchanged (product owner's pick).
- **D6 — Rows only.** No workspace totals, no ranking, no bets table in v1 (the "Next wave" panel from the grooming
  mockup was cut to hold the appetite → follow-up seed).
- **D7 — Per-cell fan-out with a timeout,** in parallel; the lock measures it on the real workspace.

## What already exists (reuse, don't rebuild)
- `apps/web/lib/workspace.ts` (`getUserWorkspaces`, `getWorkspaceProjects`), `lib/workspace-access.ts`,
  `lib/workspace-projects.ts`, `lib/membership.ts` (`getUserProjects`, `getMembershipByProjectId`, `isOwner`).
- `lib/north-star-query.ts` `getProjectNorthStarByProjectId`; `lib/tars-query.ts` `getFeatureFunnelByProjectId`.
- `lib/experiments.ts` `listExperimentRegistries`; `lib/breaker-*.ts` and the flag reads for open kill switches.
- `lib/report-artifacts.ts` `getLatestArtifact`; `lib/pod-report-view.ts` (epic lead time);
  `lib/roadmap-artifact-schema.ts` (`summarizeRoadmap`, + finops 3.2's fields).
- `app/app/page.tsx` (the `/app` front door), the grouped project switcher, the console app shell + component kit.
- AGENTS § The tenancy invariant; the `tenancy` semantic-lint rule (shadow).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `getPortfolio()` — one row per product through the one legal read | high |
| 1 | 1.2 Every cell honest: value, not set, or couldn't load | high |
| 1 | 1.3 `projects.loop_stage` — written by an owner, never inferred (migration) | high |
| 1 | 1.4 Spend vs quote from the roadmap artifact | low |
| 2 | 2.1 `/app/portfolio` — the page in its five states | high |
| 2 | 2.2 `/app` opens on the portfolio at 2+ products | high |
| 2 | 2.3 Place a product on the loop from its row | high |

## Routing
The read model (1.1–1.3) and the front-door redirect (2.2) are tenancy/migration work → **strongest model, never
delegated**. 1.4 and the page's rendering (2.1) → mid-tier builders against the locked contract. Security lens triggered
(risk high). Review per `review-route.mjs`.

## Kill switch (Stage 6b)
**No flag — carve-out recorded at grooming (product owner approved, 2026-10-01).** The page is read-only except one
owner-only column; the `/app` default is a one-line branch on project count. Rollback = `git revert`; the migration is
additive (a nullable column) and safe to leave in place.

## Deploy order
1. **Migration first** (1.3): applied through the Supabase MCP **before** merging Sprint 1, verified live (DoD: done
   means shipped). Additive and nullable → the old code ignores it.
2. Sprint 1 (read model, no UI) → Sprint 2 (page, then the `/app` default **last**, so nobody is sent to a page that
   isn't there). Stacked: `feat/portfolio-view` → `feat/portfolio-view-s2`.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written (with its quote vs actual line, once finops S2 has shipped)
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — no flag planned at grooming (carve-out above).
- [ ] The migration is applied in production and verified (`supabase migration list` shows it on the linked project)
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
