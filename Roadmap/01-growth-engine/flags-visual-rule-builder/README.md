---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: flags-visual-rule-builder
build_order: 15
---

# Epic: Flags — a visual rule builder, rollout viz, and a plain-language version diff

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/flags-visual-rule-builder.md`](../../00-ideas/seeds/flags-visual-rule-builder.md)
> **Appetite:** M (one wave) · **Underwritten by:** [`bets/wave-2026-08-08.md`](../../bets/wave-2026-08-08.md)
> **Audit:** [`00-ideas/audits/app-ux-audit-2026-08-01.md`](../../00-ideas/audits/app-ux-audit-2026-08-01.md) — §2.4, §3.2, §6.3, §7 (P1).
> **Depends on:** `app-component-kit-adoption` (#13) Sprint 1 — `FormSection`/`Field`, `ConfirmDialog`.

## Why

A PM is the person who knows *"roll this out to pro-plan users in Mexico at 10%"* and is the person
least able to express it as a JSON definition typed into a `<textarea>`. Today that textarea is the
only way to create a flag, and reading a flag's history means expanding `<details><summary>Inspect
immutable JSON</summary>` once per version and diffing braces by eye.

So the flag control plane — one of the product's strongest primitives, with an immutable version
model competitors don't all have — is effectively invisible to the buyer it was built for. The PM
either doesn't touch flags or asks an engineer. This epic gives them an authoring surface, without
changing a single thing about how flags are stored, validated or evaluated.

## Platform-first note

**The backend already models and validates every part of this, and remains the authority.** The
builder is a form that emits exactly the JSON `parseFlagDefinition` already accepts; validation
stays server-side. No new table, no new route contract, no change to the immutable-version model, no
change to the SDK's evaluation path.

**No new runtime dependency.** Rollout visualization is a proportion bar built from the token
system — the same approach `FunnelBars` proved in `app-shell-and-agent-rail`. Charting is #14's
decision and is not made here.

## What already exists (reuse, don't rebuild)

*Verified against live `main`, 2026-08-08. This table is why the appetite is M and not L.*

| Need | Already in the repo | What's actually missing |
|---|---|---|
| The clause grammar | `packages/sdk/src/flags.ts` — `FLAG_CONTEXT_FIELDS` is a **closed 6-value enum** (`targetingKey`, `source`, `channel`, `campaign`, `plan`, `region`); `FlagClause` supports exactly **two** operators (`equals`, `one_of`) | **Nothing.** The builder renders an enum it does not define — see D1 |
| Validation | `parseFlagDefinition`, re-exported by `lib/flag-definition.ts` from `@golden-beans/sdk`; DB validation in lockstep (migration `20260807…`) | Nothing. Server-side stays the authority (D2) |
| Limits | `MAX_FLAG_RULES` 20 · `MAX_FLAG_CLAUSES` 5 · `MAX_FLAG_VARIANTS` 20 · `MAX_FLAG_DEFINITION_BYTES` 32 KB · `MAX_FLAG_METADATA_ENTRIES` 16 | Nothing. Read them; never hardcode (D5) |
| The definition shape | `FlagDefinition`, `FlagRule` (`priority`, `clauses[]`, `rollout?.basisPoints`, `variantKey`), `FlagVariant` | Nothing. The UI mirrors the type |
| Evaluation | The SDK's pure evaluator + `rolloutFraction` (FNV-1a, parity-pinned to `bucketing.ts` by contract test) | Nothing — "preview as a user" calls it, never reimplements it (D4) |
| Environments | `FLAG_ENVIRONMENTS` = `development` \| `preview` \| `production` | Nothing. Three bars, from the constant |
| Admin write path | `lib/flag-admin-operation.ts`, `flag-admin-operations.ts`, `flag-sync-operations.ts`, `flag-registry.ts`, `flag-read-keys.ts`, `flag-sync-keys.ts` | Nothing. The builder posts the same definition through the same path |
| Gates | `FLAG_SERVING_ENABLED`, `FLAG_DEFINITION_SYNC_ENABLED` in `lib/flags.ts` (exact `=== 'true'`, 14 gates total) | One more — `FLAG_RULE_BUILDER_ENABLED` (D6) |
| Specs | `e2e/flag-serving.spec.ts`, `flag-serving-dark.spec.ts`, `flag-catalog-sync.spec.ts`, `flag-catalog-sync-dark.spec.ts`, `flag-sync-keys.authed.spec.ts`, `flag-evaluation-telemetry-sdk.spec.ts` | Api specs for the definition round-trip; one authed browser spec |
| UI primitives | `components/ui` (9) + `ProductShell` | `FormSection`/`Field`, `ConfirmDialog` — **from #13 Sprint 1** |

## Architecture decisions — locked before any builder starts

*To be verified against live `main` and live data by the architect at kickoff. The locking pass must
**disprove scope**: any acceptance criterion below describing a field, operator or limit the live
system doesn't have is fiction — correct this doc, with the reasoning, out loud.*

**D1 — The builder renders the SDK's enums; it does not define its own.**
`FLAG_CONTEXT_FIELDS` (6) × operators (2) is the entire grammar. Two selects and a value control
cannot produce a clause the backend rejects. **If a builder finds itself writing a list of field
names, it has taken a wrong turn** — import the constant. This single fact is what makes the epic M.

**D2 — Server-side validation remains the only authority.**
The builder narrows what can be *typed*; `parseFlagDefinition` decides what is *valid*. The UI may
pre-empt errors for feedback, but every submission is validated server-side and a rejection is
displayed, never suppressed. Two validators drift, and the one that drifts permissive is the one in
the browser.

**D3 — Percent is a display unit; basis points are the stored unit. The conversion lives in exactly one place.**
`rollout.basisPoints` is 0–10000. Write a single pair of pure functions on a `lib/` seam, unit-test
them at the boundaries (0, 1, 10000, and the rounding case), and let every display and every write
go through them. **This is the highest-consequence line in the epic**: a misplaced factor of 100 is
a silent targeting error on a production flag. It is most of why the risk tier is high.

**D4 — "Preview as a user" evaluates through the SDK, server-side.**
Call the real evaluator against the real snapshot. A UI that re-implements matching will disagree
with production at exactly the moment someone trusts it.

**D5 — Every limit is read from the SDK constant.**
`MAX_FLAG_RULES`, `MAX_FLAG_CLAUSES`, `MAX_FLAG_VARIANTS`, `MAX_FLAG_DEFINITION_BYTES`. A hardcoded
20 is a number that will disagree with the parser the first time the parser changes.

**D6 — `FLAG_RULE_BUILDER_ENABLED`: enablement gate, default `false`, created DISABLED in every env.**
Not a kill-switch. This ships a new *write* path onto the production flag control plane, so it
merges dark and is flipped on deliberately after a real definition round-trip is verified. Exact
`=== 'true'`, matching the fourteen existing gates. **The gate covers the builder only — with it
off, the existing textarea renders unchanged**, so the flag can never leave a PM unable to author a
flag. One resolver, `isFlagRuleBuilderEnabled()`.

**D7 — The builder is a new client component from the first commit.**
`flag-manager.tsx` is 483 lines before this epic starts. Extract; do not grow it.

**D8 — The version diff is bounded to six parts, and says so when it can't explain a change.**
Diff `rules` (priority, clauses, rollout, variantKey), `defaultVariantKey` and `variants`. Anything
else falls back to "definition changed — show JSON". A partial diff that admits its limits is
honest; a general JSON-to-prose differ is a project, and it is the named appetite trap.

**D9 — Rule priority is shown, and reordering is explicit.**
`FlagRule.priority` drives evaluation order. Drag-to-reorder that silently renumbers produces
definitions whose behaviour surprises their author. Show the number.

**D10 — No new clause fields or operators, and no flag→experiment promotion.**
Both are real and both are out. A new operator is an SDK contract change plus a migration; the
flag→experiment transition (audit §3.2) is a second bet. Adding either is what turns this M into an L.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | The rule builder | high |
| 2 | Rollout visualization and the version diff | high |
| 3 | Preview as a user | low |

## Deploy order

No migration. Frontend + one new server-side gate. **Stacked branches:**
`feat/flags-visual-rule-builder` → `-s2` → `-s3`, one PR per sprint, merged in order.

`FLAG_RULE_BUILDER_ENABLED` is created **DISABLED in every environment before Sprint 1 merges** — a
flag is invisible until it exists in the environment, and a dark launch behind a flag nobody created
is just a launch. Flip on per environment only after the Sprint 1 smoke walkthrough passes against
a real definition round-trip.

**Risk tier: high → the product owner merges every PR in this epic.** Two cross-family review passes
per PR, routed by `node scripts/review-route.mjs --builder <who> --tier high <PR#>`, **plus** a
fresh reviewer subagent (HIGH tier).

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (planned at grooming — Stage 6b):** `FLAG_RULE_BUILDER_ENABLED` exists in **every
      environment**, created **DISABLED**, default `false` — the enablement polarity D6 states.
      *Verify-only.*
- [ ] **Basis-points conversion:** the `lib/` seam has boundary unit tests (0, 1, 10000, rounding)
      and every call site goes through it — verified by grep, not by assertion
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
