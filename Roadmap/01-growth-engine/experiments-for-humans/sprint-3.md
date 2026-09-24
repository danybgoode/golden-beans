# Experiments for humans — Sprint 3: The builder

**Status:** ⬜ not started · **Wave 2 (needs its own bet)** · branch `feat/experiments-for-humans-s3` (stacked on S2)

## Build contract (locked by the architect before the builder started)
<!-- D7, D9, D10 verified: the Start write order against transitionExperimentVersion and
     activateFlagAction; the idempotency key; EXPERIMENT_BUILDER_ENABLED created DISABLED in every
     Vercel env BEFORE the first PR merges; the structural assertions generated from the approved states. -->
- D7 write order: _to be verified_
- D9 gate created in every env: _to be verified_

## Stories

### Story 3.1 — The five questions and the live panel, behind the gate
**As** a product person, **I want** "+ New experiment" to open five questions that are already
answered, **so that** I only change what's different and never type.
**Acceptance:**
- With `EXPERIMENT_BUILDER_ENABLED=false`, the dialog is exactly today's. With it on, it opens the
  approved builder: template cards; feature select; the hypothesis sentence of selects; Who's in it
  (conditions from catalog values with shares and coverage; one-of chips; "How many of them"; count
  each …); What they see (named versions, screenshots optional, split presets + slider, "Add a
  version" only for multi-value features, a sentence for on/off ones); How you'll know; How long.
- The live panel updates on every change without stealing focus mid-drag.
- The builder contains **zero** text inputs, `<textarea>`s and `<details>` (D10 assertion).
- Closing keeps the answers until the page is left; "+ New experiment" then reads "Continue new experiment".
**Risk:** low

### Story 3.2 — Review, computed checks, Save draft
**As** a product person, **I want** one sentence, the checks and a Save button, **so that** I can see
the whole plan and park it safely.
**Acceptance:**
- Review shows the plan sentence, versions side by side, the edit-per-row list and the six checks
  (D6), each with its one-click fix where it has one.
- Save draft writes the experiment draft, the flag version (not activated) and the binding (plus the
  new feature when "A new feature just for this test" was chosen) in **one** idempotent action. A
  double submit creates nothing twice. Nothing is activated anywhere.
- The list shows the draft with "Continue", which reopens at Review.
**Risk:** high

### Story 3.3 — Start
**As** a product person, **I want** one press to start the test, **so that** the split is serving in
Production and the experiment is running.
**Acceptance:**
- Start is disabled while any check fails. The footer says how many things to fix.
- Start runs D7's two writes in order. On success: toast "‹key› started · ‹feature› is splitting 50 / 50",
  then the experiment page at "It's live. Results start tomorrow."
- A forced activation failure (spec) leaves the experiment running and shows "running, but the split
  isn't serving yet" with a working retry.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/experiment-builder-gate.spec.ts` (3.1: gate off = old dialog),
  `e2e/experiment-save-draft.spec.ts` (3.2: idempotent, nothing activated),
  `e2e/experiment-start.spec.ts` (3.3 incl. the forced failure). Browser spec for D10's zero-inputs assertion.
- **browser smoke owed:** **yes, to Daniel.** Start activates a flag version in a customer's
  Production, the step an automated smoke can't fully judge.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green; one rendered look at 360px and 1360px.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: preview with `EXPERIMENT_BUILDER_ENABLED=true` first, then production once Daniel turns it on there.

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez and click "+ New experiment".
   → The builder opens on "What are you changing, and why?" with "Copy or button" selected and the side panel reading "≈ N days at your traffic".
2. Click "Pricing page".
   → Every step changes: a toast says the template was applied to all five steps.
3. Click "Continue" four times, then "Review".
   → One sentence describes the plan, and the checks list shows how many pass.
4. On "Who's in it", add a Campaign condition, then return to Review.
   → The eligibility check fails with "Remove the campaign condition →", and "Start experiment" is disabled.
5. Click that fix, then "Save draft".
   → The list shows the experiment as Draft with a "Continue" button.
6. (**production flag write, owed to Daniel by name**) Click "Continue" → "Start experiment".
   → "It's live. Results start tomorrow." The feature's page shows the new version serving in Production.

If any step fails, note the step number + what you saw — that's the bug report.
