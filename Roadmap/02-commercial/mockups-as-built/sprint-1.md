# The mockups, as built — Sprint 1: The gate that can fail

**Status:** 🟦 in review — the gate is built and OBSERVED RED on Journeys

> **This sprint builds no product UI.** It builds the one check that was missing, and it is not
> done until that check is **observed failing on a route you can see is wrong**.
>
> A gate written after the work it checks is a gate written to pass. Sprint 2 does not open until
> Story 1.2 has gone red on Journeys in front of the product owner.

## Stories

> ### ⚠️ Story 1.1 was re-specified before it was built, by measurement
>
> The gate this sprint scaffolded — a per-route screenshot diff against `reference/<state>.png` —
> was measured first, and **the route the epic calls correct scored FARTHER from its picture than
> the route the epic calls wrong** (6.9 % vs 6.4 % raw pixels; off-by-2 vs a *perfect* match on a
> structural band count). The numbers, the four measured causes and Daniel's decision on
> 2026-09-09 are in the epic README, **D2**. The gate reads the approved **prototype** — the file
> `APPROVED.md` hashes, and the file the PNGs are rendered from — and compares STRUCTURE. The PNGs
> still render and are still uploaded with every run: a picture is for a person.

### Story 1.1 — The gate reads the approved design
**As a** product owner, **I want** CI to compare each built route against the picture I approved,
**so that** "matches the approved design" stops being a presence check.
**Acceptance:**
- `console-visual.authed.spec.ts` gains a per-route STRUCTURAL comparison against the approved
  state's signature — the ordered content blocks, the tile count, the list's visible column words,
  the primary action's label, and the number of `<details>`, which is always 0. Generated into
  `apps/web/design-system/STATE-CONTRACT.json` by `state-contract.mjs`, `--check`ed in CI beside
  `extract-css` and `measure-contract` (epic D2).
- The existing per-route assertion (`status < 400` and `designSystemClasses > 0`) **stays**, and
  the new one is added beside it. The old one was never wrong, only insufficient.
- Routes are driven from `route-manifest.ts`'s `referenceState`, so adding a route adds a check.
- **No route is exempt without a named owner and a date.** A deferral with neither fails the gate.
**Risk:** high

### Story 1.2 — Prove it red, then prove it green ✳ *the sprint's whole point — D2*
**As a** product owner, **I want** to watch the gate fail on a page I know is wrong,
**so that** I know it can fail at all.
**Acceptance:**
- ✅ The gate is **observed FAILING on `/app/journeys/[projectSlug]`**, and names why:
  ```
  /app/journeys/[projectSlug]  (approved state: measure-journeys)
    · 1 <details> disclosure(s) in <main> — the approved design draws none
    · block 1 (`head`): primary action null where the approved state has "+ new journey"
    · block 3 (`tiles`): 3 where the approved state has 4
    · block 4 (`list`): columns [… "actions"] where the approved state has [… ""]
  ```
- ✅ The gate is **observed PASSING on `/app/flags/[projectSlug]`**, which was built to its state.
- ✅ **There is no threshold.** A threshold was the screenshot diff's mechanism, and the screenshot
  diff was disproved before it was written (epic D2). A structural signature either equals the
  approved state's or it does not, and the failure names the block.
- ✅ ⚠️ **Re-checked under a deliberate mutation of the PASSING page**, not only under the known-bad
  one: rendering three of Ship › Features' four stat cards turned the gate red and named
  `/app/flags/[projectSlug]` as a regression against the floor. *(The scaffolded version said
  "change a padding value"; a structural gate does not assert padding, so the equivalent mutation is
  a block that changes. Substitution recorded rather than made silently.)*
**Risk:** high

### Story 1.3 — Coverage stops being typed ✳ *D5*
**As a** product owner, **I want** the coverage number to come from the gate,
**so that** 27/27 means twenty-seven routes matched a picture.
**Acceptance:**
- ✅ The coverage number is **derived from the gate's result** (`STATE-MATCH.json`), not from a
  hand-typed boolean. `rendersFromDesignSystem` survives as a separately-asserted claim and stops
  feeding the number.
- ✅ `coverage.json` **dropped from 27/27 with `outstanding: []` to 5/25 measured.** The drop is the
  fix working. Sixteen routes are outstanding, and nine of them were in no story — see epic D16 and
  the new Sprint 4.
- ✅ The ratchet works against the new baseline, with ONE permitted re-baselining that cannot be
  reused (keyed on the base report having no `matchesApprovedState` field).
**Risk:** high

## Sprint QA
- **api spec(s):** the gate itself is the deliverable and lives in the `browser` project (it asserts
  rendered geometry) · `scripts/design-coverage.test.mjs` extended for the derived input.
- **browser smoke owed:** yes, to Daniel — **watching the gate go red on Journeys** (step 2 below).
  That is the acceptance for this sprint and nothing substitutes for it.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: the branch preview and the PR's CI run. Nothing user-visible changes in this sprint.

1. Open the PR's CI run and find the step **"Console visual gate (the approved design, asserted)"**.
   → It is **GREEN**, and that is correct — the ratchet blocks on the routes that have LANDED, so
   `main` never carries a red gate for work nobody has done yet (epic D15, your requirement).
2. In that step's log, find `[structure] 16 route(s) do not match their approved state yet`.
   → Each entry names the route, its approved state, the two block sequences, and the specific
   blocks that disagree. **This is the check that did not exist. Confirm you can read it.**
3. Read the entry for `/app/journeys/…`.
   → *"1 `<details>` disclosure(s) in `<main>`"*, *"primary action null where the approved state has
   `+ new journey`"*, *"3 tiles where the approved state has 4"*. That is Story 2.1, described from
   the outside by a machine.
4. Read `[structure] 5 route(s) now match` — `/app/flags`, `/app/flag-audit`, `/login`, `/signup`,
   `/talk`.
   → The gate is **not** failing everything. Those five are locked: `STATE-MATCH.json` is the floor
   and one of them regressing fails the build.
5. Open the PR's coverage output.
   → **`MATCHES its approved state  5 / 25`**, with `outstanding` naming sixteen real routes.
   `design-system-rails` closed this file at **27/27 with `outstanding: []`**.
6. Go to https://goldenfrijoles.com/app/flags/miyagisanchez
   → Unchanged. This sprint touches no product page.

If any step fails, note the step number + what you saw — that's the bug report.
