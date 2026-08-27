# Four destinations — an information architecture for the signed-in console — Sprint 3: Ship

**Status:** ⬜ not started

> **Build contract (to be locked by the architect before the builder starts).** Cite `D6`, `D7` and
> `D9` from the epic README. Three of this sprint's five stories depend on a lock that must be done
> against **live code and the live production registry**, not inferred:
>
> - **D6 gates Story 3.3.** Deleting the JSON stack is only safe if `[flagKey]/page.tsx` already
>   carries every control it removes. Verify that on `main` first. If anything is missing, 3.3 moves
>   behind the story that lands it — *"a half-landed redesign must never be the only route to that
>   control"* (`flags-console-parity`, Amendment 1).
> - **D7 is an open either/or that Story 3.4 resolves**, with a measured number, not a preference.
> - **D9 decides how big Story 3.2 is.** If TARS features and flag definitions are one registry the
>   tabs are trivial; if they are two, the tabs must say so honestly.
>
> **Story 3.5 is the only story in this epic that changes what a user sees in production.** It is a
> product-owner merge.

## Stories

### Story 3.1 — The features list: the answer line and the dormant collapse
**As an** operator, **I want** the flags page to answer "what is on here, and why" in the first
screen, **so that** I stop scrolling past forty rows that all say the same thing.
**Acceptance:**
- A one-line answer above the list, in plain words — which features Production is serving, how many
  were deliberately switched off, and how many have never been switched at all.
- The three states stay **visually distinct**, including in the switch itself: on is filled, turned
  off is red, **never turned on here is a dashed empty track**. A plain off-switch for "never" would
  re-collapse the distinction `flags-console-parity` Amendment 2 paid to separate.
- **The dormant group collapses to one row** — "N features have never been turned on in
  <environment>" — with a disclosure. Expanded, it paginates at 15.
- Production therefore renders **two rows and one summary line** with no scroll on a 900px viewport.
- Filtering or searching turns grouping off, because a filtered view has no uniform majority to
  summarise.
- The grouping/collapse arithmetic lives in `lib/flag-list-view.ts` — pure, unit-tested, zero DOM —
  not in the component. `buildFlagListView` already does the projection; this extends it.
- Every word rendered comes from `flag-vocabulary.ts` (D7 of `flags-console-parity`). No term is
  retyped in a component.
**Risk:** low

### Story 3.2 — Funnel and Impact as tabs on a feature
**As an** operator, **I want** a feature's funnel and its impact on the same page as its switch,
**so that** I never have to type a key into the address bar again.
**Acceptance:**
- `/app/flags/[projectSlug]/[flagKey]` gains **Funnel** and **Impact** tabs, reading the existing
  query libs with the key **from the route** — no picker, no placeholder, no new query.
- A feature that is off, or has no measured counterpart, gets an **honest empty state** naming which
  it is: "never turned on here, so there is nothing to measure" is different from "this feature is
  not in the TARS registry" (D9).
- `/app/funnel/[projectSlug]/[featureKey]` and `/app/impact/…` keep working and keep their URLs. Old
  links do not break; they simply stop being the only way in.
- One spec asserts a feature page renders funnel numbers for a feature that is on.
**Risk:** low

### Story 3.3 — Delete the JSON authoring stack and the rule builder
**As an** operator, **I want** the flags page to contain no JSON and no talk of immutable versions,
**so that** the page is about my job rather than about how a row is stored.
**Acceptance:**
- With the console gate on, `/app/flags/[projectSlug]` renders **no** `<textarea>`, no
  *"Create an immutable definition version"*, no *"Build a rule" / "Rules" / "Save" / "Show JSON"*.
  These currently render **regardless of `FLAG_CONSOLE_ENABLED`** because they sit outside the three
  `show*` props — that is the actual bug, and it is why `flags-console-parity` closed with them still
  on the page.
- **D6 must be verified first:** `[flagKey]/page.tsx` carries the insight, the preview, the version
  list, per-environment on/off and serve-any-version. The deletion removes a duplicate, not a
  capability.
- The **gate-off branch is untouched** — with `FLAG_CONSOLE_ENABLED` unset the legacy page is
  byte-identical to `main`, provable by `git diff`.
- A spec asserts the rendered page contains none of those strings with the gate on.
- Authoring a definition by hand remains possible where it belongs (the per-feature route and the
  catalog sync); this story removes the *console's* copy of it, not the capability.
**Risk:** high (removes a control — the ordering rule applies)

### Story 3.4 — `⌘K` indexes feature keys
**As an** operator with 42 features, **I want** to type a feature's name from anywhere, **so that**
the fastest path to anything is its name.
**Acceptance:**
- **D7 is resolved in the epic README as a dated amendment, with the measured query cost**, before
  this story is built.
- `⌘K` matches feature keys and descriptions as well as surfaces, labelled so the two kinds are
  distinguishable, and opens the feature.
- Whichever option D7 picks, `/app` route load time does not regress measurably. State the number.
**Risk:** low

### Story 3.5 — Flip the gate; delete the dead header nav
**As a** product owner, **I want** the new console live and the old chrome gone, **so that** the
product has one navigation rather than two behind a switch.
**Acceptance:**
- `CONSOLE_SHELL_ENABLED=true` in **preview first**, verified against the Sprint 1–3 walkthroughs,
  **then production** — each via a commit to `main` (AGENTS rule #4; never `vercel deploy`).
- **Only after the production flip is verified:** the `Home` / `Sections` / `Connect` / `Agent notes`
  links, the `<details>` disclosure and the now-dead gate-off branch are deleted, and
  `isConsoleShellEnabled()` is retired with them.
- `/llms.txt` **still exists and is still served** — it is an agent manifest, and only its human nav
  link is removed.
- The epic-level acceptance check runs clean: every surface reachable in ≤3 clicks or one `⌘K`, with
  no URL typed.
**Risk:** high (product-owner merge — this is what users see)

## Sprint QA
- **api spec(s):** the flags-page string assertions (no textarea / no `Show JSON` / no *immutable*
  with the gate on); a feature-page funnel-render spec; unit specs on the collapse arithmetic in
  `lib/flag-list-view.ts` and on the palette's feature filter.
- **Every new spec must be observed failing at least once** — for 3.3, break the deletion and watch
  the string assertion go red, so it is not a tautology that would pass on an empty page.
- **browser smoke owed:** yes, to the product owner — the flags page renders behind credentials, so
  the "two rows and a summary line" claim is a rendered-page check. The opt-in `browser` project can
  cover it once an authed rail exists; otherwise it is owed by name.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: production · `https://golden-beans-gamma.vercel.app` (preview URL while pre-merge)

1. With the gate on, open `https://golden-beans-gamma.vercel.app/app/flags/miyagisanchez`.
   → You see **two feature rows** and one line reading "N features have never been turned on in
   Production". No scrolling needed to reach the bottom of the list.
2. Use your browser's find-on-page for `immutable`, then for `JSON`.
   → **No matches.**
3. Click the summary line.
   → The dormant features expand, 15 at a time, with Previous/Next.
4. Click `checkout.stripe_enabled`.
   → Its own page opens with tabs including **Funnel** and **Impact**.
5. Click **Funnel**.
   → Targeted / Adopted / Retained numbers render. You did not type a key anywhere.
6. Click **Impact**.
   → Either real numbers, or a sentence naming exactly why there are none.
7. Press `⌘K` and type `stripe`.
   → `checkout.stripe_enabled` appears as a Feature. Press `↵` — it opens.
8. Open `https://golden-beans-gamma.vercel.app/llms.txt`.
   → The manifest still serves. Only its nav link is gone.
9. From `/app`, reach **every** section of the product using only clicks and `⌘K`.
   → No step requires editing a URL. *(This is the epic's acceptance test.)*

If any step fails, note the step number + what you saw — that's the bug report.
