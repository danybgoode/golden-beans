---
title: "Experiments for humans: a guided five-question flow replaces the JSON textarea"
slug: experiments-for-humans
status: scaffolded
area: "01"
type: feature
priority: "audit-wave-A"
appetite: L
underwritten_by: null
risk: high
epic: "01-growth-engine/experiments-for-humans"
build_order: 29
updated: 2026-09-24
---

# Pitch: Experiments for humans

**Deep-groomed 2026-09-24** from the portfolio-pass seed (unification audit
[§9](../audits/golden-frijoles-unification-2026-09-23.md)). Home repo: **golden-beans**.
Class **feature** · lane **shaped bet** · appetite **L** (two waves; amended from M, see below) · risk
**high** (it widens a live contract with an expand-only migration and writes flag versions that serve
in a customer's Production).

**The design is approved, and it is the contract.** Daniel approved the clickable prototype on
2026-09-24 07:44 (America/Mexico_City): `Roadmap/01-growth-engine/experiments-for-humans/approved-prototype.html`
(published at https://claude.ai/artifact/2MHJPipgJRHLT2tndtdmKx). Per WAYS-OF-WORKING step 1 (amended
2026-08-29), an approved design is scope, not inspiration. Story 1.1 lands it in
`apps/web/design-system/` with an approval line and a hash, the same way the 33 console states are
pinned. **The deviations the platform reframe forced are listed under *Deviations from the approved
design*, each with a recommendation. They go to the product owner, not into a builder's judgment.**

## Problem

"+ New experiment" opens a modal whose core is a 24-row **Definition JSON** textarea
(`experiment-manager.tsx`). Binding a flag is a second, separate step that only offers flags whose
variant keys match exactly (`sameVariantKeys`). A PM, who is the buyer, can't build the simplest A/B
test without writing JSON. The governance underneath (immutable versions, SRM, interval, decision
record) is live and good. The only thing missing is a way in for a human.

## Appetite

> **Amendment A1 (2026-09-24, Daniel, at the scope-doc gate): M → L, two waves.** The gate put the
> five deviations below to the product owner with a recommendation each, and the product owner chose
> the approved design over the cuts: **store version names, keep "How many of them", widen the
> contract** for several values per condition and 3+ versions, and keep "a new feature just for this
> test". Those choices can't fit one wave, and the rule is that appetite never grows silently
> mid-shaping, so it is re-set here, openly, before any bet. **Wave 1 = Sprints 1–2** (widen the
> contract, catalog read, planner). **Wave 2 = Sprints 3–4** (builder, readout, retire JSON). The
> betting table re-bets Wave 2 at the boundary. Stop there and report (WAYS-OF-WORKING → Betting &
> appetite: L is re-bet per wave).

*Original shaping (kept for the record):* **M**: one wave. An architect session locks the contract and does the shared surface (the planner
and the catalog read), then builders fan out across the wizard and the readout. Three sprints,
stacked. If the appetite runs out, the order of cuts is fixed in advance: the cumulative chart first
(the interval and bars already tell the story), then templates beyond "Copy or button". The five
steps, the computed checks and Start never get cut.

## Outcome & signal

After this ships, a product person creates, starts and decides an A/B test in
`/app/experiments/<project>` **without typing a single character**. Every question arrives
pre-answered by a template and is changed with a select, chip, card or slider. The signal Daniel can
test: on production, pick "Copy or button", press Continue five times and then Start. The experiment
is running, its flag version is serving the split in Production, and nobody saw JSON. The readout's
first line tells you what to do.

## Stage-2.5 bucket

**Genuinely new surface, entirely on existing primitives.** Nothing new is needed underneath:
definitions, flag versions, binding, lifecycle, analysis, SRM, interval and the decision record are all
live. The one new backend piece is a read (the event catalog). No positioning or copy change can
deliver this outcome today, because the JSON box *is* the product today.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| Five-step builder in the approved wizard modal | The approved shape. It's how "+ New …" works everywhere else. |
| Templates: copy/CTA · pricing · onboarding step · guarded rollout | They pre-answer every step, so the person only changes what differs. |
| Hypothesis as a sentence of dropdowns | "No open questions", while still producing the `hypothesis` string the contract requires. |
| Event catalog read (names, 14-day and 24-hour counts, baseline, tag coverage, entity types) | You can't pick a metric or an audience from a list you haven't seen. |
| One pure planner: answers → `ExperimentDefinition` + the flag version to write + days + checks + sentence | One seam to test, so the UI stays keystrokes. It's also the future CLI's core. |
| Auto-composed flag version (eligibility clauses plus a treatment rollout rule) and auto-bind | The flag must actually serve the split the experiment declares. Binding by hand is today's pain. |
| Computed pre-launch checklist | The Tiendas lesson: catch "the tag the emitter never sends" before launch, not after. |
| Decision-first Results tab | The readout's first line answers "can I call it?" |
| "Roll out to everyone" as a separate write after the decision | The decision record is structurally unable to touch a flag, and it stays that way. |
| `EXPERIMENT_BUILDER_ENABLED` enablement gate | Merge dark, prove it on production, then flip it on and retire the JSON box. |

## Scope

**In v1:**
- The five questions plus Review, as approved (What & why · Who's in it · What they see · How
  you'll know · How long · Review), with the live "plan so far" panel on steps 1–5.
- All four templates. Each one pre-fills the feature, reason, audience, versions, split, metric,
  direction, guardrails, breakdowns and smallest change. Defaults are resolved against *this
  project's* catalog (see D5).
- The **event catalog** read and everything it powers: metric picklists with sparkline, 14-day count
  and baseline; eligibility values with share and coverage; entity types seen; 24-hour arrival;
  flag-evaluation counts.
- Sample size shown as **"≈ N days at your current traffic"**, with the 5% / 10% / 20% trade-off
  chips, "Run it for" in full weeks (recommended = max(2, ⌈days/7⌉)), and a Start date.
- The **computed checklist** (six checks, see D6). A failing check blocks Start but never Save draft.
- **Save draft**: experiment draft, the flag version (not activated) and the binding.
  **Start**: running, plus the flag version activated in Production.
- The **decision-first Results tab** and a read-only **Plan** tab on the experiment page. Decide goes
  through the existing decision recorder. "Roll out to everyone" is a separate, explicit flag write.
- The JSON textarea **retired** from the console once the builder is live. JSON stays an
  agent/API format only.

**Out of v1 (no-gos):**
- **`gf experiments create` and an MCP create tool.** Agents have their own path, and this epic is
  for humans (Daniel, 2026-09-24). The planner is built so a later seed can wrap it (D3).
- **A visual editor or any rendering of the customer's page.** Screenshots are optional uploads. The
  versions themselves are built in code behind the feature.
- **Bayesian readout.** Keep the live frequentist interval (`lib/experiment-interval.ts`). This
  answers the seed's open question 2.
- **Editing a running plan.** "Change the plan" creates version *n+1* as a draft pre-filled from the
  current one. This already matches the immutable lifecycle.
- **Multi-armed bandits, sequential testing, CUPED.** Not this bet.

## Slices (skateboard → car): four stacked sprints, two waves

| Sprint | Story | Risk | QA stage |
|---|---|---|---|
| **Wave 1 · 1 · Widen the contract** (architect, strongest tier, shared surface first) | 1.1 Land the approved prototype as design states + approval line | low | contract regenerated; `--check` green |
| | 1.2 Variant labels + list-valued eligibility: parser, DB check (one expand-only migration), analysis `tagsMatch` | **high** | parser specs, DB round-trip, analysis spec per shape; migration applied before merge |
| | 1.3 Holding people out: the lock picks (A) or (B), then builds it end to end | **high** | spec: held-out subjects produce no exposure and SRM holds on a fixture |
| **Wave 1 · 2 · Catalog + planner** | 2.1 Event catalog read (canonical path) | low (high if the lock needs a SQL function) | api spec on a fixture project |
| | 2.2 The pure planner: answers → definition + flag version (stacked rules, allocation, one-of) + days + checks + sentence | low | unit + property specs, mutation-checked |
| | *Wave boundary: stop, report, re-bet Wave 2* | | |
| **Wave 2 · 3 · The builder** | 3.1 Steps 1–5 + live panel behind `EXPERIMENT_BUILDER_ENABLED` | low | api: gate off = old dialog; browser: zero text inputs |
| | 3.2 Review + computed checks + **Save draft** (draft + flag version, or a new feature + bind) | **high** | api: one idempotent action, nothing activated |
| | 3.3 **Start**: running → activate in Production; honest partial state + retry | **high** | api incl. forced activation failure; browser smoke owed to Daniel |
| **Wave 2 · 4 · Readout, decide, retire** | 4.1 Decision-first Results tab + Plan tab | low | structural signature for the new states; one rendered look |
| | 4.2 Decide (existing recorder) → separate "Roll out to everyone" flag write | **high** | api: record unchanged by the rollout write |
| | 4.3 Flip the gate on in Production, delete the JSON textarea, add the guard | low | guard spec; production smoke by Daniel |

## Deviations from the approved design: decided at the gate (2026-09-24)

The reframe found five places where the approved prototype goes beyond what the live contract holds.
Each was put to Daniel with a recommendation. **He chose the approved design every time.** They are
now scope, and they are why the appetite moved to L (A1).

| # | Approved prototype | What the live system held | **Decision** | Where it lands |
|---|---|---|---|---|
| 1 | Versions carry names ("Current", "New copy") | `ExperimentVariant` is `{key, weight}`; DB check `private.experiment_definition_is_valid` rejects other keys | **Store names**: optional `label` on each variant (parser + DB check, expand-only) | Story 1.2 |
| 2 | "How many of them" (% of eligible people in the test) | A flag rule serves one variant to a rollout %, and everyone else gets the default (= control), so held-out people would be counted as control | **Keep it.** Held-out people must be *eligible, served control, and not exposed*. The mechanism is an architecture fork the lock decides (see Rabbit holes) | Story 1.3 |
| 3 | Several values per condition ("Mexico or Colombia") | `eligibility.tags` is one scalar per field; `tagsMatch` is equality | **Widen the contract**: a tag value may be a scalar **or a list (one-of)**, in the parser, DB check and analysis `tagsMatch`. The flag side already has `one_of`. | Story 1.2 |
| 4 | "Add a version" (up to 4) | Binding requires the variant-key sets to be equal. Most features here are boolean `off`/`on`. | **Widen**: multi-arm splits via stacked rollout rules (the planner's maths). For a multi-value feature, "Add a version" adds a variant to the new flag version. **A boolean feature can't show a third version**, and its card says so in words, never silently. | Stories 2.2, 3.1 |
| 5 | "A new feature just for this test" | Possible via the New-feature composition; can't start until code checks it | **Keep** (the gate answer didn't carve it out). Auto-named key, created with Save draft; the "feature is live" check blocks Start until it's evaluated in Production. | Story 3.2 |

## Rabbit holes (patched here so a builder doesn't fall in)

- **Holding people out ("How many of them") is an architecture fork. The lock decides it, with the
  cross-panel offered.** Held-out people are eligible and get the control *value*, but must emit no
  exposure, or they dilute control and break SRM. Two candidate designs, both expand-only:
  **(A) rule-scoped exposure.** The experiment owns specific rules in the flag version (recorded by
  priority in the binding or definition), and `flag-telemetry` emits `experiment_exposed` only when
  the resolving rule is one of them. Everyone else emits plain `flag_evaluated`. Change surface: SDK +
  binding. **(B) a declared holdout variant.** The flag version gets a third variant carrying
  control's value (e.g. `off_holdout`). The definition declares `holdoutVariantKey`, and analysis and
  the bind RPC's set-equality treat it as "not in test". Change surface: contract, bind RPC, analysis.
  *Recommendation for the lock: (A)*. It keeps the flag's variant set honest, needs no fake variant,
  and puts the rule in one function. Verify against live SDK call sites before choosing.
- **Stacked rollouts for multi-arm splits.** Rules are bucketed independently (the hash includes
  `rule.priority`), so arm *i*'s rollout is its share of what's **left**: bp_i = w_i / (1 − Σ earlier
  w). Combined with allocation `a`, the eligible population splits a·w_i per arm and (1 − a) held out.
  This lives in the planner with a property test: simulated shares within 0.5 pp of the declared
  weights over 100k synthetic keys.
- **Widening a live contract.** One expand-only migration: `CREATE OR REPLACE` the check function to
  accept `variants[].label` (string, 1–40 chars, no control chars) and list-valued eligibility tags
  (1–20 scalars, no duplicates). Every existing row stays valid by construction. The parser widens in
  the **same PR**, because the parser and the DB check must accept exactly the same domain (the
  comment in `experiment-definition.ts` says so). Watch the LEARNINGS trap: `CREATE OR REPLACE`
  keeps grants, but `DROP` + `CREATE` silently restores PUBLIC EXECUTE. Apply before merge, verify
  live.

- **The flag must serve what the experiment declares.** Binding today checks only the variant-key
  *sets*. Nothing makes the served rollout match the declared weights. **Patch:** the planner
  composes the flag version as *the currently served definition, plus one rule at top priority*:
  eligibility clauses (the same five fields: `source · channel · campaign · plan · region`), rollout
  basis points = the treatment weight, serving the treatment variant. Everyone else falls through to
  the served default (control). If the served definition has other rules that could catch eligible
  people first, that is a checklist **warning**, not a silent SRM.
- **Start is two writes, with a partial-failure state** (the same trap A23 in `console-ia-overhaul`
  avoided for New feature). **Patch, and the order is the decision:** (1) transition the experiment
  to `running`; (2) activate the bound flag version in Production. If step 2 fails, the page says so
  in plain words ("The experiment is running but the split isn't serving yet. Turn it on.") with a
  one-click retry. A running experiment with no exposures is harmless and shows as "no exposures
  yet". The reverse order (serving a split for an experiment that isn't running) writes exposures
  outside any running window. The architect confirms the order against live code in the lock.
- **Save draft is three writes that are all inert:** draft experiment version, flag version (not
  activated), binding. Nothing serves until Start. The server action is idempotent on
  (project, experiment key, definition hash), so a double click can't create v2.
- **Exposures come from flag telemetry.** `packages/sdk/src/flag-telemetry.ts` already emits
  `experiment_exposed` when the caller passes `experiment: {key, definitionVersion}`. A customer
  without flag telemetry gets no exposures. **Patch:** the "feature is live" check reads
  `flag_evaluated` in Production. With none seen in 24 hours it is a **warning** that names the
  cause (telemetry off). It only fails when the flag doesn't exist in Production.
- **Template metric defaults can't hardcode event names:** every project's events differ. **Patch
  (D5):** primary = the bound feature's `adoptedEvent` when the feature registry declares one;
  otherwise a name-pattern match per template role (e.g. `completed|published|started` for copy);
  otherwise the most frequent "should go up" event. Guardrails match
  `abandon|cancel|refund|ticket|error|fail|slow`. Every default is shown as "suggested", never silent.
- **The cumulative chart must not become N analyses.** A daily series computed by re-running the
  governed analysis per day is N full fact scans. **Patch:** one extra pure pass over the facts the
  analysis already loaded (the same move `servedDaily` made in `tars-query.ts`). If the appetite runs
  out, the chart is the first cut.
- **Event-catalog cost.** Fourteen days of `events` for a busy project. **The lock queries live row
  counts first.** If a bounded read plus pure aggregation fits (the way `tars-query` does it), no
  migration. If not, a read-only SQL function, which is a migration and moves Story 1.2 to high risk.
  Decided in the lock with the numbers, not guessed here.

## What already exists (reuse, don't rebuild)

- **Contract:** `apps/web/lib/experiment-definition.ts` (`parseExperimentDefinition`,
  `validateExperimentKey`) + DB check `private.experiment_definition_is_valid`
  (`apps/web/supabase/migrations/20260728100000_experiment_registry.sql`).
- **Create/lifecycle/bind actions:** `app/app/experiments/[projectSlug]/actions.ts` →
  `createExperimentVersionAfterGate` (`lib/experiment-create-command.ts`),
  `transitionExperimentVersion` (`lib/experiments.ts`), `bindExperimentFlagVersion`
  (`lib/experiment-flag-bindings.ts`, RPC `bind_experiment_flag_version`, which enforces
  variant-set equality).
- **Flag writes:** `app/app/flags/[projectSlug]/actions.ts` → `createFlagDefinitionVersionAction`,
  `activateFlagAction` (per env, gated by `FLAG_SERVING_ENABLED`); the pure planners in
  `packages/sdk/src/flag-commands.ts` (rollout / kill), which the "Roll out to everyone" write reuses;
  `parseFlagDefinition`, `FLAG_CONTEXT_FIELDS`, rollout basis points (`packages/sdk/src/flags.ts`).
- **Exposure path:** `packages/sdk/src/flag-telemetry.ts` (`flag_evaluated`, and the `experiment`
  field that routes to `experiment_exposed`).
- **Analysis and readout:** `lib/experiment-analysis.ts` (SRM α 0.01, integrity diagnostics,
  segments), `lib/experiment-interval.ts`, `lib/experiment-analysis-query.ts`,
  `lib/experiment-blocker-words.ts`, `lib/experiment-list-view.ts`.
- **Decision record:** `recordExperimentDecisionAction` + `[experimentKey]/decision-recorder.tsx`
  (immutable, owner-only, cannot mutate a flag). **Unchanged.**
- **Feature registry defaults:** `lib/feature-schema.ts` (`targetEvent` / `adoptedEvent`).
- **Canonical `events` reads (AGENTS rule #1):** `lib/{tars,north-star,ab}-query.ts`. The catalog
  read joins that list; it is never an ad-hoc query in a route.
- **Design system:** `apps/web/design-system/` (approved prototype, `reference.css`, tokens, `Frame`,
  primitives, `charts/`), `components/product/NewThingDialog`, the approved `wizardModal()` shape.
  Chart colours per DD4: control grey, treatment blue, status green/red always with a word.
- **Gate convention:** `lib/flags.ts` env-var gates (`=== 'true'`), e.g.
  `isExperimentGovernanceEnabled`.
- **Seed open question 1, answered: don't generalize `RuleBuilderRow`.** Its value input is free
  text, which the "no open questions" rule forbids. "Who's in it" is its own component fed by
  `FLAG_CONTEXT_FIELDS ∩ EXACT_SEGMENT_TAG_FIELDS` and the catalog's values.

## UX heuristics & rails check

- **CI guards covering this surface:** the design-system visual gate + structural signature
  contract (`design-system/measure-contract.mjs`, `MEASURED-SPEC.md`), the coverage ratchet, the
  `<details>`-count-is-zero assertion, `check-design-drift.mjs` (bans `↗` in `/app`), the
  design-token guard. New states enter `route-manifest.ts`.
- **Audits-lens findings that apply:** unification audit §9 (this seed), `app-ux-audit-2026-08-01`
  (JSON-as-UI).
- **Design-language debt:** none new. The prototype uses only `reference.css` plus `x-`-prefixed
  additions on the same tokens. Porting uses the class names, never prose.
- **Behaviour (`references/ux-guidelines.md`):** no typing anywhere; every control pre-selected; the
  verb on the button is the verb in the toast ("Start experiment" → "started"); blocked vs not-built
  drawn differently; the live panel and checklist in `aria-live`; 44px targets and no horizontal
  scroll at 360px.
- **Design assertions that can fail on a bad-looking page (LEARNINGS 2026-08-28 / 2026-09-10):**
  step count and labels, the primary action's words per step, zero `<textarea>` and zero `<details>`
  in the builder, zero text inputs in the builder, the review sentence present, the checklist row
  count, and on Results the ordered block sequence (answer → lift card + verdict → KPI tiles →
  interval + who saw what). Then budget one **rendered look** per sprint as a step, not a courtesy.

## Kill-switch / runtime gate (risk: high, Stage 6b)

**Recommended: an enablement gate story (Story 2.1 carries it).**
1. **Flag (Story 3.1):** `EXPERIMENT_BUILDER_ENABLED` → `isExperimentBuilderEnabled()` in `lib/flags.ts`
   (`=== 'true'`), the same rail as `EXPERIMENT_GOVERNANCE_ENABLED`.
2. **Polarity:** **enablement / dark-launch.** Default `false`, **created DISABLED in every Vercel
   environment**, flipped on in Production only after the Sprint 3 smoke passes (Story 4.3).
3. **Seam:** the "+ New experiment" dialog's content (builder vs the current manager) **and** every
   new server action (`requireBuilderGate()`), so UI and writes are covered by one check.
4. **Mechanism:** Vercel env var, which needs a redeploy (merge) to reach functions. Verify by
   exercising the dialog, not `vercel env ls`.

After Story 4.3 retires the JSON box, the flag **stays** as the builder's kill-switch. Off means the
"+ New experiment" button is drawn as *blocked* with the reason ("Creating experiments is paused"),
never hidden. The contract-widening migration (Story 1.2) carries its own carve-out: **expand-only, can't sit
behind a runtime flag.** Old rows stay valid by construction, and the new fields are optional. The
holdout mechanism (Story 1.3) is unreachable until the builder's gate is on, because nothing else
composes an allocation below 100%.

## Acceptance criteria (epic-level; per-story checks live in the sprint docs)

1. From the Experiments page, a product person creates and starts a test with **zero keystrokes**
   (no text input exists in the builder), including names, several values per condition, a
   held-out share and, on a multi-value feature, a third version.
2. Every step arrives answered by the chosen template. Switching templates re-answers all five.
3. The Review sentence, the "≈ N days" figure and all six checks are computed from this project's
   live catalog, and the numbers match the planner's unit tests for the same inputs.
4. A condition on a tag carried by under 10% of recent events **fails** the eligibility check with a
   one-click fix. Start is disabled while any check fails, and Save draft never is.
5. Start leaves the experiment `running` **and** its flag version active in Production. A failed
   activation shows the honest partial state plus a retry.
6. The Results tab leads with one sentence that says whether you can call it, and "Roll out to
   everyone" appears only when the governed analysis is decision-ready.
7. Deciding writes the existing immutable decision record. Rolling out is a separate flag write, and
   the record is unchanged by it.
8. The JSON textarea no longer exists in `/app/experiments`, and a guard fails if it returns.

## Open risks / research

- **Present-day pattern references** (from the audit's 2026 reading): Statsig create flow and power
  calculator (https://docs.statsig.com/experiments/create-new); LaunchDarkly experiment creation
  (https://launchdarkly.com/docs/home/experimentation/create); PostHog running-time calculator:
  MDE-driven, baseline from the metric, switches to live data after exposures
  (https://posthog.com/docs/experiments/sample-size-running-time); Eppo protocols = templates
  (https://docs.geteppo.com/quick-starts/analysis-integration/defining-protocols/). Optimizely's
  experimentation page and Daniel's three reference screenshots (`references/shoe-sale-*.png`,
  `ship-with-certainty-checkout-rollout.png`) set the visual bar: side-by-side versions, one big lift
  number, one roll-out action.
- **Sample size:** *n ≈ 16·p(1−p)/δ²* per version (80% power, α = 0.05, δ = p × MDE), limited by the
  smallest arm's share. Shown as days, never as a formula.
- **Live data:** miyagisanchez's two experiments are both `decided`, so the Results states are only
  reachable with a fixture. The lock names the fixture (the lesson from `design-system-rails`: when a
  gate says the page is wrong, check the fixture first).
