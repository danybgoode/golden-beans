---
epic: verify-spike
sprint: 1
title: "S1 Measure and decide"
risk: low
phase: Shaping
stories_total: 4
stories:
  - id: S1.1
    title: "Quint spec of the delivery outbox + bounded model check"
    as_a: "the product owner"
    i_want: "the outbox's three promised invariants model-checked"
    so_that: "I know whether spec-level checking finds anything real, and at what cost"
    risk: low
    status: planned
  - id: S1.2
    title: "Lean model of the evaluator: explanation ⇔ verdict agreement + differential test"
    as_a: "the product owner"
    i_want: "the preview screen's explanation proven to agree with the served verdict"
    so_that: "I know what a proof tier costs and whether it catches a gap tests miss"
    risk: low
    status: planned
  - id: S1.3
    title: "Jev triage in shadow over ~10 merged PRs"
    as_a: "the product owner"
    i_want: "Jev's four triage answers logged against real past diffs"
    so_that: "verify-module knows whether Jev can route verification depth"
    risk: low
    status: planned
  - id: S1.4
    title: "The written decision (DECISION.md)"
    as_a: "the product owner"
    i_want: "one decision doc: language, tiers, cost, findings"
    so_that: "verify-module can be shaped from evidence"
    risk: low
    status: planned
---
# Verify spike: Quint on the outbox, Lean on the flag evaluator — Sprint 1: S1 Measure and decide

**Status:** ⬜ not started · **Appetite:** S (one builder session). When it runs out, write the decision
with what was measured and name the gaps. Pitch and Fix policy: [`seeds/verify-spike.md`](../../00-ideas/seeds/verify-spike.md).

All artifacts go in this folder: `quint/`, `lean/`, `diff-test/`, `jev-triage.md`, `DECISION.md`, and a
`REPRODUCE.md` with one command per result. **Time every run** (wall clock + tool versions), because cost is
one of the answers.

## Stories

### Story 1.1 — Quint spec of the delivery outbox + bounded model check
**As the** product owner, **I want** the outbox's promised invariants model-checked, **so that** I know
whether spec-level checking finds anything real, and at what cost.
Model `event_deliveries` (`pending → in_flight → delivered | failed | dead`), `claim_deliveries` (as an
atomic claim; state the `SKIP LOCKED` abstraction as an assumption), `settle_delivery`, the backoff
cursor, and the retry cap. Include a sink that can be down, and worker crashes mid-`in_flight`. Invariants:
**(a)** no loss while a sink is down (every ingested delivery eventually reaches `delivered` or `dead`,
never vanishes), **(b)** nothing is sent after `dead`, **(c)** bounded replay (attempts ≤ cap). Bounds
are small: 2 destinations, 3 events, cap 3.
**Acceptance:** `quint verify` (or `quint run` if verify is too slow; record which one and why) prints no
violation or a counterexample, reproducible from `REPRODUCE.md`. Wall-clock time and bounds are recorded.
**Risk:** low

### Story 1.2 — Lean model of the evaluator: explanation ⇔ verdict agreement + differential test
**As the** product owner, **I want** the preview screen's explanation proven to agree with the served
verdict, **so that** I know what a proof tier costs and whether it catches a gap tests miss.
Model `evaluateFlag` / `matchesRule` / `explainFlagEvaluation` over parsed definitions in Lean 4, with the
FNV rollout hash as an uninterpreted function. **Do not prove determinism.** Prove that the explanation's
`variantKey`/`reason` equal the verdict's. The groom predicts that this holds only **modulo type
checks** (`evaluateFlag` returns `DEFAULT` on `TYPE_MISMATCH` and on variant-type failure, and
`explainFlagEvaluation` never checks either). State the exact theorem that holds, and assess whether the
gap is user-visible on the preview screen. Then run a differential test: generate definitions × contexts
(start from `flags.test.ts` cases) and compare the Lean model (compiled) with the TS evaluator.
**Acceptance:** `lake build` passes with the theorem and no `sorry` (or the remaining `sorry`s are listed
with the reason). The differential test runs ≥ 1,000 cases with 0 disagreements, or each disagreement is
explained. Both commands are in `REPRODUCE.md` with timings.
**Risk:** low

### Story 1.3 — Jev triage in shadow over ~10 merged PRs
**As the** product owner, **I want** Jev's four triage answers logged against real past diffs, **so that**
`verify-module` knows whether Jev can route verification depth.
Pick the ~10 most recent merged PRs that touched the outbox migrations/dispatcher or `packages/sdk/src/flags.ts`.
Ask Jev the four questions for each one: *diff touches spec? counterexample class? obligation difficulty?
verify depth?* Egress follows the existing explicit-choice rail, so if it isn't enabled, ask the product
owner before sending anything. Nothing gates.
**Acceptance:** `jev-triage.md` has one row per PR, four answers per row, the builder's own answer beside
each one, and a one-paragraph verdict on whether Jev's answers were usable.
**Risk:** low

### Story 1.4 — The written decision (`DECISION.md`)
**As the** product owner, **I want** one decision doc, **so that** `verify-module` can be shaped from evidence.
Answer: **(1) spec language**, and whether Quint is kept (TLA+ and Veil are listed as *not evaluated*, one
line each); **(2) tiers worth productizing** (model check / proof / differential test / trace validation /
Jev triage), yes or no for each; **(3) cost**, meaning estimated CI minutes per run from local timings plus
builder effort in sessions; **(4) findings**, meaning every violation, counterexample or disagreement
found, and each one's fix PR or bug seed.
**Acceptance:** each answer cites the artifact or timing it came from. The `verify-module` seed gets a
one-line pointer to the decision.
**Risk:** low

**Stretch (only if appetite remains):** trace validation. Run the dispatcher against **local Supabase**
with a sink forced down and then up, export `event_delivery_attempts`, and replay it as a Quint trace. No
prod reads.

**Fix policy:** fix inside the spike as a **separate PR**, tiered by its paths (delivery SQL/dispatcher →
`risk: high`, full review route; an SDK fix needs a version bump and a publish, which is Daniel's step).
If a fix would exhaust the appetite, it becomes a bug seed. A live data-loss bug is reported to the product
owner immediately.

## Sprint QA
- **api spec(s):** none for the spike itself. A fix PR carries the counterexample as its regression spec (a
  pure-logic spec on the touched `lib/` seam or `flags.test.ts`).
- **browser smoke owed:** no. Nothing renders.
- **deterministic gate:** the docs PR passes the usual gate (the spike adds no workspace packages or
  workflows). A fix PR passes `tsc --noEmit` + `npm run build` + Playwright `api`.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: a local checkout of `main` after the spike's docs PR merges. There are no URLs, because nothing deploys.

1. Open `Roadmap/09-platform-infra/verify-spike/DECISION.md`
   → it answers all four questions, and each answer links an artifact or a timing.
2. Run the Quint command from `REPRODUCE.md`
   → it prints the same result (no violation, or the recorded counterexample) in about the recorded time.
3. Run the Lean build command from `REPRODUCE.md`
   → it passes, with no `sorry` except the ones the decision lists.
4. Run the differential-test command from `REPRODUCE.md`
   → it reports the recorded case count and the recorded disagreements (0 or explained).
5. Open `jev-triage.md`
   → there are ~10 rows with four Jev answers each, the builder's answers beside them, and a verdict.
6. If the decision lists a found bug, open its fix PR or bug seed
   → it exists and carries the counterexample.

If any step fails, note the step number + what you saw — that's the bug report.
