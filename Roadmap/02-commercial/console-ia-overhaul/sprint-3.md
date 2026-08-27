# Four destinations — an information architecture for the signed-in console — Sprint 3: Ship

**Status:** ⬜ not started

> ## Build contract (locked by the architect before the builder started — 2026-08-27)
>
> **Cite `D6`, `D7`, `D9`, `A2`, `A3`, `A4`, `A6` from the epic README. Do not re-derive them.**
> Three of this sprint's five stories rested on a lock that had to be done against live code and the
> live production registry. Two of those locks came back **disproved**, and the corrections below are
> the contract — not the sentences they replace.
>
> **Where the rules live:** every user-facing flag word → `app/app/flags/[projectSlug]/flag-vocabulary.ts` ·
> the three activation states and all list arithmetic → `lib/flag-list-view.ts` · gate polarity →
> `lib/flags.ts` · "merge to `main` is the deploy, and a var needs a new deployment" → `AGENTS.md` rule #4.
>
> ### ⚠️ A3 — Story 3.3 is RE-SCOPED. D6 is a superset for four controls and NOT for the fifth.
>
> `[flagKey]/page.tsx` carries the insight, the preview, the immutable version list with its JSON,
> per-environment on/off, and serve-any-version. It **cannot create a flag key that does not yet
> exist** — it renders `<FlagAuthoring flagKey={flag.key} />`, fixed from the route.
>
> The `<form onSubmit={onCreate}>` in `flag-manager.tsx` (lines 386–427), whose `<h2>` reads *"Create an
> immutable definition version"*, is **the only surface in the product that can create a new feature.**
> `flag-manager.tsx` lines 429–436 already say so, because it nearly happened once already: *"there
> would have been NO way to create a new flag at all… The authoring form therefore STAYS in both gate
> states until something replaces it."* Story 3.3's own escape hatch — *"authoring remains possible on
> the per-feature route"* — is **false**.
>
> **So Story 3.3 deletes the duplicate AND lands the replacement, in the same story:**
> - **Deleted** (console gate ON only): the per-flag definitions stack, `RuleBuilder`, the raw-JSON
>   authoring textarea, and the retired vocabulary — no `<textarea>`, no *"Create an immutable
>   definition version"*, no *"Rules" / "Save" / "Show JSON"*.
> - **Landed in the same commit:** a **"New feature"** control on the features list, written in
>   `flag-vocabulary.ts` words, posting through the **same** `createFlagDefinitionVersionAction` — one
>   write path, one validator (`flags-visual-rule-builder` A1).
> - **Untouched:** the gate-off branch, byte-for-byte, provable by `git diff`.
>
> *This is LEARNINGS' rule applied before a builder could break it: land the replacement and retire the
> original in the SAME story. Before retiring anything, enumerate what the old surface did and name each
> item's new home — that enumeration is above, and creation is the row that had no home.*
>
> ### ⚠️ A4 — Story 3.2's tabs are EMPTY for 42 of 42 features, and the empty state is the deliverable.
>
> Live production, `miyagisanchez`, 2026-08-27: `features` (TARS) holds **1** row — `setup_guide`.
> `flag_registries` holds **42**. **The join on `key` returns 0.** They are separate tables with separate
> lifecycles and separate naming conventions, and not one flag has a TARS counterpart.
>
> Build the tabs. For every feature in the registry today they render the sentence naming *which*
> absence this is — *"…is a feature flag. It has no funnel because nothing in the TARS registry is
> measuring it"* — never a zero. Two hard constraints:
>
> 1. **The tab must not call `notFound()`.** `app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26`
>    does exactly that on `feature_not_found`. A tab that 404s the whole feature page because the *other*
>    registry has no row is a regression caused by a missing measurement.
> 2. **The "funnel renders numbers" spec belongs on `setup_guide`**, which is not a flag — so it lives at
>    `/app/funnel/miyagisanchez/setup_guide`. The feature-page tab spec asserts the **empty state**.
>    Asserting numbers on a flag's tab is a test that cannot pass.
>
> ### A6 — Story 3.4's shape, and the number it must state
>
> `GET /api/internal/feature-index/[projectSlug]` — `requireProjectMembership` first (no new auth
> boundary), then the **existing** `getFlagRegistryView()`, projected **server-side** to
> `{ key, description }[]`. Measured: the full registry is **5 round trips, 15,639 bytes of definition
> JSONB and 55 audit rows**; the keys alone are **1,102 bytes**. Fetch on **first `⌘K`**, never on page
> load. **The number Story 3.4 states: `/app` load cost is unchanged — zero added queries, zero added
> bytes.** The one stated deviation is that this is a new *route* (no new SQL) — decided in A6, not
> discovered here.
>
> ### Story 3.1 — where the arithmetic lives
>
> The grouping and collapse arithmetic goes in `lib/flag-list-view.ts` — pure, zero DOM, unit-tested,
> extending `buildFlagListView`. Not in the component. The three states stay visually distinct **in the
> switch itself** (on filled · turned off red · never-turned-on a dashed empty track): a plain
> off-switch for "never" re-collapses the distinction `flags-console-parity` Amendment 2 paid to
> separate, and **34 of 42 flags' latest version evaluates `false`**, so "activated ≠ on" is the common
> case, not a corner.
>
> ### ⚠️ A16 — Sprint 1 made `header === null` permanently reachable, so Story 3.5 deletes LESS than it said
>
> *(Recorded 2026-08-27 from the fresh reviewer's fourth pass on PR #122, and corrected on its fifth —
> the first draft of this amendment contradicted itself, which is exactly the failure it exists to
> prevent. Written now because the reason is legible in Sprint 1's code today and will not be in three
> sprints.)*
>
> Story 3.5 said it deletes *"the `Home` / `Sections` / `Connect` / `Agent notes` links, the
> `<details>` disclosure and **the now-dead gate-off branch**"*. After Sprint 1 that branch is **not
> dead after the flip**, because `header === null` no longer means "the gate is off". It means *"the
> console chrome does not apply to this render"*, and two states reach it permanently, neither about
> the gate:
>
> 1. **Anonymous.** `/app/funnel/golden-beans-demo/<key>` and `/app/impact/golden-beans-demo/<key>` are
>    permanently anonymous, permanently allow-listed (`lib/public-demo.ts`, AGENTS rule #2) and
>    permanently render this shell. The console needs a session; they have none.
> 2. **The `getShellNav` catch.** A nav-read failure cannot claim signed-in chrome.
>
> **Follow 3.5 as written and the public demo dashboards render a `<div class="product-shell">` with
> no header content at all.** (The louder failure is safer: delete the ternary and always render the
> console branch, and `header.tabs` is a null deref TypeScript stops. The silent degradation is the
> one to plan against.)
>
> ### ⚠️ The correction the first draft of A16 got wrong, and the DECISION it needs
>
> That draft said 3.5 *"deletes the four **signed-in** legacy links"* and, three bullets later, that an
> anonymous visitor must still see *"at minimum Connect and Agent notes"*. **Both cannot hold.**
> `Connect` and `Agent notes` exist ONLY in the legacy branch — the console branch never rendered
> them — so "the four signed-in legacy links" has no referent. Caught by the reviewer's fifth pass.
>
> **DECIDED: the public chrome keeps `Connect` and `Agent notes` after the flip.** They point at
> `/install` and `/llms.txt`, which are genuinely public destinations, and a public page that can
> reach neither is a worse product than one signed-in nav entry too many. So Story 3.5 deletes:
>
> - **`Home`** from the legacy branch, and the **`<details>` disclosure** — noting that `Sections` is
>   *already* never rendered anonymously, because it requires `activeProject`, which is null without a
>   session. So the disclosure's deletion is signed-in-only by construction.
> - **NOT** `Connect`, **NOT** `Agent notes`, and **NOT** the branch itself.
>
> ⚠️ **This contradicts Story 3.5's own unchanged `/llms.txt` bullet**, which says *"only its human nav
> link is removed"*. That link IS `Agent notes`. Amended: it is removed from the **signed-in console
> chrome** (where it never existed) and **retained in the public chrome**. Without this, whoever runs
> 3.5 deletes the link, `console-shell-public.browser.spec.ts` goes red, and the obvious repair is to
> delete the assertion — losing the exact guard that was added to catch this.
>
> **New acceptance for 3.5:** *after the flip, an anonymous visitor to
> `https://goldenfrijoles.com/app/funnel/golden-beans-demo/setup_guide` still reaches `/install` and
> `/llms.txt` from the page chrome, and sees no console chrome.* Pinned by
> `e2e/console-shell-public.browser.spec.ts`, which asserts both halves on the **href**, not the label
> — and note that only its gate-ON run discriminates, which after the flip is the default run.
>
> `isConsoleShellEnabled()` also cannot simply be "retired": it becomes constant-true for the three
> signed-in branches, and the anonymous and catch branches never consulted it at all.
>
> ### Story 3.5 — the flip
>
> Product-owner merge. `CONSOLE_SHELL_ENABLED=true` in **preview first, then production**, each via a
> **commit to `main`** (AGENTS rule #4 — setting the var is half the job; never `vercel deploy`).
> **Per A2, the gate-on walkthrough steps run on PRODUCTION**, because `FLAG_SERVING_ENABLED`,
> `EXPERIMENT_GOVERNANCE_ENABLED`, `SIGNALS_ENABLED` and `JOURNEY_PROJECTIONS_ENABLED` are
> Production-only and a preview therefore shows 9 surfaces where production shows 13.
> **Only after the production flip is verified** are the dead header links, the `<details>` disclosure
> and the gate-off branch deleted, and `isConsoleShellEnabled()` retired with them.
>
> ### Every new spec is observed failing at least once
>
> Especially 3.3's string assertions: break the deletion and watch them go red, or they are a tautology
> that would also pass on an empty page. `landing-frijoles-rebrand` shipped three guards that could not
> fail; `flags-visual-rule-builder`'s single most important check asserted nothing because Playwright's
> `toContainText` normalises whitespace. **Assert on parsed values, not rendered substrings.**

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
- ⚠️ **A4 — the honest empty state IS the deliverable, for 42 of 42 features today.** `features`
  (TARS) holds **1** row for `miyagisanchez` — `setup_guide` — against **42** flag definitions, and the
  join on `key` returns **0**. The tab names *which* absence this is ("…is a feature flag; nothing in
  the TARS registry is measuring it") and never renders a zero.
- **The tab must NOT call `notFound()`.** `app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26` does
  exactly that on `feature_not_found`; a tab that 404s the whole feature page because the *other*
  registry has no row is a regression caused by a missing measurement.
- `/app/funnel/[projectSlug]/[featureKey]` and `/app/impact/…` keep working and keep their URLs. Old
  links do not break; they simply stop being the only way in.
- **Two specs, because one cannot cover both:** funnel numbers are asserted at
  `/app/funnel/miyagisanchez/setup_guide` (the only key that has any), and the feature-page tab spec
  asserts the **empty state**. Asserting numbers on a flag's tab is a test that cannot pass.
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
- ⚠️ **A3 — D6 was verified and came back PARTIALLY DISPROVED.** `[flagKey]/page.tsx` carries the
  insight, the preview, the version list, per-environment on/off and serve-any-version — and it
  **cannot create a flag key that does not yet exist** (`<FlagAuthoring flagKey={flag.key} />`, fixed
  from the route). The `<form onSubmit={onCreate}>` block in `flag-manager.tsx:386–427` is the **only**
  surface in the product that can create a new feature, and lines 429–436 of that file already say so.
- **So this story lands the replacement in the same commit as the deletion:** a **"New feature"**
  control on the features list, in `flag-vocabulary.ts` words, posting through the **same**
  `createFlagDefinitionVersionAction` — one write path, one validator. The deletion removes a
  duplicate; without this control it would remove a capability.
- The **gate-off branch is untouched** — with `FLAG_CONSOLE_ENABLED` unset the legacy page is
  byte-identical to `main`, provable by `git diff`.
- A spec asserts the rendered page contains none of those strings with the gate on.
- ~~Authoring a definition by hand remains possible where it belongs (the per-feature route and the
  catalog sync)~~ — **false for the per-feature route, corrected by A3.** Creating a *new* key remains
  possible on the features list's new control (above) and through catalog sync; **versioning an
  existing** key remains possible on the per-feature route. This story removes the console's
  *duplicate*, not the capability.
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
- ⚠️ **CORRECTED by A16 — the gate-off branch is NOT "now-dead" after the flip, and deleting it as
  written would strip the public demo dashboards of all header content.** Only the four **signed-in**
  legacy links go. See A16 below for what must survive and what an anonymous viewer must still see.
- ⚠️ **CORRECTED by A16 —** `/llms.txt` **still exists, is still served, and KEEPS its `Agent notes`
  link in the public chrome.** The original bullet said "only its human nav link is removed"; that
  link is `Agent notes`, which lives only in the branch an anonymous visitor gets. Removing it would
  strip the public demo dashboards of their route to the manifest AND turn
  `e2e/console-shell-public.browser.spec.ts` red, whose obvious repair is deleting the assertion that
  exists to catch this. It is removed from the **signed-in** console chrome — where it never rendered
  — and retained publicly.
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
Env: **production · `https://goldenfrijoles.com`**, after Story 3.5's flip.

⚠️ Two corrections to what this walkthrough used to say. The host is `goldenfrijoles.com` (the
product was renamed in `landing-frijoles-rebrand`; `golden-beans-gamma.vercel.app` is the old
deployment host). And per A2 there is **no useful pre-merge preview run** for these steps —
`FLAG_SERVING_ENABLED` is Production-only, so the flags page's own gate is closed on a preview.

1. With the gate on, open `https://goldenfrijoles.com/app/flags/miyagisanchez`.
   → You see **two feature rows** and one line reading "N features have never been turned on in
   Production". No scrolling needed to reach the bottom of the list.
2. Use your browser's find-on-page for `immutable`, then for `JSON`.
   → **No matches.**
3. Click the summary line.
   → The dormant features expand, 15 at a time, with Previous/Next.
4. Click `checkout.stripe_enabled`.
   → Its own page opens with tabs including **Funnel** and **Impact**.
5. Click **Funnel**.
   → ⚠️ **Expect a sentence, not numbers, and that is CORRECT (A4).** It reads that this is a feature
   flag and nothing in the TARS registry is measuring it. Production holds **1** TARS feature
   (`setup_guide`) against **42** flags, and the two sets do not intersect at all. The old walkthrough
   promised numbers here; they cannot exist, and the sentence is what the tab was worth building for.
6. Click **Impact**.
   → The same shape: a sentence naming exactly why there are no numbers.
6b. Open `https://goldenfrijoles.com/app/funnel/miyagisanchez/setup_guide`.
   → **Targeted / Adopted / Retained numbers render.** This is the one key in this tenant that has a
   funnel, and it proves the read path works — the empty tabs above are an honest absence, not a break.
6c. On the features list, click **New feature**.
   → A creation form opens, in plain words, with no JSON. **This is A3's replacement control** — it
   must exist, because this story deleted the only other way to create a feature.
7. Press `⌘K` and type `stripe`.
   → `checkout.stripe_enabled` appears as a Feature. Press `↵` — it opens.
8. Open `https://goldenfrijoles.com/llms.txt`.
   → The manifest still serves. Only its nav link is gone.
9. From `/app`, reach **every** section of the product using only clicks and `⌘K`.
   → No step requires editing a URL. *(This is the epic's acceptance test.)*

If any step fails, note the step number + what you saw — that's the bug report.
