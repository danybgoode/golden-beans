# Four destinations — an information architecture for the signed-in console — Sprint 3: Ship

**Status:** ✅ **SHIPPED & LIVE** — Part A `4ba9665` (#124); Part B `8f556ce` (**#125**),
deployed to production 2026-08-28 and verified there (below).

⚠️ Part B's per-story commits (`270faa0`, `88dccd0`, `54fa594`, `68a593f`, `05e857c`, `f825f46`,
`2e6f08f`) were **squashed** and are not on `main`. `8f556ce` is the one that is; the PR carries the
individual messages. Recorded because "a squash-merged branch's commits are not on `main`" is a trap
this repo has paid for before, and a doc citing a SHA nobody can `git show` is worse than one citing
the PR.

| Story | | Where |
|---|---|---|
| **Part A** — the design made binding and measurable | ✅ | `4ba9665` (#124): `design/CONSOLE-CONTRACT.md`, `app/console.css`, `e2e/console-visual.authed.spec.ts`, Ship › Features rebuilt, the environment picker moved to the rail, the AgentRail removed from console routes (A22a) |
| **3.1** The answer line and the dormant collapse | ✅ | `4ba9665`, corrected by A20 (three rows, not two; a zero-count clause is dropped) |
| **3.3** Delete the JSON authoring stack and the rule builder | ✅ | #125 — and the replacement in the same commit |
| **3.2** Funnel and Impact as tabs on a feature | ✅ | #125 |
| **3.4** `⌘K` indexes feature keys | ✅ | #125 |
| **3.5** Delete the dead nav | ✅ | #125 (reduced by A19, corrected by A16) |
| *(beyond the stories)* A22 for every signed-in route | ✅ | #125 (A25) |
| *(beyond the stories)* the visual gate joins CI | ✅ | #125 — Story 3.3's promised closing step |

### Verified on production, 2026-08-28, after `8f556ce` deployed

Anonymous — no session, so nothing here can pass for the wrong reason:

| Check | Result |
|---|---|
| `/app/flags/miyagisanchez` and the four new tab URLs | **307 → /login** (they exist and ask you to sign in) |
| `/api/internal/feature-index/miyagisanchez` | **307 → /login** — the route exists and `requireProjectMembership` holds |
| `/app/funnel/golden-beans-demo/setup_guide` in a private window | **200**, funnel numbers render |
| …its chrome | `Connect` → `/install` and `Agent notes` → `/llms.txt` both present |
| …**Story 3.5's deletion** | `product-shell__nav-home` **0** · `product-shell__sections` **0** |
| …no console chrome for a stranger | tabs **0** · account menu **0** · `command-palette` **0** · `is-console` **0** |
| …no credential leak | `gb_connector_` **0** |
| `/llms.txt` · `/install` | **200** · **200** |

> **Story 3.3 ran FIRST, and that was the point.** It is the only story that turns the visual gate's
> assertion [1] green: measured at **2889px in a 960px viewport** on `4ba9665` and `<= 960` after.
> Everything else in Part B was built against a page that already fits on one screen.

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

### Story 3.1 — ✅ The features list: the answer line and the dormant collapse
**As an** operator, **I want** the flags page to answer "what is on here, and why" in the first
screen, **so that** I stop scrolling past forty rows that all say the same thing.
**Acceptance:**
- A one-line answer above the list, in plain words — which features Production is serving, how many
  were deliberately switched off, and how many have never been switched at all.
- ⚠️ **A20 — a clause whose count is ZERO is DROPPED from the sentence, not rendered as "0".** On
  production the "deliberately switched off" count is **0** (see below), so this is the common path,
  not an edge. A summary line that announces an empty category reads worse than one that omits it.
  This is list arithmetic: it lives in `lib/flag-list-view.ts` and is unit-tested at every combination
  of the three counts.
- The three states stay **visually distinct**, including in the switch itself: on is filled, turned
  off is red, **never turned on here is a dashed empty track**. A plain off-switch for "never" would
  re-collapse the distinction `flags-console-parity` Amendment 2 paid to separate.
- ⚠️ **A20 — the red `off` switch has NO live instance and CANNOT be asserted on production.** Its
  spec needs a constructed fixture; a browser check against the live tenant would pass vacuously,
  because there is no such row to render. (`landing-frijoles-rebrand` shipped three guards that could
  not fail. This is how.)
- **The dormant group collapses to one row** — "N features have never been turned on in
  <environment>" — with a disclosure. Expanded, it paginates at 15.
- ⚠️ **A20 — measured on live production, 2026-08-28: 3 on · 0 off · 39 never, of 42.** So the page
  renders **three feature rows and one summary line reading "39 features have never been turned on in
  Production"** — not "two rows", which is what this story used to say. No scroll on a 900px viewport.
- ⚠️ **The contract's "34 of 42" is a DIFFERENT axis and must not be conflated.** It is confirmed (34
  flags' latest version has `defaultVariantKey: "off"`, 8 have `"on"`) but it describes what a
  definition *defaults to*, not whether an environment has *activated* it. A flag can default to
  `false` and have never been switched on. The number behind "activated ≠ on" on this page is **39**.
- Filtering or searching turns grouping off, because a filtered view has no uniform majority to
  summarise.
- The grouping/collapse arithmetic lives in `lib/flag-list-view.ts` — pure, unit-tested, zero DOM —
  not in the component. `buildFlagListView` already does the projection; this extends it.
- Every word rendered comes from `flag-vocabulary.ts` (D7 of `flags-console-parity`). No term is
  retyped in a component.
**Risk:** low

### Story 3.2 — ✅ Funnel and Impact as tabs on a feature
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

### Story 3.3 — ✅ Delete the JSON authoring stack and the rule builder
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

### Story 3.4 — ✅ `⌘K` indexes feature keys
**As an** operator with 42 features, **I want** to type a feature's name from anywhere, **so that**
the fastest path to anything is its name.
**Acceptance:**
- **D7 is resolved in the epic README as a dated amendment, with the measured query cost**, before
  this story is built.
- `⌘K` matches feature keys and descriptions as well as surfaces, labelled so the two kinds are
  distinguishable, and opens the feature.
- Whichever option D7 picks, `/app` route load time does not regress measurably. State the number.
**Risk:** low

### Story 3.5 — ✅ REDUCED by A19: the flip already happened; this deletes the dead nav
**As a** product owner, **I want** the new console live and the old chrome gone, **so that** the
product has one navigation rather than two behind a switch.
**Acceptance:**
- ⚠️ **DONE AT SPRINT 2 (A19).** Daniel overruled D4 — *"done means shipped to production always. and
  not dark, always enabled"* — so `CONSOLE_SHELL_ENABLED=true` was set in all three scopes and made
  live by the Sprint 2 merge. Sprint 3 therefore builds against a LIVE console, which makes A3's
  "land the replacement in the same commit as the deletion" load-bearing rather than prudent: there is
  no dark period in which a missing control would go unnoticed.
- ⚠️ **CORRECTED by A16 — the gate-off branch is NOT "now-dead" after the flip, and deleting it as
  written would strip the public demo dashboards of all header content.** **`Home` and the
  `<details>` disclosure go. `Connect` and `Agent notes` STAY** — they are the public chrome's only
  route to `/install` and `/llms.txt`, and they never rendered in the console branch at all. `Home`
  is safe because its destination is duplicated: both branches link `/app` from the logo, so deleting
  it removes a link and not a route. See A16.
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

## Sprint QA — what was run, and what it found

**The deterministic gate, in CI's own order** (`lint` → `format:changed` → `test:unit` →
`typecheck` → `build` → Playwright `api`): green. **1457 unit tests · 486 api specs · 0 failures.**

**The `authed` browser rail: 84 specs green**, run on purpose — it is not in the blocking gate, and
`landing.browser.spec.ts` is the standing proof of what happens to a suite nothing runs. Both gate
states were exercised against **two real servers**, because a test process with a flag unset talking
to a server that has it set asserts the opposite of what it claims: the lit run on `:3000` and a
`:3100` process with `CONSOLE_SHELL_ENABLED` and `FLAG_CONSOLE_ENABLED` unset (19 dark specs green,
including the reduced gate-off header).

**Every new spec was observed failing at least once**, each against a specific mutation and each
reported here with what it said:

| Mutation | What went red |
|---|---|
| `showAuthoring={true}` (un-delete the JSON stack) | the deletion spec, **and** visual `[1]` at *"the page is 2748px tall in a 960px viewport"* |
| Remove `<NewFeature>` from the page head | the presence assertion **and** the end-to-end wizard run |
| `.sw { width: 30px }` | `[spec] the row switch width is 30px, contract says 38px` |
| `notFound()` on `feature_not_found` in the Funnel pane | `the Funnel tab must not 404 a feature that exists · Expected 200, Received 404` |
| A zero KPI inside the empty state | `expect(.kpi).toHaveCount(0) · Received: 1` |
| The feature index returns nothing | `⌘K finds a FEATURE by its key and opens it` |

**The gate-off guarantee was proved by RENDERING, in both off-states** (A21: the promise is about
two gates). The flags page was rendered on this branch and on `4ba9665`, with `FLAG_CONSOLE_ENABLED`
unset and then with `FLAG_RULE_BUILDER_ENABLED` unset as well, and the four DOMs diffed after
normalising per-run ids and timestamps. **Identical, both times.** The one residual difference is a
preloaded chunk in the RSC payload — the new client component joins the route's manifest even though
it does not render — which is stated rather than folded into "byte-for-byte".

**The visual gate now runs in CI** (`f825f46`), which was Story 3.3's promised closing step. Wiring
it surfaced that **`FLAG_CONSOLE_ENABLED` was set nowhere in the workflow**: the whole blocking gate
had been running with the flag console dark while production served it lit. Fixed the same way A19
fixed `CONSOLE_SHELL_ENABLED` — explicitly off on the `:3100` server, on everywhere else.

**browser smoke owed to the product owner:** the walkthrough below. The mechanical half is now
automated (the visual gate, in CI); what is left is the judgement — and the two steps that write to
production, which are flagged by name in it.

## Sprint 3 — Smoke walkthrough (do these in order)

Env: **production · `https://goldenfrijoles.com`**, signed in as an owner of `miyagisanchez`.

⚠️ Two things this walkthrough used to get wrong, kept here because they still apply. The host is
`goldenfrijoles.com` (`golden-beans-gamma.vercel.app` is the old deployment host). And per **A2**
there is **no useful pre-merge preview run** for these steps: `FLAG_SERVING_ENABLED` is
Production-only, so the flags page's own gate is closed on a preview.

Each step is one action and one expected result. If any of them disagrees, note the step number and
what you saw — that is the bug report.

1. Open `https://goldenfrijoles.com/app/flags/miyagisanchez`.
   → **Three feature rows** and one line reading **"39 features have never been turned on in
   Production"**. The whole page fits without scrolling.
   → ⚠️ **Do not look for a red "turned off" switch — there is none, and that is correct.** Nobody
   has ever deliberately switched a flag off in production (0 of 42), so that state has nothing to
   render (A20). Its styling is unit-tested against a constructed fixture instead.
2. Use find-on-page for `immutable`, then for `JSON`.
   → **No matches.** This is Story 3.3: both free-key authoring surfaces are gone from this page.
3. Click the summary line ("Show them").
   → The dormant features expand.
4. Look at the right-hand column, headed **On / off**.
   → A **switch** on every row: filled green for the three that are on, a **dashed empty track** for
   the ones nobody has ever touched. Three states, not two.
5. Click the switch on a feature that is ON, in Production.
   → A dialog naming **that** feature and **that** environment, and saying what stops working.
   Cancel it. → Nothing changed.
   → ⚠️ **This is a real kill switch on a real tenant.** Cancelling is the whole of this step.
6. Click **+ New feature** (top right).
   → A three-step wizard: **Name · Kind · Check**. Step 1 has an area picker, one field to type in,
   and a fixed `_enabled` ending, with a box showing the key the code will import.
   → ⚠️ **This control is why step 2 is allowed to be true.** Before Story 3.3 the page had TWO ways
   to create a feature and both were deleted; this replaced them, in the same commit.
7. In the wizard, type a name and a sentence, press **Continue**, pick a kind and a risk, press
   **Continue**, then **Create feature**.
   → It lands you **on the new feature's own page**. The review step said it before you pressed:
   *"Nothing is switched on yet, so nothing changes for anyone today."*
   → ⚠️ **This writes a real definition version to production.** Use a name you are happy to keep —
   a definition is immutable and cannot be deleted, only superseded.
8. On any feature's page, look at the tab strip.
   → Six tabs: **Value · Targeting · Funnel · Impact · History · Settings**. Above them, one row per
   environment saying whether it is on there and who did it.
9. Click **Funnel**.
   → ⚠️ **Expect a SENTENCE, not numbers, and that is CORRECT (A4).** It reads that this is a feature
   flag and nothing in the TARS registry is measuring it. Production holds **1** TARS feature
   (`setup_guide`) against **42** flags and the two sets do not intersect at all. The page must NOT
   404 — a tab that 404s a feature because the *other* registry has no row is a regression caused by
   a missing measurement.
10. Click **Impact**.
    → The same shape: a sentence naming exactly why there are no numbers.
11. Open `https://goldenfrijoles.com/app/funnel/miyagisanchez/setup_guide`.
    → **Targeted / Adopted / Retained numbers render.** This is the one key in this tenant that has a
    funnel, and it proves the read path works — the empty tabs above are an honest absence, not a
    break. The old route still works and still has its own URL.
12. Press `⌘K` (Ctrl-K on Windows) and type `stripe`.
    → `checkout.stripe_enabled` appears, tagged **FEATURE**. Press `↵` — its page opens.
    → Then type `Flag audit`. → It appears tagged **GO TO**. Both kinds, one palette.
13. Look at the top of `/app/flag-audit/miyagisanchez`, then `/app/setup/keys/miyagisanchez`.
    → Each heading is just **"Flag audit"** / **"Keys"** — no `— miyagisanchez` suffix and no
    "← Your projects" link. The project is named once, in the switcher at the top right (A25).
    → Column headers read as small caps in the UI font, never as tracked monospace.
14. Open `https://goldenfrijoles.com/llms.txt`.
    → The manifest still serves.
15. In a **private window**, open
    `https://goldenfrijoles.com/app/funnel/golden-beans-demo/setup_guide`.
    → You are NOT signed in, and the page still renders: the funnel numbers, plus a header carrying
    **Connect** and **Agent notes**. No Today/Measure/Ship/Setup tabs, no project name, no Account
    menu, no `Home` link. `⌘K` does nothing.
    → This is A16's acceptance criterion, and it is the step that proves Story 3.5 did not strip the
    public demo dashboards of their chrome.
16. From `/app`, reach **every** section of the product using only clicks and `⌘K`.
    → No step requires editing a URL. *(This is the epic's acceptance test.)*

### What this walkthrough deliberately does not cover

- **Mint a connector URL** (`Setup › Connect`) — a real production credential mint, which is never
  pre-authorized and is owed to Daniel by name from Sprint 2.
- **Command Center's own layout.** `/app` still renders the pre-contract page: mono-italic caveats
  and a wide vertical gap between the stat row and the funnel figures. A25 records why it was left —
  it is a page redesign, no story in this epic covers it, and half-doing it would leave a route that
  is neither. Owed.
- **`landing.browser.spec.ts:630`** is red on `main` (`expected > 3, received 2` in-page anchors),
  reproduced identically on `4ba9665`. It belongs to a landing epic and decayed because the `browser`
  project runs in no pipeline. Reported, not patched here.
