# The mockups, as built — Sprint 1: The gate that can fail

**Status:** ⬜ not started

> **This sprint builds no product UI.** It builds the one check that was missing, and it is not
> done until that check is **observed failing on a route you can see is wrong**.
>
> A gate written after the work it checks is a gate written to pass. Sprint 2 does not open until
> Story 1.2 has gone red on Journeys in front of the product owner.

## Stories

### Story 1.1 — The gate reads the approved PNGs
**As a** product owner, **I want** CI to compare each built route against the picture I approved,
**so that** "matches the approved design" stops being a presence check.
**Acceptance:**
- `console-visual.authed.spec.ts` gains a per-route screenshot comparison against
  `apps/web/design-system/reference/<referenceState>.png` — the 32 PNGs already committed.
- The existing per-route assertion (`status < 400` and `designSystemClasses > 0`) **stays**, and
  the new one is added beside it. The old one was never wrong, only insufficient.
- Routes are driven from `route-manifest.ts`'s `referenceState`, so adding a route adds a check.
- **No route is exempt without a named owner and a date.** A deferral with neither fails the gate.
**Risk:** high

### Story 1.2 — Prove it red, then prove it green ✳ *the sprint's whole point — D2*
**As a** product owner, **I want** to watch the gate fail on a page I know is wrong,
**so that** I know it can fail at all.
**Acceptance:**
- The gate is **observed FAILING on `/app/journeys/[projectSlug]`**, whose approved state
  (`measure-journeys`) draws a list of journeys and whose built page draws a disclosure reading
  *"Define a journey, and activate a version"*. **Post the failure output in the PR.**
- The gate is **observed PASSING on `/app/flags/[projectSlug]`**, which was built to its approved
  state and has held geometry assertions since `design-system-rails` Sprint 4.
- The threshold is settled by those two results and written down with the numbers that produced it.
  It must be tight enough to catch a collapsed JSON block and loose enough to survive live data
  differing from the prototype's fixtures.
- ⚠️ **The assertion must be re-checked under a deliberately mutated page**, not only under a
  known-bad one: change a padding value on the flags page and confirm the gate notices. An
  assertion that only ever fails on the one page you aimed it at is aimed, not general.
**Risk:** high

### Story 1.3 — Coverage stops being typed ✳ *D5*
**As a** product owner, **I want** the coverage number to come from the gate,
**so that** 27/27 means twenty-seven routes matched a picture.
**Acceptance:**
- `rendersFromDesignSystem` is **derived from the gate's result**, not read from a hand-typed
  boolean in `route-manifest.ts`.
- `coverage.json` regenerates from that, and **its number drops** — it currently reads 27/27 with
  `outstanding: []` while at least five routes do not match. A drop here is the fix working.
- The ratchet keeps working against the new, real baseline.
**Risk:** high

## Sprint QA
- **api spec(s):** the gate itself is the deliverable and lives in the `browser` project (it asserts
  rendered geometry) · `scripts/design-coverage.test.mjs` extended for the derived input.
- **browser smoke owed:** yes, to Daniel — **watching the gate go red on Journeys** (step 2 below).
  That is the acceptance for this sprint and nothing substitutes for it.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: the branch preview and the PR's CI run. Nothing user-visible changes in this sprint.

1. Open the PR's CI run.
   → The visual gate is **RED**, and it names the routes that do not match their approved state.
   A green gate here is the bug.
2. Read the failure for `/app/journeys/…`.
   → It names the route and shows the diff against `measure-journeys.png`. **This is the check that
   did not exist. Confirm you can read it.**
3. Read the result for `/app/flags/…`.
   → **Green.** That route was built to its state, so the gate must not be failing everything.
4. Open the PR's coverage output.
   → The number is **lower than 27/27**, and `outstanding` names real routes. It currently claims
   27/27 with nothing outstanding.
5. Go to https://goldenfrijoles.com/app/flags/miyagisanchez
   → Unchanged. This sprint touches no product page.

If any step fails, note the step number + what you saw — that's the bug report.
