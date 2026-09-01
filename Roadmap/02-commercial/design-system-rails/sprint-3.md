# One design system, every surface — Sprint 3: The shell

**Status:** ✅ **SHIPPED & LIVE 2026-08-31** — merged as `8f86cf7` (PR #131), deployed to
production.

> **The highest-leverage sprint in the epic.** Every `/app` route renders through `ProductShell`, so
> this sprint changes all 20 of them at once — and **four of Daniel's five named complaints live
> here.**
>
> ⚠️ **There is no flag** (D6, Daniel, 2026-08-31). This sprint's shell goes to `main` and to
> production on merge. Sprints 4–6 are then built in the light against what people actually see, and
> a missing control is noticed the day it goes missing — which was always the point of flipping the
> flag early; removing the flag just gets there sooner and leaves one design in the codebase instead
> of two.

## Build contract (locked by the architect before the builder started)

> Sprint 3 is **not delegated** (README → *Routing*): a shared seam that 21 routes inherit, landing
> straight in production with **no flag behind it** (D6). **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/lib/flags.ts` · `apps/web/components/product/ProductShell.tsx` ·
`apps/web/components/product/{ConsoleRail,CommandPalette}.tsx` ·
`apps/web/app/app/flags/[projectSlug]/environment-picker.tsx` · `apps/web/design-system/**` ·
`apps/web/app/console.css` · the three specs named in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | ⚠️ **There is NO flag, no env var and no gated branch** — Daniel, 2026-08-31. This row used to name `DESIGN_V2_ENABLED` / `isDesignV2Enabled()` (itself a correction of the plan's fictional `console.design_v2_enabled` extending a `DEFAULT_FLAGS` registry that exists nowhere in this repo). The predicate was written and removed in the same sitting; it never shipped. Nothing is owed on Vercel. | **D6** |
| 2 | **The shell lands directly in `main` and in production on merge.** Rollback is `git revert` plus a deploy — minutes, not a switch. What protects the 21 routes is the deterministic gate, the rendered assertions and the review rounds, which is what has actually been catching defects all epic. | **D6** |
| 3 | `ProductShell` is the shared seam for **21** routes — 20 at the lock, plus `/app/design-system`, which Sprint 2 built on the same shell. The other 9 get `design-system/Frame.tsx` in Story 6.1: shared chrome, **not** a gate. | **D6** |
| 4 | ⚠️ **The "gate-off branch is byte-identical to today" proof is DELETED** along with the flag. There is no off-state to render, normalise or diff. What replaces it is narrower and real: the 21 routes must still render, and the `authed` suite is what says so. | **D6** |
| 5 | Chrome geometry comes from the **regenerated** spec: top bar **54**, section nav **44**, active tab **13/500** with a 2px gold underline, inactive **13/400 `--dim`**, rail **236**, rail item **36px / 13.5/600**, switcher **`122 × 30`** — never the contract's hand-typed `140 × 30`. | **D8** |
| 6 | The active rail item **differs from an inactive one by more than background colour**, and the cue is carried on `aria-current="page"` so the sighted and screen-reader cues are the same attribute. **A fill-only assertion would pass on what shipped last time** — assert border, icon colour and text weight too. | Story 3.3 |
| 7 | ⚠️ Keep the `> ul` **child** combinator on the environment control. `.console-rail a` and `.console-rail ul a` both leaked onto the picker and overrode its padding, radius **and** weight, killing the `aria-current` cue. Two previous attempts missed why. | Story 3.4 |
| 8 | The chosen environment **stays in the URL**. Moving the control must not change that — a copy-pasted link opens the same environment. | `console-ia-overhaul` 1.3 |
| 9 | `⌘K` **fetches lazily**: `0 / 1 / 1` requests (load / first open / reopen), counted in a browser. Its keyboard cursor is asserted as a **painted** cue, not as an attribute — the old rule was written against `li[aria-selected]` after `role="option"` moved onto the anchor. | Story 3.5 |
| 10 | **Story 3.6's production flip is OWED TO DANIEL BY NAME.** A live environment change is never covered by a merge authorization. The rollback (`false`, redeploy, confirm today's design returns, `true` again) is **tested once, deliberately**. | WAYS-OF-WORKING |
| 11 | `/app` load cost does not regress — **counted in a browser**, not reasoned about. | Story 3.6 |

## Stories

### Story 3.1 — ~~The kill-switch and its seam~~ · **DELETED (D6)**

⚠️ **This story built a flag, and there is no flag.** Daniel, 2026-08-31: *"not flagged, not dark or
anything… All goes to production, to main."*

Deleted rather than struck through in place, because a story left in a plan gets built. What it
carried and where that went:

- *"One resolver gated at `ProductShell`"* — gone. `ProductShell` is still the seam every `/app`
  route inherits; it just has nothing to ask before rendering.
- *"The gate-off branch is byte-identical to today"* — gone with the branch it described.
- *"The second seam is answered in this story"* — still answered, in **D6**, and still implemented in
  Story 6.1 as shared chrome rather than a gate.

The 21 routes this story would have gated are now simply rebuilt by Stories 3.2–3.5.

### Story 3.2 — The two chrome tiers
**As a** person using the console, **I want** the top bar and the section nav to look like the
approved design, **so that** the product reads as one product.
**Acceptance:** top bar **54px** — project switcher, `⌘K`, account, and nothing else. Section nav
**44px** — four tabs, active one 13/500 with a 2px gold underline, inactive 13/400 `--dim`.
- **The project switcher is one level.** No organisation crumb — there is no organisation layer in
  the schema and this epic does not add one (`console-ia-overhaul` D1).
- **The switcher is a menu**, not a list, and its measured box comes from the regenerated spec
  (`122 × 30`), never from the contract's hand-typed `140 × 30`.
**Approved states:** `ship-features`, `today`, `hub-roadmap` (the same two tiers in all three) — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 3.3 — The rail ✳ *two of Daniel's five complaints*
**As a** person navigating a section, **I want** to see where I am, **so that** the rail tells me my
location instead of only offering destinations.
**Acceptance:**
- Rail **236px**; each item **36px, one line, 13.5/600**, with **an SVG icon** from Story 2.4.
  **No description and no `GATED` badge** (contract Do-not #2).
- **The active item is a raised card** — lighter fill, a 1px border, a gold icon, full-strength text
  — carried on `aria-current="page"` so the cue a sighted reader sees and the one a screen reader
  hears are the same attribute. Today the rule exists and paints **fill only**: `--card-2` `#2b2318`
  on the `--roast` `#16120d` ground, no border, no icon, no accent.
- The gate asserts the active item **differs from an inactive one by more than background colour**.
  A cue you have to look for is what shipped last time, and a fill-only assertion would pass on it.
**Approved states:** `ship-features`, `setup-connect`, `measure-journeys` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 3.4 — The environment control ✳ *Daniel's first complaint* — Do-not #5
**As a** person operating a project, **I want** one control naming the environment I am in,
**so that** the rail says where I am rather than offering a filter.
**Acceptance:**
- **One button, `● Production ▾`, opening a menu.** Today `EnvironmentPicker` maps all three
  `FLAG_ENVIRONMENTS` into a permanently-expanded `<ul>` of lowercase links — the "list of three
  expanded" Daniel reported.
- Labels are title-case, and **the chosen environment stays in the URL** — a copy-pasted link must
  still open the same environment (`console-ia-overhaul` Story 1.3). Moving the control does not
  change that.
- The rail **does not learn what an environment is**: it stays a `top` slot, because only Ship has
  one.
- ⚠️ Keep the `> ul` **child** combinator. `.console-rail a` and `.console-rail ul a` both leaked
  onto the picker, and the added specificity overrode its padding, radius **and** weight — killing
  the `aria-current` cue. Two previous attempts missed why.
**Approved states:** `ship-features`, `funnel-standalone` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 3.5 — Palette, dialogs and toasts on the system
**As a** person using the product, **I want** the overlays to belong to the same product,
**so that** the redesign does not stop at the edge of the page.
**Acceptance:**
- `⌘K` renders from `design-system/`, opens on every `/app` route, and **fetches lazily** — first
  press, not page load. Measured last epic as `0 / 1 / 1` requests (load / first open / reopen);
  that must not regress.
- ⚠️ **DISPROVED AT THE SPRINT 3 PASS — this defect is already fixed, and the story asked for it to
  be fixed again.** `console-ia-overhaul` Story 3.4 moved the rule onto the anchor;
  `globals.css:1354` is `.command-palette__panel a[aria-selected='true']` and paints a `--card`
  background plus a 2px gold inset — a visible cursor, today, with a comment above it recording the
  fix. What is missing is not the paint, it is the ASSERTION: nothing in the suite would notice it
  breaking again. So this story **asserts the painted cursor** rather than repairing it, and the
  assertion reads the computed style, never the attribute.
- Dialogs are centred (Story 2.3) and toasts render from the system.
**Risk:** high

### Story 3.6 — ~~Flip it on~~ / ~~Prove the rollback~~ · **DELETED (D6)**

⚠️ This story has now been three things and is none of them. It was *"Flip it on"*; when Daniel said
ship enabled it became *"Prove the rollback, on a design that is already live"*; and with no flag at
all there is neither a flip nor a switch to exercise.

What genuinely remains from it is **not a story**, it is the last two steps of the walkthrough below:
look at the deployed page, and confirm `/app` did not get slower. Both are things a person does after
the merge, not work a sprint carries.

⚠️ **`/app` load cost must not regress** was buried in this story's acceptance and is the one part
worth keeping as a gate rather than a glance — it moves to Story 3.2, which is where the chrome that
could cost it is built.

## Sprint QA
- **api spec(s):** ⚠️ `e2e/design-v2-dark.spec.ts` is **not written** — it asserted the gate-off
  branch, and there is no gate (D6). · `e2e/console-shell.authed.spec.ts` extended (rail active state
  differs by more than background; environment is one control; switcher is one level) ·
  `e2e/command-palette.authed.spec.ts` (painted cursor; request count `0 / 1 / 1`).
- **browser smoke owed:** ⚠️ **nothing is owed to Daniel on Vercel** (D6). There is no env change to
  make and no flip to witness. The walkthrough's production steps remain — looking at the deployed
  page is how a design gets judged — but they are a person looking at a page, not a gated action.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

Env: steps 1–4 **local** (`supabase start`, production build, signed in as the local fixture user) ·
steps 5–6 **production · https://goldenfrijoles.com**, after the merge deploys.

> ⚠️ Preview has **no database** (D3), so every step that needs a signed-in project runs locally or
> in production, never on a preview. This is the same correction Sprints 1–3 all needed.

1. Locally, go to `http://localhost:3000/app/flags/<fixture-slug>`.
   → The rail shows **one** environment control reading `● Production ▾`, not three stacked
   lowercase links.
2. Click it.
   → A menu opens with Development, Preview and Production. Pick Preview.
   → The page reloads into Preview **and the URL changed** — copy it, open it in a new tab, you land
   in Preview again.
3. Look at the rail's list under **In Ship**.
   → Every item has an SVG icon, and **Features** is a raised card with a border and a gold icon —
   you can tell where you are without reading. Not a fill you have to look for.
4. Click **Activity**.
   → The raised card moves to Activity. Nothing else in the rail shifts position.
5. After the merge deploys, open https://goldenfrijoles.com/app/flags/miyagisanchez.
   → The new shell is serving. No flag was flipped and nothing was set in Vercel — the merge is the
   release (D6).
6. Press `⌘K`.
   → The palette opens; ↑/↓ moves a **visible** highlight, not just a screen-reader announcement.

If any step fails, note the step number + what you saw — that's the bug report. ⚠️ If step 5 shows
something badly wrong, the recovery is `git revert` of the sprint's merge commit plus a deploy;
there is no switch (D6).
