# One design system, every surface — Sprint 5: Measure and Today — the pages nobody designed

**Status:** ⬜ not started

> ⚠️ **AMENDED 2026-08-29 — every state in this sprint is already designed and approved.**
> As scaffolded, this sprint said *"design a state → Daniel approves it → build it"* and left the
> designing to the builder. That is the expensive-surprise shape the product owner named: a builder
> shows twenty-three screens deep into a paid run and the answer is no. **Designing is the planning
> lane's job.** The states were produced and approved in four batches on 2026-08-29 and are
> committed at `design/console-prototype.html`, with `design/APPROVED.md` recording the approval and
> its content hash.
>
> **No story in this sprint designs anything.** Each cites a state id and is built against it. Run
> `node design/render-reference.mjs` to see them.
>
> ⚠️ **This is still where the appetite is most likely to be exhausted.** If it is, stop and return
> to shaping — do not extend. Story 5.1 is the named trap.

## Build contract (locked by the architect before the builder started)

> **Story 5.1 is architect-owned and lands FIRST** — a charting primitive is shared surface (D7).
> **5.2–5.6 are delegated per story** over this contract. **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/design-system/charts/**` (new) · `apps/web/components/ui/{FunnelBars,RolloutBar,StatCard}.tsx`
(extend) · `apps/web/app/app/page.tsx` (Command Center) · `apps/web/app/app/{funnel,impact,experiments,journeys,tasks,scenarios,flag-audit,onboarding}/**` ·
the three specs in Sprint QA.

| # | The contract | Cites |
|---|---|---|
| 1 | **Hand-rolled SVG on the token set. NO dependency.** Verified: no chart library is installed or transitively reachable. A dependency here is shared surface — if a builder believes one is needed it **escalates**, it does not add one. | **D7** |
| 2 | **Dynamic bar widths are legal here.** The drift guard's inline-style ban applies only to `components/landing`, `components/methodology` and `app/methodology` — verified in `VOICE_AND_STYLE_ROOTS`. Do not build around a guard that does not apply. | **D7** |
| 3 | `FunnelBars` and `RolloutBar` **already exist** — extend, never re-author. | audit §2.2 |
| 4 | **DD4's colour rules are the contract, and they are computed rather than chosen.** Magnitude → `--gold` alone, light to dark, never a rainbow. Two-way identity → `--gold` + `--blue`. Status → `--green`/`--red`, **always with a word and a shape**, never colour alone. **Never four categorical hues** — the brand's four accents fail as a four-way set. **Never a dual axis** — small multiples instead. **A nonzero value never rounds to zero pixels**: 4px floor, with the exact count beside it. | **DD4** |
| 5 | Every stat renders `tabular-nums`. | Story 5.1 |
| 6 | **DD5 — one design, two mounts.** `/app/funnel/…` and `/app/tasks` render the *same* design as the tab and the band they also live in. A standalone route is a mount, never a fifth place to look. | **DD5** |
| 7 | **DD1 — Tasks lives on Today** as its missing third band (*Your agent is working*), and `/app/tasks` is the same three bands mounted as its own page. **Today gets no rail.** | **DD1** |
| 8 | Command Center's layout **is this story**, not a follow-up. It is still pre-contract — mono-italic caveats, a wide gap between the stat row and the funnel figures — and half-doing it left a route that is neither. | `console-ia-overhaul` A25 |
| 9 | Blockers are named in plain words — *"the split cannot be checked yet"*, **never** `srm_not_evaluable`. | Story 5.4 |

### ⚠️ What the live data can and cannot show — read this before writing an acceptance check

Production, `miyagisanchez`, queried 2026-08-29 (**D10**):

| Route | Live rows on `miyagisanchez` | Which approved state it can actually render |
|---|---|---|
| `/app` (Today) | North Star **1**, leading inputs **2**, tasks **0** | North Star strip populated; *Waiting on you* and *Your agent is working* render **empty** |
| `/app/funnel/…/setup_guide` | the **one** TARS feature | **populated** — this is the only honest place to assert numbers |
| `/app/experiments` | **2**, both `decided` | populated list; `experiment-ready` and `experiment-blocked` are **not** reachable here |
| `/app/journeys` | **0** | **empty only.** The one production journey is `merchant_activation` on **`golden-beans`** |
| `/app/scenarios` | **0** | **empty only.** The two production scenarios are on **`miyagi`** |
| `/app/tasks` | **0** | **empty only.** The one production task is a *resolved* one on **`golden-beans-demo`** |

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
- Primitives: **funnel bar · sparkline · comparison bar (control vs treatment) · rollout ring ·
  stat tile with `tabular-nums`**. `FunnelBars` and `RolloutBar` already exist — extend, don't
  re-author.
- **Dynamic bar widths are legal in `/app`**: the drift guard's inline-style ban is
  `components/landing`-only (audit §10.5). Confirm before building around it.
- Every chart reads in both the semantic states it must distinguish, and **never by colour alone**.
**Approved states:** `measure-north-star`, `measure-journey`, `experiment-ready`, `measure-scenarios` — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

### Story 5.2 — Today
**As a** person opening the product, **I want** to know what changed while I was away,
**so that** the home page answers a question instead of listing routes.
**Acceptance:** matches reference state **06** — the North Star strip, *Waiting on you*, and
*What changed*, with no rail (Today has no sub-surfaces).
- **Command Center's own layout is still pre-contract** (`console-ia-overhaul` A25: mono-italic
  caveats, a wide gap between the stat row and the funnel figures). **That page redesign is this
  story** — it was covered by no story in the last epic, and half-doing it left a route that is
  neither.
**Approved states:** `today`, `tasks-standalone` — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

### Story 5.3 — Funnel and Impact
**As a** person, **I want** the namesake framework to look like one, **so that** the funnel is a
funnel rather than a `<dl>`.
**Acceptance:** matches the approved states above. Both routes keep working
standalone and as the feature-page tabs from Story 4.2 — one design, two mounts, not two designs.
Audit §6.5.
**Approved states:** `funnel-standalone` (and `feature-funnel` for the tab mount) — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

### Story 5.4 — Experiments, list and detail
**As a** person running an experiment, **I want** lift and decision to be visible,
**so that** the comparison bar has somewhere to live.
**Acceptance:** matches the approved states above, including the blocked variant, whose blockers are named in plain words (`the split cannot be checked yet`, never `srm_not_evaluable`). `EXPERIMENT_GOVERNANCE_ENABLED` is
**Production-only** — the walkthrough step says so, or a correct preview render reads as broken.
**Approved states:** `ship-experiments`, `experiment-ready`, `experiment-blocked` — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

### Story 5.5 — Journeys, list and detail
**As a** person, **I want** journeys on the system, **so that** the section is whole.
**Acceptance:** matches the approved states above. `JOURNEY_PROJECTIONS_ENABLED` is
Production-only — same walkthrough caveat.
**Approved states:** `measure-journeys`, `measure-journey` — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

### Story 5.6 — Tasks, Scenarios, Activity audit and Onboarding
**As a** person, **I want** the last four console surfaces on the system, **so that** `/app` is
finished.
**Acceptance:** all four render from `design-system/`, matching the approved states above.
- **Scenarios is the whitespace** — audit §6.4 calls it a read-only log where the PRD describes a
  tool, and §7 P1 says prioritise it over polish elsewhere. Design it as the tool.
- `onboarding` stays `flow-only` in the inventory and is still gated out of the nav; it gets a
  reference state because a person can reach it, not because the nav lists it.
- Coverage reaches **20/29** — all of `/app`.
**Approved states:** `measure-scenarios`, `tasks-standalone`, `ship-activity`, `setup-connect` — in `design/console-prototype.html`, rendered by `design/render-reference.mjs`.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/charts.browser.spec.ts` (each primitive renders its states; no reliance on
  colour alone; `tabular-nums` on every stat) · manifest-driven visual rows for the nine routes this
  sprint lands · `e2e/command-center.authed.spec.ts` extended to the new layout.
- **browser smoke owed:** yes, to Daniel — the money/auth-free walkthrough below. **The state
  approval that used to be owed here already happened** (2026-08-29, `design/APPROVED.md`), which is
  what turns this sprint from design work into execution.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 5 — Smoke walkthrough (do these in order)

> ⚠️ **REWRITTEN AT THE LOCK (D10).** Steps 4 and 5 as scaffolded expected populated pages on a
> tenant that has **zero** experiments-in-flight, **zero** journeys, **zero** scenarios and **zero**
> tasks. Each step now names the state the live data can actually produce, and names the tenant that
> carries the populated one. A step that expects rows where there are none reads as a broken page.

Env: **production · https://goldenfrijoles.com**. Every route below rides a Production-only gate, so
none of these steps is meaningful anywhere else (**D9**: preview has no database at all).

1. Run `node apps/web/design-system/render-reference.mjs`.
   → **32** PNGs, zero page errors. These are the approved states this sprint is measured against.
2. Go to https://goldenfrijoles.com/app.
   → Today renders the **North Star number** (live: 1 metric, 2 leading inputs) and the three bands.
   *Waiting on you* and *Your agent is working* render their **empty** state — `miyagisanchez` has
   no open tasks — and the empty state is a **prompt to act**, not a blank. No mono-italic caveats,
   no dead vertical gap.
3. Go to https://goldenfrijoles.com/app/funnel/miyagisanchez/setup_guide.
   → The funnel is **drawn**, with real numbers. `setup_guide` is the **only** feature in this
   project with a TARS row; this is the one place numbers can honestly be asserted.
4. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez.
   → **Two** experiments render on the system, both in the **decided** state. The `ready` and
   `blocked` states are not reachable on this tenant — check those on the specimen route, not here.
5. Go to https://goldenfrijoles.com/app/scenarios/miyagisanchez.
   → It reads as a **tool you operate**, in its **empty** state — this project has no scenarios. To
   see it populated, open https://goldenfrijoles.com/app/scenarios/miyagi (2 scenarios).
6. Go to https://goldenfrijoles.com/app/journeys/miyagisanchez.
   → The **empty** state, naming what a journey is and how to define one. The one live journey is
   `merchant_activation` on https://goldenfrijoles.com/app/journeys/golden-beans.
7. Open the PR's CI run.
   → Coverage reports **20/29** and the visual gate is green for all twenty.

If any step fails, note the step number + what you saw — that's the bug report.
