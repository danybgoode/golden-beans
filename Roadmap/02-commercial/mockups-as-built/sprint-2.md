# The mockups, as built — Sprint 2: Delete the disclosures, build the screens

**Status:** ✅ COMPLETE — part 1 `20cecfb`, part 2 this branch. **All seven routes match.**

> **Part 2 (2026-09-10)** built the two detail routes and added Story 2.5. What it took, beyond the
> two stories as written:
>
> - **`.ds-vers` was built** — the `versions` primitive the vocabulary deliberately paired with a
>   product class that did not exist (epic README's warning). `Versions` / `Version` in
>   `primitives.tsx`, in the specimen, and in the specimen's coverage list.
> - **`sectionlabel` was a DEAD PAIR and is corrected.** `.ds-rail-label` appears in no file in this
>   repository; `.rail-label`'s port is `.ds-label`, which nineteen call sites emit. Same class of
>   defect as `.ds-crumbrow`, found the same way. This is a mapping correction, not a widening — the
>   test is whether a component renders the class today.
> - **`ListCard plain`** — the approved design uses `.listcard` as a padded SURFACE on eight states,
>   not only as a grid of rows. A `role="table"` around a bar chart is worse structure than the
>   `<div>` it replaced.
> - **Two defects only LOOKING could find**, on a page whose structural signature already matched:
>   an `Empty` made the guardrail panel the tallest block on the page while saying the least, and a
>   disabled outcome button was painted as the chosen one.
> - **`ComparisonBars` was drawing half its approved line.** The prototype says
>   `obs >= exp ? "Enough people" : "N more needed"`; only the shortfall was built, so an arm that
>   had reached its sample said nothing — and "enough" and "no minimum declared" looked identical.
> - ⚠️ **A defect the seam shipped on SIX surfaces**: `close` does not bubble in the DOM, but React
>   delegates it, so every `ConfirmDialog` closing also fired `NewThingDialog`'s `onClose`. The
>   modal shut the instant a mutation succeeded and the operator never saw the result. Guarded by
>   identity, and asserted on the SPECIMEN — because every product surface that exercises it sits
>   behind a capability gate CI turns off.
> - ⚠️ **`scenario-authoring.authed.spec.ts` had been red locally since Story 2.2 merged**, clicking
>   a `<details>` that no longer exists. CI never saw it: CI runs the DARK half of that inverse pair
>   (`SCENARIO_AUTHORING_ENABLED: 'false'`), so the only suite exercising the owner authoring path is
>   the local runner's. A suite outside the gate decays silently.

> **⛔ Read the epic README's ONE RULE before starting.** Every screen below is drawn and approved.
> There is nothing to design and nothing to decide.
>
> **If building a screen would lose a capability: STOP and ASK.** Do not hide it, do not find it a
> new home, do not keep it "behind a disclosure, complete". That is the exact move that produced
> this epic.
>
> Sprint 1's gate was red on these routes. Each story is done when its route is green.

## Stories

### Story 2.1 — Journeys ✳ *`measure-journeys`, `measure-journey`* — D7
**As a** person, **I want** the Journeys screens I approved, **so that** a journey is a list I can
read rather than a JSON definition I expand.
**Acceptance:**
- `/app/journeys/[projectSlug]` matches `measure-journeys.png` — the answer line, four stat tiles,
  and the journey rows with their state pill and version. **`+ New journey` is a control on the
  page**, not a disclosure.
- `/app/journeys/[…]/[journeyKey]` matches `measure-journey.png` — the stage funnel with drop-off
  between stages, and the version list.
- **Deleted:** `page.tsx:91` *"Define a journey, and activate a version"*,
  `journey-manager.tsx:131` *"Definition"*, `[journeyKey]/page.tsx:286` *"The window, the
  drilldowns, the retention rule and the query evidence"*.
- ⚠️ **D7 first:** confirm `journey-manager.tsx` is not the only way to create a journey. If it is,
  the creation control ships **in this story** — `console-ia-overhaul` A3 is the precedent, where
  the authoring form turned out to be the only path and was nearly deleted.
**Risk:** high

### Story 2.2 — Scenarios ✳ *`measure-scenarios`*
**As a** person, **I want** the Scenarios screen I approved, **so that** it reads as a tool I
operate rather than a log I expand.
**Acceptance:**
- `/app/scenarios/[projectSlug]` matches `measure-scenarios.png` — `▸ Run a drill` as the primary
  action, the four stat tiles, and the drill rows with their held/failed split bar, kind tag and
  cohort. The never-run drill shows its named empty state.
- **Deleted:** `page.tsx:108` *"Evidence, breakers and the full run history"*.
- Audit §6.4 is the intent: *"from a read-only log to the tool the PRD describes."*
**Risk:** high

### Story 2.3 — Experiments ✳ *`ship-experiments`, `experiment-ready`, `experiment-blocked`*
**As a** person, **I want** the Experiments screens I approved, **so that** I can see whether a
decision is available and why not.
**Acceptance:**
- The list matches `ship-experiments.png`. The detail matches `experiment-ready.png` and
  `experiment-blocked.png` — the variant bars, the drawn confidence interval, the guardrails, the
  split check, and the five decision outcomes greyed until the blockers clear.
- Blockers render in plain words — *"the split cannot be checked yet"*, never `srm_not_evaluable`.
- **Deleted:** `page.tsx:91`, `experiment-manager.tsx:323` *"Plan"*,
  `[experimentKey]/page.tsx:259` *"The plan, the diagnostics and the decision ledger"*,
  `governance-detail.tsx:95` *"Immutable plan"* and `:201` *"Captured analysis and integrity
  evidence"*.
**Risk:** high

### Story 2.4 — Destinations and Today ✳ *`setup-destinations`, `today`*
**As a** person, **I want** the last two screens carrying disclosures to match what I approved.
**Acceptance:**
- `/app/destinations/…` matches `setup-destinations.png` — delivery health on the row, the
  `+ New destination` control, the on/off switch per row.
- **Deleted:** `destinations/page.tsx:53` *"Attempt log"*,
  `destination-manager.tsx:555` *"Recent deliveries"*.
- `/app` matches `today.png` — the three bands, and the Medusa-truth disclosure
  `design-system-rails` Sprint 5 added is deleted.
**Risk:** high

### Story 2.5 — Scenario evidence leaves the authoring control ✳ *`measure-scenarios`* — Daniel, 2026-09-10
**As a** person who cannot author, **I want** a drill's evidence from the drill's own row, **so that**
reading the run history does not mean opening a control that says it starts something.
**Acceptance:**
- Each drill row carries an `Evidence` control opening THAT drill's runs, its defensive-simulation
  results and its impact snapshots — read-only, scoped by `scenarioKey` and, for the security
  results, joined through this drill's run ids (a security result carries only a run).
- `▸ Run a drill`'s lede is the approved state's again: *"Pick a drill, a target and a cohort — then
  it runs."* Story 2.2 had widened it to promise evidence, because that control was the only way to
  reach it.
- The run table is declared ONCE (`scenario-evidence-columns.tsx`); the workspace APPENDS its
  actions column to it. Two column lists in two files that currently agree is CODE-QUALITY #2.
- The evidence dialog holds **no control**. Launch, stop and retry stay in the workspace with their
  confirmations and capability gates.
- Breaker policies and trips STAY in the workspace: a trip belongs to a policy, and
  `ScenarioDashboardTrip` carries no scenario key to file it under a drill.
- `scenario-authoring-dark.authed.spec.ts` now asserts its own title directly — the evidence is
  reached without touching a write surface at all.
**Risk:** medium

## Sprint QA
- **api spec(s):** no new spec — **Sprint 1's gate is the spec.** Each story is done when its
  route's screenshot comparison is green. Existing behavioural specs for these routes must stay
  green, which is what proves a deletion removed UI and not a capability.
- **browser smoke owed:** yes, to Daniel — the walkthrough below, on production.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**

1. Go to https://goldenfrijoles.com/app/journeys/miyagisanchez
   → The screen matches the approved Journeys mockup. **There is no "Define a journey, and activate
   a version" anywhere on the page, expanded or collapsed.**
2. Open a journey.
   → The stage funnel, with how many people did not continue between each stage. No JSON.
3. Go to https://goldenfrijoles.com/app/scenarios/miyagisanchez
   → `Run a drill` is a button on the page. No *"Evidence, breakers and the full run history"*.
4. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez and open one.
   → Variant bars, a drawn interval, guardrails, the five outcomes. No *"Immutable plan"*, no
   *"The plan, the diagnostics and the decision ledger"*.
5. Go to https://goldenfrijoles.com/app/destinations/miyagisanchez and https://goldenfrijoles.com/app
   → Both match their mockups. No attempt-log or Medusa-truth disclosures.
6. On any of the five pages, press `⌘F` and search for the word **"Inspect"**, then **"Definition"**.
   → No matches. If a disclosure survived, this finds it.

If any step fails, note the step number + what you saw — that's the bug report.
