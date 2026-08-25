---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: flags-console-parity
build_order: null    # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/flags-console-parity.md`](../../00-ideas/seeds/flags-console-parity.md)
> **Appetite:** M (one wave) · **Underwritten by:** _null — not yet bet_
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §0, §1, §2.4, §3.3, §6.3, §6.7, §7 (P1).
> **Builds on:** `flags-visual-rule-builder` (#15) — its builder, diff, rollout bar and preview are moved, not rewritten.

## Why

`/app/flags/[projectSlug]` renders the engine's shape rather than the operator's job: one page
stacking a JSON authoring textarea, three credential-minting forms, an `<article>` per flag (each
with its own rule builder, insight block, preview and version table), then three more tables. At
Miyagi Sánchez's ~42 definitions nobody reaches the bottom, and the vocabulary — *immutable
definition version*, *activation*, *snapshot revision*, *mint a scoped snapshot key* — describes
storage, not work.

This epic buys **information architecture, list ergonomics and language**. It buys no new flag
capability, because there is none missing: the visual rule builder, rollout bars, plain-language
version diff and preview-as-a-user all shipped in `flags-visual-rule-builder` and
`FLAG_RULE_BUILDER_ENABLED=true` has been live in Production and Preview since **2026-08-10**.

The target design language is **Flagsmith's**, deliberately — parity before innovation, on a
vocabulary and IA already tested and validated at scale.

**The outcome, stated as the test it must pass.** During this epic's groom the product owner was
given a correct, evidenced explanation of which Miyagi Sánchez flags were on and why three were not,
and answered: *"I didn't understand the explanation… perhaps after the UX/UI work I will."* Answering
that question today takes three paragraphs of SQL archaeology across two repositories. **When this
epic is done it takes one screen, and that explanation becomes unnecessary.**

## Platform-first note

**Nothing new is modelled and no query is added.** The flag registry, its immutable versions, the
per-environment activations and the credential taxonomy all already exist and are already read by
this page through `getFlagRegistryView()`. This epic re-presents what that call returns and moves two
groups of controls to their own routes. The SQL, the wire contract, the snapshot semantics and the
write path are all untouched — the same A4 line `flags-visual-rule-builder` held.

Per AGENTS rule #1, every read stays on the existing `lib/` seams; per rule #2 nothing here is
public; the two new routes sit behind the same `requireProjectMembership` path as the current one.

## What already exists (reuse, don't rebuild)

**Golden — use directly:**
- `apps/web/lib/flag-registry.ts` → `getFlagRegistryView()` — every definition, version and
  per-environment activation. **The list needs no new query.**
- `apps/web/lib/flag-environment-view.ts` → `summariseFlagEnvironments()` — per-environment state and
  rollout reach; pure, unit-tested.
- `apps/web/lib/flag-definition-diff.ts` → `diffFlagDefinitions()` — the plain-language version diff.
- `apps/web/lib/data-table.ts` — pure `sortRows` / `filterRows` / `nextSortState` / `compareCellValues`
  (**no paginate** — see D4).
- `apps/web/components/ui/` — `DataTable`, `RolloutBar`, `StatCard`, `Badge`, `Panel`, `Icon`,
  `ConfirmDialog`, `FormSection`/`Field`.
- `app/app/flags/[projectSlug]/{rule-builder,flag-insight,flag-preview}.tsx` — **move, don't rewrite.**
- `apps/web/lib/project-route-inventory.ts` + `lib/shell-nav.ts` + `components/product/ProductShell.tsx`
  — the registration path for the two new routes.
- `apps/web/lib/flags.ts` — 16 existing `=== 'true'` gates (counted 2026-08-25); the new one goes here.
- `apps/web/lib/positioning.ts` — the precedent for one imported vocabulary module (D7).
- `apps/web/lib/dashboard-auth.ts` → `requireProjectMembership`, `lib/roles.ts` → `isOwner`.

**Miyagi Sánchez (`medusa-bonsai`) — port the semantics, never the file:**
- `apps/miyagisanchez/lib/flags-admin-view.ts` — `sortFlags` (five sorts, every branch tie-breaking
  alphabetically), `filterFlagsByQuery` (key **or** description), `filterFlagsByStatus`,
  `filterFlagsByPolarity`, `paginate` (clamps an out-of-range page instead of returning empty), and
  an allow-listed `URLSearchParams` builder. Framework-free on purpose so the math is gate-testable
  with zero DOM — the same constraint `lib/data-table.ts` was built under. **This shape has been
  running against this exact flag data since the `admin-flags-cleanup` chore.**
- `app/(shell)/admin/flags/FlagsFilterBar.tsx` — a zero-JS filter bar: status chips as `Link`s plus a
  plain GET `<form>`, URL-driven so filters are shareable, bookmarkable and survive a refresh, with
  the client bundle carrying only the toggle interactivity.
- ⚠️ **`FlagsFilterBar.tsx` is es-MX** (and Tailwind-classed, so it was always shape-only reuse).
  `flags-admin-view.ts` is **English** and ports as-is — the original claim that both were es-MX was
  corrected at the lock pass (Amendment 3). Golden is English-only by explicit policy
  (WAYS-OF-WORKING → Conventions → Language). **Copy the shape, never the copy.**

**Flagsmith — the reference IA** (product owner's own live dashboard, screenshots 2026-08-24): an
environment switcher above a left rail; a Features list with Search plus Tags/Value/Users/Groups/View/Sort
controls, a toggle and a kebab per row; an Edit Feature modal tabbed
Value · Segment Overrides · Identity Overrides · Usage · Health · History · Settings, carrying
Enabled, Value, *Compare across environments*, and Schedule Update / Update Feature Value.

## Decisions — ✅ LOCKED 2026-08-24 (architect, against live code **and** the live production registry)

Locked per WAYS-OF-WORKING §5. Every row below was verified against the code as it is on `main`
(`b57ccdb`) and against the **production** Supabase registry (`slweidgffcfndnskcskc`, project
`miyagisanchez`, 42 definitions / 44 versions, read 2026-08-24). Builders **cite** these; they do not
re-derive them.

**The locking pass disproved scope, as the groom predicted it would.** `D5` and `D8` were both wrong
about live data, and `D6` was in direct conflict with Stories 3.1/3.2. Corrections are stated out
loud below and the affected sprint docs were edited, not silently reinterpreted.

| # | Locked decision | Evidence |
|---|---|---|
| D1 | ✅ **CONFIRMED — with a correction about *where* the fields live.** The console reads only `getFlagRegistryView()`; no query is added. | `description` is a **required, non-blank** field of `FlagDefinition` (`packages/sdk/src/flags.ts`). `polarity` and `criticality` are **not** typed fields — they live inside the optional `definition.metadata` bag. Live: **44/44** versions carry both (`polarity` ∈ `killswitch\|enablement`, `criticality` ∈ `high\|medium\|low`); `enforcement` and `source` are on **43/44**. So the data the list needs is all there — but see D1a. |
| D1a | ✅ **NEW — polarity and criticality are a convention, not a guarantee.** The list renders an explicit *unclassified* state for either. | `metadata?: Record<string, FlagMetadataValue>` is optional in the SDK and unvalidated by `private.flag_definition_is_valid`. Nothing stops a definition arriving without them, and **one live version already lacks `enforcement`/`source`**. A list that assumes the bag is populated is one sync away from rendering `undefined`. |
| D2 | ✅ **LOCKED — a new pure `lib/flag-list-view.ts`, NOT an extension of `lib/data-table.ts`.** | Three reasons. (a) `data-table.ts` is generic arithmetic over `CellValue`, deliberately paired with the `DataTable` island under its own frozen-API rule. (b) The flag list needs **domain** sorts (state, type, recently-changed) which are not column sorts. (c) **The decisive one:** Miyagi Sánchez's model has one global `enabled`; **Golden's state is per-environment**. So this module's real signature is `(flags, environment) → row projection`, and sort/filter/paginate run over that projection. That is domain logic, not table arithmetic. |
| D3 | ✅ **LOCKED as scope** — the environment selector is flags-scoped; `ProductShell` is untouched. | Product owner's decision, 2026-08-25. Unchanged by the lock pass. |
| D4 | ✅ **LOCKED — `DataTable` gains no pagination prop, and the feature list is not a `DataTable`.** No written exception is needed. | Its D3 comment forbids quiet prop growth (*"a finding to log, not a prop to add quietly"*), and its filter box renders **unconditionally** — the open finding from `app-component-kit-adoption`. Decisive on its own: `DataTable`'s search and sort are **client state**, and Story 1.3 requires URL-driven filters that survive a refresh and can be shared. Those are incompatible; this is a different component, not a bigger `DataTable`. |
| D5 | ❌ **DISPROVED as written. Re-stated on honest grounds.** | Two claims, both false. (1) *"Two disposable `breaker.*` proof flags sit in production"* — they do, but in the **`miyagi`** project, **not** `miyagisanchez` (`breaker.auto_prd_g_20260729`, `breaker.manual_prd_g_20260729`, `scenario.miyagi_readiness_epic_20260729`). Every one of `miyagisanchez`'s 42 keys carries `source: miyagi` metadata and none is a `breaker.*`. (2) *"definitions may carry non-empty `rules`"* — **zero of the 44 live versions have a single rule**, and all share **one** `valueType`. The live registry is 100% rule-less static booleans. **The robustness requirement survives, on forward-looking grounds:** the visual rule builder shipped in #15 can author rules today, and `getFlagRegistryView()` serves both tenants. The list must not *assume* a static boolean — but the sprint doc must stop claiming live data proves it. |
| D6 | ✅ **LOCKED, strengthened into a construction, and a conflict with 3.1/3.2 resolved.** | See **Amendment 1** below. |
| D7 | ✅ **CONFIRMED.** One module owns every user-facing flag word, `lib/positioning.ts` pattern. | That module exists (52 lines) and its own comment names the three prior epics that paid for the alternative. It is pinned by `e2e/positioning-surfaces.spec.ts`, which asserts the string renders identically on every surface — **Story 3.3 mirrors that spec shape**, so a sixth surface retyping a term is a failing test rather than a slow drift. No Flagsmith term is reused for a Golden concept that differs (checked against D8's re-scope: *Environment*, *Feature*, *Enabled*, *Value*, *History* all match; Golden's three-state activation gets plain-language names of its own). |
| D8 | ❌ **DISPROVED, decisively — and re-scoped into the distinction that IS real.** | See **Amendment 2** below. |

### Amendment 1 (2026-08-24) — D6 conflicts with Stories 3.1/3.2, and the move is therefore gate-conditional

D6 promises that with `FLAG_CONSOLE_ENABLED` off the flags page is byte-for-byte pre-epic. Stories
3.1 and 3.2 move the credential forms and the lifecycle audit **off** that page. Taken literally the
two cannot both hold: an unconditional move deletes controls from the gate-off page, and a
dark-launch guarantee that holds "except for the three forms" is not a guarantee. The groom did not
notice this. Three things are therefore locked:

1. **The move is gate-conditional.** With the console **off**, `flag-manager.tsx` still renders the
   key forms and the audit table exactly as today. With it **on**, they are absent there and live on
   their own routes. The gate-off branch of that component is not edited by this epic.
2. **Byte-for-byte is a construction, not a promise to test.** The new console is a **new component
   tree**; Sprint 1 does not edit `flag-manager.tsx` at all. D6 then holds *because the legacy code
   path is untouched* — auditable with `git diff`, which is a far stronger guarantee than a spec.
   (`flags-visual-rule-builder` promised D6 in prose and nearly broke it over one CSS class.)
3. **What the merge gate can actually assert is the two new routes.** Both follow the established
   `if (!isFlagConsoleEnabled()) notFound()` pattern — *"dark means nonexistent, before auth or
   project lookup"* (`app/app/journeys/[projectSlug]/page.tsx`). An unauthenticated GET therefore
   returns a flat **404** while dark and a **login redirect** once open, and both are reachable by
   the Playwright `api` project. **Sprint 1's QA section was corrected:** the planned
   `e2e/flag-console-dark.spec.ts` cannot assert "the page renders as it does today", because that
   page is credential-gated and the `api` project only ever sees the login redirect — identical with
   the gate on or off. It asserts the two routes' 404 instead.

### Amendment 2 (2026-08-24) — D8 is disproved; Story 2.3 becomes the distinction Golden can actually make

**"In a catalog but undefined" is not expressible in Golden, and not merely absent from the data.**
`create_flag_definition_version` (`20260807100000_flag_serving.sql`) inserts the `flag_registries`
row and its **first `flag_definition_versions` row in the same transaction, unconditionally**. A
registry row with no version is unreachable by construction — and, consistently, **zero such rows
exist across every project in production**.

**The doc's named example is exactly backwards.** Sprint 2's smoke step 7 says
`partners.recruiting_v3_enabled` *"reads **not created**, not 'off', and offers to create it."* Live,
that flag has **2 versions and is activated in all three environments** — it is one of only **two**
flags in the entire project that are on anywhere. Anyone running that smoke would have reported a bug
against correct behaviour.

**What IS real, expressible, and needs no new query.** `deactivate_flag` sets `version_id = NULL` and
**keeps the activation row**. So each `(flag, environment)` pair has **three** distinct states:

| State | How it is stored | Live count (`miyagisanchez`) |
|---|---|---|
| **On** — serving version *N* | activation row with a `version_id` | 2 flags × 3 environments |
| **Turned off** — deliberately deactivated, and audited | activation row with `version_id = NULL` | 0 today; reachable, and written by `deactivate_flag` |
| **Never turned on here** | **no activation row at all** | **40 of 42 flags, in every environment** |

`summariseFlagEnvironments()` currently **collapses the last two** — `activations.find(…)?.versionId ?? null`
maps "no row" and "row holding NULL" to the same `null`, and both render as
*"Nothing is activated here."* That collapse is the real defect behind the audit's complaint, and
un-collapsing it is a pure change to an already-unit-tested seam: `FlagActivationRow` already carries
`environment` and a nullable `versionId`, so **D1 holds — no query is added**.

**Story 2.3 is re-scoped to that distinction** ("never turned on here" vs "turned off" vs "on"), and
Sprint 2's smoke step 7 is rewritten. This is not a consolation prize: with 40 of 42 flags never
activated anywhere, it is precisely the epic's outcome test — *"which of these are on, in which
environment, and which aren't created yet"* — answered with a state the system can actually defend.

### Amendment 3 (2026-08-24) — two smaller corrections found while locking

- **The reuse sources are not both es-MX.** The README says *"⚠️ Both files are es-MX."*
  `lib/flags-admin-view.ts` is **entirely English** and ports as-is (modulo the D2 per-environment
  projection). Only `FlagsFilterBar.tsx` is es-MX — and it is also Tailwind-classed, so it was always
  shape-only reuse. The English-only policy is unaffected; the warning was simply over-broad.
- **The live filter value is `killswitch`, one word.** The sprint docs write "kill-switch". The
  *label* may render however D7's vocabulary module decides, but the value matched against
  `definition.metadata.polarity` — and the URL parameter — is `killswitch`, exactly as
  `filterFlagsByPolarity` already spells it upstream.
## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `FLAG_CONSOLE_ENABLED`, created disabled in every environment | high |
| 1 | 1.2 Pure list math in `lib/flag-list-view.ts`, gate-tested | low |
| 1 | 1.3 One feature list — search · filters · sort · pagination, URL-driven | low |
| 1 | 1.4 Environment selector, flags-scoped and deep-linkable | low |
| 2 | 2.1 A per-feature destination (Value · History · Settings) | low |
| 2 | 2.2 One clear enable/disable control, with a confirm that names what stops | high |
| 2 | 2.3 "Not created" as a state distinct from "off" | low |
| 3 | 3.1 Credentials move to their own route | high |
| 3 | 3.2 Lifecycle audit moves to its own route | low |
| 3 | 3.3 One module owns every user-facing flag word | low |
| 3 | 3.4 Guards and specs extended to the new surfaces | low |

## Kill-switch (decided at grooming — Stage 6b)

- **Flag:** `FLAG_CONSOLE_ENABLED` in `apps/web/lib/flags.ts`, same exact `process.env.X === 'true'`
  shape as `isFlagRuleBuilderEnabled()`.
- **Polarity: ENABLEMENT — default `false`, created DISABLED in development, preview and production
  before Sprint 1 merges.** The surface being replaced is how an operator kills a live checkout on
  Miyagi Sánchez; a half-landed redesign must never be the only route to that control. A flag is
  invisible until it exists — Story 1.1 creates it in every environment.
- **Seam:** `isFlagConsoleEnabled()` resolved **server-side in `page.tsx`** and passed down — the same
  boundary `isFlagRuleBuilderEnabled()` uses today. One resolver covers the list, the per-feature
  destination and both new routes.
- **Mechanism:** a Vercel environment variable. Per AGENTS rule #4, **a commit to `main` is what makes
  it live** — Vercel snapshots env values at build time. Never `vercel redeploy`/`--prod`.

## Deploy order

Frontend-only, single repo, no migration. Sprints stack: `feat/flags-console-parity` →
`-s2` → `-s3`, each cut from the previous, one PR per sprint, merged in order (WAYS-OF-WORKING §6 —
these sprints share `flag-manager.tsx` and `page.tsx` by construction, so siblings off one base would
pay a per-merge conflict tax).

`FLAG_CONSOLE_ENABLED` must exist **disabled in all three environments before Sprint 1's PR merges**.
The flip to `true` is a separate, deliberate act after the product owner has walked the surface — and
it needs its own commit to `main`, not an env edit alone.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `FLAG_CONSOLE_ENABLED` exists in all three Vercel environments with the stated
      enablement polarity (born `false`). *Verify-only — not a new gate.*
- [ ] **The outcome test:** the product owner opens `/app/flags/miyagisanchez` cold and answers
      "which of these are on, in which environment, and which aren't created yet" **without asking a
      second question.**
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
