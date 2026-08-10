---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
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

---

## Architecture lock — verified against live `main` @ `db95b5e`, 2026-08-09

*The locking pass required by WAYS-OF-WORKING §5. Every decision above was re-read against the
shipped code, not the plan. **Four things this doc asserted are wrong**; they are corrected here
rather than discovered by a builder mid-build.*

### What held (verified, cite freely)

| Claim | Verified against | Result |
|---|---|---|
| `FLAG_CONTEXT_FIELDS` is a closed 6-value enum | `packages/sdk/src/flags.ts:10-17` | ✅ exactly 6 |
| `FlagClause` has exactly 2 operators | `flags.ts:56-58`, parser at `:180-222` | ✅ `equals` \| `one_of`, parser rejects a third |
| Limits are SDK constants | `flags.ts:19-26` | ✅ rules 20 · clauses 5 · variants 20 · 32 KiB · metadata 16 |
| `rollout.basisPoints` is an integer 0–10000 | parser `flags.ts:324-333`; evaluator `:472` divides by `10_000` | ✅ D3's unit is real; **percent = bp ÷ 100** |
| `FLAG_ENVIRONMENTS` is 3 values | `flags.ts:9` | ✅ development · preview · production |
| 14 existing gates, exact `=== 'true'` | `apps/web/lib/flags.ts` | ✅ 14 counted; `FLAG_RULE_BUILDER_ENABLED` is the 15th |
| `FormSection` / `Field` / `ConfirmDialog` on `main` | `apps/web/components/ui/` | ✅ #13 shipped 2026-08-09 (`db95b5e`) — **dependency met** |
| No charting dependency | `apps/web/package.json` | ✅ `FunnelBars` remains the precedent |

**No migration, confirmed.** Nothing in the three sprints writes a column that does not exist. The
deploy order in this README stands unchanged.

### A1 — Story 1.4 named the wrong write seam. Corrected.

This README's "Admin write path" row listed six files, and sprint-1.md picked
`lib/flag-admin-operations.ts` out of that list. **That is the wrong one.** It serves
`POST /api/v1/flags/admin` — Miyagi's operational adapter, which flips a boolean `enabled` on an
already-defined flag and carries `criticality`/`polarity` metadata. It cannot create a definition
version and never sees a `FlagDefinition`.

**The seam the builder reuses is the one the existing textarea already posts through:**

```
rule-builder (client)
  → createFlagDefinitionVersionAction()   apps/web/app/app/flags/[projectSlug]/actions.ts:31
  → parseFlagDefinition()                 (D2 — server-side, unchanged)
  → createFlagDefinitionVersion()         apps/web/lib/flag-registry.ts:186
```

That action already resolves ownership (`requireProjectOwnership`), already validates server-side,
and already surfaces `parsed.errors[0]` to the caller — so D2's "a rejection is displayed, never
suppressed" is **wiring, not new code**. No new route, no new action, no second validation path.

### A2 — D7's line count was stale. Decision unchanged.

`flag-manager.tsx` is **548** lines, not 483 — #13's Sprints 2 and 3 added `DataTable` column memos
and the revoke `ConfirmDialog`. This strengthens D7 rather than weakening it: extract, do not grow.

### A3 — D4 cannot deliver Story 3.2 as the SDK stands. The SDK gains one additive export.

**The finding.** `evaluateFlag` returns `{ value, variant, reason, flagMetadata, flagVersion }`. It
never names *which* rule matched. Worse, `matchesRule` (`flags.ts:454`) is **private** and collapses
two different outcomes into one `false`: *a clause did not match* and *the rollout excluded this
context*. Story 3.2 requires both facts, by name, and calls the second one "the single most
confusing outcome". As shipped, the SDK cannot answer either question.

So Sprint 3 had exactly two roads, and one of them is the failure D4 exists to prevent:

- ❌ Write a second matcher in `apps/web`. This is precisely D4's "a UI that re-implements matching
  will disagree with production at exactly the moment someone trusts it."
- ✅ **Add one export to the SDK, and refactor so there remains exactly ONE matcher.**

**Locked: the second.** `packages/sdk/src/flags.ts` splits the existing private `matchesRule` into
two private predicates — `clausesMatch(rule, context)` and `rolloutAdmits(rule, …)` — and exports
`explainFlagEvaluation()` built from them. `matchesRule` becomes `clausesMatch && rolloutAdmits`, so
`evaluateFlag`'s behaviour is unchanged **by construction**, not by assertion.

**This is not a D10 violation.** D10 bans new clause *fields* and *operators* and the
flag→experiment promotion. The grammar, the wire contract, `FLAG_CONTRACT_VERSION`, the parser and
the stored shape are all untouched. What changes is that a private predicate becomes two private
predicates and one new pure function is exported. It is additive, and it is the only way to keep D4.

**The parity pin is the acceptance:** a spec asserts `explainFlagEvaluation(…).variantKey ===
evaluateFlag(…).variant` across the same fixtures, following the existing `flags.test.ts` ↔
`bucketing.ts` precedent. The mutation check sprint-3.md already names — evaluate through a locally
written comparison → the parity spec goes red — now has something real to be red about.

### A4 — Sprint 2 needs no new query. Do not add a fetch.

`getFlagRegistryView()` (`lib/flag-registry.ts:80`) already returns, per flag, **every version with
its full `definition`** plus `activations[]` (environment → versionId) and `environments[]`
(snapshot version per environment). Stories 2.1, 2.2 and 2.3 are **pure derivations over props the
page already passes**. A builder adding a Supabase call in Sprint 2 has taken a wrong turn.

### A5 — Two evaluator facts the prose must get right

- **No rule matched is `reason: 'STATIC'`, not `'DEFAULT'`** (`flags.ts:514`). `'DEFAULT'` is
  reserved for the error fallbacks. Story 3.2's copy names the *default variant*, never "DEFAULT".
- **A rollout with no `targetingKey` in context excludes silently** (`flags.ts:468-469`): if
  `rollout` is set and `context.targetingKey` is not a valid string, the rule cannot match at all.
  Story 3.2 must state this as its own outcome — a PM who leaves the targeting key blank and sees
  "no rule matched" has been told something misleading.

### A6 — D5 was unbuildable as written: three of its four constants were not exported. *(found during Sprint 1, 2026-08-09)*

The "Limits" row of the table above says "Nothing" is missing and D5 says every limit is **read from
the SDK constant**. `MAX_FLAG_RULES`, `MAX_FLAG_CLAUSES` and `MAX_FLAG_VARIANTS` are declared in
`packages/sdk/src/flags.ts` — and **were never re-exported from `packages/sdk/src/index.ts`**. Only
`MAX_FLAG_DEFINITION_BYTES` was, which is why `lib/flag-definition.ts` re-exports exactly that one
and no other. Every consumer outside the SDK had no choice but to hardcode the numbers.

So D5 could not be obeyed; a builder following it would have hit the wall mid-story and, under
pressure, written the literal `20` that D5 exists to forbid. **Fixed by adding the three names to
the existing export block** — purely additive, no behaviour change, and it is what makes "read the
constant" possible at all. The cap test asserts the bound *against the constant*, so the mutation
sprint-1.md names (hardcode 20, change the constant) now goes red as designed. Verified: it does.

### A7 — A git worktree with no `node_modules` silently tests the ROOT checkout's SDK

Not a scope finding, but it cost real time and will cost the next agent the same. This worktree
resolved `@golden-beans/sdk` to **`/Users/cosmo/dobby/golden-beans/packages/sdk/dist`** — the root
checkout, on `main`, without the branch's changes. `npm run build --workspace=@golden-beans/sdk`
wrote to the worktree's `dist/`, which nothing imported, so an SDK edit appeared to have no effect
and the unit tests were quietly asserting against `main`'s code. **`npm install` inside the worktree
first**, and confirm with `node -e "console.log(require.resolve('@golden-beans/sdk'))"` before
trusting a single SDK-touching test result. Promote to `LEARNINGS.md` at epic close.

### A8 — Story 2.1's bar is a ROLLOUT bar, not a coverage bar. *(found during Sprint 2, 2026-08-10)*

Story 2.1 asks for "what proportion of users a flag is reaching in each environment". **A definition
cannot answer that.** Reach depends on the population — how many of your users are on the pro plan,
in Mexico — and the flags page has no population and no way to get one. A bar drawn as if it did
would be the most confident wrong number on the screen, and it would be wrong in the direction that
matters: a `plan is pro` rule at 100% would render as "everyone".

**Locked: the bar shows the ROLLOUT, of the contexts a rule already matches**, and the caption says
exactly that. Five consequences, each unit-tested in `lib/flag-environment-view.test.ts`. The middle
three were each found by a reviewer after the first version collapsed them:

- **No rollout on any rule → a full bar labelled "everyone"**, never an empty bar. `0%` is a
  different, valid, opposite statement and the two are one keystroke apart in the definition.
- **Rules that disagree → "up to 50% · 3 rules, not all reaching the same share".** One bar cannot
  represent three rollouts. The count is of RULES, not of distinct percentages — the number a reader
  can check against the definition — and the phrasing claims only that they do not all agree, since
  in 10/10/50 two of the three do.
- **A rollout-less rule counts as a disagreement.** `[10% rule, unrestricted rule]` is not a 10%
  flag: the second rule serves every context it matches. Collapsing it understated the blast radius.
- **…and it is not "100%" either.** Beside a rule that really is at 100% the two would agree and the
  bar would read a flat `100%` — but a 100% rollout still excludes a context with no targeting key
  (A5) and an absent rollout does not. `several` carries "includes an unbounded rule" separately and
  the label reads **"up to everyone"**, which is a share no percentage names.
- **Nothing activated, or a version with no rules → no bar at all**, with the row saying so
  ("not active" / "default only"). A zero-length bar reads as "0% of users" and a full one reads as
  "fully rolled out"; on a flag that targets nobody and serves its default, both are false.

Story 2.2's "matches what the evaluator would return" is kept literally: the variant beside each bar
is `evaluateFlag`'s own answer for a context with no attributes — the question behind "is this live
in production" — and a spec re-asks the evaluator and compares. This is D4 applied a sprint early,
and it is why the derivation lives in a `lib/` seam (added to the table below) instead of inside the
component, where nothing but a signed-in browser could reach it.

### A9 — Sprint 1's authed spec had a locator that pointed at the wrong button. *(found during Sprint 2, 2026-08-10)*

`flag-rule-builder.authed.spec.ts`'s rejection probe used `getByRole('button', { name: 'Create
immutable version' }).first()`. The builder and the textarea form carry the **same words** on their
submit buttons and the builder renders first — so `.first()` was the builder's button, which is
disabled whenever its form has problems, which an untouched form always has. The probe would have
waited on an unclickable element instead of testing the textarea.

It was never caught because **the `authed` Playwright project does not run in CI** (see
`playwright.config.ts`; the deterministic gate is the `api` project) and Sprint 1's signed-in
walkthrough is still owed to the product owner. Fixed by scoping both forms' submits through the
control that distinguishes them, and the same class of positional locator was removed from the
stored-definition assertion, which Sprint 2's second `<pre>` in the same article would have
re-pointed. **The general lesson for `LEARNINGS.md`: a positional locator over two identically
worded controls is a spec that will silently start testing something else.**

### The seams this epic creates (named once, here)

| Seam | Purpose | Sprint | Pure? |
|---|---|---|---|
| `apps/web/lib/rollout-percent.ts` | **D3.** percent ↔ basis points, the only place the arithmetic exists | 1 | yes — zero-import, `node --test` |
| `apps/web/lib/flag-rule-draft.ts` | builder draft → `FlagDefinition`, round-trip both ways | 1 | yes |
| `isFlagRuleBuilderEnabled()` in `apps/web/lib/flags.ts` | **D6.** the 15th gate, exact `=== 'true'` | 1 | yes |
| `apps/web/app/app/flags/[projectSlug]/rule-builder.tsx` | **D7.** the builder, a new client component | 1 | no |
| `apps/web/components/ui/RolloutBar.tsx` | token-system bars, `FunnelBars` precedent | 2 | no |
| `apps/web/lib/flag-definition-diff.ts` | **D8.** the six-part bounded diff + fallback | 2 | yes |
| `apps/web/lib/flag-environment-view.ts` | per-environment reach + the evaluator's own answer (A8) | 2 | yes |
| `explainFlagEvaluation()` in `packages/sdk/src/flags.ts` | **A3.** the one matcher, made explicable | 3 | yes |

Every pure seam above is unit-tested with `node --test` and mutation-checked. The impure ones are
covered by the api specs sprint QA names.

### Routing (auditable, per WAYS-OF-WORKING)

**Not delegated to a builder subagent.** This epic is a new **write path onto the production flag
control plane**, and D3 is a silent-targeting-error risk on a live flag — the routing table's
"never delegated" column. The architect builds it, and the review layer is where the independence
comes from: two cross-family passes per PR plus the fresh reviewer subagent on the two HIGH-tier
sprints, as the deploy-order section already requires.

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
