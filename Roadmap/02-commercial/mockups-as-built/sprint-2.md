# The mockups, as built — Sprint 2: Delete the disclosures, build the screens

**Status:** ⬜ not started

> **⛔ Read the epic README's ONE RULE before starting.** Every screen below is drawn and approved.
> There is nothing to design and nothing to decide.
>
> **If building a screen would lose a capability: STOP and ASK.** Do not hide it, do not find it a
> new home, do not keep it "behind a disclosure, complete". That is the exact move that produced
> this epic.
>
> Sprint 1's gate is red on these routes right now. Each story is done when its route is green.

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
