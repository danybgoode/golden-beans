# Experiments for humans — Sprint 2: Event catalog and the planner

**Status:** ✅ shipped 2026-09-25 — PR #169, squash `bf62913`; 8 review rounds (last two clean from both layers); amendment A7 recorded for Daniel · **Wave 1** · branch `feat/experiments-for-humans-s2` (stacked on S1)

## Build contract (locked by the architect before the builder started)
Cite the README's D-numbers; do not restate them.

- **2.1 → D11** (builder: mid tier, own worktree). `lib/event-catalog.ts` (pure, zero imports) +
  `lib/event-catalog-query.ts` (`server-only`, `getSupabaseServiceClient`, project id from the resolved
  membership, never from input). Shape, all from ONE fetch: per event name `{ event, count14d,
  count24h, daily: number[14] }`; per assignment entity type `{ type, subjects14d }` and per (event,
  type) `baseline = subjects who did it / subjects of that type seen`; per segment field `{ field,
  coverage, values: top 20 { value, share } }`; per flag key in Production over 24 h
  `{ flagKey, evaluations }` (`event = 'flag_evaluated'` and `tags.environment = 'production'`);
  `{ truncated, rowCap: 50000, windowDays: 14, asOf }`. Reserved events (`experiment_exposed`,
  `flag_evaluated`, `$error`, `scenario_executed`) are counted but flagged `reserved: true` so the
  builder never offers them as a metric. **Fixture:** the spec creates its own project on local
  Supabase through the canonical ingest path (`POST /api/v1/track` with a minted key, the pattern in
  `e2e/experiment-analysis-query.spec.ts`) and asserts every figure; a second project's events must not
  appear (tenancy). AGENTS.md rule #1 table + "Key imports" gain the catalog in the same PR. Risk: low.
- **2.2 → D3, D4, D5, D6** (builder: the architect). `lib/experiment-templates.ts` (the four templates
  as data, copied from the approved prototype's `TEMPLATES`, with event NAMES replaced by D5 roles) and
  `lib/experiment-builder-plan.ts`. Specs under `npm run test:unit`: the sentence and day count for
  the prototype's own example (Copy template on a catalog fixture built from the prototype's `EVENTS`,
  `FIELDS`, `ENTITIES` — the prototype says 18 days / 11,000-ish per version; the spec pins OUR numbers
  and states where they differ and why); the stacked-rollout property test (D4); the six checks on a
  pass / warn / fail fixture each; `stripExperiment` round trip (D8); every output through its parser.
  Each spec observed red once by a mutation that compiles. Risk: low, reviewed as HIGH (shared seam).
- **Deviation:** A2 — no stop at the end of this sprint; the ⛔ boundary below is superseded.

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

## ⛔ Wave boundary — SUPERSEDED by A2 (2026-09-24)
At the end of this sprint the orchestrator **stops, reports what shipped and what Wave 2 now costs, and
waits for the Wave 2 bet** (README → A1). Don't start Sprint 3 in the same run without it.

## Sprint QA
- **api spec(s):** `e2e/event-catalog.spec.ts` (2.1); unit + property specs for the planner (2.2).
- **browser smoke owed:** no.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com (sign in as the `miyagisanchez` owner). Nothing in this
sprint is visible in the product: the catalog read has no caller until Sprint 3, and the builder is
dark. The walkthrough checks that nothing moved, and where the numbers are proven.

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez
   → The page is exactly as after Sprint 1: the list, "+ New experiment" opening the old dialog,
   `founding-message-v2` and `fundadoras_promise_cta` reading Decided.
2. Open the Sprint 2 PR and find `apps/web/lib/experiment-builder-plan.test.ts`, test "the Copy
   template on the prototype catalog".
   → It pins the sentence *"New copy goes to half of merchants in MX. It wins if application
   completed rises by at least 10%, as long as application abandoned don't rise."* and **36 days**
   (the prototype drew 13 from a hand-typed 780 merchants/day; the catalog can only know the 279/day
   it has seen — the test says so).
3. In the same PR, find the CI job "Static gate + build" (it runs `npm run test:unit`).
   → Green, including the 100k-key stacked-rollout property test.

If any step fails, note the step number + what you saw — that's the bug report.
