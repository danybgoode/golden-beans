# Experiments for humans — Sprint 2: Event catalog and the planner

**Status:** ⬜ not started · **Wave 1** · branch `feat/experiments-for-humans-s2` (stacked on S1)

## Build contract (locked by the architect before the builder started)
<!-- D3, D4, D5, D6 verified. The catalog's cost decided from LIVE row counts: events per project over
     14 days for the busiest tenant. Bounded read + pure aggregation (no migration) vs a read-only SQL
     function (migration → Story 2.1 becomes high). Name the fixture project the specs use. -->
- Catalog read shape: _to be decided from live counts_
- Planner location and signature: D3 — _to be verified_

## Stories

### Story 2.1 — The event catalog read
**As** a product person, **I want** to choose metrics and audiences from what my product actually
sends, **so that** I never type an event name or guess a tag value.
**Acceptance:**
- `lib/event-catalog-query.ts` joins the canonical read paths (AGENTS rule #1 list updated in the same
  PR), project resolved server-side.
- For a project it returns: event names with 14-day and 24-hour counts and a daily series; the
  baseline rate per assignment entity type; for each of `source · channel · campaign · plan · region`
  the coverage (share of recent events carrying it) and value shares (top 20); entity types seen with
  counts; `flag_evaluated` counts per flag key in Production over 24 hours.
- An api spec on the fixture project asserts each figure against seeded events.
**Risk:** low (high if the lock chooses a SQL function)

### Story 2.2 — The pure planner
**As** the builder UI, **I want** one function that turns answers into everything the screens show and
the writes need, **so that** the UI is keystrokes and every number is tested once.
**Acceptance:**
- `lib/experiment-builder-plan.ts` (zero I/O) returns the `ExperimentDefinition` (passes
  `parseExperimentDefinition`), the flag definition version (passes `parseFlagDefinition`, D4), days
  and need per version (n ≈ 16·p(1−p)/δ², smallest arm), the recommended weeks (max(2, ⌈days/7⌉)), the
  six checks (D6) and the plain sentence.
- The four templates are data in one module. Their defaults resolve against a catalog (D5), each
  flagged "suggested".
- Property test: stacked rollouts reproduce declared weights and allocation within 0.5 pp over 100k keys.
- Unit specs pin the sentence and the days for the prototype's example (Copy template on the fixture
  catalog), each observed red once by mutation.
**Risk:** low

## ⛔ Wave boundary — stop here
At the end of this sprint the orchestrator **stops, reports what shipped and what Wave 2 now costs, and
waits for the Wave 2 bet** (README → A1). Don't start Sprint 3 in the same run without it.

## Sprint QA
- **api spec(s):** `e2e/event-catalog.spec.ts` (2.1); unit + property specs for the planner (2.2).
- **browser smoke owed:** no.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez
   → Nothing visible has changed (the builder is still dark).
2. Open the Sprint 2 PR and find the planner spec output for the Copy template on the fixture catalog.
   → It shows a sentence and a day count, and the spec asserts both.

If any step fails, note the step number + what you saw — that's the bug report.
