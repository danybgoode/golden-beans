---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: scenarios-pm-operable
build_order: 16
---

# Epic: Scenarios made PM-operable — define, launch, and kill a scenario from the UI

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/scenarios-pm-operable.md`](../../00-ideas/seeds/scenarios-pm-operable.md)
> **Appetite:** M (one wave) · **Underwritten by:** _not yet — `underwritten_by: null`_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.4, §2.6, §3.3, §6.4, §7 (P1). PRD-G E1, E3.
> **Depends on:** #13 Sprint 1 (`ConfirmDialog`, `FormSection`), #15 Sprint 1 (`RuleBuilderRow`), #14 (charting decision — soft).

> ## ⚠️ Scaffolded, not yet bet
> This epic is **shaped and documented but not underwritten** (`wave-2026-08-08.md` funds #13, #14
> and #15; two M features in one wave is two waves). The docs exist so the next betting table is a
> three-line decision rather than a fresh groom. **Do not start building from this file** until a
> wave file names it and the seed's `underwritten_by:` is set.

## Why

Chaos and secops are the product's clearest whitespace — the audit's §3.3 is blunt that neither
PostHog nor GrowthBook has this at all. And it is the least PM-operable surface in the product: 287
lines rendering six stacked HTML tables of evidence about scenarios an agent already ran over the
API. A PM can read that a resilience probe happened. They cannot cause one, and they cannot stop one.

The gap is **not capability**. Defining a scenario, launching a run and tripping a breaker are all
existing, validated, unit-tested operations in `lib/`. They have simply never been given a screen.
PRD-G E1 asks for a PM to define a scenario and watch the downstream impact; E3 asks for that impact
to be legible as a comparison rather than a row. This epic is the screen.

## Platform-first note

**Every operation this epic surfaces already exists and is parsed server-side today.** No new admin
operation, no new table, no new route contract, no change to the scenario or breaker model. The
definition grammar is four closed enums and six hard numeric bounds — the form renders constants it
does not define.

This has a strong consequence for scope: **any story that needs an operation
`lib/scenario-admin-operation.ts` does not already parse is out of this epic by construction**, and
is a backend seed with its own bet.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08. Everything in the middle column is built and validated.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| Define a scenario | `lib/scenario-admin-operation.ts` → `create_definition` carrying a parsed `ScenarioDefinition`; `parseScenarioDefinition` in the SDK | **A screen. Nothing else** |
| The grammar | `ScenarioKind` = `resilience` \| `security` (2) · `SCENARIO_COHORTS` = `synthetic` \| `internal` \| `external` (3) · `ScenarioFault` = `none` \| `delay` \| `synthetic_error` (3, closed) · `SCENARIO_SECURITY_TEMPLATES` (4) | Nothing. Four closed enums — see D1 |
| Bounds | `MAX_SCENARIO_REQUEST_CAP` 100 · `MAX_SCENARIO_CONCURRENCY_CAP` 5 · `MAX_SCENARIO_LEASE_TTL_SECONDS` 30 · `MAX_SCENARIO_DELAY_MS` 2000 · `MAX_SCENARIO_ABORT_FAILURES` 10 · `MAX_SCENARIO_DURATION_SECONDS` 3600 · `MAX_SCENARIO_DEFINITION_BYTES` 64 KB | Nothing. Read them (D5) |
| Guardrails | `ScenarioGuardrails` = `abortAfterFailures` + `maxErrorRateBasisPoints` | Nothing. **Basis points again** — same discipline as #15 (D3) |
| Target lifecycle | `registerScenarioTarget`, `verifyScenarioTarget`, `revoke_target`, `SCENARIO_TARGET_OWNERSHIP_PATH` (`/api/internal/resilience/ownership`), `lib/scenario-target-proof.ts` | Verification surfaced as **state**, not hidden (D6) |
| Launch | `create_run`, `executeScenarioAdminOperation`, `lib/scenario-execution-operation.ts` | A button |
| Kill | `lib/breaker-admin-operations.ts` → `executeBreakerAdminOperation`, `executeAutomaticBreaker`, `getBreakerAdminSnapshot`; `lib/breaker-policy.ts`, `lib/breaker-evidence.ts` | A button + `ConfirmDialog`. **Two distinct affordances** (D4) |
| Impact evidence | `lib/scenario-impact.ts`, `scenario-impact-operations.ts`, `scenario-impact-request.ts` — all unit-tested | The comparison *view* — **gated on #14** (D7) |
| The dashboard read | `lib/scenario-dashboard.ts`, `getScenarioAdminSnapshot` | Nothing. The rewrite reads the same seam |
| Security runs | `lib/scenario-security-operation.ts`, `scenario-security-request.ts`, `scenario-security-runner.ts` | Nothing |
| Gates | `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` | One more — `SCENARIO_AUTHORING_ENABLED` (D8) |
| Specs | `e2e/scenario-dark.spec.ts`, `scenario-dashboard.authed.spec.ts`, `scenario-registry.spec.ts`, `scenario-telemetry-sdk.spec.ts`, `breaker-contract.spec.ts` | Api specs for define/launch/kill; one authed browser spec |
| UI primitives | `components/ui` (9) + `ProductShell` | `ConfirmDialog`, `FormSection` from **#13**; `RuleBuilderRow` from **#15** |

## Architecture decisions — locked before any builder starts

*To be verified against live `main` and live data by the architect at kickoff. **D9 is a
scope-disproving check that must run first** — if it fails, this epic's shape changes.*

**D1 — The form renders the SDK's enums; it does not define its own.**
Kind (2), cohort (3), fault (3), security template (4). Four closed enums. A form over them cannot
produce an invalid definition. If a builder writes a list of fault kinds, it has taken a wrong turn.

**D2 — `parseScenarioDefinition` remains the only authority.**
The form narrows what can be typed; the parser decides what is valid. Rejections are displayed,
never suppressed.

**D3 — `maxErrorRateBasisPoints` uses #15's percent↔basis-points seam.**
Do not write a second conversion. If #15 has not merged, extract the seam here and #15 imports it —
but there is exactly one.

**D4 — Killing a *run* and the automatic breaker *policy* are two different affordances, named differently.**
`executeBreakerAdminOperation` stops something a human started; `executeAutomaticBreaker` is a policy
that trips on its own. Conflating them in one control produces the worst available outcome: a PM who
believes they killed something that is still running. Distinct controls, distinct wording, distinct
confirmation copy.

**D5 — Every bound is read from the SDK constant.** No hardcoded 100, 5, 30, 2000, 10 or 3600.

**D6 — Target verification is surfaced as an explicit state, never faked.**
`verifyScenarioTarget` is a challenge/response proving ownership via
`/api/internal/resilience/ownership`. A PM cannot complete it alone. The UI shows "waiting on target
verification" with what is needed. Launching against an unverified target is **not offered** — it is
not a 400 the PM discovers after clicking.

**D7 — The impact chart is gated on #14, and degrades rather than pre-empting it.**
If the charting decision has not landed when this sprint starts, impact ships as **today's table
with the gap stated in the PR**. It does **not** hand-roll an SVG chart and thereby make the
dependency decision by accident.

**D8 — `SCENARIO_AUTHORING_ENABLED`: enablement gate, default `false`, created DISABLED in every env.**
This gives a human a button that injects faults. It merges dark and is flipped on deliberately after
a synthetic-cohort run is verified end to end. **It gates the write controls only** — define,
launch, kill, revoke. With it off, the page renders today's read-only evidence view. It deliberately
does *not* gate the read surface: an operator losing visibility into running scenarios because a
flag flipped is worse than losing the ability to start new ones — the same reasoning
`app-shell-and-agent-rail` used for not gating the section nav. It **composes with** the three
existing gates; authoring is available only where the relevant capability gate is also on.

**D9 — VERIFY FIRST: does a `synthetic` scenario run without `approve_definition`?**
`approve_definition` takes `external_cohort` | `production_security`. This epic's no-go list assumes
a synthetic-cohort scenario needs neither. **If that assumption is wrong, the approval flow is
load-bearing for v1 and the epic's shape changes** — surface it as an amendment before any builder
starts, per WAYS-OF-WORKING. This is the single highest-value check in the locking pass.

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

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | Define a scenario | high |
| 2 | Launch and kill | high |
| 3 | Impact as a comparison | high |

## Deploy order

No migration. Frontend + one new server-side gate. **Stacked branches:**
`feat/scenarios-pm-operable` → `-s2` → `-s3`, one PR per sprint, merged in order.

`SCENARIO_AUTHORING_ENABLED` is created **DISABLED in every environment before Sprint 1 merges**.
Flip on per environment only after a synthetic-cohort run has been verified end to end — including
the kill path.

**Risk tier: high → the product owner merges every PR.** Two cross-family review passes routed by
`review-route.mjs --tier high`, **plus** a fresh reviewer subagent.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — Stage 6b):** `SCENARIO_AUTHORING_ENABLED` exists in **every
      environment**, created **DISABLED**, default `false`. *Verify-only.*
- [ ] **D9 answered in writing** — whether `approve_definition` gates a synthetic run, and what
      changed if it does
- [ ] **The rendered impact claim reviewed by the product owner specifically** (D11), not just the
      page
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
