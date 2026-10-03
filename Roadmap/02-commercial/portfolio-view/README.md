---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
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
actual_usd: 18.17
actual_mtok: 57.3
actual_basis: "this machine · 2026-10-03 · 1 session · prices 2026-10-02"
---

# Epic: Portfolio view — every product in a workspace on one page, placed on the Consider · Operate · Exit loop ✅

> **✅ Shipped and live 2026-10-03** — S1 #234 (`a23ff01`), S2 #235 (`1751c8c`). Migration `20261003100000` applied
> to production before S1 merged and verified. Actual ≈$18.17. Owed to Daniel: the signed-in walkthroughs (sprint
> files) and placing his products on the loop.

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

## Architecture lock (2026-10-03, verified against live code + production data before any builder started)

**Live data the lock read (prod `slweidgffcfndnskcskc`):** 2 workspaces, 4 projects. "Daniel's products" holds
`golden-beans`, `golden-beans-demo`, `miyagisanchez` (one owner each, no other members); "miyagi's products" holds
`miyagi`. Events per project ≤ 453. Pushed artifacts: `golden-beans-demo` (roadmap v228 with 50 epic rows, every one
carrying the finops fields; pod_report v212, lead time 2 d) and `miyagisanchez` (pod_report only, lead time 7.1 d, as of
2026-07-26). `golden-beans` has no artifacts (its pushes go to the self-tenant `golden-beans-demo`). North Star:
`miyagisanchez` and `golden-beans-demo` register `payable_sellers` (2 and 1 inputs); the other two register none.

### Decisions (the builders cite these; nothing below is restated elsewhere)
- **D1 — One seam (verified).** `getPortfolio(userId, workspaceId)` (`lib/portfolio.ts`) lists projects ONLY through
  `getWorkspaceProjects()`; every other read is keyed by ONE project id from that list. The loop stage is read per
  project too (C10) — `getWorkspaceProjects` itself is not widened.
- **D2 — Unknown is not zero (verified, kept).** A cell is `{ value, as_of? }`, `{ value: null, reason }` or
  `{ error: true }` — the type in `lib/portfolio-model.ts`, nowhere else.
- **D3 — Loop stage is written, never inferred (kept).** `projects.loop_stage`, nullable, `consider | operate | exit`.
  Only an owner writes it (`isOwner` on `getMembershipByProjectId`).
- **D4 — Pushed figures carry `as_of` (kept)** = the artifact's `generatedAt`.
- **D5 — Front door (corrected, C2/C3).** Bare `/app` redirects to `/app/portfolio` when the viewer holds 2+ projects
  in ONE workspace. `/app?project=…` and `/app?provision=…` never redirect.
- **D6 — Rows only (kept).** No cross-product totals or ranking. (A per-product spend sum over that product's own
  epics is a row figure, not a workspace total.)
- **D7 — Fan-out (measured).** Largest workspace = 3 projects → no batching. All cells of all rows run in parallel;
  each cell has a **5000 ms** timeout and times out to `{ error: true }` alone.
- **D8 — Module split.** `lib/portfolio-model.ts` ZERO-import (cell type, `withTimeout`, every shaping rule, the
  assembler over injected readers); `lib/portfolio.ts` `server-only` (binds `getWorkspaceProjects` + the real readers);
  `lib/loop-stage.ts` ZERO-import (stages, parse, the write decision); `lib/loop-stage-store.ts` (its read + write; client parameter, no
  `server-only`, so a spec drives the real write against the real database — the `workspace-projects.ts` precedent).
- **D9 — Migration** `20261003100000_projects_loop_stage.sql`: `ALTER TABLE projects ADD COLUMN loop_stage text` +
  a separately named `CHECK (loop_stage IN ('consider','operate','exit'))`. NULL passes the check on purpose (NULL =
  not placed); every other string must fail — verified by ATTEMPTING the write (CODE-QUALITY #3). Applied to prod via
  `supabase db query --linked -f` + its `schema_migrations` row (the workspaces precedent; the Supabase MCP is not
  connected), before Sprint 1 merges.
- **D10 — Reads reused per cell.** loop stage: one `projects` row by id · North Star + funnel: `getProjectOutcome`
  (one call, two cells — the read Today uses) · running: `listExperimentRegistries` · kill switches:
  `getFlagRegistryView` → `projectFlagRows(…, 'production')` (the read Today uses) · lead time: `getLatestArtifact(id,
  'pod_report')` · spend: `getLatestArtifact(id, 'roadmap')` → `epicFinopsFromArtifact` (finops 3.2's accessor).
- **D11 — Write path.** A Server Action (`app/app/portfolio/actions.ts`): session user → `getMembershipByProjectId` →
  `loopStageWriteDecision` → `writeLoopStage` (`lib/loop-stage-store.ts`). No API route, no credential path reaches it.
- **D12 — Workspace choice for `/app/portfolio`.** `?workspace=<id>` is a VIEW preference matched against the viewer's
  own workspaces (not theirs / malformed → 404). Without it: the workspace holding most of the viewer's projects
  (ties → workspace name), from `getUserProjects` (the named membership carve-out) through a pure `portfolioWorkspace()`.
- **D13 — Routing.** The architect builds in place (one session in the checkout, one builder); the fresh
  `pr-reviewer` (mandatory, risk high) + `review-route.mjs` external passes review each PR.

### Corrections — scope the live system disproved (said out loud)
- **C1 — There is no North Star value, so there is no WoW.** `readNorthStar` returns `latestValue: null` by
  construction: `north_star_metrics` stores a KEY, values belong to leading INPUTS, and no table holds a level for the
  metric (the North Star page says so in its header comment). A "value (WoW)" column would be "not set" forever.
  **The cell shows the registered metric and how many inputs feed it** (`payable_sellers · 2 inputs`), or
  "no North Star set". `wow` is dropped from the row shape. A metric level is a follow-up seed, not this epic.
- **C2 — `/app?project=<slug>` is the switcher's Today link.** Redirecting every `/app` at 2+ products would make
  Today unreachable for exactly the users this epic serves. Only bare `/app` redirects (D5).
- **C3 — "2+ products in the workspace" needs a workspace.** A viewer can belong to several (prod has two). D12 picks one.
- **C4 — "owner 200 / member 403 / non-member 404" assumed a route.** No session-authed API route exists in this repo,
  and a cookie-authed POST route would need its own CSRF guard that Server Actions carry. The three outcomes are the
  decision function's `ok | forbidden | not_found`, asserted directly; the write and its CHECK are asserted against the
  real database; the wire is the S2 authed browser spec.
- **C5 — "open kill switches" = kill-switch-polarity flags switched OFF in production** (the deliberate kill; a
  kill switch's default is on — `flag-list-view.ts`). Breakers are not read separately: a breaker trip moves its flag
  to a protective version, which this count does not claim to see. Shown as the Running cell's second line (the
  approved sketch has no kill-switch column).
- **C6 — "funnel_stage" has no definition in code.** It is the furthest TARS stage any registered feature reached
  (`Retained` > `Adopted` > `Targeted`), over `getProjectOutcome`'s bounded feature list; "no features registered" /
  "nobody targeted yet" otherwise.
- **C7 — Spend vs quote.** Over this product's epics carrying BOTH a quote and an actual: `≈$Σactual · ±Δ% (n quoted
  epics)`, Δ against Σ`quote_high` (finops' own "over" rule). None → "no quotes yet". finops S3 is live, so the column
  lights up for `golden-beans-demo` on day one.
- **C8 — Row shape (final):** `{ project, loop_stage, north_star, funnel_stage, experiments_running,
  kill_switches_off, epic_lead_time_days, spend_vs_quote }`, every field but `project` a D2 cell.

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
- [x] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written (with its quote vs actual line, once finops S2 has shipped)
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — no flag planned at grooming (carve-out above).
- [x] The migration is applied in production and verified (`supabase migration list` shows it on the linked project)
- [x] Feature branches deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
