# One design system, every surface — Sprint 1: The rails — make a bad-looking page fail the build

**Status:** ⬜ not started

> **This sprint writes almost no product CSS.** It builds the machinery that makes every later
> sprint checkable, and it closes four of the six mechanisms in the epic README on its own.
> **Every assertion it adds must be observed failing on the current `main` before the work starts**
> (WAYS-OF-WORKING: *every new spec was observed failing at least once*). They all will — that is the
> point.
>
> **Shared surface, architect-owned, done first.** `design-system/`, the token collapse, the widened
> guard and the manifest are inherited by all five later branches. A mistake here breaks every one.

> **Story 1.0 was landed at grooming, not by a builder.** The WAYS-OF-WORKING amendment (*an
> approved design IS signed-off scope*) is a `Roadmap/` doc change and belongs to the planning lane.
> It shipped in the scaffold commit. It is recorded here because it closes Mechanism B and the
> sprint would otherwise look like it has a gap.

## Stories

### Story 1.1 — The design source moves out of a closed epic ✳ *closes Mechanism F*
**As a** builder on any future epic, **I want** the design system to live at a product-level path,
**so that** it does not expire with the epic that produced it.
**Acceptance:**
- `apps/web/design-system/` exists and holds **this epic's own `design/` folder** — the approved
  32-state `console-prototype.html`, `APPROVED.md`, `render-reference.mjs` and `_harness.mjs` — plus
  `console-reference.css`, `CONSOLE-CONTRACT.md` and `measure-contract.mjs` from
  `Roadmap/02-commercial/console-ia-overhaul/design/`. Both source folders are left as
  forward-pointers, not deleted.
- On a **fresh clone**, both commands run green and `render-reference.mjs` writes all ten states.
  (They died with `ERR_MODULE_NOT_FOUND` for four days because `_harness.mjs` was uncommitted —
  prove the move did not reintroduce that.)
- The old path is gone, and `console-ia-overhaul`'s README + contract link forward to the new one.
  A dangling link from a shipped epic is how the next reader concludes the design was deleted.
- **D1 is answered in writing first:** an app-dir import from a sibling top-level directory either
  builds under the current `tsconfig` paths, or the seam is changed to one that does — before the
  move, not after.
**Risk:** high

### Story 1.2 — One token file ✳ *D2*
**As a** builder, **I want** exactly one definition of every colour, **so that** changing a token
changes the product rather than one of three copies.
**Acceptance:**
- `references/design/assets/tokens.css`, the prototype's inlined `:root` and `console.css`'s own set
  are collapsed to one file, imported once.
- **Every value that differed between the three is written down as a finding**, with which one was
  on screen. A silent merge here hides the answer to "why did it not look like the mockup".
- Deleting a token breaks its consumers **at build time**, not at render time.
- The design system's classes are namespaced per **D3**, and the `font:`-shorthand trap is covered by
  a case in the drift guard or a unit test: the shorthand resets family, weight and style, so
  restating `font-size` under it leaves the rest in place.
**Risk:** high

### Story 1.3 — The drift guard covers the directories primitives land in
**As a** reviewer, **I want** `check-design-drift.mjs` to walk `components/ui` and
`components/product`, **so that** the guard is not blind to exactly where this epic adds code.
**Acceptance:**
- The guard walks both directories. The audit named this gap by hand (§10.5): it already covers all
  of `apps/web/app` and neither of these.
- Observed failing first — introduce a raw hex in a `components/ui` file, see red, remove it.
- The **pictograph ban is not relaxed.** It is the reason no rail icon was ever added, and Story 2.4
  answers it with SVG `Icon` components (**D4**), not with an exemption.
**Risk:** high

### Story 1.4 — The contract becomes generated output ✳ *closes Mechanisms C and D*
**As a** product owner, **I want** every number in the spec to come from a measurement,
**so that** a number nobody can reproduce cannot be committed and then reasoned about as intent.
**Acceptance:**
- `measure-contract.mjs` **emits** the spec file — every column, including the Box column — under a
  do-not-hand-edit header.
- CI regenerates it and **fails on any diff**. The scripts and the harness are themselves under CI,
  so a missing import fails in minutes rather than four days.
- The two wrong numbers are **corrected by regeneration, never by hand**: project switcher
  `122 × 30` (written `140 × 30`), feature row `71` (written `78`). Re-measured 2026-08-29.
- Any row that stays deferred carries **an owner and a date**, and the gate fails when the date
  passes.
**Risk:** high

### Story 1.5 — The coverage manifest ✳ *closes the rest of Mechanism E*
**As a** product owner, **I want** one generated number for how much of the product is on the
system, **so that** an XXL project has a finish line and an off-system page is visibly a debt.
**Acceptance:**
- A generated manifest lists all **29** in-scope routes with three booleans each: has an approved
  reference state · renders from `design-system/` · passes the visual gate.
- It **extends `lib/project-route-inventory.ts`** — no second list (the last epic's D2, and the
  reason the nav needed no second list either).
- A new route with no reference state makes the manifest **red**, not silently green.
- **The ratchet is wired: coverage may not decrease.**
- Sprint 1 also captures all 29 routes **as they are today** as the before-baseline. Six defects in
  the last epic were found by opening the page and none by reading a diff.
**Risk:** high

### Story 1.6 — The gate is driven by the manifest ✳ *closes Mechanism A* — **D5**
**As a** product owner, **I want** a page that looks wrong to fail CI on any route,
**so that** "done" and "right" stop being different conditions.
**Acceptance:**
- `console-visual.authed.spec.ts` becomes manifest-driven: it asserts computed geometry for every
  route the manifest says has a reference state, instead of one hand-written route.
- **Every assertion is observed failing on a deliberately mutated page.** The epic's own closing
  lesson: counting `querySelectorAll('[role="columnheader"]')` passes under `display: none`, which
  removes an element from the accessibility tree and not from the DOM. A gate that cannot fail is
  worse than no gate.
- The three cheap assertions stay and apply per route: no vertical overflow at 1440×960, the
  expected row count, and **no horizontal page scroll, ever**.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/design-drift.spec.ts` (guard covers the two new directories, fails on a
  planted hex) · `e2e/coverage-manifest.spec.ts` (a route with no reference state fails; the ratchet
  refuses a decrease) · the regenerate-produces-no-diff check runs in the deterministic gate, not as
  a browser spec.
- **browser smoke owed:** yes, to Daniel — **the before-baseline contact sheet of all 29 routes**
  (authed; a real session is required and no automated smoke can sign it off). One page, 29 shots.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.
  The visual gate itself lives in the `browser` project because it asserts rendered geometry.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: **the branch preview** for steps 1–3 (nothing user-visible changes in this sprint) ·
production · https://goldenfrijoles.com for step 4.

1. On a **fresh clone** of the branch, run
   `node apps/web/design-system/render-reference.mjs`
   → Ten PNGs are written. No `ERR_MODULE_NOT_FOUND`.
2. Run `node apps/web/design-system/measure-contract.mjs --check`
   → It exits green, and the spec file it emits shows the project switcher as `122 × 30` and the
   feature row as `71` — not `140 × 30` and `78`.
3. Open the PR's CI run.
   → A `coverage` line reports **1/29** (only Ship › Features has a reference state today), and the
   visual gate is **red** on the routes that have one and do not match. A green gate at this point
   is the bug.
4. Go to https://goldenfrijoles.com/app/flags/miyagisanchez
   → The page looks **exactly as it does today**. This sprint changes no product pixel; if anything
   moved, that is the bug report.

If any step fails, note the step number + what you saw — that's the bug report.
