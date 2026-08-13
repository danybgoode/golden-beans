# Scenarios made PM-operable — Sprint 2: Launch and kill

**Status:** ✅ built in `cf1b971` + hardening through `f553bac`; PR #98 awaits product-owner merge

> **Build contract (locked by the architect before the builder started).**
> **This is the sprint that gives a human a button that injects faults.** Every gate applies and
> none is optional. Cite D4 (two distinct affordances), D6 (verified targets only), D8 (the gate),
> D10 (no external cohort) and D13 (owner-session command facade).
> **D4 was corrected by the lock:** stopping a run is `transition_run` through the scenario command;
> `executeBreakerAdminOperation` trips a flag breaker policy and never stops a scenario. A PM who
> believes they killed something that is still running is the worst outcome this epic can produce.
> **Amendment 1 approved 2026-08-13:** use the owner-session facade; keep API-key commands intact.
> Delivered sequentially on the single epic branch after Sprint 1.

## Stories

### Story 2.1 — Launch a run
**As a** PM, **I want** to start a scenario I defined against a verified target,
**so that** I can run a resilience exercise myself.

**Acceptance:**
- Launch parses `create_run` then `start_run` through the gated owner-session facade. Both owner and
  credential RPCs share the existing transaction cores; if start fails after draft creation, the
  page refreshes so the honest retryable draft remains visible.
- **A target that is not verified cannot be selected.** The precondition is a visible state, not a
  rejected request (D6).
- `external`-cohort definitions offer no launch control at all (D10).
- The launch confirmation names the scenario, the target and the blast radius — request cap,
  concurrency and duration — in plain language before the PM commits.
- A run in progress is visibly in progress, with its elapsed time and the guardrail thresholds that
  would abort it.
**Risk:** high

### Story 2.2 — Stop a run
**As a** PM, **I want** one button that stops what I started, **so that** I can run an exercise
without needing an engineer to end it.

**Acceptance:**
- A stop control on an in-progress run calls `transition_run` with `transition: 'stop'` through the
  scenario command facade and stops **that run** (D4).
- It opens `ConfirmDialog` naming the specific run and saying, in a sentence, what stops when it
  fires.
- Stopping records the immutable scenario lifecycle transition and reason, visible in the run
  history. It does not create a breaker trip (D4).
- The control is disabled — with a stated reason — for a run the PM cannot stop, rather than
  failing after the click.
**Risk:** high

### Story 2.3 — Automatic breaker policy is a separate thing, named separately
**As a** PM, **I want** to tell the difference between "stop this run" and "the system trips on its
own", **so that** I never think I've stopped something I haven't.

**Acceptance:**
- Automatic breaker policy (`executeBreakerAdminOperation`, `executeAutomaticBreaker`,
  `lib/breaker-policy.ts`) is presented in its own section with its own wording — never as a variant
  of the stop button (D4).
- The two are visually distinct and their confirmation copy shares no sentence.
- A spec asserts the stop-run path calls the scenario `transition_run` operation and **neither**
  breaker function — the mutation check swaps in a breaker call and watches it go red.
- Run history attributes human stop reasons. The separate trips view contains only flag-policy
  trips and distinguishes its own manual-confirmed and automatic modes.
**Risk:** high

## Sprint QA
- **specs:** the owner-operation cases in `e2e/scenario-registry.spec.ts` prove owner attribution,
  tenant isolation, verified-target launch and lifecycle stop. `scenario-authoring.authed.spec.ts`
  covers the launch/stop affordances; `breaker-contract.spec.ts` passes unchanged.
- **browser smoke owed:** yes, to the product owner — **the full launch → observe → kill loop on a
  synthetic cohort.** This is fault injection against a real target; an automated smoke covers the
  API shape, a human confirms the thing actually stopped.
- **Mutation checks (each observed red once):** wire stop-run to either breaker function → the
  distinctness spec goes red. Remove the verified-target precondition → its spec goes red.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` +
  `check:design-drift` green before merge.
- **Review:** HIGH tier — routed, two cross-family passes + fresh reviewer subagent. **Product owner
  merges.**

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

> **Synthetic cohort only.** Use a test project and a verified synthetic target. This walkthrough
> injects real faults — do not run it against a target anyone depends on.

1. Go to https://golden-beans-gamma.vercel.app/app/scenarios/<testProjectSlug> with
   `SCENARIO_AUTHORING_ENABLED=true`, and open the synthetic `delay` scenario from Sprint 1.
   → A launch control is visible.
2. Try to select an **unverified** target.
   → It isn't selectable, and the UI says what verification is needed. You never get a failed
     request.
3. Select the verified synthetic target and click launch.
   → A confirmation names the scenario, the target, and the blast radius — request cap, concurrency,
     duration — before you commit.
4. Confirm.
   → The run appears as in-progress, with elapsed time and the guardrail thresholds that would abort
     it.
5. Click stop on the run.
   → A dialog names **that run** and says what stops.
6. Confirm the stop.
   → The run ends. **Verify it actually ended** — the run's state is terminal and no further
     activity appears against the target.
7. Inspect the terminal run in run history.
   → Its stop reason is recorded on the scenario lifecycle; no breaker trip was manufactured.
8. Look at the automatic breaker policy section.
   → It is clearly a **different thing** — different section, different wording. Nothing about it
     reads like the stop button you just used. Its trips are only flag-policy trips.
9. Unset `SCENARIO_AUTHORING_ENABLED` and reload.
   → Launch and stop controls are gone. The run history and trips are **still visible** — the gate
     hides authoring, not evidence.

If any step fails, note the step number + what you saw — that's the bug report.
**Step 6 is the one that matters most:** if the run did not actually stop, stop the walkthrough and
report it immediately.
