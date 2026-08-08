# Flags — a visual rule builder — Sprint 3: Preview as a user

**Status:** ⬜ not started

> **Build contract (locked by the architect before the builder started).**
> **D4 is the whole sprint**: evaluation happens through the SDK's own evaluator, server-side,
> against the real snapshot. A second matching implementation in the browser is the one failure this
> sprint exists to avoid — it will agree with production right up until someone relies on it.
> Cite D1, D2, D4. Branch `feat/flags-visual-rule-builder-s3`, cut from `-s2`.
> **Risk: low** — this sprint is read-only. It writes nothing to the control plane.

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
