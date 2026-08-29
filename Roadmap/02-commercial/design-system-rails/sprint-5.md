# One design system, every surface — Sprint 5: Measure and Today — the pages nobody designed

**Status:** ⬜ not started

> **The largest genuinely-new design surface in the epic.** Only `Today` has an approved state
> (reference **06**). Funnel, Impact, Experiments, Journeys, Tasks, Scenarios and the audit have
> **never had a mockup at all** — so every story here is *design a state → Daniel approves it →
> build it*, in that order (Rail 2). No route in this sprint is built from prose.
>
> ⚠️ **This is where the appetite is most likely to be exhausted.** If it is, the answer is to stop
> and return to shaping — not to extend. Story 5.1 is the named trap.

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
**Risk:** high

### Story 5.3 — Funnel and Impact
**As a** person, **I want** the namesake framework to look like one, **so that** the funnel is a
funnel rather than a `<dl>`.
**Acceptance:** states designed and **approved by Daniel before build**. Both routes keep working
standalone and as the feature-page tabs from Story 4.2 — one design, two mounts, not two designs.
Audit §6.5.
**Risk:** high

### Story 5.4 — Experiments, list and detail
**As a** person running an experiment, **I want** lift and decision to be visible,
**so that** the comparison bar has somewhere to live.
**Acceptance:** states designed and approved before build. `EXPERIMENT_GOVERNANCE_ENABLED` is
**Production-only** — the walkthrough step says so, or a correct preview render reads as broken.
**Risk:** high

### Story 5.5 — Journeys, list and detail
**As a** person, **I want** journeys on the system, **so that** the section is whole.
**Acceptance:** states designed and approved before build. `JOURNEY_PROJECTIONS_ENABLED` is
Production-only — same walkthrough caveat.
**Risk:** high

### Story 5.6 — Tasks, Scenarios, Activity audit and Onboarding
**As a** person, **I want** the last four console surfaces on the system, **so that** `/app` is
finished.
**Acceptance:** all four render from `design-system/` with reference states.
- **Scenarios is the whitespace** — audit §6.4 calls it a read-only log where the PRD describes a
  tool, and §7 P1 says prioritise it over polish elsewhere. Design it as the tool.
- `onboarding` stays `flow-only` in the inventory and is still gated out of the nav; it gets a
  reference state because a person can reach it, not because the nav lists it.
- Coverage reaches **20/29** — all of `/app`.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/charts.browser.spec.ts` (each primitive renders its states; no reliance on
  colour alone; `tabular-nums` on every stat) · manifest-driven visual rows for the nine routes this
  sprint lands · `e2e/command-center.authed.spec.ts` extended to the new layout.
- **browser smoke owed:** yes, to Daniel — **approving the seven new states before they are built.**
  That approval *is* the gate for this sprint, and it happens at story start, not at sprint end.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 5 — Smoke walkthrough (do these in order)
Env: **production · https://goldenfrijoles.com**. Every route below rides a Production-only gate, so
none of these steps is meaningful on a preview.

1. Before any of this sprint is built: open the seven proposed states side by side.
   → **You approve or reject them here.** Nothing in this sprint gets built from a description.
2. Go to https://goldenfrijoles.com/app.
   → Today renders the North Star number, what is waiting on you, and what changed — matching the
   state you approved. No mono-italic caveats, no dead vertical gap.
3. Go to https://goldenfrijoles.com/app/funnel/miyagisanchez/setup_guide.
   → The funnel is **drawn**, with real numbers. `setup_guide` is the one feature that has a funnel;
   this is where numbers can honestly be asserted.
4. Go to https://goldenfrijoles.com/app/experiments/miyagisanchez.
   → Experiments render on the system, with a comparison bar where there is a result.
5. Go to https://goldenfrijoles.com/app/scenarios/miyagisanchez.
   → It reads as a tool you operate, not a log you read.
6. Open the PR's CI run.
   → Coverage reports **20/29** and the visual gate is green for all twenty.

If any step fails, note the step number + what you saw — that's the bug report.
