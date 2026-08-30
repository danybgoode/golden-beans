# One design system, every surface — Sprint 3: The shell

**Status:** ⬜ not started

> **The highest-leverage sprint in the epic.** Every `/app` route renders through `ProductShell`, so
> this sprint changes all 20 of them at once — and **four of Daniel's five named complaints live
> here.**
>
> **The flag flips ON at the end of this sprint, not at epic close.** Sprints 4–6 are then built in
> the light with a live rollback, and a missing control is noticed the day it goes missing. That is
> the last epic's own recorded lesson.

## Build contract (locked by the architect before the builder started)

> Sprint 3 is **not delegated** (README → *Routing*): a kill-switch, a shared seam, and a production
> flip. **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/lib/flags.ts` · `apps/web/components/product/ProductShell.tsx` ·
`apps/web/components/product/{ConsoleRail,CommandPalette}.tsx` ·
`apps/web/app/app/flags/[projectSlug]/environment-picker.tsx` · `apps/web/design-system/**` ·
`apps/web/app/console.css` · the three specs named in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | ⚠️ **The flag is `DESIGN_V2_ENABLED`, read by `isDesignV2Enabled()`.** `DEFAULT_FLAGS` **does not exist** anywhere in this repo — `lib/flags.ts` is 22 `process.env.<NAME>_ENABLED === 'true'` predicates, and no flag here has ever had a dotted lower-case key. Every `console.design_v2_enabled` in this file and in `sprint-6.md` is that name. | **D6** |
| 2 | Enablement polarity. Exactly `=== 'true'`. Read **fresh per request**, no module-level capture. Created **DISABLED in Production, Preview and Development before this sprint merges** — a var that does not exist is not "created disabled", it is unverifiable. | **D6** |
| 3 | Seam **A** is `ProductShell`, covering **20** routes. Seam **B** (the other 9) is `design-system/Frame.tsx` and lands in Story 6.1 — **already decided, not discovered.** Root `layout.tsx` is **rejected** as seam B because it also wraps `/` and `/methodology`, which two shipped epics own. | **D6** |
| 4 | **The gate-off branch is byte-identical to today.** Proved by *rendering* both off-states — this branch and the merge base — normalising per-run ids and diffing. **Not by reading the diff.** | LEARNINGS |
| 5 | Chrome geometry comes from the **regenerated** spec: top bar **54**, section nav **44**, active tab **13/500** with a 2px gold underline, inactive **13/400 `--dim`**, rail **236**, rail item **36px / 13.5/600**, switcher **`122 × 30`** — never the contract's hand-typed `140 × 30`. | **D8** |
| 6 | The active rail item **differs from an inactive one by more than background colour**, and the cue is carried on `aria-current="page"` so the sighted and screen-reader cues are the same attribute. **A fill-only assertion would pass on what shipped last time** — assert border, icon colour and text weight too. | Story 3.3 |
| 7 | ⚠️ Keep the `> ul` **child** combinator on the environment control. `.console-rail a` and `.console-rail ul a` both leaked onto the picker and overrode its padding, radius **and** weight, killing the `aria-current` cue. Two previous attempts missed why. | Story 3.4 |
| 8 | The chosen environment **stays in the URL**. Moving the control must not change that — a copy-pasted link opens the same environment. | `console-ia-overhaul` 1.3 |
| 9 | `⌘K` **fetches lazily**: `0 / 1 / 1` requests (load / first open / reopen), counted in a browser. Its keyboard cursor is asserted as a **painted** cue, not as an attribute — the old rule was written against `li[aria-selected]` after `role="option"` moved onto the anchor. | Story 3.5 |
| 10 | **Story 3.6's production flip is OWED TO DANIEL BY NAME.** A live environment change is never covered by a merge authorization. The rollback (`false`, redeploy, confirm today's design returns, `true` again) is **tested once, deliberately**. | WAYS-OF-WORKING |
| 11 | `/app` load cost does not regress — **counted in a browser**, not reasoned about. | Story 3.6 |

## Stories

### Story 3.1 — The kill-switch and its seam ✳ *D6*
**As a** product owner, **I want** one switch that returns the product to the current design,
**so that** a shell rebuild across 20 routes is reversible without a deploy.
**Acceptance:**
- ⚠️ **CORRECTED AT THE LOCK (D6): `DESIGN_V2_ENABLED`, not `console.design_v2_enabled`, and there is no `DEFAULT_FLAGS` to extend** — it exists in no file in this repo. `isDesignV2Enabled()` joins `lib/flags.ts`'s 22 sibling predicates, **enablement polarity —
  default `false`, created DISABLED in every Vercel env**, read `=== 'true'` per that file's own 17
  comments (*set ≠ live*).
- One resolver, `isDesignV2Enabled()`, gated at **`ProductShell`** — every `/app` route inherits it.
- Created **DISABLED in all three Vercel environments before this sprint merges** (D6).
- **The gate-off branch is byte-identical to today.** Prove it by *rendering* both off-states — this
  branch and the merge base — normalising per-run ids and diffing, not by reading the diff.
- ⚠️ **The second seam was answered AT THE LOCK, not here (D6).** `/hub/*` (×4), `/login`,
  `/signup`, `/install`, `/s/[token]` and `/talk` do **not** render through `ProductShell` — verified:
  they share no wrapper at all (`.auth-shell`, the landing `Nav`/`Footer`, `hub.module.css`, and
  `/s/[token]` reusing the hub's report components). So this flag covers **20 of 29**. Seam B is a
  new `design-system/Frame.tsx` with DD3's `door` and `public` variants, landing in Story 6.1 and
  reading this same `isDesignV2Enabled()`. Root `layout.tsx` is **rejected** — it also wraps `/` and
  `/methodology`, and gating them would put two shipped epics behind this epic's kill-switch.
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
- **The palette's keyboard cursor is visible.** Its rule was written against `li[aria-selected]`
  after `role="option"` moved onto the anchor, so ↑/↓ moved an announcement a screen reader could
  hear and a sighted reader could not see. Assert the *painted* cursor, not the attribute.
- Dialogs are centred (Story 2.3) and toasts render from the system.
**Risk:** high

### Story 3.6 — Flip it on
**As a** product owner, **I want** the new shell live in Production, **so that** the remaining
sprints are built against what people actually see.
**Acceptance:** `DESIGN_V2_ENABLED` set to `true` in every Vercel env; the visual gate green
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

> ⚠️ **REWRITTEN AT THE LOCK (D9).** As scaffolded, steps 1–4 ran on *"the branch preview with the
> flag ON for that scope"*. **Preview has no Supabase credentials and no session** — it cannot serve
> `/app/flags/…` at all, with any flag in any position. The scaffold's own warning about preview's
> gates was true but far too mild: the problem is not that a preview shows 9 surfaces instead of 13,
> it is that a preview shows a 500. Steps 1–4 are **local**; steps 5–7 are **production**.

Env: steps 1–4 **local** (`supabase start`, production build, `DESIGN_V2_ENABLED=true`, signed in as
the local fixture user) · steps 5–7 **production · https://goldenfrijoles.com** after Story 3.6.

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
5. **(Owed to Daniel by name — live environment change.)** Set `DESIGN_V2_ENABLED=true` in all three
   Vercel environments, then merge a commit to `main`. A set var reaches running functions only via
   a new build (AGENTS rule #4) — `vercel env ls` is never the confirmation.
   → https://goldenfrijoles.com/app/flags/miyagisanchez serves the new shell.
6. **(Owed to Daniel by name.)** Set it back to `false`, redeploy.
   → The page returns to exactly today's design. **This is the rollback; test it once,
   deliberately.** Set it back to `true` and redeploy again.
7. Press `⌘K` anywhere under https://goldenfrijoles.com/app.
   → The palette opens; ↑/↓ moves a **visible** highlight, not just a screen-reader announcement.
   Open DevTools' Network tab and reload: **0** palette requests on load, **1** on first open,
   **1** on reopen.

If any step fails, note the step number + what you saw — that's the bug report.
