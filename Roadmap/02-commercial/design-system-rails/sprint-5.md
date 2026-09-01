# One design system, every surface — Sprint 5: Measure and Today — the pages nobody designed

**Status:** 🟨 **IN PROGRESS** — architecture locked 2026-09-01 against the live code on `main`
(`fa06612`), the live production database (`slweidgffcfndnskcskc`) and the live Vercel Production
environment. Branch `feat/design-system-rails-s5`.

> ⚠️ **AMENDED 2026-08-29 — every state in this sprint is already designed and approved.**
> As scaffolded, this sprint said *"design a state → Daniel approves it → build it"* and left the
> designing to the builder. That is the expensive-surprise shape the product owner named: a builder
> shows twenty-three screens deep into a paid run and the answer is no. **Designing is the planning
> lane's job.** The states were produced and approved in four batches on 2026-08-29 and are
> committed at `apps/web/design-system/console-prototype.html`, with `apps/web/design-system/APPROVED.md` recording the approval and
> its content hash.
>
> **No story in this sprint designs anything.** Each cites a state id and is built against it. Run
> `node apps/web/design-system/render-reference.mjs` to see them.
>
> ⚠️ **This is still where the appetite is most likely to be exhausted.** If it is, stop and return
> to shaping — do not extend. Story 5.1 is the named trap.

## 🔒 The architecture lock — Sprint 5

> **Every row below was verified by RUNNING something** — a query against production, a probe
> against the deployed site, a read of the module that actually computes the number. Where the
> scaffold described data, a capability or a spec target the live system does not have, it is
> corrected here out loud and the correction carries its evidence.
>
> **Five of the scaffold's claims came back changed.** Three are data corrections, one is a stale
> spec target, and one is a capability the product does not have at all — which went to Daniel
> rather than into my judgement, and came back as **DA2** below.

### L1 — 🔒 The North Star has **no recorded value**, and cannot have one. The walkthrough is corrected.

`sprint-4.md`-era wording and this sprint's own walkthrough step 2 said Today renders *"the **North
Star number** (live: 1 metric, 2 leading inputs)"*. **There is no number, and there is no code path
that could produce one.**

`readNorthStar` in `apps/web/lib/pod-report-query.ts:176` returns `latestValue: null`
**unconditionally** — it reads `north_star_metrics` for the key and `leading_inputs` for a count, and
nothing else. Its own comment says why: *"Deliberately reports a LEVEL and never a trend."* And there
is no table it could read a level from: enumerating `information_schema.tables` on
`slweidgffcfndnskcskc` for `%north%`/`%metric%`/`%input%` returns exactly **`north_star_metrics`,
`leading_inputs`, `input_values`, `feature_inputs`** — `input_values` belongs to a *leading input*,
not to the metric.

🔒 **Locked:** the North Star tile renders state **3 of `northStarFigure`'s four** — *a metric is
registered but no value has been recorded yet, which is not a reading of zero* — and that sentence
is already written, in `lib/stat-figures.ts`. **That is the deliverable**, not a fallback (D10), and
the walkthrough says so. A builder told to "render the North Star number" would either have gone
looking for a query that does not exist or invented one.

### L2 — 🔒 `/app/impact/…` renders `measure-north-star` from the **inputs'** real series, and the hero is honest.

The manifest maps `/app/impact/[projectSlug]/[featureKey]` → `measure-north-star`. Verified what that
route can actually draw: `getFeatureImpact` (`lib/north-star-query.ts`) returns one
`FeatureImpactInput` per linked leading input, each with `name`, `valueSource`, `metricKey` and a
**real `series: DailySeriesPoint[]`**. So the approved state's two halves split cleanly:

| Approved element | What fills it | Honest on `miyagisanchez` |
|---|---|---|
| the hero number + big plot | the **North Star metric** | **empty** — L1: registered, never recorded |
| *What fed it* small multiples + sparklines | the **leading inputs'** real series | populated, and thin |

Production, queried 2026-09-01: `miyagisanchez` has **2** leading inputs — `attributed_revenue`
(`external_push`, **1** value, 2026-07-06) and `setup_guide_shares` (`telemetry_event`, **0** values).

🔒 **A series of fewer than two points is not a line, and the primitive must say so.** One point drawn
as a flat stroke reads as *"steady"*, which is a claim about a trend nobody measured — the same
class as a zero standing for an unreadable value (CODE-QUALITY #8). `Sparkline` renders a
`too-short` state carrying the point count instead.

### L3 / **DA2** — 🔒 The engine computes **no confidence interval**. **Daniel decided 2026-09-01: build the significance layer.**

The approved `experiment-ready` state draws an interval bar — *"How sure we are, and it does not
cross zero"*, +6.2% → +30.4% around a +18.1% lift. Verified against the module that computes the
numbers: `MetricResult` in `lib/experiment-analysis.ts` carries `conversionRate`,
`absoluteDeltaFromControl`, `liftFromControl` and `directionalStatus` — **no interval and no
p-value**. The only χ²/p in the product is `diagnostics.srm`, and that is a test of the *allocation*,
not of the metric. The shipped page's own footnote says it: *"Basic lift only — no
statistical-significance engine (that's a later epic)."*

Drawing that bar from the data the engine has means inventing numbers, and amending an approved
design is a product-owner decision, not a documentation task (`D13`'s precedent). So it went to
Daniel with three options and a recommendation.

> **DECIDED 2026-09-01 — Daniel: build the significance layer.** The recommendation (ship the card
> in an honest "no interval computed" state) was **not** taken. The interval is computed for real,
> and the bar draws from it.

🔒 **Locked, and these five constraints are what keep a real statistic from becoming a new way to be
wrong:**

1. **The interval is on the SAME quantity as the headline number** — the relative lift — or the
   picture and the number disagree, which is the defect class this epic exists to kill. Method:
   **Katz log** on the risk ratio (`log RR ± z·√((1−p₁)/(p₁n₁) + (1−p₂)/(p₂n₂))`, exponentiated),
   reported as `RR − 1`. It is the standard closed form for a ratio of two proportions and needs no
   special function.
2. **It lives in its own pure, zero-import module** — `lib/experiment-interval.ts` — so it is
   testable without a database, a fixture or a render (CODE-QUALITY #5). `experiment-analysis.ts`
   imports it; it imports nothing.
3. **Every degenerate input returns a NAMED not-computable reason, never a number.** Zero exposures,
   a zero control rate (`log 0`), a zero treatment rate, a non-finite input. A ratio interval is
   undefined at a zero denominator and "undefined" must not arrive on screen as `NaN%` or as a bar
   of width zero.
4. **`decisionReady` and the decision ledger are NOT changed.** They are a shipped governance
   boundary with an append-only immutable ledger behind them (`experiment-governance-v2`), and
   re-gating them on a new statistic is a governance change this sprint did not bet on. The interval
   is **reported**; readiness gates exactly what it gated yesterday.
5. **The answer sentence is computed from the three facts it names** — the split, the sample, and
   whether the interval crosses zero — and states each one's real state. It must never say *"so the
   difference is real"* while the interval crosses zero, which is what a sentence copied from the
   prototype would do.

### L4 — 🔒 Story 5.6's *Activity audit* **already shipped**, in Sprint 4.

`/app/flag-audit/[projectSlug]` landed as `ship-activity` in commit `b9d78f6` and its manifest row
reads `landsIn: 4, rendersFromDesignSystem: true`. Story 5.6's title names four surfaces; **three**
remain — Tasks, Scenarios and Onboarding. The arithmetic is unaffected: Sprint 4 left coverage at
**8**, this sprint's ten manifest rows (`landsIn: 5`) take it to **18 / 27**.

### L5 — 🔒 The reference states are **ids**, not numbers. Every "state 06" is stale.

Story 5.2 cites *"reference state **06**"* and Story 5.4 *"the approved states above"*. The states
have been id-keyed since `approved-states.mjs` — the numbering is `console-ia-overhaul`'s and does
not survive the twenty-three states added on 2026-08-29. Each story below cites ids only.

### L6 — 🔒 `charts.browser.spec.ts` → **`charts.authed.spec.ts`**. Same correction Sprint 4 recorded.

Sprint QA names `e2e/charts.browser.spec.ts`. **D5-a**: the visual gate is the `authed` project, the
`browser` project runs nowhere, and a `*.spec.ts` lands in `api`, which has no session and would only
ever assert the redirect to `/login`. Every new visual row lands in `authed` or it is not in the gate.

### L7 — 🔒 The funnel's fourteen-day bars need **no new query and no migration**.

`getFeatureFunnelByProjectId` already selects **every** event for the feature
(`user_id, event, created_at`) and hands them to `computeTars`. The daily served series is a pure
function over that same array — so `funnel-standalone`'s *Times served, last 14 days* costs one more
`map` and zero round trips. No ad-hoc `events` read (AGENTS #1): the series is computed inside
`lib/tars.ts`, the canonical path, and returned by `lib/tars-query.ts`.

### L8 — 🔒 Today's third band rides the **same gate as `/app/tasks`**, and it already exists.

DD1 puts Tasks on Today. `/app/tasks` calls `notFound()` when `isSignalsEnabled()` is false, and
`project-route-inventory.ts` already declares the `tasks` surface with `gate: 'signals'`,
`section: 'today'`. `/app` already reads `isSignalsEnabled()` into its `gates` record. So the band is
gated by the one predicate both surfaces already ask, not by a second condition that can disagree.

### L9 — 🔒 Verified live before building: **all ten routes exist and their gates are ON in Production.**

Probed 2026-09-01 against `https://goldenfrijoles.com`. Every Sprint-5 route answers **307** (the
redirect to `/login`) while `/app/definitely-not-a-route/miyagisanchez` answers **404** — which is the
narrowest observation that separates *"live behind auth"* from *"dark"*, and it holds for `/app`,
`/app/tasks/…`, `/app/journeys/…`, `/app/scenarios/…`, `/app/experiments/…`,
`/app/impact/…/setup_guide`, `/app/funnel/…/setup_guide` and `/app/onboarding/…`.

**Nothing is owed on Vercel** (D6). No env var, no flag, no redeploy step. The merge is the release.

## Build contract (locked by the architect before the builder started)

> **Story 5.1 is architect-owned and lands FIRST** — a charting primitive is shared surface (D7).
> **5.2–5.6 are delegated per story** over this contract. **Cite a decision; never re-derive one.**
>
> ⚠️ **Deviation, stated rather than found: nothing in this sprint was delegated.** The session ran
> under an explicit instruction not to spawn subagents, so the architect built all six stories. The
> contract below is unchanged — it is what the build was held to, and the routing table's *why* for
> 5.2–5.6 ("bounded, with an approved state to check against") is still what made that safe.

**Paths this sprint owns.** `apps/web/design-system/charts/**` (new) · `apps/web/components/ui/{FunnelBars,RolloutBar,StatCard}.tsx`
(extend) · `apps/web/app/app/page.tsx` (Command Center) · `apps/web/app/app/{funnel,impact,experiments,journeys,tasks,scenarios,flag-audit,onboarding}/**` ·
`apps/web/lib/{tars,experiment-interval,experiment-analysis}.ts` · the specs in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | **Hand-rolled SVG on the token set. NO dependency.** Re-verified 2026-09-01: `apps/web/package.json` lists nine dependencies and none is a chart library; `node_modules` matches nothing for `chart\|d3\|recharts\|victory\|plotly\|apex\|nivo\|visx`. A dependency here is shared surface — if a builder believes one is needed it **escalates**, it does not add one. | **D7** |
| 2 | **Dynamic bar widths are legal here.** Re-verified in `scripts/check-design-drift.mjs:748`: `VOICE_AND_STYLE_ROOTS` is exactly `components/landing`, `components/methodology`, `app/methodology`, and `disallowInlineStyle` is passed only for those. Do not build around a guard that does not apply. | **D7** |
| 3 | `FunnelBars` and `RolloutBar` **already exist** — extend, never re-author. | audit §2.2 |
| 4 | **DD4's colour rules are the contract, and they are computed rather than chosen.** Magnitude → `--gold` alone, light to dark, never a rainbow. Two-way identity → `--gold` + `--blue`. Status → `--green`/`--red`, **always with a word and a shape**, never colour alone. **Never four categorical hues.** **Never a dual axis** — small multiples instead. **A nonzero value never rounds to zero pixels**: 4px floor, with the exact count beside it. | **DD4** |
| 5 | Every stat renders `tabular-nums`. | Story 5.1 |
| 6 | **DD5 — one design, two mounts.** `/app/funnel/…` and `/app/tasks` render the *same* design as the tab and the band they also live in. A standalone route is a mount, never a fifth place to look. | **DD5** |
| 7 | **DD1 — Tasks lives on Today** as its missing third band (*Your agent is working*), and `/app/tasks` is the same three bands mounted as its own page. **Today gets no rail**, and the band rides `gate: 'signals'` (**L8**). | **DD1** |
| 8 | Command Center's layout **is this story**, not a follow-up. It is still pre-contract — mono-italic caveats, a wide gap between the stat row and the funnel figures — and half-doing it left a route that is neither. | `console-ia-overhaul` A25 |
| 9 | Blockers are named in plain words — *"the split cannot be checked yet"*, **never** `srm_not_evaluable`. The vocabulary is a module with a total map, so a new blocker code is a **compile error** rather than a raw enum leaking onto a page. | Story 5.4 |
| 10 | **An absent number is never a zero, and a one-point series is never a line.** Every chart primitive takes an explicit not-readable state and renders a *word*, and every unreadable stat keeps the sentence naming which absence it is. | **L1**, **L2** |
| 11 | **The significance layer is real, in its own pure module, and it changes no governance gate.** The five constraints of **DA2** are the contract. | **DA2** |
| 12 | The three cheap assertions apply per route at 1440×960: **no vertical page scroll**, the expected element count, **no horizontal page scroll, ever**. Wide content scrolls inside its own `overflow-x: auto` container. | Do-not #6 |

### ⚠️ What the live data can and cannot show — read this before writing an acceptance check

Production, `miyagisanchez`, **re-queried 2026-09-01** (**D10**, and it reproduces exactly):

| Route | Live rows on `miyagisanchez` | Which approved state it can actually render |
|---|---|---|
| `/app` (Today) | North Star **registered, never recorded**; leading inputs **2**; tasks **0** | the strip renders its **honest never-recorded** tile (**L1**); *Waiting on you* and *Your agent is working* render **empty** |
| `/app/impact/…/setup_guide` | 2 inputs — **1** reading and **0** readings | hero **empty** (L1); one sparkline in its **too-short** state, one in its **no-data** state |
| `/app/funnel/…/setup_guide` | the **one** TARS feature | **populated** — this is the only honest place to assert numbers |
| `/app/experiments/…` | **2** experiments | populated list; `experiment-ready` and `experiment-blocked` are **not** reachable here |
| `/app/journeys/…` | **0** | **empty only.** The one production journey is `merchant_activation` on **`golden-beans`** |
| `/app/scenarios/…` | **0** | **empty only.** The two production scenarios are on **`miyagi`** |
| `/app/tasks/…` | **0** | **empty only.** The one production task is a *resolved* one on **`golden-beans-demo`** |

🔒 **So: populated states are asserted on the specimen route (Story 2.1) and by the visual gate
against the local fixture tenant, which the `authed` rail seeds. The production walkthrough names
the EMPTY state as its expected result where that is what the data supports, and names which tenant
carries the populated one.** An acceptance criterion that asks a builder to match a populated design
on a route with no rows is unsatisfiable — and *"it looked empty"* is not a bug report anyone can
act on. **The empty state is one of the nine and is a deliverable, not a fallback.**

## Stories

### Story 5.1 — The charting primitives ✳ *D7 — architect-owned, done first*
**As a** person using an analytics product, **I want** to see the numbers, **so that** the product
whose whole pitch is *"see the funnel, see the North Star, see the lift"* shows them.
**Acceptance:**
- **Audit §2.3 is the finding this closes: zero data visualization anywhere in `/app`, and no chart
  library installed.** Every number in the product is a table row today.
- **Hand-rolled SVG on the token set is the default (D7)** — no dependency, no bundle cost, no
  second theming system. A library is a shared-surface change and is decided at the architecture
  lock, before this sprint opens, never mid-sprint.
- Primitives: **funnel bar · sparkline · comparison bar (control vs treatment) · interval bar ·
  rollout ring · stat tile with `tabular-nums`**. `FunnelBars` and `RolloutBar` already exist —
  extend, don't re-author.
- **Every geometry decision is a pure function in `design-system/charts/geometry.ts`**, unit-tested
  directly — the 4px floor, the scale, the too-short guard. A rule that only exists inside a
  component can only be tested by rendering the page (CODE-QUALITY #5).
- Every chart reads in both the semantic states it must distinguish, and **never by colour alone**.
- **Every primitive takes an explicit unreadable state** and renders a word for it (**L1**, **L2**).
**Approved states:** `measure-north-star`, `measure-journey`, `experiment-ready`, `measure-scenarios` — in `apps/web/design-system/console-prototype.html`, rendered by `apps/web/design-system/render-reference.mjs`.
**Risk:** high

### Story 5.2 — Today
**As a** person opening the product, **I want** to know what changed while I was away,
**so that** the home page answers a question instead of listing routes.
**Acceptance:** matches reference state **`today`** — the North Star strip, *Waiting on you*, and
*Your agent is working*, with **no rail** (Today has no sub-surfaces).
- **Command Center's own layout is still pre-contract** (`console-ia-overhaul` A25: mono-italic
  caveats, a wide gap between the stat row and the funnel figures). **That page redesign is this
  story** — it was covered by no story in the last epic, and half-doing it left a route that is
  neither.
- ⚠️ **L1: the North Star tile renders its never-recorded state**, with the sentence
  `lib/stat-figures.ts` already writes. It is not a zero and it is not a blank.
- The three bands ride `gate: 'signals'` (**L8**), which `/app` already resolves.
**Approved states:** `today`, `tasks-standalone` — in `apps/web/design-system/console-prototype.html`.
**Risk:** high

### Story 5.3 — Funnel and Impact
**As a** person, **I want** the namesake framework to look like one, **so that** the funnel is a
funnel rather than a `<dl>`.
**Acceptance:** matches `funnel-standalone` and `measure-north-star`. Both routes keep working
standalone and as the feature-page tabs from Story 4.2 — one design, two mounts, not two designs.
Audit §6.5.
- The funnel's *Times served, last 14 days* bars are computed in `lib/tars.ts` from the events
  `getFeatureFunnelByProjectId` **already fetches** — no new query, no migration (**L7**).
- Impact's hero is the North Star in its honest state (**L1**); its small multiples are the
  inputs' real series, and a series under two points renders `too-short`, never a flat line (**L2**).
**Approved states:** `funnel-standalone` (and `feature-funnel` for the tab mount), `measure-north-star`.
**Risk:** high

### Story 5.4 — Experiments, list and detail ✳ *carries **DA2***
**As a** person running an experiment, **I want** lift and decision to be visible,
**so that** the comparison bar has somewhere to live.
**Acceptance:** matches `ship-experiments`, `experiment-ready` and `experiment-blocked`, including
the blocked variant, whose blockers are named in plain words (`the split cannot be checked yet`,
never `srm_not_evaluable`). `EXPERIMENT_GOVERNANCE_ENABLED` is **Production-only** — the walkthrough
step says so, or a correct preview render reads as broken.
- ⚠️ **DA2 — the significance layer is BUILT** (Daniel, 2026-09-01). A real 95% interval on the
  relative lift, Katz log method, in a pure zero-import `lib/experiment-interval.ts`, with every
  degenerate input returning a **named** not-computable reason. **`decisionReady` and the decision
  ledger are unchanged.**
- The answer sentence is computed from the three facts it names and never claims a difference is
  real while the interval crosses zero.
**Approved states:** `ship-experiments`, `experiment-ready`, `experiment-blocked`.
**Risk:** high

### Story 5.5 — Journeys, list and detail
**As a** person, **I want** journeys on the system, **so that** the section is whole.
**Acceptance:** matches `measure-journeys` and `measure-journey`. `JOURNEY_PROJECTIONS_ENABLED` is
Production-only — same walkthrough caveat.
- The stage bars come from `cohort.stages`' real `satisfied` / conversion / continuation numbers; the
  *"N did not continue"* line is the continuation figure, not a second computation.
**Approved states:** `measure-journeys`, `measure-journey`.
**Risk:** high

### Story 5.6 — Tasks, Scenarios and Onboarding
> ⚠️ **CORRECTED AT THE LOCK (L4): the *Activity audit* named in this story's title shipped in
> Sprint 4** — `/app/flag-audit/[projectSlug]`, commit `b9d78f6`, manifest row `landsIn: 4`. Three
> surfaces remain, and the coverage arithmetic is unchanged.

**As a** person, **I want** the last console surfaces on the system, **so that** `/app` is
finished.
**Acceptance:** all three render from `design-system/`, matching the approved states above.
- **Scenarios is the whitespace** — audit §6.4 calls it a read-only log where the PRD describes a
  tool, and §7 P1 says prioritise it over polish elsewhere. Design it as the tool.
- `onboarding` stays `flow-only` in the inventory and is still gated out of the nav; it gets a
  reference state because a person can reach it, not because the nav lists it.
- Coverage reaches **18 / 27** — all of `/app`. ⚠️ *Corrected at the lock (**D13**): the
  denominator is 27, and the three legacy credential routes left it in Sprint 4.*
**Approved states:** `measure-scenarios`, `tasks-standalone`, `setup-connect`.
**Risk:** high

## Sprint QA
- **specs:** `e2e/charts.authed.spec.ts` (each primitive renders its states; no reliance on colour
  alone; `tabular-nums` on every stat) · manifest-driven visual rows for the ten routes this sprint
  lands · `e2e/command-center.authed.spec.ts` extended to the new layout ·
  `lib/experiment-interval.test.ts` (the significance layer, against hand-computed values).
  ⚠️ **`charts.authed.spec.ts`, not `charts.browser.spec.ts`** — L6.
- **browser smoke owed:** yes, to Daniel — the money/auth-free walkthrough below.
  **The state approval that used to be owed here already happened** (2026-08-29,
  `apps/web/design-system/APPROVED.md`), which is what turns this sprint from design work into
  execution.
- **deterministic gate:** `npm run lint` + `npm run typecheck` + `npm run test:unit` +
  `npm run build` + design-drift + `extract-css --check` + the coverage ratchet, all green before
  merge.

## Sprint 5 — Smoke walkthrough (do these in order)

> ⚠️ **REWRITTEN AT THE LOCK (D10), and CORRECTED AGAIN 2026-09-01 (L1).** Steps 4 and 5 as
> scaffolded expected populated pages on a tenant that has **zero** journeys, **zero** scenarios and
> **zero** tasks. Step 2 expected a *North Star number* that no code path in this product can
> produce. Each step now names the state the live data can actually produce, and names the tenant
> that carries the populated one. A step that expects rows where there are none reads as a broken
> page.

Env: **production · https://goldenfrijoles.com**. There is no flag (D6) — the merge is the release.
Every route below rides a Production-only gate, so none of these steps is meaningful anywhere else
(**D9**: preview has no database at all). Verified 2026-09-01 that all ten answer **307** in
Production while a nonexistent sibling answers 404 (**L9**).

1. Run `node apps/web/design-system/render-reference.mjs`.
   → **32** PNGs, zero page errors. These are the approved states this sprint is measured against.
2. Go to https://goldenfrijoles.com/app.
   → **Today**, with no rail. The North Star tile says a metric is **registered and never
   recorded** — ⚠️ *not a number, and not a blank*: this project has registered `payable_sellers`
   and the engine stores no reading for it (**L1**). *Waiting on you* and *Your agent is working*
   render their **empty** state — `miyagisanchez` has no open tasks — and the empty state is a
   **prompt to act**, not a blank. No mono-italic caveats, no dead vertical gap.
3. Go to https://goldenfrijoles.com/app/funnel/miyagisanchez/setup_guide.
   → The funnel is **drawn**, with real numbers, and below it fourteen daily bars of times served.
   `setup_guide` is the **only** feature in this project with a TARS row; this is the one place
   numbers can honestly be asserted.
4. Go to https://goldenfrijoles.com/app/impact/miyagisanchez/setup_guide.
   → The **North Star** hero in its never-recorded state, and beneath it *What fed it* — **two**
   leading inputs. `Attributed Revenue` has **one** reading and its sparkline says *one reading, not
   a trend*; `Setup Guide Shares` has **none** and says so. ⚠️ Neither draws a flat line: a
   one-point line would be a claim about a trend nobody measured (**L2**).
5. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez.
   → **Two** experiments render on the system. Each row carries its state and its primary metric.
   The `ready` and `blocked` detail states are checked on the specimen route, not here.
6. Go to https://goldenfrijoles.com/app/scenarios/miyagisanchez.
   → It reads as a **tool you operate**, in its **empty** state — this project has no scenarios. To
   see it populated, open https://goldenfrijoles.com/app/scenarios/miyagi (2 scenarios, with the
   held/failed bar on each row: a green run and a red one, each with its **word and its count**,
   never colour alone).
7. Go to https://goldenfrijoles.com/app/journeys/miyagisanchez.
   → The **empty** state, naming what a journey is and how to define one. The one live journey is
   `merchant_activation` on https://goldenfrijoles.com/app/journeys/golden-beans — open it and the
   stage bars are drawn, each with its count, its share, and the number who did not continue.
8. Go to https://goldenfrijoles.com/app/tasks/miyagisanchez.
   → The **same three bands as Today**, mounted as their own page (DD5) — not a fifth place to
   look, and not a different design. Empty here; the one production task is a *resolved* one on
   `golden-beans-demo`.
9. Open the PR's CI run, step **Design coverage + ratchet**.
   → Coverage reports **18 / 27** and the visual gate is green for all eighteen.

If any step fails, note the step number + what you saw — that's the bug report.
