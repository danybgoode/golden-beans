# Experiments for humans — Sprint 1: Widen the contract

**Status:** ⬜ not started · **Wave 1** · branch `feat/experiments-for-humans` · strongest tier, never delegated

## Build contract (locked by the architect before the builder started)
<!-- The architect fills this in the lock: D1 and D2 verified against live code AND live data
     (row counts of experiment_definition_versions; every SDK call site passing `experiment:`), the
     D2 choice (A or B) with its reason, and every deviation from the README named. Cite, don't restate. -->
- D1 — _to be verified_
- D2 — _to be decided (A recommended); cross-panel offered_

## Stories

### Story 1.1 — Land the approved prototype as design states
**As** the builders of this epic, **we want** the approved prototype to live in the product's design
home, hash-pinned, **so that** every later story is checked against the design Daniel approved, not
against a description of it.
**Acceptance:**
- [`approved-prototype.html`](approved-prototype.html) (in this folder — a handoff copy; Story 1.1 moves it into the product and this copy is deleted) copied into `apps/web/design-system/`
  unchanged, with an approval line in `APPROVED.md` (Daniel, 2026-09-24 07:44 America/Mexico_City,
  SHA-256 first 16).
- The new states are named and registered: `wizard-new-experiment` (steps 1–5), `wizard-new-experiment-review`,
  `experiment-results` (gathering), `experiment-results-ready`, `experiment-decided`. `experiment-ready`
  and `experiment-blocked` are marked superseded (not deleted) with a pointer.
- `measure-contract.mjs` / `extract-css.mjs` regenerate cleanly; `--check` green.
**Risk:** low

### Story 1.2 — Version labels and one-of eligibility (one expand-only migration)
**As** a product person, **I want** my versions to keep their names and a condition to accept
several values, **so that** results read "New copy is ahead" and "Mexico or Colombia" is one condition.
**Acceptance:**
- One migration `CREATE OR REPLACE`s `private.experiment_definition_is_valid` to accept optional
  `variants[].label` (1–40 code points, no control chars) and list-valued `eligibility.tags.<field>`
  (1–20 distinct scalars). Grants unchanged (checked, not assumed).
- `parseExperimentDefinition` accepts exactly the same domain, and a spec feeds the same fixtures to
  both (parser and a DB round-trip on the fixture project).
- `tagsMatch` treats a list as one-of. Analysis specs cover scalar, list, missing tag and wrong type.
- A legacy definition (no labels, scalar tags) round-trips byte-identical.
- Migration applied to production **before** merge; verified live with one legacy row and one new-shape insert on the fixture project.
**Risk:** high

### Story 1.3 — Holding people out ("How many of them")
**As** a product person, **I want** to put only a share of eligible people into the test, **so that**
I can start small without the people left out being counted as control.
**Acceptance (whichever of D2's designs the lock picks):**
- On a fixture, with allocation 50% and a 50/50 split, held-out subjects are served control's value
  and produce **no** `experiment_exposed`. Exposed subjects split 50/50 within the in-test half.
- SRM on the fixture reads `clear`. A deliberately broken fixture (held-out exposures emitted) reads
  `detected` or `eligibility_mismatch`, **observed failing once**.
- Existing SDK callers that never set allocation behave exactly as today (spec on the old path).
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/experiment-definition-widen.spec.ts` (1.2), `e2e/experiment-holdout.spec.ts`
  (1.3), SDK unit spec for the telemetry branch (if D2 = A). Design contract `--check` (1.1).
- **browser smoke owed:** no (no UI yet).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge;
  every new spec observed red once via a deliberate mutation.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez
   → The page loads exactly as before: the list, "+ New experiment", the two decided experiments.
2. Open `seller_welcome_email` from the list.
   → Its results and its recorded decision read exactly as before (legacy definitions still parse).
3. (migration, owed to Daniel by name) In Supabase, confirm the migration from Story 1.2 is listed as
   applied in production.
   → It's there, and its timestamp is before the merge time of the Story 1.2 PR.

If any step fails, note the step number + what you saw — that's the bug report.
