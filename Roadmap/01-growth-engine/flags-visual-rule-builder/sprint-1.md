# Flags — a visual rule builder — Sprint 1: The rule builder

**Status:** 🟦 In review — PR [#87](https://github.com/danybgoode/golden-beans/pull/87)
· `ae8189f` (1.1 + gate + A6) · `4e2cd36` (1.2–1.4) · `daf5b34` (browser smoke)

> **Build contract (locked by the architect before the builder started).**
> Cite D1, D2, D3, D5, D6, D7, D9, D10 and **A1, A2** — do not re-derive them.
> **Verified at lock, 2026-08-09 @ `db95b5e`:** `FLAG_CONTEXT_FIELDS` has exactly 6 values and
> `FlagClause` exactly 2 operators. Limits are as D5 states. `FormSection`/`Field`/`ConfirmDialog`
> are on `main` — **the #13 dependency is met.** Do not re-verify; build.
> `FLAG_RULE_BUILDER_ENABLED` must exist **DISABLED in every environment before this merges.**
> **A1 — the write seam:** post through `createFlagDefinitionVersionAction` (`./actions.ts:31`),
> which already validates server-side and already returns the parser's error. **Not**
> `lib/flag-admin-operations.ts` — that is Miyagi's boolean-toggle adapter and cannot create a
> definition version. No new route, no new action.

## Stories

### Story 1.1 — The basis-points seam, first
**As a** builder, **I want** the percent↔basis-points conversion to exist in one tested place before
anything renders a rollout, **so that** a factor-of-100 error cannot reach a production flag.

**Acceptance:**
- A `lib/` seam exports `percentToBasisPoints` and `basisPointsToPercent` (or equivalently named),
  pure and dependency-free.
- Unit tests cover 0, 1, 50, 100, 10000 and the rounding case, and were **observed failing** before
  the implementation landed.
- No other file in the epic performs the arithmetic inline — verified by grep at sprint close (D3).
**Risk:** high

### Story 1.2 — `RuleBuilderRow`
**As a** PM, **I want** to pick a targeting field, an operator and a value from controls,
**so that** I can express who a flag applies to without typing JSON.

**Acceptance:**
- `RuleBuilderRow` renders a field select populated from `FLAG_CONTEXT_FIELDS` and an operator
  select populated from the clause union — **imported, not listed** (D1).
- Choosing `equals` shows a single value input; choosing `one_of` shows a multi-value input. No
  other operator is offered.
- A clause built in the UI serialises to exactly the `FlagClause` shape `parseFlagDefinition`
  accepts — asserted by a round-trip unit test on a `lib/` seam.
- Built as a new client component; `flag-manager.tsx` does not grow (D7).
**Risk:** high

### Story 1.3 — The rule card
**As a** PM, **I want** a rule to show its priority, its clauses, its rollout and the variant it
serves, **so that** I can read the rule as one thing instead of four fields.

**Acceptance:**
- A rule card renders `priority`, up to `MAX_FLAG_CLAUSES` clause rows, an optional rollout control
  and a variant select.
- **Priority is displayed as a number**, and changing evaluation order is an explicit action — no
  silent renumbering (D9).
- Rule and clause counts are capped by `MAX_FLAG_RULES` and `MAX_FLAG_CLAUSES`, **read from the SDK
  constants** (D5). A test asserts the cap tracks the constant rather than a literal.
- The rollout control accepts **percent** and stores basis points via the Story 1.1 seam.
**Risk:** high

### Story 1.4 — Create a flag without typing JSON, behind the gate
**As a** PM, **I want** to create a working flag end to end from the builder,
**so that** the flag control plane is something I can actually use.

**Acceptance:**
- With `FLAG_RULE_BUILDER_ENABLED=true`, the flags page offers the builder; the definition posts
  through the **existing** server action `createFlagDefinitionVersionAction` (A1) with no new route
  and no second validation path.
- A server-side rejection from `parseFlagDefinition` is **displayed to the PM**, not swallowed (D2).
- With the gate **unset**, the page renders exactly as it does today — the existing textarea,
  unchanged. A dark spec asserts it.
- A "Show JSON" disclosure renders the definition **read-only** and byte-identical to what is stored.
**Risk:** high

## Sprint QA
- **api spec(s):** a new `e2e/flag-rule-builder.spec.ts` — definition round-trip (builder output →
  `parseFlagDefinition` → stored → re-read → same); rejection surfacing. A new
  `flag-rule-builder-dark.spec.ts` for the gate-off path, following the `flag-serving-dark.spec.ts`
  precedent. Pure-logic coverage (clause serialisation, basis-points conversion, cap-from-constant)
  as unit tests on `lib/` seams — free coverage, no browser.
- **Existing specs must pass unchanged:** `flag-serving.spec.ts`, `flag-serving-dark.spec.ts`,
  `flag-catalog-sync.spec.ts`, `flag-sync-keys.authed.spec.ts`. A spec that needed editing means the
  epic changed serving behaviour — stop and escalate.
- **browser smoke owed:** yes, to the product owner — **the 10%-means-1000 check** (step 4 below).
  An api spec proves the number round-trips; only a human confirms the *label* says what the PM
  meant.
- **Mutation checks (each observed red once):** invert the basis-points conversion → Story 1.1 tests
  go red. Hardcode `20` in place of `MAX_FLAG_RULES` and change the constant → the cap test goes red.
- **deterministic gate:** `npm run typecheck` (all four projects) + `npm run build` + Playwright
  `api` + `check:design-drift` green before merge.
- **Review:** HIGH tier — `node scripts/review-route.mjs --builder <who> --tier high <PR#>`, two
  cross-family passes **plus** a fresh reviewer subagent. **Product owner merges.**

## Sprint 1 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

> Use a **test project**. This sprint writes real flag definitions to the control plane.

1. With `FLAG_RULE_BUILDER_ENABLED` unset, go to
   https://golden-beans-gamma.vercel.app/app/flags/<testProjectSlug>
   → The page looks **exactly as it does today**, including the JSON textarea. No builder anywhere.
2. Set `FLAG_RULE_BUILDER_ENABLED=true` for preview and reload.
   → A "Build a rule" affordance appears alongside the existing textarea.
3. Create a flag: add a rule, set the field to `plan`, the operator to `equals`, the value to `pro`,
   and the variant to `on`.
   → The field select offers exactly six options and the operator select exactly two. There is no
     free-text field entry anywhere.
4. Set the rollout to **10%** and save.
   → The flag saves. Open "Show JSON".
   → The definition reads `"basisPoints": 1000` — **not 10, not 100000**. This is the step that
     matters most in the whole epic.
5. Re-open the flag.
   → The rollout control displays **10%** again. The round-trip is symmetric.
6. Try to add a seventh clause to one rule.
   → The UI stops you at five and says why.
7. Deliberately break it: edit the JSON textarea to something invalid and save.
   → A server-side validation error is **shown on screen**, not silently dropped.
8. Unset `FLAG_RULE_BUILDER_ENABLED` and reload.
   → Back to step 1's view. Nothing you created is lost — the flags you made are still listed.

If any step fails, note the step number + what you saw — that's the bug report.
