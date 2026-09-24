---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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
[`approved-prototype.html`](approved-prototype.html) (in this folder — a handoff copy; Story 1.1 moves it into the product and this copy is deleted)
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

## Platform-first note

The platform already models all of it: `ExperimentDefinition` (hypothesis, assignment entity,
eligibility, variants + control, primary metric + direction, guardrails, segments, planned window,
minimum sample), immutable versions and lifecycle, flag definition versions with rules and rollout
basis points, the variant-set-equal binding RPC, exposure emission from flag telemetry, the governed
analysis and the decision record. **The epic adds one read** (the event catalog), **one pure
planner**, **one expand-only contract widening**, and the UI. AGENTS rule #1 holds: the catalog read
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

## Architecture decisions — PROPOSED at grooming (the lock verifies each against live code + live data, or amends it out loud)

### D1 — Contract widening is ONE expand-only migration, and the parser widens in the same PR
`variants[].label`: optional string, 1–40 code points, no control characters.
`eligibility.tags.<field>`: a scalar **or** a list of 1–20 distinct scalars (one-of). The check
function is `CREATE OR REPLACE`d (never `DROP` + `CREATE`, which restores PUBLIC EXECUTE). Every
existing row is valid by construction. `parseExperimentDefinition`, `tagsMatch` in
`experiment-analysis.ts` and the decision-snapshot path accept exactly the same domain as the DB check.
Applied **before** merge and verified live.

### D2 — Holding people out: rule-scoped exposure (recommended), decided in the lock
"How many of them" < 100% means eligible people who get control's *value* but **emit no exposure**.
**Recommended (A):** the experiment owns named rules in its flag version, and `flag-telemetry` emits
`experiment_exposed` only when the resolving rule is one of them. Everyone else emits plain
`flag_evaluated`. **Alternative (B):** a declared `holdoutVariantKey` (a third variant carrying
control's value) that analysis and the bind RPC treat as "not in test". The architect picks against
the live SDK call sites and **offers the cross-panel** (`node scripts/cross-panel.mjs <this README>
--lens both --agent codex`), because this is a new-primitive / expensive-to-reverse fork.

### D3 — One pure planner, in `apps/web/lib/experiment-builder-plan.ts`
Input: the builder's answers plus the currently served flag definition plus the catalog. Output: the
`ExperimentDefinition`, the flag definition version to write, days, need per version, the six checks
and the plain sentence. Zero I/O, the same shape as `flag-commands.ts`. It lives in `apps/web` because
the contract does; moving the contract into the SDK is the future `gf experiments create` seed's first
story, not this epic's.

### D4 — The flag version = the served definition plus the experiment's rules at top priority
Eligibility clauses (`equals` or `one_of` over `source · channel · campaign · plan · region`). One rule
per non-control arm, with **stacked** rollouts: arm *i* gets bp_i = a·w_i / (1 − Σ earlier a·w)
(allocation *a*). Control is served explicitly to the in-test share when a < 1 (D2). Everyone else
falls through to the served default. Other served rules that could catch eligible people first
produce a checklist **warning**. Property test: simulated shares within 0.5 pp of the declared weights
over 100k keys.

### D5 — Template defaults are resolved against THIS project's catalog, and always shown as "suggested"
Primary metric = the bound feature's `adoptedEvent` if declared; else a name pattern per template
role; else the most frequent up-event. Guardrails match
`abandon|cancel|refund|ticket|error|fail|slow`. Breakdowns = the template's field if the catalog shows
coverage ≥ 50%.

### D6 — The six checks, and what blocks
1 feature exists in Production (**fail** if not; **warn** if no `flag_evaluated` in 24 h: telemetry
off) · 2 every metric arrived in 24 h (**fail**) · 3 eligibility tags on recent events (**fail**
< 10%, **warn** < 90%) · 4 split adds up (**fail**) · 5 planned window ≥ estimate (**fail**, one-click
fix) · 6 SRM armed (always ok). **Fail blocks Start, never Save draft.**

### D7 — Save draft is inert; Start is two ordered writes with an honest partial state
Save draft = experiment draft version + flag version (not activated) + binding (+ the new feature, when
chosen) in one idempotent server action keyed on (project, experiment key, definition hash). Start =
(1) transition → `running`, then (2) activate the bound flag version in Production. If (2) fails, the
page says "running, but the split isn't serving yet" with a one-click retry. The lock confirms the
order against `transitionExperimentVersion` and `activateFlagAction`.

### D8 — "Roll out to everyone" is a separate flag write after the decision
The decision recorder stays structurally unable to touch a flag. After a decision, the verdict card
offers the rollout (or turn-off) through the `flag-commands` planner, in its own confirmation.

### D9 — The gate: `EXPERIMENT_BUILDER_ENABLED`, born OFF, stays as a kill-switch
Enablement polarity: `false`, created disabled in every Vercel env. Seam = the dialog's content plus
every new server action (`requireBuilderGate()`). Flipped on in Production at 4.3. After the JSON
textarea is retired it stays as the kill-switch: off means "+ New experiment" is drawn **blocked,
with the reason**, never hidden.

### D10 — Contract assertions that can fail on a bad-looking page
Builder: step count and labels, per-step primary action words, **zero** `<textarea>`, **zero** text
`<input>`, **zero** `<details>`, the review sentence present, checklist row count. Results: the ordered
block sequence (answer → lift card + verdict → KPI tiles → interval + who saw what). Plus one
**rendered look** per sprint, budgeted as a step (LEARNINGS 2026-09-10).

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

**Model routing (proposed):** Sprint 1 and Stories 3.2, 3.3 and 4.2 on the strongest tier (contract,
migration, flag writes in a customer's Production), never delegated. 2.1, 2.2, 3.1, 4.1 and 4.3 to the
mid tier against the locked contract. The riskiest PR (1.2 + 1.3) gets the fresh reviewer on the
strongest tier.

## Deploy order

1. **1.2's migration applied to production before its PR merges** (expand-only; verify one legacy row
   still parses and one new-shape row is accepted, live).
2. SDK change for D2 (if A) published before any app code depends on it. Old SDKs keep emitting
   exactly what they do today.
3. Sprints 2–3 merge dark behind `EXPERIMENT_BUILDER_ENABLED=false` (created in every env first).
4. Sprint 3 smoke on a preview with the gate on → Daniel's production smoke with the gate on for
   production → 4.3 retires the JSON textarea.

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
