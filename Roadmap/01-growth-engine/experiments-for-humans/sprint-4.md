# Experiments for humans — Sprint 4: Decision-first readout, decide, retire the JSON box

**Status:** 🟦 In review · **Wave 2** · branch `feat/experiments-for-humans-s4` (stacked on S3)

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

- **spec(s):** `e2e/experiment-results.authed.spec.ts` (4.1 + 4.2's browser flow — see deviation 2),
  `e2e/experiment-decide-rollout.spec.ts` (4.2 commands, incl. the two race specs),
  `e2e/experiment-start.spec.ts` ("Change the plan" as n+1), `lib/experiment-decide-plan.test.ts`
  (4.2's write order), `lib/experiment-retirement.test.ts` (4.3 guard, mutation-checked).
- **browser smoke owed:** **yes, to Daniel.** The rollout writes a customer's Production flag.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green; one rendered look.

## As built — deviations and notes (the architect, 2026-09-25)
1. **Routing:** 4.1 and 4.3 were delegated to Codex (`--tier build`); it hit its usage cap after
   ~9 minutes (resets 2026-10-25) and left a partial tree. The architect re-derived it and **rewrote the
   detail page**: the delegate's version dropped the legacy `?metricEvent=` comparison (which by contract
   does not read the governance gate), the `asOf`/segment parameters, the resource-limit and
   unavailable pages, made drafts 404, and drew the decide controls for non-owners. Kept from the
   delegate: the ported `experiments.css` block, the manager deletion, the list page's blocked door,
   the retirement guard, the revise prop (fixed to preview the NEXT version's key).
2. **4.1's spec is `experiment-results.authed.spec.ts`, not an api spec:** the governed analysis read is
   `server-only`, so an api spec could only re-assert the pure readout (`experiment-readout.test.ts`
   does). The authed spec seeds its own project through the builder commands, makes the fixture user
   its owner, and opens the real page at waiting / gathering / ready; at ready it records the decision
   through the chip modal and — builder gate on — rolls out and undoes (off, as in CI: the decision
   records and the page says the roll-out didn't happen). Mutation: skipping `decisionReady` fails it.
3. **Cumulative chart: CUT** (the story's named first cut). The lift card says the day-by-day line isn't
   drawn; the number, legend, range and bars stay.
4. **4.3 capability handoff:** create → builder; bind → Save draft; start → Start (3.3); stop → the
   verdict card (`DecideFlow`); invalidate → the Plan tab (`lifecycle-action.tsx`); decision and
   corrections → `DecideFlow` (chips; the recorder's `<textarea>` is gone); the ledger → the Plan tab.
   `GovernanceDetail`'s allocation table / freshness read retire with the disclosure (the answer line,
   KPIs and split check carry what a decider needs; the API/MCP still serve the full analysis).
5. **"Change the plan"** saves version n+1 through an explicit `revise` path; Start refuses while
   another version of the same experiment runs ("Version N is still running. Stop it before …").
6. **Rollout/undo** replace exactly the version they planned against (`replacing`), never "same base".
7. **Review round 1 (fresh reviewer, #172):** a stopped, undecided version has its own readout state
   (`stopped` — never "live" / "keep it running"; the next step is the decision); with the builder gate
   off no roll-out is drawn or pre-ticked (the verdict offers "Ship ‹version›", the modal records only);
   the server ties the roll-out's variant to the CURRENT decision record (ship → its treatment, keep →
   the control, anything else refused); "Change the plan" is drawn only on started versions; Start
   lands on `?version=`; a draft the builder did NOT make gets "Start this version" on its Plan tab
   (production has two: `miyagi`/`scenario_miyagi_readiness_epic_20260729` v1 and
   `miyagisanchez`/`fundadoras_promise_cta` v2 — the manager was their only way to start).
8. **External review families:** Codex capped (resets 2026-10-25) and agy's Google sign-in expired; by
   Daniel's call the general pass and the security lens run as fresh subagents, beside the fresh
   `pr-reviewer` — recorded as a downgrade (no external family on this PR).

## Sprint 4 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez and click "+ New experiment".
   → The builder opens. There is no JSON box anywhere on the page.
2. Open the experiment started in the Sprint 3 smoke.
   → The first line says what's happening and what to do next, in one sentence.
3. Click the "Plan" tab.
   → The plan reads as one sentence plus a short list, and "Change the plan →" is offered.
4. (**production flag write, owed to Daniel by name**) When the verdict card offers it, click "Roll out ‹version› to everyone".
   → A modal: outcome "Ship ‹version›" and reason "The main number improved and guardrails held" are
   picked, "Set ‹version› for everyone in Production" is ticked. Click "Record and roll out".
   → Toast "Decision recorded. ‹version› is on for everyone in Production." with Undo for 10 seconds.
   The page shows "Decided"; the feature's page shows Production serving that version to everyone.
5. On the Plan tab, the Decisions list shows the record with its reason.

If any step fails, note the step number + what you saw — that's the bug report.
