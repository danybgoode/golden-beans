---
title: "Flags — a visual rule builder, rollout viz, and a version diff instead of a JSON dump"
slug: flags-visual-rule-builder
status: scaffolded
area: "01"
type: feature
priority: "wave-2026-08-08"
appetite: M
underwritten_by: "Roadmap/bets/wave-2026-08-08.md"
risk: high
epic: "01-growth-engine/flags-visual-rule-builder"
build_order: 15
updated: 2026-08-08
---

# Pitch — Flags, from a JSON textarea to a rule builder

> **Class:** Feature · **Lane:** shaped bet · **Risk:** high
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.4, §3.2, §6.3, §7 (P1).
> **Verified against live `main`, 2026-08-08** — see *What already exists*. The verification changed
> this pitch materially: the clause schema is far smaller and more closed than the audit assumed.

## Problem

Creating a flag means hand-typing a raw JSON definition — targeting rules, variants, rollout and all
— into a `<textarea>` in a 483-line `flag-manager.tsx`. Reading a flag's history means expanding
`<details><summary>Inspect immutable JSON</summary>` once per version and diffing it by eye.

The persona mismatch is total. A PM is the person who knows *"roll this out to pro-plan users in
Mexico at 10%"* and is the person least able to express it as `{"rules":[{"priority":20,"clauses":
[{"field":"plan","operator":"equals","value":"pro"}],...}]}`. Today they either don't touch flags or
they ask an engineer — which makes the flag control plane, one of the product's strongest
primitives, invisible to the buyer it was built for. GrowthBook, a direct competitor by our own
framing, ships a visual targeting builder as table stakes.

## Appetite

**M — one wave.** The verification pass is what makes M credible: the clause grammar is a **closed
6×2 enum**, not an open attribute system, so the builder is a bounded form problem rather than a
query-builder project. If the work starts trying to be a general rule engine UI, the appetite is
being spent on the wrong problem — stop and re-shape.

**Circuit breaker:** the most likely appetite-eater is the plain-language version diff (see rabbit
holes). If it does not fit, ship the builder and the rollout viz and cut the diff to a follow-up —
those two alone close the persona gap.

## Outcome & signal

**What's true after:** a PM creates a targeting rule by picking a field, an operator and a value
from controls that cannot produce invalid JSON; sees the rollout as a proportion rather than a
number; and can answer *"what does user X see right now, and why"* without reading a definition.

**How the product owner tests it:** create a flag targeting `plan equals pro` at 10% rollout without
typing a brace. Then open the previous version and read, in a sentence, what changed.

## Stage-2.5 bucket

**Genuinely new — as a surface, not as a capability.** The backend models and validates every part
of this already (`parseFlagDefinition` is the authority, and stays the authority). What is new is an
authoring affordance over it. This is the strongest possible platform-first position: **the builder
emits the exact JSON the backend already validates, and validation remains server-side.**

## Bill of materials (What / Why)

| What | Why |
|---|---|
| `RuleBuilderRow` — field ▾ · operator ▾ · value | The 6 fields and 2 operators are closed enums. Two selects and an input cannot produce invalid JSON, which removes the entire class of error the textarea invites |
| Rule card: priority · clauses · rollout · variant | `FlagRule` has exactly these four parts. The UI mirrors the type, so a PM learns the model by using it |
| Rollout control in **percent**, stored in basis points | `rollout.basisPoints` is 0–10000. A PM thinks in percent; the conversion belongs in the UI, never in the PM's head |
| `RolloutBar` — proportion per environment | Replaces the "active (snapshot N)" text line. Three environments, one bar each |
| "Show JSON" disclosure, read-only | The JSON stays one click away. It stops being the *only* affordance without stopping being an affordance — engineers still need it |
| Plain-language version diff | Two immutable snapshots → "targeting narrowed from all users to plan=pro; rollout 100% → 10%". The immutable model is a strength; reading it should not require diffing braces |
| "Preview as a user" panel | GrowthBook's debug pattern. Enter a context, see the matched rule and resulting variant, with the *reason* |

## Scope

**In v1:** the rule builder (create + edit), the rollout control and `RolloutBar`, the read-only JSON
disclosure, the plain-language diff between adjacent versions, and the preview-as-a-user panel.
Targeting the existing `parseFlagDefinition` contract exactly.

**Out of v1 (no-gos):**
- **The immutable-version model does not change.** This pitch changes how a definition is *authored
  and read*, never that it is immutable, never how it is stored, never the snapshot contract.
- **No new clause fields or operators.** If the builder makes someone want `contains` or `not_in`,
  that is a *backend* decision with an SDK contract change and a migration. It is a separate seed.
- **No client-side validation as the authority.** The builder narrows what can be *typed*;
  `parseFlagDefinition` still decides what is *valid*. Two validators drift.
- **No flag→experiment promotion in v1.** The audit (§3.2) wants it as one visible action, and the
  backend already models a flag as the thing an experiment governs. It is real, and it is a second
  bet — putting it here is what turns an M into an L.
- **No bulk edit, no import/export, no flag templates.**

## Rabbit holes

- **The version diff is the appetite trap.** A general JSON differ rendered in prose is unbounded.
  Bound it: diff only the four `FlagRule` parts plus `defaultVariantKey` and `variants`, and fall
  back to "definition changed — show JSON" for anything else. A partial diff that says so is honest;
  a general differ is a project.
- **Rollout is basis points, not percent.** `rollout: { basisPoints: number }`, 0–10000. Every
  display converts; every write converts back. Getting this wrong is a 100× targeting error on a
  production flag — this alone is most of why the risk tier is high.
- **Rule priority ordering.** `FlagRule.priority` is a number and rules are evaluated by it. A
  drag-to-reorder UI that silently renumbers priorities will produce definitions whose evaluation
  order surprises the author. Show the priority number; make reordering explicit.
- **"Preview as a user" must not become a second evaluator.** Evaluate through the SDK's own
  `flags.ts` path, server-side, against the real snapshot. A UI that re-implements matching will
  disagree with production at exactly the moment someone trusts it.
- **`flag-manager.tsx` is 483 lines before this starts.** Extract the builder as its own client
  component from the first commit; do not grow the existing file.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08. This list is why the appetite is M.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The clause grammar | `packages/sdk/src/flags.ts` — `FLAG_CONTEXT_FIELDS` is a **closed 6-value enum** (`targetingKey`, `source`, `channel`, `campaign`, `plan`, `region`); `FlagClause` supports exactly **two** operators (`equals`, `one_of`) | **Nothing.** The builder renders an enum it does not define. This is the single most scope-reducing fact in the pitch |
| Validation | `parseFlagDefinition` (re-exported by `lib/flag-definition.ts` from the SDK), with `MAX_FLAG_RULES` 20, `MAX_FLAG_CLAUSES` 5, `MAX_FLAG_VARIANTS` 20, `MAX_FLAG_DEFINITION_BYTES` 32 KB | Nothing. The builder's limits are read from these constants, never re-declared |
| The definition shape | `FlagDefinition` / `FlagRule` / `FlagVariant` types; DB validation kept in lockstep (migration `20260807…`) | Nothing. The UI mirrors the type |
| Evaluation | The SDK's pure evaluator in `flags.ts` (`rolloutFraction`, FNV-1a, parity-pinned to `bucketing.ts` by contract test) | Nothing — "preview as a user" calls it server-side rather than reimplementing |
| Environments | `FLAG_ENVIRONMENTS` = `development` \| `preview` \| `production` | Nothing. `RolloutBar` renders three, from the constant |
| Admin write path | `lib/flag-admin-operation.ts`, `lib/flag-admin-operations.ts`, `lib/flag-sync-operations.ts`, `lib/flag-registry.ts` | Nothing. The builder posts the same definition through the same path |
| Gates | `FLAG_SERVING_ENABLED`, `FLAG_DEFINITION_SYNC_ENABLED` in `lib/flags.ts`, exact `=== 'true'` | One more for this surface — see kill-switch below |
| Specs | `e2e/flag-serving.spec.ts`, `flag-serving-dark.spec.ts`, `flag-catalog-sync.spec.ts`, `flag-catalog-sync-dark.spec.ts`, `flag-sync-keys.authed.spec.ts` | One authed browser spec for the builder; api specs for the definition round-trip |
| UI primitives | `components/ui` (9), `components/product/ProductShell` | `FormSection`/`Field` and `ConfirmDialog` — **delivered by #13**, which is why this sits behind it |

## UX heuristics & rails check

- **CI guards covering this surface:** `check:design-drift` (covers `app` + `components/ui` +
  `components/product`); `typecheck` × 4 projects; Playwright `api` project as the gate.
- **Audits-lens findings that apply:** §2.4 (the textarea), §3.2 (GrowthBook parity + the
  flag→experiment transition, deferred here), §6.3 (the builder design), §7 P1.
- **Design-language debt:** `flag-manager.tsx` at 483 lines with no shared form primitives; the
  `<details>` disclosure pattern used as a data view rather than progressive disclosure.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**Is there a runtime seam a kill-switch can gate? Yes.**

1. **Flag:** `FLAG_RULE_BUILDER_ENABLED`, added to `lib/flags.ts` alongside the existing gates,
   matched with exact `=== 'true'` like all fourteen.
2. **Polarity: enablement / dark-launch ⇒ default `false`, created DISABLED in every environment.**
   Not a kill-switch. The reason is specific: this ships a *new authoring path onto the production
   flag control plane*. A rollout-percent conversion bug here mis-targets live flags. It merges
   dark, is verified against a real definition round-trip, and is flipped on deliberately.
3. **Seam:** one resolver — `isFlagRuleBuilderEnabled()` — read by the flags page. **Off ⇒ the
   existing textarea renders unchanged.** The fallback is the current, working authoring path, so
   the flag never leaves a PM unable to author a flag.
4. **Mechanism:** env-backed gate in `lib/flags.ts`, matching the fourteen existing gates. Server-side
   only; no Edge/middleware seam involved.

**Why high risk, and it is not the UI.** The builder writes definitions that govern production flag
evaluation, and the percent↔basis-points conversion is a silent-100×-error surface. Product owner
merges.

## Acceptance criteria

1. A PM creates a flag with a rule `plan equals pro`, rollout 10%, variant `on`, without typing JSON;
   the stored definition round-trips through `parseFlagDefinition` unchanged.
2. The field and operator selects offer exactly the SDK's enums — no free text, no operator the
   backend rejects.
3. Entering 10% stores `basisPoints: 1000`; re-opening the flag displays 10%. A spec asserts the
   round-trip in both directions.
4. Rule limits (20 rules, 5 clauses, 20 variants) are enforced in the UI *and* read from the SDK
   constants, not hardcoded.
5. `RolloutBar` shows the live proportion per environment for all three environments.
6. "Show JSON" renders the definition read-only and matches what is stored, byte for byte.
7. The version diff describes a change between two adjacent snapshots in a sentence, and falls back
   to "definition changed — show JSON" for anything outside the six diffed parts.
8. "Preview as a user" returns the matched rule, the resulting variant and the reason, evaluated
   server-side through the SDK evaluator.
9. With `FLAG_RULE_BUILDER_ENABLED` unset, the flags page renders exactly as it does today — a dark
   spec asserts it.

## Open risks / research

- **Risk: the closed enum is too small for a real PM.** Six context fields may not cover the
  targeting a PM actually wants. If the builder makes that obvious, that is a *valuable finding* and
  a backend seed — not a reason to add client-side fields. Log it, don't build it.
- **Risk: #13 slips.** This epic assumes `FormSection`/`Field` and `ConfirmDialog` exist. If they do
  not when this starts, escalate rather than inlining local copies.
- **Depends on:** #13 (kit primitives). **Feeds:** #16 (Scenarios reuses `RuleBuilderRow` so a PM
  learns the targeting pattern once).
