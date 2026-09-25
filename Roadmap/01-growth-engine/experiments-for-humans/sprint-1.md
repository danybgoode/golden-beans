# Experiments for humans — Sprint 1: Widen the contract

**Status:** ✅ shipped 2026-09-24 — danybgoode/golden-beans#167, squash `7f81540`, production deploy succeeded; migration applied + D1 probes live (PR comment). Owed to Daniel: SDK 0.6.0 publish; the migration's `schema_migrations` row · **Wave 1** · branch `feat/experiments-for-humans` · strongest tier, never delegated

## Build contract (locked by the architect before the builder started)
Cite the README's D-numbers; do not restate them. Builder: the architect (never delegated).

- **1.1 → D12.** Copy `approved-prototype.html` byte-for-byte to `apps/web/design-system/`; hash
  SHA-256 prefix `sha256-0f7c5be3c9c316e4`. `APPROVED.md` gets a 6th batch row and an approval line. `approved-states.mjs`
  learns a per-state `source` (default `console-prototype.html`); the five new states evaluate inside
  the new file (`wizard-new-experiment` = boot at step 1, `wizard-new-experiment-review` = `#review`,
  `experiment-results` = `#results` at day 3 (gathering), `experiment-results-ready` = day ≥ planned,
  `experiment-decided` = `#decided`). `experiment-ready` / `experiment-blocked` stay registered and
  are marked **superseded** (by `experiment-results*`) in `APPROVED.md`, not deleted — their routes
  still render them until Sprint 4. `extract-css.mjs` emits `reference-experiments.css` (the
  prototype's additions after its verbatim copy of `reference.css`, which it asserts) and `--check`
  covers it. The handoff copy in this folder is deleted in the same commit.
  `route-manifest.test.ts`' batch/approval agreement stays green.
- **1.2 → D1.** Migration `20260925100000_experiment_definition_widen.sql` (CREATE OR REPLACE only;
  re-REVOKE; no table change). Fixtures in ONE module, fed to both the parser and the DB function
  (`e2e/experiment-definition-widen.spec.ts`), including: legacy byte-identical round trip, label at
  40 and 41 code points, `U+0085` and `U+007F` in a label, leading space, duplicate labels, a
  21-value list, `["1", 1]` (distinct), `[1, 1]` (not), an empty list, a nested list. Analysis spec:
  scalar, list, missing tag, wrong type. Applied to production before merge; D1's three live probes.
- **1.3 → D2.** SDK only: `rulePriority` on `FlagResolutionDetails`, `experimentForResolution`,
  `segments` on `FlagEvaluationTelemetryInput`, version 0.6.0 + README section + CHANGELOG line.
  Specs: `packages/sdk/src/flag-telemetry.test.ts` + `flags.test.ts` (unit), and
  `e2e/experiment-holdout.spec.ts` (api): 10,000 synthetic subjects through `evaluateFlag` on a D4-shaped
  definition (allocation 50 %, 50/50) → the telemetry payloads the SDK WOULD send → the governed
  analysis. Held-out subjects produce no exposure; SRM `clear`; a deliberately broken variant that
  emits held-out exposures reads `detected` or `eligibility_mismatch`, observed red once. The old path
  (caller passes `experiment` by hand, no `segments`) is byte-identical to today (spec on the request
  body). D4's planner does not exist yet, so the spec builds its D4-shaped definition by hand from the
  formula; Story 2.2's property test is where the planner is held to it.
- **Deviations from the stories as groomed:** 1.2's live verification is a pure-function probe, not a
  production insert (D1). 1.3's design is A with the served binding (A3), and it adds `segments`
  (D2.4), which the groomed story did not name. No UI in this sprint.

## Stories

### Story 1.1 — Land the approved prototype as design states
**As** the builders of this epic, **we want** the approved prototype to live in the product's design
home, hash-pinned, **so that** every later story is checked against the design Daniel approved, not
against a description of it.
**Acceptance:**
- [`approved-prototype.html`](../../../apps/web/design-system/approved-prototype.html) copied into `apps/web/design-system/`
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
Env: production · https://goldenfrijoles.com (sign in as the `miyagisanchez` owner)

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez
   → The page loads exactly as before: the list, "+ New experiment", and `founding-message-v2` and
   `fundadoras_promise_cta` both reading Decided.
2. Open `fundadoras_promise_cta`.
   → Its results and its recorded decision read exactly as before (legacy definitions still parse).
3. (migration, owed to Daniel by name) In the Supabase dashboard for `golden-beans`
   (`slweidgffcfndnskcskc`) › Database › Migrations, find `20260925100000_experiment_definition_widen`.
   → It is listed, and its time is before the merge time of the Sprint 1 PR.
4. (SDK, owed to Daniel by name) Publish `@golden-frijoles/sdk@0.6.0` (`npm publish` from
   `packages/sdk`, 2FA), then run `npm view @golden-frijoles/sdk version`.
   → It prints `0.6.0`.

If any step fails, note the step number + what you saw — that's the bug report.
