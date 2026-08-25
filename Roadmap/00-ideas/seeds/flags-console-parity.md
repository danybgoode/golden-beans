---
title: "The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics"
slug: flags-console-parity
status: scaffolded
area: "01"
type: feature
priority: null
appetite: M
underwritten_by: null
risk: high
epic: "01-growth-engine/flags-console-parity"
build_order: null
updated: 2026-08-25
---

# Pitch — The flag console a human can operate

## Problem

`/app/flags/[projectSlug]` was written for an agent to operate and a PM to audit. It renders the
engine's shape: one page that stacks a JSON authoring textarea, three credential-minting forms, an
`<article>` per flag (each with its own rule builder, insight block, preview and version table), and
then three more tables. At Miyagi Sánchez's ~42 definitions that is a page nobody scrolls to the
bottom of, in a vocabulary — *immutable definition version*, *activation*, *snapshot revision*,
*mint a scoped snapshot key* — that describes the storage model rather than the job.

This is already the standing diagnosis in this repo, not a new opinion.
`00-ideas/audits/app-ux-audit-2026-08-01.md` §0: *"The product hasn't been designed for a human yet;
it's been rendered."* Its positioning matrix (§3.3) scores Golden **🚧 raw JSON textarea** against
PostHog's *"mature, dense UI"* and GrowthBook's *"mature, visual rule builder"*.

**The sharpest evidence arrived during this groom.** Asked to confirm which of Miyagi Sánchez's flags
were on and why three were not, the product owner's answer was *"I didn't understand the
explanation… perhaps after the UX/UI work I will."* Answering that question currently takes three
paragraphs of SQL archaeology across two repos. It should take one screen. **That is the outcome this
epic is bought for, and it is the acceptance test.**

We are pre-innovation here on purpose: match a design language that has already been tested and
validated at scale before differentiating on top of it.

## Appetite

**M — one wave.** An architect session that locks the decisions, builder fan-out across three
sprints, and the review rounds. The circuit breaker is real: if the IA split starts pulling
`ProductShell` or the write path in, the work stops and comes back to shaping rather than growing.

Cheaper than it looks, because the capability is already built (see *Stage-2.5 bucket*). This buys
information architecture, list ergonomics and copy — not features.

## Outcome & signal

After this ships, the product owner opens the flags page for a project and — without asking anyone,
and without opening a second repo — can answer:

1. **Which features are on**, in the environment he picked, sorted and filtered to the handful he
   cares about.
2. **Which are off, and which don't exist yet** — rendered as two different facts, because they are.
   (Retro learning, `medusa-bonsai/Roadmap/09-platform-infra/golden-frijoles-integration`: *"Absent
   and off are different facts about a flag, and the difference is operational. Any flag inventory
   that renders both as OFF is hiding a task."*)
3. **What changed on a feature and when**, in sentences, without expanding
   `<details><summary>Inspect immutable JSON</summary>`.

**How he tests it:** open the page, find `checkout.stripe_enabled` in under five seconds by typing
into a search box, and read its production state without scrolling past another flag.

## Stage-2.5 bucket

**Split — and the split is the good news.**

- **Already possible (bucket 1) — the capability.** The visual rule builder, rollout bars,
  plain-language version diff and preview-as-a-user all shipped in `flags-visual-rule-builder`, and
  `FLAG_RULE_BUILDER_ENABLED=true` has been live in Production and Preview since **2026-08-10**
  (that epic's RETROSPECTIVE.md, line 109). Nothing in this pitch builds a flag capability.
- **Genuinely new (bucket 3) — the information architecture and the language.** There is no
  environment selector, no way to search or filter or page a flag list, no per-feature destination,
  and no module that owns the user-facing vocabulary. Those don't exist and can't be reached by
  configuration.

## Bill of materials (What / Why)

*(Edit the Why column. A Why neither of us can defend is a part we cut.)*

| What | Why |
|---|---|
| One feature **list**, row per flag | The `<article>`-per-flag stack is the whole complaint. A list is scannable; 42 stacked editors are not. |
| Search · status · type filters · sort · pagination | Flagsmith's list has all five. Miyagi Sánchez already proved this exact shape on this exact data. |
| Environment **selector** on the flags surface | Flagsmith makes environment the context you pick once. Today it's three columns inside every row. |
| A **per-feature** destination (Value · History · Settings) | Editing one feature shouldn't mean scrolling past 41 others. Mirrors Flagsmith's Edit Feature modal. |
| "Not created" as a distinct state | `partners.recruiting_v3_enabled` reads OFF because it has no definition. That's a create, not a flip — and today the UI lies about it. |
| Credentials → their own route | Flagsmith calls it SDK Keys. Three minting forms above the list is why the list starts below the fold. |
| Lifecycle audit → its own route | Flagsmith calls it Audit Log. Same reason. |
| One module owning every user-facing flag word | The `lib/positioning.ts` precedent: define it once, import it everywhere, so no two surfaces can drift. |
| `FLAG_CONSOLE_ENABLED` | This replaces the surface used to kill a live checkout. It merges dark and gets flipped deliberately. |

## Scope

**In v1:**

- The flags surface becomes: environment selector → filtered/sorted/paginated feature list → a
  per-feature destination.
- Flagsmith's vocabulary adopted **where the concept genuinely matches** — Feature, Enabled, Value,
  History, Environment. Golden's genuinely-different concepts (immutable versions, snapshot
  revisions) get plain-language names of their own and **never** borrow a Flagsmith word that
  already means something else there.
- Snapshot keys and catalog sync keys move to one credentials route; the lifecycle audit moves to
  its own. Both registered in `PROJECT_ROUTE_INVENTORY` and linked from the shell nav.
- "Not created" rendered as its own state, with the create action attached.
- The existing rule builder, diff, rollout bar and preview move **into** the per-feature destination
  unchanged.

**Out of v1 (no-gos):**

- **No app-wide environment context.** The selector is flags-scoped. `ProductShell` is shared
  surface across every `/app` route; promoting environment to ambient context is its own decision
  with its own blast radius. (Product owner's call, this groom.)
- **No Segments, Scheduling, Feature Change Requests or Identity Overrides.** They're in the
  Flagsmith screenshots and they have no Golden backend. Building rail items that lead nowhere is
  worse than not having them.
- **No charting dependency.** `apps/web/package.json` still has none, and picking one is the open
  `analytics-visualization-layer` spike's decision, not this epic's.
- **No change to the write path, the SQL, the wire contract or snapshot semantics.** The console
  reads what `getFlagRegistryView` already returns. Adding a query is a scope breach — the same A4
  line `flags-visual-rule-builder` held.
- **No locale layer.** The reuse source (Miyagi Sánchez's filter bar) is es-MX. Golden is
  English-only by explicit policy (WAYS-OF-WORKING → Conventions → Language). **Copy its shape,
  never its copy.**
- **No touching Miyagi Sánchez's `/admin/flags`.** It is a correct, deliberately-narrow projection
  and it is out of this repo.

## Rabbit holes

- **The JSON textarea's D6 promise.** `flag-manager.tsx` carries an inline `style={{...}}` with a
  comment explaining that Sprint 2 of the rule-builder epic swapped it for `.code-input`, cross-review
  rejected the swap, and *"whoever replaces this control owns the swap"* — because `.code-input` also
  sets `white-space: pre` and would stop long JSON wrapping. That's this epic. Budget for it; don't
  discover it.
- **`DataTable` has no pagination, deliberately.** Its own D3 comment: *"A third route that needs an
  option is a finding to log, not a prop to add quietly."* Adding one is a locked architect decision
  with the finding written down, or the list is a different component. Not a quiet prop.
- **Not every flag in the registry is a Miyagi Sánchez static boolean.** Two disposable `breaker.*`
  proof flags from a 2026-07-29 circuit-breaker test still sit in the production registry, and the
  registry can hold definitions with non-empty `rules`. A list that assumes boolean-with-two-variants
  will render garbage for them.
- **A new route that isn't registered is a URL only its author knows.** `lib/project-route-inventory.ts`
  opens with exactly that warning. Two new routes ⇒ two inventory entries, shell-nav links, and
  entries in the `mobile-heuristics` route sweep array.
- **Terminology drift is the failure mode this epic is most likely to ship.** Renaming labels in six
  files is how two surfaces end up calling one thing two names. One module, imported — the
  `lib/positioning.ts` pattern — or it will drift within a sprint.
- **The page must stay operable with the gate off.** `page.tsx` resolves gates server-side and
  `flag-manager.tsx` proves the pattern; a half-migrated page behind a flipped gate is an operator
  who cannot kill a checkout.

## What already exists (reuse, don't rebuild)

**Golden — reuse directly:**

- `apps/web/lib/flag-registry.ts` → `getFlagRegistryView()` — every definition, version and
  per-environment activation. The list needs **no new query**.
- `apps/web/lib/flag-environment-view.ts` → `summariseFlagEnvironments()` — per-environment state and
  rollout reach, already pure and unit-tested.
- `apps/web/lib/flag-definition-diff.ts` → `diffFlagDefinitions()` — the plain-language diff.
- `apps/web/lib/data-table.ts` — pure `sortRows` / `filterRows` / `nextSortState` (no paginate).
- `apps/web/components/ui/` — `DataTable`, `RolloutBar`, `StatCard`, `Badge`, `Panel`, `Icon`,
  `ConfirmDialog`, `FormSection`/`Field`.
- `app/app/flags/[projectSlug]/{rule-builder,flag-insight,flag-preview}.tsx` — move, don't rewrite.
- `apps/web/lib/{project-route-inventory,shell-nav}.ts` + `components/product/ProductShell.tsx` — the
  registration path for the two new routes.
- `apps/web/lib/flags.ts` — 16 existing `=== 'true'` gates (counted 2026-08-25); the new one goes here.
- `apps/web/lib/positioning.ts` — the precedent for a single imported vocabulary module.

**Miyagi Sánchez — port the semantics, not the file (different repo, different language):**

- `apps/miyagisanchez/lib/flags-admin-view.ts` — `sortFlags` (key_asc/key_desc/status/polarity/recent,
  every branch tie-breaking alphabetically), `filterFlagsByQuery` (key **or** description),
  `filterFlagsByStatus`, `filterFlagsByPolarity`, `paginate` (clamps out-of-range instead of
  returning empty), and an allow-listed `URLSearchParams` builder. **Framework-free on purpose so
  the pure math is gate-testable with zero DOM** — exactly the constraint `lib/data-table.ts` was
  built under. This is the single highest-leverage reuse in the pitch: the shape has been running
  against this same flag data since the `admin-flags-cleanup` chore.
- `app/(shell)/admin/flags/FlagsFilterBar.tsx` — a zero-JS filter bar (status chips as `Link`s + a
  plain GET `<form>`), URL-driven so filters are shareable, bookmarkable and survive a refresh, with
  the client bundle carrying only the toggle interactivity. **Shape only — its copy is Spanish.**

**Flagsmith — the reference IA** (from the product owner's own live dashboard, 2026-08-24): an
environment switcher above a left rail; a Features list with Search plus Tags/Value/Users/Groups/View/Sort
controls, a toggle and a kebab per row; an Edit Feature modal tabbed
Value · Segment Overrides · Identity Overrides · Usage · Health · History · Settings, with Enabled,
Value, *Compare across environments*, and Schedule Update / Update Feature Value.

## UX heuristics & rails check

- **CI guards covering this surface:** `scripts/check-design-drift.mjs` (design tokens);
  `npm run test:unit` (the pure-function layer — where the new list math belongs); the Playwright
  `api` project (the deterministic merge gate); `e2e/mobile-heuristics.authed.spec.ts` +
  `.browser.spec.ts` (the zero-specificity tap-target sweep — **the two new routes get array
  entries**); `e2e/flag-rule-builder.authed.spec.ts` (the authed flags spec to extend).
- **Audits-lens findings that apply:** `00-ideas/audits/app-ux-audit-2026-08-01.md` — §0 (the root
  cause), §1's *"what good means"* checklist (*"buttons say Activate, not what activation changes"*),
  §2.4 (the feature-by-feature walkthrough of this very file), §3.3 (the positioning matrix),
  §6.3 (this ask, near-verbatim), §6.7 (`DataTable`, `RuleBuilderRow`), §7 (P1).
- **Design-language debt (if any):** the D6-protected inline `style={{...}}` on the JSON textarea;
  three hand-rolled `<table>` elements not on `DataTable`; the `<article>`-per-flag stack;
  `<details><summary>Inspect immutable JSON</summary>` as the primary "what changed" affordance
  (audit §1, named there as the current UI for *"see what the agent did without reading JSON"*);
  `<h1>Feature flags — {projectSlug}</h1>` with a hand-written `← Your projects` link where the
  shell already provides navigation.

## Kill-switch / runtime gate (Stage 6b)

**There is a runtime seam, and it gets a flag.**

- **Flag:** `FLAG_CONSOLE_ENABLED`, added to `apps/web/lib/flags.ts` alongside the existing 14 gates,
  same exact `process.env.X === 'true'` shape as `isFlagRuleBuilderEnabled()`.
- **Polarity: ENABLEMENT — default `false`, created DISABLED in every environment before Sprint 1
  merges**, flipped on deliberately once the product owner has walked the new surface. This is the
  right polarity because the page being replaced is the operating surface used to kill a live
  checkout on Miyagi Sánchez: a half-landed redesign must never be the only way to reach that
  control. A flag is invisible until it exists — the story says *create it in every env*.
- **Seam:** `isFlagConsoleEnabled()` resolved **server-side in `page.tsx`** and passed down, the same
  boundary `isFlagRuleBuilderEnabled()` uses today. One resolver, so the list, the per-feature
  destination and the two new routes are covered by one check.
- **Mechanism:** a Vercel environment variable — and per AGENTS rule #4 **a commit to `main` is what
  makes it live**, because Vercel snapshots env values at build time. Never `vercel redeploy`.
- **With the gate off, the current page renders exactly as it does today.** That guarantee is
  asserted, not asserted-ish: `flags-visual-rule-builder` learned the hard way that a dark-launch
  promise holding "except for one class" is not a guarantee.

## Acceptance criteria

**Sprint 1 — the list becomes a list**

1. `FLAG_CONSOLE_ENABLED` exists and is **disabled in development, preview and production** before
   anything merges. With it off, `/app/flags/<slug>` is byte-for-byte what it is today. *(HIGH)*
2. Pure list math lives in `lib/flag-list-view.ts` and is covered by `npm run test:unit`: search
   matches key **or** description; status and type filters; five sorts, each tie-breaking
   alphabetically; pagination that clamps an out-of-range page instead of returning an empty one. *(LOW)*
3. With the gate on, the page shows **one list** — a row per feature with its key, description, state
   in the selected environment, and its type — with search, filters, sort and pagination driven by
   URL parameters, so a filtered view can be bookmarked and survives a refresh. *(LOW)*
4. An environment selector sits above the list; changing it changes what the list reports and is
   reflected in the URL. *(LOW)*

**Sprint 2 — one feature, in Flagsmith's shape**

5. Clicking a feature opens its own destination carrying Value, History and Settings; the existing
   rule builder, plain-language diff, rollout bar and preview render there, behaviourally unchanged. *(LOW)*
6. Enabling or disabling a feature in an environment is one clearly-labelled control, and disabling
   asks first — naming the specific feature, the environment, and what stops. *(HIGH — this control
   can kill a live checkout)*
7. A catalog key with no definition shows as **not created**, visibly distinct from off, with the
   create action attached. *(LOW)*

**Sprint 3 — the split and the language**

8. Snapshot keys and catalog sync keys live on their own route; the lifecycle audit lives on its own.
   Both are registered in `PROJECT_ROUTE_INVENTORY`, reachable from the shell nav, and appear in the
   mobile-heuristics route sweep. *(3.1 HIGH — credential surface; 3.2 LOW)*
9. Every user-facing flag word comes from one module. Grepping the old vocabulary
   (*immutable definition version*, *mint*, *snapshot revision*, *activation*) returns nothing in
   rendered copy. *(LOW)*
10. The design-drift guard and the authed flags spec both pass against the new surfaces. *(LOW)*

**Epic-level, and the one that matters:** the product owner opens the flags page cold and answers
"which of these are on, where, and which aren't created yet" without asking a second question.

## Open risks / research

- **Flagsmith's IA is sourced from the product owner's own live dashboard** (screenshots, 2026-08-24)
  — primary and current, not recalled from training. What they show is recorded above under *reuse*.
  Rail items visible there with no Golden backend are explicitly no-gos.
- **Flagsmith is fully retired from Miyagi Sánchez's code** — it survives only in historical docs and
  in a stale local `.env.local`. It is a design reference here and nothing more.
- **Row count is unverified.** ~42 comes from Miyagi Sánchez's 41-key catalog plus two `breaker.*`
  proof flags; the live Golden registry was not read during this groom (its credentials live in GCP
  Secret Manager, not locally). If a project's list is genuinely small, story 3 still holds but
  pagination is cheap insurance rather than the point.
- **Two of Golden's own flag-adjacent gates are unrelated to this one** —
  `FLAG_DEFINITION_SYNC_ENABLED` (born OFF) and `FLAG_SERVING_ENABLED`. The console must not
  accidentally read or flip either. `FLAG_SERVING_ENABLED` being off already has its own banner and
  that behaviour is preserved.
- **Cross-agent planning panel:** *not* triggered. No new primitive, no new table, no data-ownership
  fork, no migration — the app-wide-environment question was the one architecture fork here and the
  product owner closed it as a no-go this groom. Available on demand via the `Panel:` verb if the
  architect's lock pass surfaces one.
