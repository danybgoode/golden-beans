# One design system, every surface — Sprint 4: Ship and Setup, finished

**Status:** 🟦 In review — all six stories built, both gates green locally
(**492 api passed / 35 skipped**, **112 authed passed / 8 skipped**), coverage **8 / 27**.

> **Ship and Setup are the two sections that already have approved states**, so this sprint is
> execution against pixels rather than design. Six of the ten approved renders are here, and
> **three of Daniel's five named complaints** are closed by Stories 4.4 and 4.5.
>
> **The flag is ON from Sprint 3.** Every story here lands the replacement and retires the original
> **in the same commit** (`console-ia-overhaul` A3) — never as a cleanup story, because with the
> shell live there is no dark period in which a missing control goes unnoticed.

## Build contract (locked by the architect before the builder started)

> Sprint 4 is **delegated per story** over this contract — except **Story 4.5, which stays with the
> architect**: it moves credential minting and retires three live credential routes, and credentials
> are the never-delegated row (README → *Routing*). **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/app/app/flags/**` · `apps/web/app/app/funnel/**` ·
`apps/web/app/app/impact/**` · `apps/web/app/app/flag-audit/**` · `apps/web/app/app/setup/**` ·
`apps/web/app/app/{keys,flag-credentials,agent-keys}/**` (retirement) ·
`apps/web/app/app/{destinations,shares}/**` · `apps/web/lib/credential-inventory.ts` ·
`apps/web/design-system/**` · the three specs in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | ⚠️ **THE LIVE DATASET IS NOT THE PROTOTYPE'S.** Production `miyagisanchez`, 2026-08-29: **42 flags, 3 active in Production, 39 never activated, 0 deliberately off.** The design's *"42 → 2 rows + 1 line"* is the prototype's data. On the real page it is **3 rows + one line standing for 39**. Assert the *shape* — rows plus at most one summary, and the summary standing for rows that are not also listed — never the literal 2. | **D10** |
| 2 | The three cheap assertions apply per route at 1440×960: **no vertical page scroll**, the expected row count, **no horizontal page scroll, ever**. Wide content scrolls inside its own `overflow-x: auto` container (Do-not #6). | Do-not #6 |
| 3 | ⚠️ **A tab must never call `notFound()`.** `funnel/[projectSlug]/[featureKey]/page.tsx:26` does exactly that on `feature_not_found`. Verified live: `miyagisanchez` holds **42 flag registries and exactly ONE TARS feature (`setup_guide`)** — so 42 of 42 flags have no funnel, and today clicking Funnel on any of them 404s the whole feature page. The empty state **names which absence it is** and is the deliverable. | **D10** |
| 4 | The funnel-renders-numbers spec belongs on **`setup_guide`**, the one feature that has a funnel. Asserting numbers on a flag's tab is a test that cannot pass. | **D10** |
| 5 | ⚠️ **`lib/credential-inventory.ts` carries a FALSE claim about a live bearer credential.** Its comment and its `CREDENTIAL_KINDS_NOT_LISTED` entry both say `flag_admin` *"has no minting surface and no live rows"*. Production holds **one unrevoked `flag_admin` key** — *"Miyagi Cloud Run flag administration"*, created 2026-07-28, project `miyagi`. On the page whose whole job is an accurate access inventory, that is a live credential omitted under an untrue justification. **Story 4.5 corrects it.** | **D11-3** |
| 6 | The **four** mint kinds are correct and are `ingest` · `flag_read` (needs an environment) · `flag_sync` (needs a source) · `agent_write` (needs an expiry from an allow-list). `share`, `connector` and `flag_admin` are deliberately elsewhere and the page **says so**. The schema's `CHECK` allows all six — do not widen the page to match the schema. | `credential-inventory.ts` |
| 7 | **The key value is shown once, on a screen of its own, with a copy button.** Never a value read off a table. | Story 4.5 |
| 8 | `requireProjectOwnership` is called **at the route**, and every mint and revoke action re-asserts ownership **independently**. Identical to today, **never looser**. A member gets a flat 404. | AGENTS |
| 9 | Setup › Connect: **keep the shipped credential half** — status, the multi-token warning, and **server-side filtering of `tokens` before they cross the client boundary**. A member must not be able to read a bearer URL out of View Source. | Story 4.4 |
| 10 | The connector status line says **only what the data supports**: `connector_tokens` records no use, so the page says a URL exists and says out loud that existing is not the same as being used. Verified: `miyagisanchez` has exactly **1** connector token. | **D10** |
| 11 | **Land the replacement and retire the original in the SAME commit.** With the shell live from Sprint 3 there is no dark period in which a missing control goes unnoticed. Never a cleanup story. | `console-ia-overhaul` A3 |
| 12 | Coverage reaches **8 / 27** by the end of this sprint, and the manifest is what says so. ⚠️ Not 13/29: the denominator drops to 27 here (Story 4.5 retires three, Story 4.3 adds one) and the numerator counts page bodies, not chrome. | **D5**, **D13** |

## Stories

### Story 4.1 — Ship › Features
**As a** person operating a project, **I want** the features list to read as the approved design,
**so that** what Production is serving is legible on one screen.
**Acceptance:** matches reference state **01** and **02** — the answer line with its gold left
border, four stat tiles, the search/filter/group row, the header row at 11/600 uppercase Archivo
(**never mono**), feature rows, and the dormant group as **one summary line replacing forty**.
- At 1440×960 with the dormant group collapsed: **no vertical page scroll, no horizontal scroll,
  and the feature rows plus at most ONE summary line.** ⚠️ **CORRECTED AT THE LOCK (D10):** the
  scaffolded *"2 rows"* is the prototype's dataset. Live on `miyagisanchez` it is **3 rows and one
  line standing for 39** (42 flags, 3 active in Production, 0 deliberately off — queried
  2026-08-29). Assert the shape, not the literal 2; the arithmetic is pinned exhaustively in
  `lib/flag-list-view.test.ts` where the dataset is controlled. The shipped page was ~2400px tall
  with 25 rows and clipped tables — that is what these three assertions catch.
- **Wide content scrolls inside its own `overflow-x: auto` container** (Do-not #6).
- The **compare-environments** view (reference state **10**) ships with the list, since the button is
  already in state 01 and a control that goes nowhere is worse than no control.
**Approved states:** `ship-features`, `ship-features-dormant`, `ship-compare` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.2 — The feature destination and its tabs
**As a** person, **I want** one page that answers the whole loop for one feature, **so that** value,
environments, funnel and impact are tabs rather than routes I type a key into.
**Acceptance:** matches reference states **03**, **04** and **05** — Value, Environments, Funnel.
- The three-state switch renders **38 × 21** with its **dashed empty "never"** state.
- ⚠️ **A tab must never call `notFound()`.** `funnel/[projectSlug]/[featureKey]/page.tsx:26` does
  exactly that on `feature_not_found`, and the two registries have **zero overlap** — verified live
  2026-08-29: `miyagisanchez` holds **42 flag registries and exactly one TARS feature**
  (`setup_guide`), so 42 of 42 flags have no funnel row. The empty state **names which absence it is** and is the
  deliverable, not a fallback.
- The funnel-renders-numbers spec belongs on a feature that **has** a funnel (`setup_guide`);
  asserting numbers on a flag's tab is a test that cannot pass.
**Approved states:** `feature-value`, `feature-environments`, `feature-funnel` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.3 — Ship › Activity and Scheduled changes
> ⚠️ **CORRECTED AT THE LOCK, then DECIDED BY DANIEL (D13).** As scaffolded this said Scheduled
> changes *"renders the same row language with its honest empty state (the rail shows `0` today)"*.
> **The rail shows nothing today.** There is no scheduled-changes route, no table and no scheduling
> capability anywhere in the product — verified by grep across the whole repo. That sentence
> described the *prototype's* rail as though it were the product's, and a builder would have gone
> looking for a page that does not exist.
>
> **Daniel decided 2026-08-29: build the designed empty-state route.** So this story creates
> `/app/scheduled/[projectSlug]`, keeps the rail's fourth item, and registers a `scheduled` surface
> in `lib/project-route-inventory.ts`. It does **not** build scheduling.

**As a** person, **I want** to see who changed what, where and why, **so that** the section's other
two surfaces are on the system too.
**Acceptance:**
- Activity (`/app/flag-audit/[projectSlug]`) matches reference state `ship-activity`.
- **`/app/scheduled/[projectSlug]` is a NEW route** rendering the same row language in its empty
  state, registered as a `scheduled` surface in the inventory and as a manifest row.
- ⚠️ **The empty state says plainly that scheduling is not available yet.** It must **not** read as
  *"you have no scheduled changes"*, which implies you could have some — that is the mitigation for
  the risk the architect flagged and Daniel accepted: Story 4.1's own rule is *"a control that goes
  nowhere is worse than no control"*. An empty state is one of the nine and is a deliverable.
**Approved states:** `ship-activity` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.4 — Setup › Connect gets its teaching half ✳ *Daniel's complaint*
**As a** person connecting an agent, **I want** the page to teach the job and then hand me the
control, **so that** setup is a task rather than a credential screen.
**Acceptance:** matches reference state **07** — the connector URL in a mono field **with Copy**, the
status pill, and the **numbered three-step card ending in `Add to Claude ↗`**.
- The credential half already shipped and shipped well — status, the multi-token warning, and
  **server-side filtering of `tokens` before they cross the client boundary**. *Keep all of it.*
  A member must not be able to read a bearer URL out of View Source.
- The status line keeps saying **only what the data supports**: `connector_tokens` records no use, so
  the page says a URL exists and says out loud that existing is not the same as being used.
**Approved states:** `setup-connect` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.5 — Setup › Keys mints, and the three legacy routes retire ✳ *Daniel's complaint*
**As an** owner, **I want** one page that owns credentials, **so that** the page named for the job
can do the job.
**Acceptance:** matches reference state **08** — four rows, a *what it may do* column, environment
and expiry chips, a row menu, and **`+ New key`**.
- **Minting moves onto the page in the same commit that retires `/app/keys`,
  `/app/flag-credentials` and `/app/agent-keys`.** The four mint forms genuinely differ —
  `flag_read` needs an environment, `flag_sync` a source, `agent_write` an expiry from an
  allow-list, ingest keys none — and that is the work, not a reason to defer again.
- **The key value is shown once, on a screen of its own, with a copy button.** Never a value read
  off a table.
- `requireProjectOwnership` is called **at the route**, and every mint and revoke action re-asserts
  ownership independently — identical to today, never looser.
**Approved states:** `setup-keys` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 4.6 — Destinations and Share links
**As a** person, **I want** Setup's remaining two surfaces on the system, **so that** the section is
finished rather than mostly finished.
**Acceptance:** both render from `design-system/` with the shared data table, its row menu and its
empty state; both have reference states in the manifest. Coverage reaches **8 / 27**.
⚠️ *Corrected at the lock (**D13**): the scaffold said 13/29. The denominator is 27 — this sprint
retires three credential routes (Story 4.5) and adds one (Story 4.3) — and the numerator counts only
routes whose **page body** renders from the system, which is the eight this sprint lands.*
**Approved states:** `setup-destinations`, `setup-shares` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

## What actually shipped, per story

Each line names the commit and the deviations, so the doc describes the build rather than the plan.

| Story | Commit | Landed |
|---|---|---|
| — | `3a245e9` | **The page layer**, first and alone: `design-system/system.css`'s page section, `primitives.tsx`'s head/summary/list/row/field/callout components, and `copy-field.tsx`. Shared surface, by the architect, before any page (WAYS-OF-WORKING). |
| 4.1 | `99a04de` | Ship › Features from `design-system/`, and **66 `.is-console` rules deleted in the same commit**. Compare-environments ships as a VIEW (`?view=compare`), not a route. Closed the `feature row` deferral. |
| 4.2 | `ffba6d4` | Seven tabs, `Environments` restored as one. The Value tab's three stacked buttons became one line per environment with the 38 × 21 switch. `auth.setup.ts` seeds the one feature that has a funnel, so the renders-numbers spec can pass. |
| 4.3 | `b9d78f6` | Activity as a **timeline**, not a `DataTable`. `/app/scheduled/[projectSlug]` created. **The Ship rail was in the wrong order** and is corrected. |
| 4.4 | `1f2e2f0` | Setup › Connect's teaching half: copy field, status pill, numbered steps ending in `Add to Claude ↗` (the arrow an `<Icon>`, per F1). `setup-surfaces.authed.spec.ts` joins CI. |
| 4.5 | `67dc175` | Four mint forms on Setup › Keys; `/app/keys`, `/app/flag-credentials`, `/app/agent-keys` retired into permanent redirects; both `legacy-*` gates deleted; **D11-3 corrected against a live production query**. |
| 4.6 | `4dcaeca` | Destinations and Share links. Delivery health moved onto the rows; the two operational logs kept behind disclosures. |
| — | `5f6890c` | **The browser pass.** Nineteen failures: eight real defects, ten guards whose subject had moved, and one already red on `main`. |

### Deviations, stated rather than left to be found

1. **The three specs are `.authed.spec.ts`, not `.spec.ts`.** A plain `*.spec.ts` lands in the `api`
   project, which has no session — it would only ever assert the redirect to `/login`. All three are
   wired into CI's visual-gate step in the commits that wrote them.
2. **`Environments` returned as a TAB**, withdrawing a deviation `console-ia-overhaul` recorded (it
   rendered as a table above the strip). WAYS-OF-WORKING now says an approved design IS the contract,
   and this story's acceptance cites `feature-environments` by name.
3. **The Ship rail order was wrong** — Experiments above Features, against an approved rail of
   Features · Experiments · Scheduled changes · Activity. Corrected here because this is the sprint
   that adds the fourth item; the tests name all four so it is a decision a reader can see.
4. **`isConsoleShellEnabled()` left Setup › Keys.** Forced, not chosen: it is the only surface that
   mints, so a closed gate would leave a project unable to issue any credential and would land the
   three redirects on a 404. The auth boundary is unchanged.
5. **The no-scroll promise covers three of the seven feature tabs.** `Targeting` (the rule builder),
   `History` and `Settings` are authoring and log surfaces the design does not draw; `Targeting`
   measures 2925px because its height is the number of clauses somebody wrote. Named in the spec.
6. **Destinations keeps its delivery and attempt logs, behind disclosures.** The approved state has
   neither, and the page must fit — but replaying a dead delivery has no other surface, and deleting
   a capability to satisfy a geometry assertion is not what the story asks for.
7. **`dormant summary row` stays deferred** (contract 89, built 91). Its 2px is body copy wrapping at
   78ch, which is what the prototype does too. Sweeping it up with its neighbour would have been a
   claim nothing measured.
8. **The 9.2 MB of rendered reference states at the epic's old `design/` path were deleted.** Story
   1.1 moved the design to `apps/web/design-system/`; those PNGs were the pre-move copy, regenerable
   by one command, and had been sitting untracked in every `git status`. Both locations are now
   gitignored, which the docs had claimed since Story 1.1 with no rule behind it.

## Sprint QA

- **api spec(s) — RUN, with results:**
  - `e2e/console-visual.authed.spec.ts` is manifest-driven and now opens the eight routes this sprint
    landed. It reads `liveRows(6)`, so the three retired credential routes are excluded from the
    walk rather than exempted by hand.
  - `e2e/setup-keys.authed.spec.ts` — all four kinds mint and revoke through the real forms, and the
    value's ABSENCE after the reveal is asserted, including across a reload. *A member gets 404* is
    in `lib/setup-route-guards.test.ts` rather than here, deliberately: it needs a second identity,
    and a source guard proves the shape for every route at once where a browser test proves it for
    one member on one run.
  - `e2e/feature-tabs.authed.spec.ts` — every tab renders from `design-system/` and does not 404, the
    38 × 21 switch is measured as a PAIR, the dashed `never` state is asserted on its computed border
    style, and the Funnel tab renders real numbers for the one fixture feature that has a funnel.
  - Both gates green locally on `5f6890c`: **492 api passed / 35 skipped**, **112 authed passed /
    8 skipped**.
- **Four suites joined CI** in the commits that needed them: `feature-tabs`, `setup-surfaces`,
  `setup-keys` and (from Sprint 4's review pass) the corrected `mobile-heuristics` target rule.
  `setup-surfaces.authed.spec.ts` had said in its own header for a whole epic that it was outside the
  gate and that "a suite outside the gate decays silently" — and it was, while being the only
  automated check on Setup's connector status and member boundary.
- **browser smoke owed:** yes, to Daniel — **minting a real connector URL** and **minting and
  revoking one real key of each kind** in Production. A real credential mint is never covered by a
  merge authorization. Also outstanding from `console-ia-overhaul` Sprint 2.
- **deterministic gate:** lint + format:changed + `npm run typecheck` + `npm run test:unit` +
  `npm run build` + design-drift + coverage ratchet, all green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com** — there is no flag (D6); the merge is the release.

⚠️ **Steps 5 and 6 are OWED TO DANIEL BY NAME.** They mint real credentials on a real tenant, and a
real credential mint is never covered by a merge authorization. Everything else an agent can run.

1. Go to https://goldenfrijoles.com/app/flags/miyagisanchez in a 1440×960 window.
   → The page **fits without scrolling**. You see **3** feature rows and one line standing for the
   **39** that have never been turned on in Production. No sideways scrollbar. Every row is the same
   height, including the "never turned on here" ones — that sentence is clipped to one line and the
   whole of it is in the row's tooltip.
   ⚠️ *Corrected at the lock (D10): the scaffold said "2 rows … 40 features", which is the
   prototype's data. Production was re-counted 2026-08-29 — 42 flags, 3 on, 39 never, 0 off.*
2. Click **Show them**.
   → The 39 expand in place. Row height and chrome are unchanged.
3. Click **Compare environments** in the page head.
   → A grid of all 42 features against all three environments, scrolling **inside its own box** while
   the page does not. Each mark is a shape as well as a colour: a filled disc for on, a filled disc
   for off, a dashed ring for never. Click **Back to the list**.
4. Click `checkout.stripe_enabled`. You get **seven** tabs: Value, Targeting, Environments, Funnel,
   Impact, History, Settings.
   → **Value** shows one line per environment — the environment with its dot, the state in words,
   and a small switch on the right. All three switches are **dashed and empty**, because nobody has
   ever turned this feature on anywhere. That is different from "switched off", and it should look
   different.
   → **Environments** is a three-row table saying the same thing with more detail.
   → **Funnel** gives you a sentence naming *why* there is no funnel — not a zero, and **not a 404 on
   the whole feature page**. Same on **Impact**, with a different sentence, because it is a different
   absence.
5. Go to https://goldenfrijoles.com/app/setup/connect/miyagisanchez.
   → The connector URL in a mono field with a **Copy** button and a **Revoke** button beside it, a
   status pill, and a card of **three numbered steps** ending in **Add to Claude ↗**. The page fits
   without scrolling.
   → **(Owed to Daniel)** Click **Add to Claude**, paste the URL into Claude's connector settings,
   then ask Claude for this project's funnel. Claude returns **miyagisanchez** data, not the demo
   project's.
6. Go to https://goldenfrijoles.com/app/setup/keys/miyagisanchez.
   → The page lists what has access **now**, and the footnote names what it deliberately does not
   list — connector URLs, share links, and flag admin keys. ⚠️ The flag-admin line must **no longer
   claim there are no live rows**: production has one unrevoked, non-expiring `flag_admin` key on the
   `miyagi` project (D11-3, re-verified 2026-08-31). It is plain text, not a link, because there is
   no surface here that can create or revoke one.
   → **(Owed to Daniel)** Click **+ New key**. Pick a job — the four are described by what they let
   something do, not by a scope name — answer the one question that kind asks, name it, and create
   it. The value appears **once**, on its own screen, with a copy button, and the form is gone while
   it is on screen. Press **I've saved it**: the row appears and the value is not on the page any
   more, including after a reload. Then revoke it from the row menu; the confirmation names the key
   and says what stops working. The row disappears — revoked keys are not listed at all.
   → Do that for **each of the four kinds**. The three extra questions are: an environment
   (flag snapshot), a publisher (catalog sync), an expiry (agent write). An API key asks none.
7. Go to https://goldenfrijoles.com/app/keys/miyagisanchez.
   → You land on **Setup › Keys** — a permanent redirect, and the address bar says so. Same for
   `/app/flag-credentials/miyagisanchez` and `/app/agent-keys/miyagisanchez`. None of them offers a
   mint form of its own. If any still mints, the replacement and the retirement did not ship
   together.
8. Go to https://goldenfrijoles.com/app/flag-audit/miyagisanchez.
   → **Activity** — sentences, newest first, each naming who did what to which feature in which
   environment and why. Not a table of columns.
9. Go to https://goldenfrijoles.com/app/scheduled/miyagisanchez.
   → **Scheduled changes**, with an amber dashed panel saying scheduling is **not built yet**. It
   must NOT read as "you have no scheduled changes" — that would imply you could have some, and send
   you looking for a control nobody has written. There is a line pointing at Features and Activity
   for what you can do today.
10. Go to https://goldenfrijoles.com/app/destinations/miyagisanchez.
    → The answer line says how many are live and how many deliveries have failed. Each destination's
    delivery health is a small bar **on its row**, not a separate table. The delivery log and the
    append-only attempt log are below, collapsed. The page fits without scrolling.
11. Go to https://goldenfrijoles.com/app/shares/miyagisanchez.
    → Two share links, each with a **Live** pill and its lens. Click **Revoke** on one you do not
    need: the confirmation is the same dialog Setup › Keys uses — not an inline "click again".
    ⚠️ *Do not revoke a link somebody is using; production carries two.*

If any step fails, note the step number + what you saw — that's the bug report.
