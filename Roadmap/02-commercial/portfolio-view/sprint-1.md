---
epic: portfolio-view
sprint: 1
title: "The read model and the loop stage"
risk: high
phase: Shaping
stories_total: 4
stories:
  - id: S1.1
    title: "getPortfolio() — one row per product through the one legal read"
    as_a: "the product owner"
    i_want: "one call that returns a row for every product I'm a member of in my workspace"
    so_that: "the page has one honest source and the tenancy rule holds by construction"
    risk: high
    status: planned
  - id: S1.2
    title: "Every cell honest: value, not set, or couldn't load"
    as_a: "the product owner"
    i_want: "each figure to say plainly when it doesn't exist or didn't load"
    so_that: "I never compare products on a zero that isn't real"
    risk: high
    status: planned
  - id: S1.3
    title: "projects.loop_stage — written by an owner, never inferred"
    as_a: "the product owner"
    i_want: "to place each product on Consider, Operate or Exit myself"
    so_that: "the loop reflects my judgment, not a guess from metrics"
    risk: high
    status: planned
  - id: S1.4
    title: "Spend vs quote from the roadmap artifact"
    as_a: "the product owner"
    i_want: "each product's spend against its quotes on its row"
    so_that: "cost sits beside health when I choose the next wave"
    risk: low
    status: planned
---
# Portfolio view: every product in a workspace on one page, placed on the Consider · Operate · Exit loop — Sprint 1: The read model and the loop stage

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
Lock against live code + data: count the projects in the product owner's workspace (decides D7's batching), confirm
the pod-report artifact's `delivery.epicLeadTime` shape, and pick the kill-switch source (breakers vs flags) the
project page already uses — reuse that read, don't add one.

## Stories

### Story 1.1 — getPortfolio() — one row per product through the one legal read
**As** the product owner, **I want** one call that returns a row for every product I'm a member of in my workspace, **so that** the page has one honest source and the tenancy rule holds by construction.
**Acceptance:**
- `getPortfolio(userId, workspaceId)` (new `lib/portfolio.ts`) starts from `getWorkspaceProjects()` and returns one row per project in it — nothing else (D1).
- A project in the workspace that the caller is not a member of never appears; a foreign workspace returns no rows (api specs).
- Row shape: `{ project, loop_stage, north_star: {value, wow, label}, funnel_stage, experiments_running, kill_switches_open, epic_lead_time_days, spend_vs_quote }`.
- The `tenancy` semantic-lint rule passes on the new file.
**QA:** pure-logic spec over an injected reader (fixture workspace: member, non-member, foreign); api spec `e2e/portfolio-access.spec.ts`.
**Risk:** high

### Story 1.2 — Every cell honest: value, not set, or couldn't load
**As** the product owner, **I want** each figure to say plainly when it doesn't exist or didn't load, **so that** I never compare products on a zero that isn't real.
**Acceptance:**
- Each cell is `{ value }`, `{ value: null, reason }` or `{ error: true }` (D2): no North Star → "no North Star set"; < 2 weeks → "WoW not yet"; no pushed report → "no report pushed".
- Per-cell reads run in parallel with a timeout (D7); one slow read marks only its cell `error`.
- Pushed figures carry `as_of` (D4).
**QA:** spec per reason and the timeout path (a fake slow reader); observed failing once by returning 0.
**Risk:** high

### Story 1.3 — projects.loop_stage — written by an owner, never inferred
**As** the product owner, **I want** to place each product on Consider, Operate or Exit myself, **so that** the loop reflects my judgment, not a guess from metrics.
**Acceptance:**
- A migration adds `projects.loop_stage` — nullable, `consider | operate | exit` (check constraint); applied before merge and verified live.
- A server action / route sets it; owner → 200, member → 403, non-member → 404 (api specs). Credentials (API keys, connector tokens) can't set it.
- Nothing infers it: unset reads `null` → "Not placed" (D3).
**QA:** api spec `e2e/portfolio-loop-stage.spec.ts`; migration verified with `supabase migration list` against the linked project.
**Risk:** high

### Story 1.4 — Spend vs quote from the roadmap artifact
**As** the product owner, **I want** each product's spend against its quotes on its row, **so that** cost sits beside health when I choose the next wave.
**Acceptance:**
- Reads `quote_*`/`actual_*` from the latest roadmap artifact through finops 3.2's accessor; shows `≈$<sum of actuals> · <Δ%> (last <n> epics)`.
- Before finops 3.2 ships, or with no quoted epics: "no quotes yet" — the cell never waits and never errors.
- Says `as of <push date>`.
**QA:** unit spec with and without the fields; fixture of mixed quoted/unquoted epics.
**Risk:** low

## Sprint QA
- **api specs:** portfolio access (member / non-member / foreign workspace), loop-stage write by role — the gate.
- **migration:** applied via the Supabase MCP before merge; `supabase migration list` shows it live.
- **review:** risk HIGH → security lens (tenancy + migration); fresh `pr-reviewer`; routed external pass.
- **browser smoke owed:** no UI this sprint; step 2 below (auth) is owed to Daniel.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (Sprint 1 ships no page — the page is Sprint 2)

1. In the repo, run `supabase migration list` against the linked project.
   → the `loop_stage` migration shows as applied on the remote.
2. Run `npx playwright test e2e/portfolio-access.spec.ts e2e/portfolio-loop-stage.spec.ts --project api` (names as the lock fixes them).
   → all green: member sees their rows, non-member sees none, a foreign workspace sees none; owner 200, member 403, non-member 404 on the loop-stage write.
3. (auth — owed to Daniel) Signed in, open https://goldenfrijoles.com/app
   → nothing has changed yet (the front door moves in Sprint 2).

If any step fails, note the step number + what you saw — that's the bug report.
