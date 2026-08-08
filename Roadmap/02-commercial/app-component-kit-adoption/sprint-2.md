# Component-kit adoption sweep — Sprint 2: Convert the owner-operated routes

**Status:** ⬜ not started

> **Build contract (locked by the architect before the builder started).**
> Sweeper acceptance governs every story here: **less code, same behaviour, no regressions.** A
> converted route that shows different information is a bug in the conversion. Cite D2, D3, D4, D6.
> **Scenarios is not in this sprint** (D6) — `scenarios-pm-operable` rewrites that page.
> Branch `feat/app-component-kit-adoption-s2`, cut from `-s1` after it merges.

## Stories

### Story 2.1 — Convert two routes thin, then freeze the API
**As a** builder, **I want** `DataTable`'s API validated by two real call sites before it grows,
**so that** the remaining conversions don't inherit an abstraction shaped by guesswork.

**Acceptance:**
- `keys` and `agent-keys` render their tables through `DataTable` with no visible change.
- Any `DataTable` change needed to make them work is made **now**; after this story the API is
  frozen for the sprint, and a third route needing an option is a finding to log, not a change to
  make silently (D3).
- Line count for both routes goes **down**.
**Risk:** low

### Story 2.2 — Convert `destinations` and `experiments`
**As a** PM, **I want** the destinations and experiments tables to sort and filter like the others,
**so that** finding the row I need doesn't depend on which screen I'm on.

**Acceptance:**
- Both routes render tabular data through `DataTable` and forms through `FormSection`/`Field`.
- Each has an empty state that tells a new PM what to do next, not a blank table body.
- `experiments/[projectSlug]/[experimentKey]` (the detail route and `decision-recorder.tsx`) is
  included — a converted list behind an unconverted detail page is the inconsistency this epic
  exists to remove.
**Risk:** low

### Story 2.3 — Convert `flags` and `impact`
**As a** PM, **I want** the flags list and the impact view to use the same grammar as everything else,
**so that** the two surfaces I check most often are the two I have to think about least.

**Acceptance:**
- `flags/[projectSlug]/page.tsx` and its `flag-manager.tsx` table render through `DataTable`;
  `impact/[projectSlug]/[featureKey]` renders its headline numbers through `StatCard`.
- **The flag authoring `<textarea>` is left exactly as it is.** Replacing it is
  `flags-visual-rule-builder`'s entire epic — touching it here would collide with a stacked branch
  and pre-empt a decision this epic hasn't made.
- `impact`'s time-series table is **not** turned into a chart (that is #14's decision and #16's
  work). It gets `StatCard`s for the headline figures and keeps the table.
**Risk:** low

### Story 2.4 — Route-conversion inventory
**As a** product owner, **I want** the remaining debt written down as a list,
**so that** "the sweep is partly done" is a set of named routes rather than a feeling.

**Acceptance:**
- The epic README (or this sprint doc) lists every `/app` route **not** converted, with a one-line
  reason each — `scenarios` cites D6, leaf/detail routes cite "accretes."
- `design-system.authed.spec.ts` has one assertion per converted route, each observed failing before
  its conversion landed.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/design-system.authed.spec.ts` — one assertion per converted route.
  Regression cover for behaviour parity comes from the routes' **existing** specs
  (`api-keys.spec.ts`, `destinations.spec.ts`, `experiments.spec.ts`, `flag-serving.spec.ts`,
  `experiment-decisions.spec.ts`) — they must pass **unchanged**. A spec that needed editing to
  survive a conversion is a behaviour change; stop and report it.
- **browser smoke owed:** yes, to the product owner — **visual parity** across the six converted
  routes. An api spec cannot see that a table still looks right.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` + `npm run
  check:design-drift` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Go to https://golden-beans-gamma.vercel.app/app/keys/<projectSlug>
   → The key table renders. Click a column header.
   → The table sorts by that column.
2. Type into the table's filter box.
   → Rows narrow as you type; clearing it restores all rows.
3. Go to https://golden-beans-gamma.vercel.app/app/destinations/<projectSlug>
   → The destinations table sorts and filters **the same way**, with the same control in the same
     place.
4. Go to https://golden-beans-gamma.vercel.app/app/experiments/<projectSlug> and open one experiment.
   → Both the list and the detail page use the converted layout — no mismatch between them.
5. Go to https://golden-beans-gamma.vercel.app/app/flags/<projectSlug>
   → The flag list is converted. **The JSON textarea for creating a flag is unchanged** — this epic
     deliberately does not touch it.
6. Go to https://golden-beans-gamma.vercel.app/app/impact/<projectSlug>/<featureKey>
   → Headline numbers render as stat cards. The time-series table is still a table.
7. Open any converted page for a project with no data yet.
   → The empty state is a sentence telling you what to do, not an empty table.
8. Go to https://golden-beans-gamma.vercel.app/app/scenarios/<projectSlug>
   → **Unchanged** — six tables, as today. This is deliberate (D6), not a miss.

If any step fails, note the step number + what you saw — that's the bug report.
