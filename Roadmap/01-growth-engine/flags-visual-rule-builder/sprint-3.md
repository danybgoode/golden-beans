# Flags — a visual rule builder — Sprint 3: Preview as a user

**Status:** 🟡 built, in review — branch `feat/flags-visual-rule-builder-s3`, stacked on `-s2`.

> **What was built.**
>
> - **A3 delivered as locked.** `packages/sdk/src/flags.ts` splits the private `matchesRule` into
>   `clausesMatch` + `rolloutAdmits` (the latter over a four-outcome `rolloutOutcome`), and
>   `matchesRule` is redefined as their conjunction — so `evaluateFlag` is unchanged **by
>   construction**. `explainFlagEvaluation()` is built from the same two predicates. One matcher, as
>   the epic requires; no change to the grammar, the parser, the stored shape or
>   `FLAG_CONTRACT_VERSION`.
> - **The parity pin** is in `flags.test.ts` over 13 contexts, following this module's existing
>   FNV-fraction pin against `bucketing.ts`. **Mutation check observed:** drop `rolloutAdmits` from
>   `matchesRule` and the pin goes red (along with an existing rollout spec).
> - **Story 3.2's wording is on a pure seam**, `lib/flag-explanation-prose.ts`, because the wording
>   *is* the acceptance criterion — 9 unit tests, including a sweep asserting no sentence anywhere
>   can render basis points. Clauses are described by `describeFlagClause`, the same function the
>   Sprint 2 diff uses, so a condition reads identically on both panels.
> - **Read-only, and asserted as such:** the action creates nothing, and the browser spec counts the
>   flag's versions before and after three evaluations.

> **Build contract (locked by the architect before the builder started).**
> **D4 is the whole sprint**: evaluation happens through the SDK's own evaluator, server-side,
> against the real snapshot. A second matching implementation in the browser is the one failure this
> sprint exists to avoid — it will agree with production right up until someone relies on it.
> Cite D1, D2, D4 and **A3, A5**. Branch `feat/flags-visual-rule-builder-s3`, cut from `-s2`.
> **Risk: low** — this sprint is read-only. It writes nothing to the control plane.
>
> **A3 — the SDK gains `explainFlagEvaluation()`, and that is how D4 is kept.** As shipped,
> `evaluateFlag` cannot name which rule matched, and the private `matchesRule` collapses "a clause
> failed" and "the rollout excluded you" into one `false` — so Stories 3.1/3.2 are unbuildable
> without either a second matcher (D4's exact failure) or this export. Split `matchesRule` into
> `clausesMatch` + `rolloutAdmits`, keep `matchesRule = clausesMatch && rolloutAdmits` so
> `evaluateFlag` is unchanged by construction, and export the explanation built from the same two.
> **A5:** no-rule-matched is `reason: 'STATIC'`, never `'DEFAULT'`; and a rollout with no
> `targetingKey` in context excludes the rule outright — that is its own outcome, not "no match".

## Stories

### Story 3.1 — Evaluate a context, server-side
**As a** PM, **I want** to ask "what would this user see", **so that** I can check a flag's targeting
before I trust it.

**Acceptance:**
- A context form takes the six `FLAG_CONTEXT_FIELDS` values (all optional) — the same closed enum
  the builder renders (D1).
- Evaluation calls the SDK's existing evaluator server-side against the current snapshot for the
  chosen environment. **No matching logic is written in this epic** — a reviewer should be able to
  grep the diff and find no clause comparison (D4).
- The result names the **variant** the context resolves to.
- It is read-only: no definition is created, updated or versioned by using the preview.
**Risk:** low

### Story 3.2 — Say *why*
**As a** PM, **I want** to see which rule matched and why, **so that** a surprising result teaches me
something instead of just contradicting me.

**Acceptance:**
- The result names the **matching rule** by its priority and shows the clauses that matched.
- When no rule matches, it says so and names the `defaultVariantKey` that applied instead.
- When a rule's clauses matched but the **rollout** excluded this context, that is stated
  distinctly — "matched rule 20, excluded by 10% rollout" — because it is the single most confusing
  outcome and the one a PM is most likely to report as a bug.
- Rollout is described in **percent** (D3's seam), consistently with Sprints 1 and 2.
**Risk:** low

### Story 3.3 — Reachable from where the question is asked
**As a** PM, **I want** the preview where I'm already looking at the flag, **so that** I use it.

**Acceptance:**
- The preview is reachable from the flag's own view, not a separate page.
- It renders inside `ProductShell` using `FormSection`/`Field` from #13 — no bespoke form styling.
- It is gated by `FLAG_RULE_BUILDER_ENABLED` along with the rest of the epic; with the gate unset it
  is not reachable.
- Empty state before a first evaluation tells a PM what to do, rather than showing a blank result.
**Risk:** low

## Sprint QA
- **api spec(s):** extend `e2e/flag-rule-builder.spec.ts` — a context that matches a rule, a context
  that matches nothing, and a context excluded by rollout. **The parity assertion is the important
  one:** the preview's answer equals the SDK evaluator's answer for the same context and snapshot.
  Follows the precedent of the existing `flags.test.ts` ↔ `bucketing.ts` parity pin.
- **Existing specs must pass unchanged:** `flag-serving.spec.ts`, `bucketing.spec.ts`,
  `exposure.spec.ts`, `flag-evaluation-telemetry-sdk.spec.ts`.
- **browser smoke owed:** no — this sprint is fully API-testable. Stated rather than assumed.
- **Mutation check:** change the preview to evaluate through a locally-written comparison instead of
  the SDK → the parity spec goes red. This is the mutation that proves D4 is enforced and not just
  intended.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` +
  `check:design-drift` green before merge.
- **Review:** LOW tier — `node scripts/review-route.mjs --builder <who> --tier low <PR#>`, two
  cross-family passes, **no** fresh reviewer subagent (LOW). Reviewer may auto-merge on green.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: preview (pre-merge) · then production · https://golden-beans-gamma.vercel.app

1. Go to https://golden-beans-gamma.vercel.app/app/flags/<testProjectSlug> and open the flag you
   built in Sprint 1 (`plan equals pro`, 10% rollout, variant `on`).
   → A "Preview as a user" section is visible on the flag's own view.
2. Enter `plan = pro`, `region = mx`, and a targeting key. Evaluate.
   → You get a variant back, and a sentence naming the rule that matched.
3. Change `plan` to `free` and evaluate again.
   → No rule matches; it says so and names the default variant that applied.
4. Set `plan` back to `pro` and try several different targeting keys.
   → Some are excluded by the 10% rollout, and those say **"excluded by rollout"** — clearly
     different wording from "no rule matched". Roughly one in ten should get the variant.
5. Confirm nothing was written: reload the flag and check its version history.
   → **No new version was created** by any of the evaluations above.
6. Unset `FLAG_RULE_BUILDER_ENABLED` and reload.
   → The preview section is gone, along with the builder. The page is today's view.

If any step fails, note the step number + what you saw — that's the bug report.
