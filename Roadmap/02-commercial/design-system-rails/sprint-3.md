# One design system, every surface — Sprint 3: The shell

**Status:** ⬜ not started

> **The highest-leverage sprint in the epic.** Every `/app` route renders through `ProductShell`, so
> this sprint changes all 20 of them at once — and **four of Daniel's five named complaints live
> here.**
>
> **The flag flips ON at the end of this sprint, not at epic close.** Sprints 4–6 are then built in
> the light with a live rollback, and a missing control is noticed the day it goes missing. That is
> the last epic's own recorded lesson.

## Stories

### Story 3.1 — The kill-switch and its seam ✳ *D6*
**As a** product owner, **I want** one switch that returns the product to the current design,
**so that** a shell rebuild across 20 routes is reversible without a deploy.
**Acceptance:**
- `console.design_v2_enabled` extends `DEFAULT_FLAGS` in `lib/flags.ts`, **enablement polarity —
  default `false`, created DISABLED in every Vercel env**, read `=== 'true'` per that file's own 17
  comments (*set ≠ live*).
- One resolver, `isDesignV2Enabled()`, gated at **`ProductShell`** — every `/app` route inherits it.
- **The gate-off branch is byte-identical to today.** Prove it by *rendering* both off-states — this
  branch and the merge base — normalising per-run ids and diffing, not by reading the diff.
- ⚠️ **The second seam is answered in this story, in writing.** `/hub/*`, `/login`, `/signup`,
  `/install` and `/s/[token]` do **not** render through `ProductShell`, so this flag covers 20 of 29
  routes. Sprint 6 executes whatever the lock decided; it does not discover it.
**Risk:** high

### Story 3.2 — The two chrome tiers
**As a** person using the console, **I want** the top bar and the section nav to look like the
approved design, **so that** the product reads as one product.
**Acceptance:** top bar **54px** — project switcher, `⌘K`, account, and nothing else. Section nav
**44px** — four tabs, active one 13/500 with a 2px gold underline, inactive 13/400 `--dim`.
- **The project switcher is one level.** No organisation crumb — there is no organisation layer in
  the schema and this epic does not add one (`console-ia-overhaul` D1).
- **The switcher is a menu**, not a list, and its measured box comes from the regenerated spec
  (`122 × 30`), never from the contract's hand-typed `140 × 30`.
**Approved states:** `ship-features`, `today`, `hub-roadmap` (the same two tiers in all three) — in `design/console-prototype.html`.
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
**Approved states:** `ship-features`, `setup-connect`, `measure-journeys` — in `design/console-prototype.html`.
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
**Approved states:** `ship-features`, `funnel-standalone` — in `design/console-prototype.html`.
**Risk:** high

### Story 3.5 — Palette, dialogs and toasts on the system
**As a** person using the product, **I want** the overlays to belong to the same product,
**so that** the redesign does not stop at the edge of the page.
**Acceptance:**
- `⌘K` renders from `design-system/`, opens on every `/app` route, and **fetches lazily** — first
  press, not page load. Measured last epic as `0 / 1 / 1` requests (load / first open / reopen);
  that must not regress.
- **The palette's keyboard cursor is visible.** Its rule was written against `li[aria-selected]`
  after `role="option"` moved onto the anchor, so ↑/↓ moved an announcement a screen reader could
  hear and a sighted reader could not see. Assert the *painted* cursor, not the attribute.
- Dialogs are centred (Story 2.3) and toasts render from the system.
**Risk:** high

### Story 3.6 — Flip it on
**As a** product owner, **I want** the new shell live in Production, **so that** the remaining
sprints are built against what people actually see.
**Acceptance:** `console.design_v2_enabled` set to `true` in every Vercel env; the visual gate green
for every route with a reference state; **`/app` load cost does not regress** (counted in a browser,
not reasoned about). Rollback is one env change.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/design-v2-dark.spec.ts` (gate-off renders identically to the merge base —
  four renders, normalised, diffed) · `e2e/console-shell.authed.spec.ts` extended (rail active state
  differs by more than background; environment is one control; switcher is one level) ·
  `e2e/command-palette.authed.spec.ts` (painted cursor; request count `0 / 1 / 1`).
- **browser smoke owed:** yes, to Daniel — **the flag flip in Production (Story 3.6)** is a live
  environment change and is never covered by a merge authorization.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: steps 1–4 on **the branch preview with the flag ON for that scope**; steps 5–7 on
**production · https://goldenfrijoles.com** after Story 3.6.

> ⚠️ Preview does **not** mirror Production's gates (`console-ia-overhaul` A2). On a preview a member
> sees **9** surfaces, not 13 — Flags, Experiments, Journeys and Tasks are gate-closed there. A short
> rail on preview is correct and reads exactly like a broken one.

1. On the preview, go to `<preview-url>/app/flags/miyagisanchez`.
   → The rail shows **one** environment control reading `● Production ▾`, not three stacked links.
2. Click it.
   → A menu opens with Development, Preview and Production. Pick Preview.
   → The page reloads into Preview **and the URL changed** — copy it, open it in a new tab, you land
   in Preview again.
3. Look at the rail's list under **In Ship**.
   → Every item has an icon, and **Features** is a raised card with a border and a gold icon — you
   can tell where you are without reading.
4. Click **Activity**.
   → The raised card moves to Activity. Nothing else in the rail shifts position.
5. (Owed to Daniel by name) Set `console.design_v2_enabled=true` in every Vercel env and redeploy.
   → https://goldenfrijoles.com/app/flags/miyagisanchez serves the new shell.
6. Set it back to `false` and redeploy.
   → The page returns to exactly today's design. **This is the rollback; test it once, deliberately.**
   Set it back to `true`.
7. Press `⌘K` anywhere under https://goldenfrijoles.com/app.
   → The palette opens; ↑/↓ moves a **visible** highlight, not just a screen-reader announcement.

If any step fails, note the step number + what you saw — that's the bug report.
