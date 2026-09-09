# The mockups, as built — Sprint 3: The two missing screens, and no flags

**Status:** ⬜ not started

> Two surfaces in the approved design were never built at all, and one flag is still standing
> between the console and the people using it.

## Stories

### Story 3.1 — North Star becomes a Measure surface ✳ *`measure-north-star`*
**As a** person, **I want** Measure to open on the North Star, **so that** the section shows the
number the project exists to move.
**Acceptance:**
- A North Star surface exists in `lib/project-route-inventory.ts` under `section: 'measure'`, and
  **it is the section's default** — the approved Measure rail opens on it.
- It matches `measure-north-star.png`: the hero number with its weekly delta, the trend plot with
  its crosshair, and the leading inputs as **three separate small plots**.
- ⚠️ **Three plots, never three lines on one chart** (`APPROVED.md` DD4). They are counts of
  different things on different scales; one axis would make the largest look like the most
  important.
- The page says when the North Star was last synced and by what, because it is synced from outside
  the product.
- **The `measure-north-star` state stops being mapped onto `/app/impact/…`.** That mapping was an
  architect's substitution for a route that did not exist; `/app/impact/…` keeps its own state.
**Risk:** high

### Story 3.2 — Activity paginates ✳ *`ship-activity`*
**As a** person, **I want** Activity to be a page, **so that** it stops being an endless list.
**Acceptance:**
- `/app/flag-audit/[projectSlug]` matches `ship-activity.png` and **paginates**. It currently
  renders every row `getFlagRegistryView()` returns, with no limit and no slice.
- Page size and controls come from the approved state. The URL carries the page, so a copy-paste
  opens the same one — the rule `console-ia-overhaul` Story 1.3 set for the environment.
**Risk:** high

### Story 3.3 — Delete the flag ✳ *D4*
**As a** product owner, **I want** no flag between the console and the people using it,
**so that** nothing is dark and nothing is half-on.
**Acceptance:**
- `CONSOLE_SHELL_ENABLED` is removed from `lib/flags.ts` and from the **four** files that gate on
  it: `app/app/page.tsx`, `setup/keys/[projectSlug]/page.tsx`,
  `setup/connect/[projectSlug]/page.tsx`, `setup/connect/[projectSlug]/actions.ts`.
- It is removed from **every Vercel environment**, and from `ci.yml` where the gate lights it.
- `grep -rn "CONSOLE_SHELL_ENABLED" .` returns nothing outside `Roadmap/` history.
- **No new flag replaces it.** Rollback is `git revert` of a sprint PR — sound here because this
  epic ships no migration, no schema change and no auth change.
**Risk:** high

### Story 3.4 — Close it honestly
**As a** product owner, **I want** the record to say what happened, **so that** the next epic does
not inherit a false green.
**Acceptance:**
- `RETROSPECTIVE.md` records the three facts: the gate asserted presence on 25 of 27 routes, the
  screenshot layer was never built, and coverage was computed from typed booleans.
- It records that `design-system-rails` reported **27/27 complete, `outstanding: []`** while at
  least five routes did not match, and **does not rewrite that epic's docs** — the record of what
  it claimed is evidence.
- The durable lesson goes to `Roadmap/LEARNINGS.md`, deduped and sharpened, not appended.
**Risk:** low

## Sprint QA
- **api spec(s):** `e2e/north-star.authed.spec.ts` (the surface exists, is Measure's default, and
  renders three separate plots) · `e2e/flag-audit.authed.spec.ts` (paginates; the page survives a
  copy-paste) · the visual gate covers both against their PNGs.
- **browser smoke owed:** yes, to Daniel — **removing the flag from every Vercel environment** is a
  live environment change and is never covered by a merge authorization.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**

1. Go to https://goldenfrijoles.com/app and click **Measure**.
   → It opens on **North Star**. The rail lists North Star, Journeys, Scenarios & drills.
2. Look at the North Star page.
   → The big number with its weekly change, one trend plot, and **three separate small plots**
   underneath. Not three lines on one chart.
3. Go to **Ship › Activity**.
   → A page of activity with pagination. Go to page 2, copy the URL, open it in a new tab.
   → You land on page 2.
4. (Owed to Daniel by name) Remove `CONSOLE_SHELL_ENABLED` from every Vercel environment and redeploy.
   → The console serves normally. Nothing 404s. There is no flag left to turn it off.
5. Open the PR's CI run.
   → The visual gate is **green for every route**, and coverage reports every route matching its
   approved PNG — derived from the gate, not typed.

If any step fails, note the step number + what you saw — that's the bug report.
