---
status: in-progress # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: experiments-for-humans
build_order: 29      # integer position in the ONE global build sequence (carried from the seed; audit wave A)
title: "Experiments for humans — a guided five-question flow replaces the JSON textarea"
area: 01-growth-engine
risk: high
type: feature
appetite: L          # amended from M at the scope-doc gate (A1) — two waves, re-bet at the boundary
sprints_total: 4
stories_total: 11
---

# Epic: Experiments for humans

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/experiments-for-humans.md`](../../00-ideas/seeds/experiments-for-humans.md)

## Why

A product person can't build the simplest A/B test today without writing a 24-row JSON document and
then binding a flag by hand. The governance underneath is live and good (immutable versions, SRM, the
interval, the decision record). This epic gives it a way in for a human: five questions that arrive
already answered by a template, one plain sentence to check, a checklist the system computes, one
press to start, and a results page whose first line says whether you can call it. **Nothing on any
screen is typed.**

## The design is the contract

Daniel approved the clickable prototype on **2026-09-24 07:44 (America/Mexico_City)**:
[`apps/web/design-system/approved-prototype.html`](../../../apps/web/design-system/approved-prototype.html) (moved there byte-for-byte by Story 1.1; the handoff copy in this folder is gone)
(https://claude.ai/artifact/2MHJPipgJRHLT2tndtdmKx). Per WAYS-OF-WORKING step 1 (amended 2026-08-29),
**an approved design is scope**. Story 1.1 lands it in `apps/web/design-system/` with an approval
line and a content hash, beside the 33 pinned console states. Its new states replace the approved
`experiment-ready` / `experiment-blocked` detail layout and give the `ship-experiments` "+ New
experiment" door its room. Port from the prototype's class names (`reference.css` verbatim plus
`x-`-prefixed additions on the same tokens), never from prose.

Five deviations surfaced by the platform reframe were put to Daniel at the gate, and **all five were
decided in favour of the approved design** (seed → *Deviations*): store version names; keep "How many
of them"; one-of eligibility values; 3+ versions on multi-value features; a new feature inside the
builder. Those are why the appetite moved.

## Amendments

- **A1 (2026-09-24, Daniel, scope-doc gate): appetite M → L, two waves.** The five deviations above
  widen the live contract, so the work no longer fits one wave. **Wave 1 = Sprints 1–2** (contract,
  catalog, planner). **Wave 2 = Sprints 3–4** (builder, readout, retire). At the end of Sprint 2 the
  orchestrator **stops, reports and waits for the Wave 2 bet**. L is re-bet per wave, and an exhausted
  wave returns to shaping; it never extends in flight.
- **A2 (2026-09-24, Daniel, at the lock): the Wave 2 bet is placed by the epic-mode kickoff.** The
  kickoff asked for all four sprints in one run; asked directly whether A1's stop still applied,
  Daniel answered *"this kickoff is the bet"*. The run builds through Sprint 4 without stopping at
  the Sprint 2 boundary. A1's rule still stands for the *next* epic: a wave that exhausts returns to
  shaping.
- **A3 (2026-09-24, Daniel, at the lock): D2 = A, and the exposure is emitted from the SERVED
  binding.** The lock found that no app can emit an experiment's exposure unless its code hard-codes
  the experiment key and version (D2 below has the evidence). Daniel chose to serve the binding: the
  experiment's flag version names the experiment and its rules in `metadata`, the SDK reports which
  rule resolved, and one SDK helper derives the exposure. Cost accepted: an SDK minor release
  (0.6.0, published by Daniel — npm 2FA) and a one-time, generic wiring in each app.
- **A4 (2026-09-24, Daniel, at the lock): screenshot upload is deferred.** The approved version
  cards take a screenshot per version; the product has no file storage and the definition has no
  field for one. The cards ship without the upload control and without the prototype's example Miyagi
  screens (they would be wrong for every other tenant). Follow-up seed: *version screenshots*.
- **A5 (2026-09-24, Daniel, at the lock): the gate stays, and the architect owns its env.**
  `EXPERIMENT_BUILDER_ENABLED` is kept as D9 describes despite the 2026-08-31 "no flags" preference,
  because it guards writes into a customer's Production flags. It was created `false` in all three
  environments of the **`golden-beans`** Vercel project (not `golden-beans-demo`) on 2026-09-24,
  verified by pulling Production (`"false"`). Nothing about it is owed to Daniel.
- **A6 (2026-09-24, Daniel, at the lock): step 5 offers one start, "When I press Start".** The
  approved "Monday 28 Sep, 9:00" chip needs a scheduler the product does not have (Ship › Scheduled
  changes already says so). Dropped for now; scheduled start is a follow-up seed that rides with the
  scheduler. D7 says what Start does when a saved draft's dates no longer fit.

## Platform-first note

The platform already models all of it: `ExperimentDefinition` (hypothesis, assignment entity,
eligibility, variants + control, primary metric + direction, guardrails, segments, planned window,
minimum sample), immutable versions and lifecycle, flag definition versions with rules and rollout
basis points, the variant-set-equal binding RPC, exposure emission from flag telemetry, the governed
analysis and the decision record. **The epic adds one read** (the event catalog), **one pure
planner**, **one expand-only contract widening**, and the UI — and, since the lock (A3, D2, D7), **one
additive SDK minor** (the exposure follows the served binding) and **one function-only migration**
(an atomic, idempotent Save draft). AGENTS rule #1 holds: the catalog read
joins the canonical `events` read paths; nothing queries `events` ad hoc.

## What already exists (reuse, don't rebuild)

- **Contract:** `apps/web/lib/experiment-definition.ts` + DB check `private.experiment_definition_is_valid`
  (`apps/web/supabase/migrations/20260728100000_experiment_registry.sql`).
- **Experiment actions:** `app/app/experiments/[projectSlug]/actions.ts` — `createExperimentVersionAfterGate`
  (`lib/experiment-create-command.ts`), `transitionExperimentVersion` (`lib/experiments.ts`),
  `bindExperimentFlagVersion` (`lib/experiment-flag-bindings.ts`; RPC `bind_experiment_flag_version`,
  latest body in `20260807150000_fix_experiment_flag_binding_retry.sql`, enforces variant-set equality
  and one flag version per experiment version).
- **Flag writes:** `app/app/flags/[projectSlug]/actions.ts` — `createFlagDefinitionVersionAction`,
  `activateFlagAction` (per env, `FLAG_SERVING_ENABLED`); pure planners `packages/sdk/src/flag-commands.ts`
  (rollout / kill); `parseFlagDefinition`, `FLAG_CONTEXT_FIELDS`, `rollout.basisPoints`, `one_of`
  clauses (`packages/sdk/src/flags.ts`); rule bucketing hashes `[targetingKey, flagKey, version, priority]`.
- **New feature composition:** `lib/new-feature-draft.ts` + `new-feature.tsx` (the approved 33rd state).
- **Exposure path:** `packages/sdk/src/flag-telemetry.ts` — `flag_evaluated`, and the `experiment`
  field that emits `experiment_exposed`.
- **Analysis/readout:** `lib/experiment-analysis.ts` (SRM α 0.01, diagnostics, segments, `tagsMatch`),
  `lib/experiment-interval.ts`, `lib/experiment-analysis-query.ts`, `lib/experiment-blocker-words.ts`,
  `lib/experiment-list-view.ts`; `[experimentKey]/page.tsx`, `governance-detail.tsx`.
- **Decision record:** `recordExperimentDecisionAction` + `[experimentKey]/decision-recorder.tsx`.
  Immutable, owner-only, cannot mutate a flag. **Unchanged by this epic.**
- **Feature registry defaults:** `lib/feature-schema.ts` (`targetEvent` / `adoptedEvent`).
- **Canonical reads:** `lib/{tars,north-star,ab}-query.ts` (the `servedDaily` single-extra-pass
  precedent in `tars-query.ts`).
- **Design system:** `apps/web/design-system/` (`APPROVED.md`, `console-prototype.html`,
  `reference.css`, `measure-contract.mjs`, `route-manifest.ts`, `primitives.tsx`, `charts/`),
  `components/product/NewThingDialog`. DD4 chart colours: control grey, treatment blue, status
  green/red always with a word.
- **Gate convention:** `lib/flags.ts` (`=== 'true'` env gates, e.g. `isExperimentGovernanceEnabled`).

## Architecture — LOCKED by the architect on 2026-09-24 (before any builder started)

Each decision below was checked against the code on `main` at `f3e7d42` **and** against production
(Supabase `slweidgffcfndnskcskc`, Vercel project `golden-beans`) on 2026-09-24. Builders cite these by
number. They do not re-derive them, and a paraphrase is not the contract — the file named in each
decision is. Where the grooming proposal was wrong, the correction is said out loud.

### What production actually holds (the numbers the lock decided on)

| Fact | Value (2026-09-24) | What it decided |
|---|---|---|
| `experiment_definition_versions` | **6** rows (2 draft, 2 stopped, 2 decided), **4** carry scalar `eligibility.tags` | D1's widening is a strict superset, so all 6 stay valid |
| `experiment_decision_records` | **3** rows, all 3 snapshots carry scalar tags | The same CHECK guards them; same conclusion |
| `experiment_flag_version_bindings` | **1** | The bind RPC's variant-set equality is load-bearing and barely exercised |
| Latest flag versions | **86 boolean** (2 variants, 0 rules, ≤4 metadata entries) + **1 json** | D4 targets boolean features first; metadata has room for D2's 3 keys |
| Events, all tenants, all time | **~1,070**; busiest tenant in 14 days: **19** (`golden-beans`) | D11: a bounded read, no SQL function; Story 2.1 stays **low** |
| Events carrying any of the 5 segment tags | **1** of 1,068 | D6 check 3 will honestly fail any condition today; D5's breakdown default needs coverage it will not find |
| `experiment_exposed` from flag telemetry, non-scenario | **0, ever** | D2 — the exposure gap |
| `flag_evaluated`, `miyagisanchez`, 14 days | **1** | D6 check 1 will warn "telemetry off" on almost every feature today |
| Preview env | no Supabase, no `EXPERIMENT_GOVERNANCE_ENABLED`, no `FLAG_SERVING_ENABLED` | D13: no smoke can run on a preview |

### D1 — Contract widening: ONE expand-only migration, parser widened in the same PR *(verified; Story 1.2)*
Migration `apps/web/supabase/migrations/20260925100000_experiment_definition_widen.sql`
`CREATE OR REPLACE`s `private.experiment_definition_is_valid` (defined once, in
`20260728100000_experiment_registry.sql`; used by **two** CHECKs — `experiment_definition_versions.definition`
and `experiment_decision_records.definition_snapshot` — so one replacement widens both).
- `variants[].label` — optional; a string of 1–40 code points; no character in `[\x00-\x1F\x7F-\x9F]`
  (the exact Unicode `Cc` set, written as ranges so the DB answer cannot depend on the server's locale —
  the existing `[[:cntrl:]]` does); no leading/trailing character from the existing whitespace set
  (JS: `value.trim() === value`); not blank. When two or more variants carry labels, the labels are
  distinct.
- `eligibility.tags.<field>` — the existing scalar **or** an array of 1–20 **typed-distinct** scalars,
  each obeying today's scalar bounds (`"1"` and `1` are distinct, as `sameScalar` and jsonb already say).
- Nothing else moves. `CREATE OR REPLACE` keeps the function's ACL; the migration re-asserts it anyway
  (REVOKE from `PUBLIC, anon, authenticated`) and a spec asserts `has_function_privilege('anon', …)` is false.
- `parseExperimentDefinition` (`lib/experiment-definition.ts`) accepts exactly the same domain; the
  `ExperimentVariant` type gains `label?: string` and the tag type becomes `Scalar | Scalar[]`.
  `tagsMatch` (`lib/experiment-analysis.ts`) treats a list as one-of via the existing `sameScalar`.
  The read paths cast the stored JSON (they do not re-parse), so no reader needs a change.
- **Live verification without a production write** (a correction to Story 1.2's "insert on the
  fixture project"): after `apply_migration`, `select private.experiment_definition_is_valid(<fixture>)`
  for one legacy and one new-shape definition, plus `count(*) … where not
  private.experiment_definition_is_valid(definition)` = 0 over **both** tables, plus the anon privilege
  probe. A pure-function probe proves the same property as an insert and leaves nothing to clean up.

### D2 — "How many of them" and the exposure: the served binding *(decided, A3; Stories 1.3, 3.2)*
**The finding.** `trackFlagEvaluation` (`packages/sdk/src/index.ts`) emits `experiment_exposed` only when
the CALLER passes `experiment: { key, definitionVersion }`. The flag snapshot carries no binding (only
the scenario snapshot does), so today an app must hard-code each experiment's key and version, and
every "Change the plan" would need a deploy. Production agrees: every flag-driven exposure ever
recorded came from the scenario rail. A builder-started experiment would serve its split and record
nothing — the LEARNINGS "silent zero" class, the fifth time.
**The design (A).** Everything below lives in the SDK; old SDKs keep emitting exactly what they do today.
1. **The flag version names its experiment** in `definition.metadata` (scalar keys the parser already
   allows): `experiment_key`, `experiment_version`, `experiment_rules` (the experiment's rule
   priorities, comma-separated ascending, e.g. `"0,10"`). Written by Save draft (D7); removed by the
   rollout (D8). Production's largest metadata today is 4 entries of 16.
2. **The evaluator reports the rule that resolved**: `FlagResolutionDetails.rulePriority?: number`,
   present if and only if `reason === 'TARGETING_MATCH'`. Additive; evaluation itself is unchanged
   (same rule order, same hash tuple — `flags.test.ts` pins that).
3. **One pure helper** in `packages/sdk/src/flag-telemetry.ts`:
   `experimentForResolution(details) → { key, definitionVersion } | undefined` — defined only when the
   metadata names an experiment AND `rulePriority` is one of `experiment_rules`. Held-out people fall
   through to the served default, so they resolve `STATIC` (or through a non-experiment rule) and emit
   plain `flag_evaluated`. That IS the holdout.
4. **The exposure carries the eligibility tags.** `FlagEvaluationTelemetryInput` gains optional
   `segments` (any of `source · channel · campaign · plan · region`, scalar, the definition's predicate
   bounds), copied into the event's `tags` on both paths. Without it every exposure of an experiment
   with conditions is rejected as `eligibility_mismatch` (LEARNINGS, fourth instance) and every
   breakdown reads empty, because `computeCore` joins eligibility and segments on the EXPOSURE's tags.
5. SDK **0.6.0** (minor: additive only). Publishing is Daniel's npm 2FA step, owed before an app
   can adopt it; nothing in `apps/web` imports a published SDK, so the app side does not wait on it.
**Every arm gets its own rule** — a correction to the grooming D4, which gave control a rule only when
allocation < 100%. Under A an in-test control person must resolve through an experiment rule or they
emit no exposure; control falling through to the default would leave the control arm empty.

### D3 — One pure planner: `apps/web/lib/experiment-builder-plan.ts` *(verified; Story 2.2)*
Zero imports beyond pure modules (`experiment-definition`, `@golden-frijoles/sdk`'s pure `flags` /
`flag-commands` / `rollout-percent`), the same shape as `flag-commands.ts`. Input: the builder's answers,
the currently served flag definition (or none, for a new feature), the event catalog (D11) and `now`.
Output: the `ExperimentDefinition` (passes `parseExperimentDefinition`), the flag definition version
(passes `parseFlagDefinition`), estimated days, need per version, recommended weeks, the six checks
(D6), the plan sentence and the hypothesis sentence. It stays in `apps/web` because the contract does.
The four templates are data in `lib/experiment-templates.ts`. Unit specs run under `npm run test:unit`
(the pure-module runner), not Playwright.

### D4 — The experiment's flag version *(corrected; Story 2.2)*
The served definition, plus the experiment's rules **at the top**: experiment rules take priorities
**`0, 10, 100, 1000`** (one per arm, at most four) and every served rule is shifted by `+10000`, order
preserved (refused if that would pass the 1,000,000 ceiling; production has no rules at all today). A
new definition version re-buckets every rollout anyway, because the version is in the hash tuple.
⚠️ **Corrected during Story 1.3 (2026-09-24), by the spec, not by review.** The lock first said
`0…k−1`. The holdout spec came back at 45 % in-test instead of 50 %: FNV-1a's high bits barely move
when only the LAST digit of the hashed tuple changes, so rules at priorities 0 and 1 admit strongly
correlated people (measured joint admission 0.35 vs 0.25 independent, on random UUIDs), and the
stacked formula below assumes independence. Priorities whose decimal strings differ in LENGTH are
independent (0/10: 0.2496 vs 0.2489). Measured over 400k keys, 3 id shapes, 3 flag keys, 3 versions,
2–4 arms and allocations 1 / 0.5 / 0.1: worst deviation 0.23 pp. The SDK's hash is the public
rollout-compatibility contract and does not change; the planner picks priorities that make it safe. One rule per arm, **including control** (D2).
Each rule carries the eligibility clauses (`equals` for one value, `one_of` for several) and a
**stacked** rollout: with allocation *a* and normalised weights *wᵢ*, arm *i* gets
`bpᵢ = round(10000 · a·wᵢ / (1 − Σⱼ<ᵢ a·wⱼ))`; the last arm is `10000` when *a* = 1 (no rollout key).
Rules hash independently (the tuple includes the priority), so admission compounds correctly.
Variants: the flag version's variant set must **equal** the experiment's (the bind RPC enforces it):
- **boolean feature** → exactly two arms, keys `off`/`on` as the served definition has them; control is
  the served default's variant; version names ride in `label` (D1). "Add a version" is not offered.
- **new feature** (created by Save draft) → a `string` flag whose variant keys are the slugs of the
  version names, values equal to the keys, default = control; 2–4 versions.
- **existing string/number/json feature** → the arms are the served definition's variants, all of
  them, fixed (no add/remove). Production has one such flag.
Warnings (never fails): a served rule whose clauses could admit an eligible person means *held-out*
people may not see control's value. Property test: over 100k keys, simulated arm shares within
0.5 pp of `a·wᵢ` and held-out share within 0.5 pp of `1 − a`.

### D5 — Template defaults resolve against THIS project's catalog, always shown as "suggested" *(verified)*
Primary metric: the bound feature's `adoptedEvent` from the registry (`lib/feature-schema.ts`) if
declared and present in the catalog; else the template's name pattern; else the most frequent event.
Guardrails: catalog events matching `abandon|cancel|refund|ticket|error|fail|slow`. Breakdown: the
template's field **only if** its coverage ≥ 50% — today that is never, so the default is no breakdown
and the step says why. A template never invents an event the catalog does not contain; an empty
catalog is an honest empty state ("Your product hasn't sent any events in 14 days").

### D6 — The six checks *(verified; Story 2.2 computes, Story 3.2 renders)*
1 **feature exists** (fail if the flag has no Production activation and was not created by this
draft; a feature created by this draft fails "no code checks it yet" and can still be saved) · **warn**
if no `flag_evaluated` for its key in Production in 24 h. · 2 **every metric arrived in 24 h** (fail). ·
3 **eligibility tags on recent events** (fail < 10 %, warn < 90 %, per condition, worst wins). ·
4 **split adds up** (fail). · 5 **planned window long enough**, measured from **now** for a saved draft
(fail, one-click fix = the recommended weeks, or "Plan from today" when the saved window has started —
A6). · 6 **SRM armed** (always ok). **Fail blocks Start, never Save draft.** The checks read only the
catalog and the served flag state, which the page already loaded — no I/O in the planner.

### D7 — Save draft is ONE transactional function; Start is ordered writes with an honest partial state *(corrected; Stories 3.2, 3.3)*
The grooming said "one idempotent server action". Four writes (new flag registry when asked, experiment
version, flag version, binding) cannot be atomic or double-submit-safe from a server action — a second
click between writes creates a second version. So Story 3.2 adds a **function-only, expand-only
migration**: `save_experiment_draft(p_project_id, p_experiment_key, p_definition, p_flag_key,
p_flag_definition, p_actor_user_id)`, `SECURITY DEFINER`, owner-only, `pg_advisory_xact_lock` on
`project:key` (the lock `create_experiment_version` already takes), idempotent on **jsonb equality** of
both definitions against the latest draft for the key, composing the existing
`create_experiment_version`, `create_flag_definition_version` and `bind_experiment_flag_version` inside
one transaction. REVOKE from `PUBLIC, anon, authenticated`, GRANT `service_role`; the grant spec asserts
a *function-level* denial. The flag version it writes carries D2's metadata, so the experiment version
number must exist first — the function orders it that way. Nothing is activated.
**Start** (server action, owner-only, gate-checked): (0) if the draft's window no longer fits (D6 check
5), Save first with the window re-dated from now — a new version, bound, still inert; (1)
`transitionExperimentVersion → running`; (2) `activateFlagAction` semantics (`setFlagActivation`) for the
bound flag version in **Production**, with the snapshot revision read immediately before. Order is (1)
then (2) so exposures can never arrive for a version that is not running. If (2) fails, the page says
**"Running, but the split isn't serving yet"** with a retry that repeats (2) only. `FLAG_SERVING_ENABLED`
must be on (it is, in Production) or Start refuses before (1).

### D8 — "Roll out to everyone" is a separate flag write after the decision *(verified; Story 4.2)*
`recordExperimentDecision` requires a **stopped** version (RPC: *"initial decision requires an
undecided stopped experiment"*), so the decide flow is three writes, each with its own confirmation
state: stop → record (existing RPC, unchanged, cannot touch a flag) → roll out. The rollout definition
is `planFlagSet` (`packages/sdk/src/flag-commands.ts`) applied to the served definition **after**
stripping the experiment's rules and its three metadata keys (a pure `stripExperiment` in the planner;
without it `planFlagSet` would carry the split forward, because it preserves rules by design). Undo (10 s)
re-activates exactly the version that was serving before the rollout; it cannot touch the decision
record, which is immutable. The decide modal is chips only (outcome + reason); the reason chip's text
is the rationale. **Corrections** (record kind `correction`, superseding the current record) move to the
same chip modal, so retiring the recorder's `<textarea>` loses no capability.

### D9 — The gate: `EXPERIMENT_BUILDER_ENABLED`, enablement polarity, kept as a kill-switch *(verified, A5)*
`isExperimentBuilderEnabled()` in `lib/flags.ts`, `=== 'true'` like its siblings. Seam: the dialog's
content and every new server action (`requireBuilderGate()`, checked before ownership, the same order
`activateFlagAction` uses). Created `false` in Production, Preview and Development on 2026-09-24.
Production flips at 4.3 by env change **plus** a commit to `main` (LEARNINGS: env vars reach running
functions only on a new deployment). After 4.3, off means "+ New experiment" is drawn **blocked, with
the reason** ("Creating experiments is paused"), never hidden. CI: ON for the main server and the test
process; the gate-off spec runs on the `:3100` differently-enved server (the shape `ci.yml` already
uses).

### D10 — Assertions that can fail on a bad-looking page *(verified; Stories 3.1, 4.1)*
Builder: six step buttons with the approved labels, per-step primary action words
(`Continue`×4, `Review`, `Start experiment`), **zero** `<textarea>`, **zero** text-like `<input>`
(`range` and none else), **zero** `<details>`, the review sentence present, the checklist row count = 6.
Results: the ordered block sequence (answer → lift card + verdict → KPI tiles → "How sure we are" +
"Who saw what"). Plus one **rendered look** per UI sprint at 360 px and 1360 px, read by a person and
recorded in the sprint file — budgeted as a step, not a courtesy.

### D11 — The event catalog: a bounded read + a pure aggregation, no SQL function *(decided from live counts; Story 2.1)*
`lib/event-catalog.ts` (pure, zero-import) aggregates; `lib/event-catalog-query.ts` reads the project's
events from the last 14 days, `project_id`-scoped from the resolved membership, selecting only
`event, tags, subject_type, subject_id, created_at`, capped at **50,000** rows newest-first. Past the
cap the catalog says `truncated: true` and every figure says "at least" — a thin number never
pretends to be a whole one. The busiest tenant sent 19 events in 14 days, so the cap is ~2,600× the
live peak; a SQL aggregate is the upgrade path when a tenant approaches it, not today's cost. The
catalog joins AGENTS rule #1's canonical-read table in the same PR.

### D12 — The approved prototype lands as a SECOND design source *(corrected; Story 1.1)*
The harness (`approved-states.mjs`, `render-reference.mjs`, `state-contract.mjs`, `extract-css.mjs`) is
hard-wired to `console-prototype.html`. The new states run inside `approved-prototype.html`, which has
its own globals, so Story 1.1 teaches the registry a per-state **source** and gives the new states their
own evaluation functions (`boot` hashes `#review`, `#results`, `#decided`, `#list` already exist).
`extract-css.mjs` gains a second output, `reference-experiments.css`: everything in the new
prototype's stylesheet after its verbatim copy of `reference.css` (the prefix is asserted), with the
same `--check`. Like `reference.css` it is a porting reference, never imported — product CSS is
ported by hand under `.ds`. *(Corrected while building 1.1: the lock first called it `experiments.css`
and implied the product would import it.)* The block vocabulary gains six pairs (`builder-steps`,
`builder-panes`, `results-tabs`, `results-top`, `results-kpis`, `results-two`); the day picker
(`.x-proto`) is reviewer chrome and joins the annotation selector. `console-prototype.html` is untouched and its hash `5bc7e24ed5e3d0aa`
still holds. The new file's hash is **`0f7c5be3c9c316e4`**.

### D13 — Where each smoke can actually run *(corrected)*
Previews have no Supabase and no governance/serving gates (`vercel env ls preview`, 2026-09-24), so
Sprint 3's "smoke on a preview with the gate on" cannot happen. The builder is exercised by the local
authed rail with the gate on, then in **Production** after the gate flips at 4.3. Sprint 1's walkthrough
named `seller_welcome_email`, which is prototype example data; production's experiments are
`founding-message-v2` and `fundadoras_promise_cta` (`miyagisanchez`).

### D14 — Where each contract lives, once
| Contract | Its one home |
|---|---|
| The experiment definition | `lib/experiment-definition.ts` + `private.experiment_definition_is_valid` |
| Eligibility / segment matching | `tagsMatch`, `lib/experiment-analysis.ts` |
| A flag definition, its rules and rollout | `packages/sdk/src/flags.ts` (`parseFlagDefinition`, `evaluateFlag`) |
| Which rule is an experiment's | D2 metadata keys, read by `experimentForResolution` |
| Rollout / kill / set | `packages/sdk/src/flag-commands.ts` |
| Answers → definition + flag version + checks + sentences | `lib/experiment-builder-plan.ts` |
| Template data | `lib/experiment-templates.ts` |
| What the product sends | `lib/event-catalog.ts` (+ `-query.ts`) |
| The decision record | `record_experiment_decision` RPC (unchanged) |
| The approved look | `design-system/approved-prototype.html` @ `0f7c5be3c9c316e4` |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| **Wave 1** · Sprint 1 — Widen the contract | 1.1 Land the approved prototype as design states | low |
| | 1.2 Version labels + one-of eligibility (one expand-only migration) | **high** |
| | 1.3 Holding people out (D2) | **high** |
| **Wave 1** · Sprint 2 — Event catalog and the planner | 2.1 The event catalog read | low (high if the lock needs a SQL function) |
| | 2.2 The pure planner | low |
| **Wave 2** · Sprint 3 — The builder | 3.1 Steps 1–5 + live panel behind the gate | low |
| | 3.2 Review + computed checks + Save draft | **high** |
| | 3.3 Start | **high** |
| **Wave 2** · Sprint 4 — Readout, decide, retire | 4.1 Decision-first Results + Plan tabs | low |
| | 4.2 Decide → separate "Roll out to everyone" | **high** |
| | 4.3 Flip the gate on, retire the JSON textarea | low |

**Model routing (locked, amended from the grooming proposal).** The architect (Claude Opus 5.5, the
coordinating session) builds **all of Sprint 1** (1.1 is shared design-harness surface; 1.2 is the
migration; 1.3 is the SDK contract), **Story 2.2** (the planner is the seam every Wave 2 story imports —
grooming routed it mid-tier; WAYS-OF-WORKING says a `lib/` seam several stories import is done first
and by the architect), and **Stories 3.2, 3.3 and 4.2** (a migration and writes into a customer's
Production flags) — never delegated. **Mid tier** (Codex `gpt-5.6-terra`, `scripts/codex-task.mjs
--tier build`, or a Sonnet subagent when Codex is unavailable) builds **2.1, 3.1, 4.1 and 4.3** against
this lock, each in its own worktree, and the architect verifies each by re-deriving the tree. Review
follows `scripts/review-route.mjs`: two external families that did not build the diff, plus the fresh
`pr-reviewer` subagent on every HIGH-tier PR (all four sprint PRs are HIGH: S1 migration + SDK, S2 a
shared seam, S3 a migration + Production writes, S4 Production writes).

## Found during the build, outside this epic's scope (follow-ups, not fixed here)

- **`lib/tars-query.ts` and `lib/ab-query.ts` read `events` with no paging.** PostgREST returns at most
  `max_rows` (1,000 on hosted Supabase) per request, so a tenant with more rows than that in a window
  gets an undercount with no error. Found while reviewing Story 2.1, whose catalog read now pages
  (`lib/event-catalog-read.ts`). Production is far below 1,000 today (busiest tenant: 19 events in 14
  days), which is why nothing shows it yet.
- **`lib/flag-registry.ts` builds `.in('flag_id', ids)` over every flag in a project.** At ~200 flags the
  request URL overflows ("URI too long") and the flags page and CLI reads 500. Reproduced locally on an
  accumulated fixture project (210 flags); production's largest project has 43.

## Deploy order (locked)

1. **S1:** `20260925100000_experiment_definition_widen.sql` applied to production through the Supabase
   MCP `apply_migration` **before** the S1 PR merges, then D1's live probes. SDK 0.6.0 is built and
   versioned in the S1 PR; **publishing it is Daniel's npm 2FA step**, and it gates only app adoption.
2. **S2** merges with no production mutation (pure planner + a read).
3. **S3:** `save_experiment_draft` migration applied before the S3 PR merges. The builder merges dark
   (`EXPERIMENT_BUILDER_ENABLED=false`, created 2026-09-24).
4. **S4:** the decide/rollout flow merges dark; then Production flips to `true` (env + a commit to
   `main`), verified by opening the dialog on goldenfrijoles.com, then 4.3's retirement merges.
5. Daniel's production smokes: Start (S3 step 6) and the rollout (S4 step 4) write a customer's
   Production flag — owed to Daniel by name.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — D9):** `EXPERIMENT_BUILDER_ENABLED` exists in every Vercel
      env with enablement polarity (born `false`), is `true` in Production after 4.3, and switching it
      off draws "+ New experiment" as blocked with its reason. *Verify-only.*
- [ ] The migration from 1.2 is applied in production (not only written), and the approved design
      states are hash-pinned in `APPROVED.md`
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
