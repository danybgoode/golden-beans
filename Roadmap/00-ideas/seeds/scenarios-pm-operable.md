---
title: "Scenarios made PM-operable — define, launch, and kill a chaos/secops scenario from the UI"
slug: scenarios-pm-operable
status: scaffolded
area: "01"
type: feature
priority: "wave-2026-08-08"
appetite: M
underwritten_by: null
risk: high
epic: "01-growth-engine/scenarios-pm-operable"
build_order: 16
updated: 2026-08-08
---

# Pitch — Scenarios, from a read-only log to the tool PRD-G describes

> **Class:** Feature · **Lane:** shaped bet · **Risk:** high
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.4, §6.4, §7 (P1); PRD-G E1/E3.
> **Verified against live `main`, 2026-08-08** — see *What already exists*.
> **Shaped and scaffolded, NOT yet underwritten.** `underwritten_by: null` is the honest state: the
> docs are ready so the next betting table is a three-line decision rather than a fresh groom.

## Problem

`app/app/scenarios/[projectSlug]/page.tsx` is 287 lines rendering **six stacked HTML tables** —
registered targets, recent runs, defensive-simulation results, canonical product-impact evidence,
circuit-breaker policies, immutable breaker trips — and declares itself read-only operating evidence.

The audit calls chaos + secops the product's clearest whitespace (§3.3: neither PostHog nor
GrowthBook has it at all), and today it is the **least** PM-operable surface in the product: an
inspection console for scenarios an agent already ran over the API. The PM can read that a
resilience probe happened. They cannot cause one, and they cannot stop one. PRD-G Requirement E1
asks for a PM to *define* a scenario and watch the downstream TARS impact; E3 asks for the impact to
be legible as a comparison, not a row.

The gap is not capability. Every operation this pitch surfaces **already exists, validated, in
`lib/`** — it has simply never been given a screen.

## Appetite

**M — one wave.** Justified by the same fact that justified #15: the scenario grammar is a set of
small closed enums with hard numeric bounds, all parsed server-side today. The UI is a bounded form
plus a confirmation plus a chart — not a chaos-engineering console.

**Circuit breaker:** named in the raw seed and still the right one — if the propose/confirm surface
starts growing beyond "define, launch, kill", stop and return to shaping. The approval workflow
(`approve_definition` with its two approval kinds) is the most likely place that happens.

## Outcome & signal

**What's true after:** a PM defines a resilience or security scenario from a form that cannot
produce an invalid definition, launches a run against a verified target, watches its impact as a
control-vs-treatment comparison, and stops it with a button that names what it will stop.

**How the product owner tests it:** define a `synthetic`-cohort delay scenario, launch it, watch the
impact chart populate, then hit the kill switch and confirm the run stops and the breaker trip is
recorded immutably.

## Stage-2.5 bucket

**Genuinely new as a surface; already-possible as a capability.** Bucket 1 and bucket 3 at once, and
saying so matters: an agent with a scoped credential can already do every one of these things over
the API today. What is missing is the *human* affordance. That framing keeps the epic honest — it is
a rendering job over an existing operation set, and any story that needs a new backend operation is
out of scope by construction.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| Define-a-scenario form: kind · cohort · fault · limits · guardrails | Every one of these is a closed enum or a bounded integer. A form over them cannot produce an invalid definition |
| Reuse `RuleBuilderRow` from #15 for targeting | The raw seed's instinct, and it survives verification: a PM learns the targeting pattern once, in Flags, and re-uses it here |
| Launch flow: pick a verified target → `create_run` | `create_run` exists. The UI adds the target-must-be-verified precondition as a visible state, not a 400 |
| **Kill switch that is a button**, wired to `lib/breaker-admin-operations.ts` | The single most-requested affordance in the audit. Uses `ConfirmDialog` from #13, naming the specific run it stops |
| Control-vs-treatment chart for impact evidence (PRD-G E3) | Replaces a table row reading "technical delta / claim / blockers". **Depends on #14's charting decision** |
| Cohort + caveat rendering, unchanged in strictness | §2.6's honesty is a brand asset. The chart carries the same caveats the table does — a chart makes a claim look stronger, so the caveat has to work harder |

## Scope

**In v1:** define (`create_definition`), launch (`create_run`), kill (breaker admin), and the
impact comparison chart. Target registration/verification surfaced as **state**, and revoke wired to
`ConfirmDialog`.

**Out of v1 (no-gos):**
- **The "no causal customer claim" rail does not soften.** Internal/synthetic-cohort caveats stay
  exactly as strict as they are (audit §2.6). Rendering evidence as a chart **increases** the
  obligation here, it does not relax it. Any story that makes the claim read stronger than the
  evidence supports is rejected, not negotiated.
- **No new admin operation.** If a flow needs an operation `scenario-admin-operation.ts` does not
  already parse, that is a backend seed and a separate bet.
- **No approval-workflow UI.** `approve_definition` with `external_cohort` / `production_security`
  is a governance flow with real consequences and deserves its own shaping. v1 surfaces approval
  *state*; it does not let a PM grant it.
- **No `external`-cohort launches from the UI.** v1 launches `synthetic` and `internal` only. External
  cohorts touch real users and the UI is not where that authorization should first appear.
- **No new fault kinds, no raised limits.**

## Rabbit holes

- **The kill switch must stop the right thing.** `executeBreakerAdminOperation` and
  `executeAutomaticBreaker` are different paths. The button stops a *run*; the automatic breaker is a
  policy that trips on its own. Conflating them in one control is the worst available outcome —
  a PM who thinks they killed something that is still running. Two distinct affordances, named
  differently.
- **Target verification is a challenge/response.** `verifyScenarioTarget` takes a `challenge`, and
  `SCENARIO_TARGET_OWNERSHIP_PATH` (`/api/internal/resilience/ownership`) is how ownership is proven.
  A PM cannot complete this alone. Surface it as an explicit "waiting on target verification" state
  with instructions — do not hide the step and do not fake it.
- **`concurrencyCap` cannot exceed `requestCap`.** A cross-field constraint the parser enforces. The
  form must express it as a live constraint, not as a server error after submit.
- **The impact chart is blocked on #14.** If the charting decision has not landed, this epic's
  impact story ships as the existing table with a stated gap — it does **not** get to hand-roll an
  SVG and pre-empt the dependency call.
- **Six tables is a lot of page.** #13 explicitly defers converting this route because #16 rewrites
  it. Do not convert-then-rewrite; rewrite once, here, using #13's primitives.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08. Everything in the left column is built and validated.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| Define a scenario | `lib/scenario-admin-operation.ts` → `create_definition` with a parsed `ScenarioDefinition`; `parseScenarioDefinition` in the SDK | **A screen.** Nothing else |
| The definition grammar | `ScenarioKind` = `resilience` \| `security` (2) · `SCENARIO_COHORTS` = `synthetic` \| `internal` \| `external` (3) · `ScenarioFault` = `none` \| `delay` \| `synthetic_error` (3, closed) · `SCENARIO_SECURITY_TEMPLATES` (4) | Nothing. Four closed enums — the form renders them |
| Bounds | `MAX_SCENARIO_REQUEST_CAP` 100 · `MAX_SCENARIO_CONCURRENCY_CAP` 5 · `MAX_SCENARIO_LEASE_TTL_SECONDS` 30 · `MAX_SCENARIO_DELAY_MS` 2000 · `MAX_SCENARIO_ABORT_FAILURES` 10 · `MAX_SCENARIO_DURATION_SECONDS` 3600 | Nothing. Inputs read these constants; never hardcode |
| Guardrails | `ScenarioGuardrails` = `abortAfterFailures` + `maxErrorRateBasisPoints` | Nothing. Note **basis points** again — same conversion discipline as #15 |
| Launch / target lifecycle | `registerScenarioTarget`, `verifyScenarioTarget`, `revoke_target`, `create_run`, `executeScenarioAdminOperation`, `getScenarioAdminSnapshot` | Nothing |
| Kill | `lib/breaker-admin-operations.ts` → `executeBreakerAdminOperation`, `executeAutomaticBreaker`, `getBreakerAdminSnapshot`; `lib/breaker-policy.ts`, `lib/breaker-evidence.ts` | A button and a `ConfirmDialog` |
| Impact evidence | `lib/scenario-impact.ts`, `scenario-impact-operations.ts`, `scenario-impact-request.ts` (all unit-tested) | The comparison *view* — **gated on #14** |
| The dashboard read | `lib/scenario-dashboard.ts` | Nothing. The rewrite reads the same seam |
| Proof-of-target | `lib/scenario-target-proof.ts` + its test | Nothing |
| Gates | `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` — three, all exact `=== 'true'` | One more for the write surface — see kill-switch |
| Specs | `e2e/scenario-dark.spec.ts`, `scenario-dashboard.authed.spec.ts`, `scenario-registry.spec.ts`, `scenario-telemetry-sdk.spec.ts`, `breaker-contract.spec.ts` | Api specs for define/launch/kill; one authed browser spec |
| UI primitives | `components/ui` (9) + `ProductShell` | `ConfirmDialog`, `FormSection`/`Field` from **#13**; `RuleBuilderRow` from **#15** |

## UX heuristics & rails check

- **CI guards covering this surface:** `check:design-drift` over `app` + `components/ui` +
  `components/product`; `typecheck` × 4; Playwright `api` as the gate.
- **Audits-lens findings that apply:** §2.4, §2.6 (the honesty rail — binding), §6.4 (the
  launch/kill flow design), §7 P1, §3.3 (this is the whitespace).
- **Design-language debt:** six `<table>` blocks and no cards on the highest-consequence page in the
  product; destructive operations with no confirmation affordance at all.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**Is there a runtime seam a kill-switch can gate? Yes.**

1. **Flag:** `SCENARIO_AUTHORING_ENABLED` in `lib/flags.ts`, exact `=== 'true'`, matching the
   existing gates.
2. **Polarity: enablement / dark-launch ⇒ default `false`, created DISABLED in every environment.**
   This adds a *human write path* that can start fault injection. It merges dark and is flipped on
   deliberately, per environment, after a synthetic-cohort run is verified end to end.
3. **Seam:** one resolver — `isScenarioAuthoringEnabled()` — gating **the write controls only**
   (define, launch, kill, revoke). **Off ⇒ the page renders as today's read-only evidence view.**
   It deliberately does *not* gate the read surface: an operator losing visibility into running
   scenarios because a flag flipped is a worse failure than losing the ability to start new ones.
   Same reasoning `app-shell-and-agent-rail` used for not gating the section nav.
4. **Mechanism:** env-backed gate in `lib/flags.ts`, server-side. It composes with — does not
   replace — the three existing gates: authoring is available only where the relevant capability
   gate is *also* on.

**Why high risk.** This gives a human a button that injects faults and trips breakers against real
targets. Product owner merges.

## Acceptance criteria

1. A PM defines a `resilience` scenario, `synthetic` cohort, `delay` fault at 500 ms, requestCap 10,
   concurrencyCap 2 — with no free-text JSON — and it round-trips through `parseScenarioDefinition`
   unchanged.
2. The form cannot submit `concurrencyCap > requestCap`; the constraint is shown before submit.
3. Every bound in the form is read from the SDK constants; a spec asserts no bound is hardcoded.
4. Launching against an unverified target is impossible from the UI, and the target's state says
   what is needed instead of failing.
5. The kill button opens `ConfirmDialog` naming the specific run, and stopping it records an
   immutable breaker trip visible in the trips view.
6. The kill affordance for a *run* is visually and textually distinct from automatic breaker policy.
7. `external`-cohort launch is not offered in the UI.
8. Impact evidence renders as control-vs-treatment **with the existing caveats verbatim** — or, if
   #14 has not landed, as today's table with the gap stated in the PR.
9. With `SCENARIO_AUTHORING_ENABLED` unset, the page renders exactly today's read-only view and no
   write control is reachable — a dark spec asserts it.

## Open risks / research

- **Depends on:** #13 (`ConfirmDialog`, `FormSection`), #15 (`RuleBuilderRow`), #14 (the charting
  decision — soft: degrades to the current table).
- **Risk: the honesty rail and the chart pull against each other.** A control-vs-treatment chart is
  persuasive in a way a table is not. Budget real design attention for the caveat, and have the
  product owner review the rendered claim specifically — this is the one story where "it looks good"
  is a warning sign.
- **Risk: `approve_definition` turns out to be load-bearing for v1.** If a `synthetic` scenario
  cannot run without an approval, the no-go above collapses the epic. **Verify this first, in the
  architecture-lock pass, before any builder starts.**
