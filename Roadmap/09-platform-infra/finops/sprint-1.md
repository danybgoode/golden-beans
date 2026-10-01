---
epic: finops
sprint: 1
title: "Actuals, measured locally"
risk: low
phase: Shaping
stories_total: 4
stories:
  - id: S1.1
    title: "epic-actuals.mjs — transcripts to usage by epic"
    as_a: "the product owner"
    i_want: "a script that reads my Claude Code transcripts and totals what each epic consumed"
    so_that: "I can see an epic's real cost without instrumenting anything"
    risk: low
    status: planned
  - id: S1.2
    title: "The incremental usage index and the dated price table"
    as_a: "the product owner"
    i_want: "the totals kept in a small local index and priced as ≈ API $"
    so_that: "the numbers are instant to read and comparable across models and cache mixes"
    risk: low
    status: planned
  - id: S1.3
    title: "The Spend row in the build view band"
    as_a: "the product owner"
    i_want: "a Spend row in the band on any epic branch"
    so_that: "I see what this epic has consumed while it is being built"
    risk: low
    status: planned
  - id: S1.4
    title: "Backfill: actuals for recently shipped epics from local history"
    as_a: "the product owner"
    i_want: "the last ~30 days of epics measured from what is already on my Mac"
    so_that: "the first quote rests on real history instead of a guess"
    risk: low
    status: planned
---
# FinOps: quote vs actual per epic — measured from your own sessions, shown live in the build view, sent to the engine — Sprint 1: Actuals, measured locally

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
Shared seam first: the architect lands **2.1's contract fields** in `scripts/lib/roadmap-contract.mjs` (+ template twin) at the
start of this sprint — 1.4 writes them. Then: `epic-actuals.mjs` + `lib/model-prices.mjs` (pure; Node built-ins only;
kit closure via the `golden-frijoles` skill's `requires_scripts`), `build-state.mjs` reads the summary, `hooks/index.tsx`
refreshes on `session.measure`. Verify D1/D2 and the subagent transcript layout against a live Claude Code first.

## Stories

### Story 1.1 — epic-actuals.mjs — transcripts to usage by epic
**As** the product owner, **I want** a script that reads my Claude Code transcripts and totals what each epic consumed, **so that** I can see an epic's real cost without instrumenting anything.
**Acceptance:**
- `node scripts/epic-actuals.mjs --epic <slug> --json` prints sessions, tokens by kind (input · output · cache-read · cache-write), by model and by skill (`attributionSkill`, else `(no skill)`), first/last timestamp, and a `skipped` count (D4).
- A streamed response written as several transcript entries counts once (D2) — fixture spec, observed failing once by removing the dedupe.
- A session in a worktree of this repo on `feat/<slug>-s2` counts toward `<slug>`; a session in another repo, or on `main`, never does (`unattributed`, D11) — fixture specs.
- Branch → epic goes through `build-state.mjs`'s `branchCandidates()`; no second parser (grep in review).
- Output carries no message content: a spec asserts the JSON's key set (D9).
**QA:** pure-logic spec `epic-actuals.test.mjs` over fixture transcripts (split response, worktree cwd, sidechain, `main`, foreign repo, missing usage); parity with the template copy (`check-script-parity`).
**Risk:** low

### Story 1.2 — The incremental usage index and the dated price table
**As** the product owner, **I want** the totals kept in a small local index and priced as ≈ API $, **so that** the numbers are instant to read and comparable across models and cache mixes.
**Acceptance:**
- The index lives at `.golden-frijoles/usage-index.json` (covered by the existing `.golden-frijoles/.gitignore`), keyed per transcript file by size + mtime + offset; a second run reads only new bytes and changes nothing when nothing changed.
- Aggregates survive transcript deletion: an epic indexed before Claude Code's 30-day cleanup keeps its totals.
- `model-prices` holds one dated table with its source URL (D3); ≈ $ = Σ tokens × price per kind and model; an unknown model shows `$ unknown` and still counts tokens (D4).
- A summary file (`.golden-frijoles/usage-summary.json`, one row per epic) is written alongside — the only thing the band reads (D5).
**QA:** spec: idempotent re-index, append-only growth, unknown model; price arithmetic spec with a hand-computed fixture.
**Risk:** low

### Story 1.3 — The Spend row in the build view band
**As** the product owner, **I want** a Spend row in the band on any epic branch, **so that** I see what this epic has consumed while it is being built.
**Acceptance:**
- On an epic branch the band shows `$ Spend  ≈$<n> · <m>M tok · <k> sessions · this machine` between `Progress` and `Status`; on `main` nothing new appears.
- `build-state.mjs` reads only `usage-summary.json` — no transcript scan inside the resolver (D5); a missing summary renders no row, never a zero.
- The mod refreshes the index on `session.measure` with a timeout; a slow or failed refresh logs (`claude --debug`) and leaves the last row.
- The vendored resolver carries the change (`render-hook-vendor.mjs --check` green); `claude plugin validate` green.
- Glyph `$` is added to `LABEL_GLYPHS`; the row's tone is `plain` until Sprint 2 adds a quote.
**QA:** `build-state.test.mjs` (row present / absent / no summary); `build-view.test.mjs` (row parsing + glyph); plugin + kit version bump with CHANGELOG.
**Risk:** low

### Story 1.4 — Backfill: actuals for recently shipped epics from local history
**As** the product owner, **I want** the last ~30 days of epics measured from what is already on my Mac, **so that** the first quote rests on real history instead of a guess.
**Acceptance:**
- `epic-actuals.mjs --backfill` lists every epic found in local transcripts with its totals, and every shipped epic it could not resolve, each with a reason (no transcripts left, cloud-built, branch never seen) — findings recorded, not fixed (the `roadmap-backfill` D5 rule).
- `--backfill --write` stamps `actual_*` (contract from 2.1, pulled forward) on resolved shipped epics only, with `actual_basis: "backfill · this machine · <date>"`; dry run is the default.
- Running it on this repo resolves at least the epics shipped since 2026-09-01 that were built on this Mac (workspaces, think-skills, session-budget, intent-match are the expected ones) — the report says which.
**QA:** spec over a fixture corpus; the real run's report is attached to the PR.
**Risk:** low

## Sprint QA
- **pure-logic specs:** `epic-actuals.test.mjs`, `model-prices.test.mjs`, `build-state.test.mjs`, `build-view.test.mjs` — each new spec observed failing once by mutation.
- **parity + release:** `check-script-parity`, `render-hook-vendor --check`, `claude plugin validate`, `check-release.mjs` (plugin + kit bump).
- **browser smoke owed:** no — the band is a terminal surface; steps 2–4 below are owed to the product owner (they need his real transcripts).
- **deterministic gate:** the skills CI + root `npm run typecheck`/lint/test green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: your Mac · the repo at ~/dobby/golden-frijoles · the plugin updated to this sprint's release

1. Open https://github.com/danybgoode/golden-frijoles/blob/main/skills/CHANGELOG.md after the merge.
   → the newest section names `epic-actuals.mjs` and the band's Spend row.
2. In a terminal at the repo, run `node scripts/epic-actuals.mjs --backfill`.
   → a list of recent epics with ≈ $ and tokens, and a list of epics it couldn't resolve, each with a reason.
3. Run `git switch feat/finops` (or any epic branch), open Claude Code there and send one message.
   → the band shows a `$ Spend` row between Progress and Status, ending in "this machine".
4. Switch to `main` and send one message.
   → no Spend row.

If any step fails, note the step number + what you saw — that's the bug report.
