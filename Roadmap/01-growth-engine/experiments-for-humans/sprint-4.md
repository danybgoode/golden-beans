# Experiments for humans — Sprint 4: Decision-first readout, decide, retire the JSON box

**Status:** ⬜ not started · **Wave 2** · branch `feat/experiments-for-humans-s4` (stacked on S3)

## Build contract (locked by the architect before the builder started)
Cite the README's D-numbers; do not restate them.

- **4.1 → D10** (builder: mid tier). The approved `experiment-results*` states on
  `/app/experiments/[projectSlug]/[experimentKey]`. The answer line and verdict are a pure module
  (`lib/experiment-readout.ts`) over the governed analysis — the same `computeExperimentAnalysis`
  result, never a second statistic. **Cumulative series:** ONE extra pure pass over the facts the
  analysis already loaded (the `servedDaily` precedent in `lib/tars-query.ts`), never an analysis per
  day; if it does not fit, it is the first cut (the story says so). "Roll out ‹version›" appears only
  when `decisionReady`. A running experiment whose bound flag version is **not** the active Production
  version reads "The split isn't serving" (D7's partial state, and the case where someone edited the
  feature mid-test). **Results fixture:** production's two experiments are decided, so the spec seeds
  its own project on local Supabase through the product's write path (`save_experiment_draft` →
  start → facts via ingest) at three points: waiting, gathering, ready. Plan tab + "Change the plan"
  opens the builder at Review pre-filled as version n+1. Risk: low.
- **4.2 → D8** (builder: the architect). Stop → decide (chips) → roll out, three writes, each with its
  own result; rollout via `planFlagSet` on `stripExperiment(served)`; 10-second undo re-activates the
  prior version. Corrections move to the chip modal. Spec `e2e/experiment-decide-rollout.spec.ts`:
  the decision record's row bytes are identical before and after the rollout and after the undo.
  Risk: **high**.
- **4.3 → D9** (builder: mid tier, the architect flips the env). Before deleting anything, enumerate
  what `experiment-manager.tsx` does today — create from JSON, bind, start/stop/invalidate per version
  — and name each capability's new home (create → builder; bind → Save draft; start → 3.3; stop →
  the verdict card; invalidate → the Plan tab). The guard: no `<textarea>` and no "Definition JSON"
  under `app/app/experiments` (a spec that walks the directory, mutation-checked). Gate off ⇒ "+ New
  experiment" drawn blocked with "Creating experiments is paused". Risk: low.

## Stories

### Story 4.1 — The decision-first Results tab and the Plan tab
**As** a product person, **I want** the experiment page to lead with what I should do, **so that** I
don't have to interpret an interval to know whether to call it.
**Acceptance:**
- The answer line is computed from the governed analysis, e.g. "New copy is ahead, +10.2% (range +2.0% to +18.4%). Guardrails fine, split checks out. 72% of the planned sample, so don't call it yet. About 4 more days."
- The block order matches the approved state: answer → lift card (big number, legend, cumulative chart
  in DD4 grey/blue) + verdict card → KPI tiles → "How sure we are" + "Who saw what" with the split check.
- The verdict card offers "Roll out ‹version› to everyone" **only** when the analysis is decision-ready.
- Plan tab: the sentence plus the read-only plan. "Change the plan" opens the builder at Review as version n+1.
- If the appetite is tight, the cumulative chart is the first cut. The interval and bars stay.
**Risk:** low

### Story 4.2 — Decide, then roll out as a separate write
**As** a product person, **I want** to record the decision and roll the winner out in one flow,
**so that** the decision is on the record and the feature matches it.
**Acceptance:**
- Deciding uses the existing recorder (outcome and reason from chips; no free text in this flow). The
  record is immutable and unchanged by anything after it.
- "Set ‹version› for everyone in Production" is a second, explicit write through the `flag-commands`
  planner, with its own toast and a 10-second undo.
- Spec: the decision record's bytes are identical before and after the rollout write.
**Risk:** high

### Story 4.3 — Turn it on and retire the JSON textarea
**As** Daniel, **I want** the builder on in Production and the JSON box gone, **so that** there's one
way in and it's the human one.
**Acceptance:**
- `EXPERIMENT_BUILDER_ENABLED=true` in Production after the Sprint 3 smoke passes (redeploy by merge;
  verified by opening the dialog, not `vercel env ls`).
- The Definition JSON textarea and its manager path are deleted from `/app/experiments`. JSON stays an
  API/agent format only. A guard fails if a `<textarea>` or the words "Definition JSON" return under
  `app/app/experiments`.
- With the gate switched off, "+ New experiment" is drawn blocked with "Creating experiments is paused". No capability is lost.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/experiment-results-readout.spec.ts` (4.1, on the named fixture),
  `e2e/experiment-decide-rollout.spec.ts` (4.2), the retirement guard (4.3).
- **browser smoke owed:** **yes, to Daniel.** The rollout writes a customer's Production flag.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green; one rendered look.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez and click "+ New experiment".
   → The builder opens. There is no JSON box anywhere on the page.
2. Open the experiment started in the Sprint 3 smoke.
   → The first line says what's happening and what to do next, in one sentence.
3. Click the "Plan" tab.
   → The plan reads as one sentence plus a short list, and "Change the plan →" is offered.
4. (**production flag write, owed to Daniel by name**) When the verdict card offers it, click "Roll out ‹version› to everyone" and confirm.
   → Toast "Decision recorded. ‹version› is on for everyone in Production." The page shows "Decided". The feature's page shows it serving 100%.

If any step fails, note the step number + what you saw — that's the bug report.
