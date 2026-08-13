---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: scenarios-pm-operable
build_order: 16
---

# Epic: Scenarios made PM-operable — define, launch, and kill a scenario from the UI

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/scenarios-pm-operable.md`](../../00-ideas/seeds/scenarios-pm-operable.md)
> **Appetite:** M (one wave) · **Underwritten by:** [`bets/wave-2026-08-13-scenarios.md`](../../bets/wave-2026-08-13-scenarios.md)
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.4, §2.6, §3.3, §6.4, §7 (P1). PRD-G E1, E3.
> **Depends on:** #13 Sprint 1 (`ConfirmDialog`, `FormSection`) — shipped; #15's percent seam — shipped;
> #14 (charting decision — still open, so D7's table fallback applies).

> ## 🏗️ Underwritten and in architecture lock
> The product owner started this epic on 2026-08-13. The lock against live code and production data
> disproved several scaffolded premises; the consequential owner-session command boundary is recorded
> in D13 and Amendment 1 below rather than being invented inside a builder.

## Why

Chaos and secops are the product's clearest whitespace — the audit's §3.3 is blunt that neither
PostHog nor GrowthBook has this at all. And it is the least PM-operable surface in the product: 287
lines rendering six stacked HTML tables of evidence about scenarios an agent already ran over the
API. A PM can read that a resilience probe happened. They cannot cause one, and they cannot stop one.

The gap is mostly **not capability**. Defining a scenario, launching a run and stopping it are
existing, validated, unit-tested credential operations in `lib/`. The lock found that they cannot be
called honestly from an owner session without an explicit session-authorized database facade; that
boundary, rather than the screen itself, is the only backend work now in question.
PRD-G E1 asks for a PM to define a scenario and watch the downstream impact; E3 asks for that impact
to be legible as a comparison rather than a row. This epic is the screen.

## Platform-first note

**Every domain operation this epic surfaces already exists and is parsed server-side today.** No new
table, public route contract, scenario model or breaker model is needed. However, the existing command
functions derive project and audit identity from a revocable admin credential, while this UI derives
them from an owner session. D13 records the missing trusted facade; it may require an additive migration
but must not bypass or duplicate the existing transactional invariants.

This has a strong consequence for scope: **any story that needs an operation
`lib/scenario-admin-operation.ts` does not already parse is out of this epic by construction**, and
is a backend seed with its own bet.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08. Everything in the middle column is built and validated.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| Define a scenario | `lib/scenario-admin-operation.ts` → `create_definition`; `parseScenarioDefinition` in the SDK | The screen **and an owner-session facade** over the same DB invariant (D13) |
| The grammar | Runtime arrays exist for `SCENARIO_COHORTS` and `SCENARIO_SECURITY_TEMPLATES`; `ScenarioKind` and `ScenarioFault` are TypeScript types only | Add import-safe `SCENARIO_KINDS` / `SCENARIO_FAULT_KINDS`, or the form would have to hardcode them (D1) |
| Bounds | `MAX_SCENARIO_REQUEST_CAP` 100 · `MAX_SCENARIO_CONCURRENCY_CAP` 5 · `MAX_SCENARIO_LEASE_TTL_SECONDS` 30 · `MAX_SCENARIO_DELAY_MS` 2000 · `MAX_SCENARIO_ABORT_FAILURES` 10 · `MAX_SCENARIO_DURATION_SECONDS` 3600 · `MAX_SCENARIO_DEFINITION_BYTES` 64 KB | Nothing. Read them (D5) |
| Guardrails | `ScenarioGuardrails` = `abortAfterFailures` + `maxErrorRateBasisPoints` | Nothing. **Basis points again** — same discipline as #15 (D3) |
| Target lifecycle | `registerScenarioTarget`, `verifyScenarioTarget`, `revoke_target`, `SCENARIO_TARGET_OWNERSHIP_PATH` (`/api/internal/resilience/ownership`), `lib/scenario-target-proof.ts` | Verification surfaced as **state**, not hidden (D6) |
| Launch | `create_run` + `start_run` through `executeScenarioAdminOperation`; `lib/scenario-execution-operation.ts` is the target execution lease path, not the UI launch command | A button plus D13's owner-session facade |
| Stop a run | `transition_run` with `transition: 'stop'` through `executeScenarioAdminOperation` | A button + `ConfirmDialog`; the scaffolded breaker call was wrong (D4) |
| Breaker policy | `executeBreakerAdminOperation` manually trips a flag breaker; `executeAutomaticBreaker` trips the same policy automatically | A separate read-only policy section; neither stops a scenario run (D4) |
| Impact evidence | `lib/scenario-impact.ts`, `scenario-impact-operations.ts`, `scenario-impact-request.ts` — all unit-tested | The comparison *view* — **gated on #14** (D7) |
| The dashboard read | `lib/scenario-dashboard.ts`, `getScenarioAdminSnapshot` | Nothing. The rewrite reads the same seam |
| Security runs | `lib/scenario-security-operation.ts`, `scenario-security-request.ts`, `scenario-security-runner.ts` | Nothing |
| Gates | `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` | One more — `SCENARIO_AUTHORING_ENABLED` (D8) |
| Specs | `e2e/scenario-dark.spec.ts`, `scenario-dashboard.authed.spec.ts`, `scenario-registry.spec.ts`, `scenario-telemetry-sdk.spec.ts`, `breaker-contract.spec.ts` | Api specs for define/launch/kill; one authed browser spec |
| UI primitives | `ProductShell`, `Panel`, `StatCard`, `DataTable`, `ConfirmDialog`, `FormSection`/`Field` are all shipped | `RuleBuilderRow` is private to the boolean-flag builder and does not model a scenario's immutable flag-version reference (D13) |

## Architecture decisions — locked before any builder starts

*Locked against `origin/main` (`ad8a1e3`) and the linked production database on 2026-08-13. The
lock deliberately disproved the scaffold rather than summarising it. Deviations are in Amendment 1.*

**D1 — The form renders runtime SDK constants; it does not define its own.**
`SCENARIO_COHORTS` and `SCENARIO_SECURITY_TEMPLATES` already satisfy this. `ScenarioKind` and
`ScenarioFault` are types and cannot populate a select at runtime, so the SDK must export closed
`SCENARIO_KINDS` and `SCENARIO_FAULT_KINDS` tuples beside those types. A literal list in the app is
still forbidden.

**D2 — `parseScenarioDefinition` remains the only authority.**
The form narrows what can be typed; the parser decides what is valid. Rejections are displayed,
never suppressed.

**D3 — `maxErrorRateBasisPoints` uses #15's percent↔basis-points seam.**
Do not write a second conversion. If #15 has not merged, extract the seam here and #15 imports it —
but there is exactly one.

**D4 — Stopping a *run* and tripping a breaker *policy* are two different operations and affordances.**
The scaffold was factually wrong: `executeBreakerAdminOperation` does **not** stop a run. A human stop
is `transition_run` with `transition: 'stop'` through `executeScenarioAdminOperation`. Manual and
automatic breaker operations both trip a flag policy. The UI keeps run stop and breaker evidence in
different sections, with different wording; Sprint 2's acceptance/spec must assert the scenario
transition path, not a breaker call.

**D5 — Every bound is read from the SDK constant.** No hardcoded 100, 5, 30, 2000, 10 or 3600.

**D6 — Target verification is surfaced as an explicit state, never faked.**
`verifyScenarioTarget` is a challenge/response proving ownership via
`/api/internal/resilience/ownership`. A PM cannot complete it alone. The UI shows "waiting on target
verification" with what is needed. Launching against an unverified target is **not offered** — it is
not a 400 the PM discovers after clicking.

**D7 — #14 has not landed; Sprint 3 uses the documented comparison-table fallback.**
The spike remains `status: ready` with no decision. This epic does not choose a runtime chart
dependency or hand-roll an SVG by accident. The redesigned table may make control and treatment
legible side by side, but the PR and smoke walkthrough state that the chart dependency remains open.

**D8 — `SCENARIO_AUTHORING_ENABLED`: enablement gate, default `false`, created DISABLED in every env.**
This gives a human a button that injects faults. It merges dark and is flipped on deliberately after
a synthetic-cohort run is verified end to end. **It gates the write controls only** — define,
launch, kill, revoke. With it off, the page renders today's read-only evidence view. It deliberately
does *not* gate the read surface: an operator losing visibility into running scenarios because a
flag flipped is worse than losing the ability to start new ones — the same reasoning
`app-shell-and-agent-rail` used for not gating the section nav. It **composes with** the three
existing gates; authoring is available only where the relevant capability gate is also on.

**D9 — Answered: a synthetic scenario runs without `approve_definition`.**
The production migration's `start_scenario_run` checks only `external_cohort` and a `security` scenario
in `production`. A synthetic resilience run needs neither; a synthetic production security run still
needs `production_security`, exactly as the function says. Live data also contains a synthetic
security definition and an internal resilience definition, so this is not an empty-schema inference.

**D10 — `external`-cohort launches are not offered in the UI.**
v1 launches `synthetic` and `internal`. External cohorts touch real users, and the UI is not where
that authorization should first appear.

**D11 — The honesty rail tightens, it does not soften.**
Audit §2.6's "no causal customer claim" and the internal/synthetic-cohort caveats stay verbatim. A
chart makes a claim look stronger than the same numbers in a table, so the caveat has to work
harder. On the impact story specifically, **"it looks good" is a warning sign** — the product owner
reviews the rendered claim, not just the render.

**D12 — This epic rewrites the scenarios page; #13 deliberately did not convert it.**
Do not convert-then-rewrite. Rewrite once, here, using #13's primitives.

**D13 — The signed-in UI uses one owner-session command facade; the existing API-key facade is not reused as-is.**
`executeScenarioAdminOperation` requires a key hash and derives `project_id` plus `actor_user_id` from
that credential. `requireProjectOwnership()` resolves the signed-in owner directly. Selecting an
arbitrary stored key hash would attribute the write to that key's creator and would still fail the
external-actor contract; passing a project id from the browser is forbidden. The safe shape is the
same one used by journeys, experiments and flags: a server action gates first, re-authenticates owner
server-side, parses through the existing contract, then calls a service-role-only, project-and-actor
scoped RPC. The RPC shares the existing transaction logic rather than reimplementing it. This is an
auth/DB scope addition approved by the product owner in Amendment 1.

**D14 — A scenario selects an existing immutable fault-injector flag version; it does not reuse `RuleBuilderRow`.**
`ScenarioDefinition` stores a `{key, definitionVersion}` flag reference. `RuleBuilderRow` is a private
component for boolean flag clauses and the current `RuleBuilder` creates boolean variants only. The
honest v1 form lists compatible existing flag versions whose variant values all pass
`parseScenarioFault`, labels the fault payload and targeting summary, and links to Flags for authoring.
Automatically creating a new flag and scenario in one click would be a new cross-control-plane
transaction, outside the existing operation set.

**D15 — Live-data shape is non-empty and must remain readable throughout rollout.**
Production has 1 target (currently revoked), 2 definition versions, 5 stopped runs, 3 impact
snapshots, 2 breaker policies and 2 immutable trips. The two definitions reference the same immutable
fault-injector flag version. The known `golden-beans` and `miyagisanchez` project slugs currently have
zero scenario rows; the evidence belongs to another project and is never exposed by the app. Any DB
change is additive and applied before the code deploy; no drop/recreate shortcut gets an empty-table
pass.

**D16 — Routing: the architect owns the lock and any auth/DB seam; the UI work is sequential in one worktree.**
The scenario page, actions and tests are shared hot files across all three sprints, so parallel
builders would buy conflicts rather than speed. Review independence comes from the required routed
cross-family passes. The high-risk fresh-reviewer layer remains owed by policy.

**D17 — Impact links follow the immutable experiment reference; they do not guess a TARS feature.**
`ScenarioImpactEvidence` stores the producing scenario/run and the exact canonical experiment key and
definition version. It does not store a feature key, and an experiment metric event is not a unique
feature identity. The PM thread therefore links run → impact → exact experiment analysis and back to
the producing definition. Inventing a funnel key from the scenario, flag or metric name could produce
a broken or semantically false tenant-local link. A future TARS link requires an explicit immutable
feature reference in the evidence contract, not a UI heuristic.

## Amendment 1 — 2026-08-13 · owner-session command boundary (approved)

The lock disproved the sentence “a screen, nothing else.” The product owner approved option 1:

1. **APPROVED — add the owner-session facade.** Add service-role-only, owner-scoped RPC wrappers
   for create/start/stop/revoke that share the credential operations' transaction cores. Server
   actions call them only after `requireProjectOwnership()`. This preserves the epic outcome and adds
   a migration, grant-denial specs, tenant-isolation specs and the mandatory migration-before-merge
   rollout step.
2. **Rejected — narrow the bet to read-only UX.** Ship the sectioned evidence view and comparison table, but
   leave define/launch/stop available only to credential clients. This avoids auth/DB work and fails
   the epic's named PM-operable outcome, so it is not recommended.

Decision given explicitly in the build session on 2026-08-13. The owner-session RPCs are additive,
service-role-only, tenant-scoped, actor-attributed and migration-first; no existing credential route
loses its current contract.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | Define a scenario | high |
| 2 | Launch and kill | high |
| 3 | Impact as a comparison | high |

## Deploy order

Deployment order under approved Amendment 1 is env var → additive owner-session RPC migration →
merge/deploy. The three slices are delivered in one orchestrated epic branch and one PR, with a
separate commit per completed slice.

`SCENARIO_AUTHORING_ENABLED` is created **DISABLED in every environment before Sprint 1 merges**.
Flip on per environment only after a synthetic-cohort run has been verified end to end — including
the kill path.

**Risk tier: high → the product owner merges every PR.** Two cross-family review passes routed by
`review-route.mjs --tier high`, **plus** a fresh reviewer subagent.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch (planned at grooming — Stage 6b):** `SCENARIO_AUTHORING_ENABLED` exists in **every
      environment**, created **DISABLED**, default `false`. *Verify-only.*
- [x] **D9 answered in writing** — whether `approve_definition` gates a synthetic run, and what
      changed if it does
- [ ] **The rendered impact claim reviewed by the product owner specifically** (D11), not just the
      page
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
