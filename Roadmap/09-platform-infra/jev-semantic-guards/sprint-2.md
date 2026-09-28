---
epic: jev-semantic-guards
sprint: 2
title: Review guard on Jev (shadow, marker, backtest)
risk: high
phase: Shipped
stories_total: 3
stories:
  - id: S2.1
    title: judgeReviewOutput() in review-guard.mjs
    as_a: the review rail
    i_want: "an async judge that asks Jev `is_real_review` (Noul) and `severity` (Choice: blocking / should_fix / nit / clean) and decides by mode"
    so_that: a real prose review passes and a banner that merely looks structured fails
    risk: high
    status: done
  - id: S2.2
    title: Wire cross-review.mjs + the PR marker
    as_a: the product owner
    i_want: "each posted cross-review comment to carry a hidden `<!-- jev:{…} -->` marker"
    so_that: "shadow verdicts from cloud routines survive and can be harvested with `gh api`"
    risk: high
    status: done
  - id: S2.3
    title: Backtest (scripts/jev-backtest.mjs)
    as_a: the product owner
    i_want: Jev replayed over historical cross-review comments across the three repos
    so_that: there is evidence before live traffic accrues
    risk: high
    status: done
---
# Jev semantic guards — Sprint 2: Review guard on Jev (shadow, marker, backtest)

**Status:** ✅ Shipped — merged to `main` in [#35](https://github.com/danybgoode/dobby-foundation/pull/35) (`5616be7`)

> Touches `securityPaths` (`scripts/cross-review.mjs`, `scripts/lib/review-guard.mjs`) — the security lens runs on this PR.

## Stories

### Story 2.1 — `judgeReviewOutput()` in `review-guard.mjs`
**As the** review rail, **I want** an async judge that asks Jev `is_real_review` (Noul) and `severity` (Choice: blocking / should_fix / nit / clean) and decides by mode, **so that** a real prose review passes and a banner that merely looks structured fails.
**Acceptance:** `assertReviewOutput` is byte-unchanged and every existing review-guard spec passes; `mode:off` ⇒ regex result; `shadow` ⇒ regex decides, both logged; `jev` ⇒ Jev decides at `noul ≥ 0.85` (real) / `≤ 0.15` (not), regex decides in between or on could-not-look; the returned `reason` names the decider.
**Risk:** high

### Story 2.2 — Wire `cross-review.mjs` + the PR marker
**As the** product owner, **I want** each posted cross-review comment to carry a hidden `<!-- jev:{…} -->` marker, **so that** shadow verdicts from cloud routines survive and can be harvested with `gh api`.
**Acceptance:** the call site at `cross-review.mjs:429` becomes one `await judgeReviewOutput(...)`; marker holds `{mode, decider, noul, severity, model}` and never the reply text; a rejected run logs locally (it posts no comment); `--dry-run` prints the marker.
**Risk:** high

### Story 2.3 — Backtest (`scripts/jev-backtest.mjs`)
**As the** product owner, **I want** Jev replayed over historical cross-review comments across the three repos, **so that** there is evidence before live traffic accrues.
**Acceptance:** `node scripts/jev-backtest.mjs --repo <owner/name>...` harvests review comments, strips the header/marker, scores each, and writes a disagreement table (regex vs Jev) to `.jev/backtest-<date>.md`; notes that the corpus holds only replies the regex ACCEPTED (so it can find false passes, not false fails).
**Risk:** high

## Sprint QA
- **specs:** `node --test` beside each new module — Jev is injected (`fetch` stub), CI never calls the network
- **browser smoke owed:** no — no UI
- **deterministic gate:** `node --test template/scripts` + `node scripts/check-skill-scripts.mjs` + `node scripts/check-plugin-leaks.mjs` green before merge

## Sprint 2 — Smoke walkthrough (do these in order)
Env: a local checkout of the repo named in each step, with `TYPESAFE_API_KEY` in `.env.local`.

1. In a consumer checkout, set `rails.review.mode: shadow`, run `node scripts/cross-review.mjs <PR#> --dry-run`
   → the printed comment ends with a `<!-- jev:` marker; stderr says `decided by regex (shadow)`.
2. Run `tail -1 .jev/decisions.jsonl`
   → one line with `rail:"review"` and both verdicts.
3. Set `mode: jev`, re-run step 1
   → stderr says `decided by jev (0.9x)`.
4. Run `node scripts/jev-backtest.mjs --repo <owner/name>`
   → a `.jev/backtest-*.md` table with at least one row.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results — run 2026-09-23 (builder, worktree `feat/jev-semantic-guards-s2`)

Steps 1–3 need a consumer checkout, and they run there in Sprint 4 against a real routed review, where
their results are recorded. Step 4 and the measurement behind the question:

4. ✅ `node scripts/jev-backtest.mjs --repo <consumer A> --repo <consumer B> --repo <this repo>` harvested
   **655** cross-review comments and scored them in 25 s. Every reply went through `judgeReviewOutput` in
   shadow, so every one is in `.jev/decisions.jsonl`. The resulting table:

   | scored | regex accepted | jev real | jev not-real | jev uncertain | could not look | disagreements |
   |---|---|---|---|---|---|---|
   | 655 | 650 | 647 | 3 | 3 | 2 | 2 |

   The 2 "could not look" rows are raw tool-call transcripts. Those are decided mechanically, so Jev is never
   asked about them. The 2 disagreements:
   - **A regex false pass that Jev catches (0.07):** a vibe tool-call transcript that writes a review *plan*
     ("Plan created. Ready to execute.") and never reviews anything. The regex accepted it because the plan
     names severity headings.
   - **An ambiguous case:** a builder's "review trail" summary posted under the review header. It has no
     honest label, so it is excluded from the fixtures.

**The question was measured, not guessed.** Each wording below was run on the 76 labelled fixtures
(62 real corpus replies, anonymised, plus 14 failure shapes), at real ≥ 0.85 / not-real ≤ 0.15:

| wording | Jev decided | Jev right, of those decided | judge overall | regex alone |
|---|---|---|---|---|
| "is this a genuine review?" (first draft) | — | scored the real prose finding **0.73** (uncertain) | — | — |
| "does it contain an assessment of a code change?" | 38 / 76 | 38 / 38 | 75 / 76 | 66 / 76 |
| **"did the reviewer deliver a verdict?"** + named terse verdicts and failure shapes (shipped) | **74 / 76** | **74 / 74** | **75 / 76** | 66 / 76 |

**Two corrections the measurement forced:**
- **Two fixtures were mislabelled by the builder.** Both were vibe plan transcripts. Jev scored them "not a
  review" and was right. The fixtures now carry that label and a note.
- **`reviewState` truncated head-only.** On a 124k-character reply that left Jev seeing only a file-list
  preamble. It now keeps the head and the tail, because the verdict comes last.

**Mutation check:** each of these was applied on its own and caught:
- non-inclusive thresholds
- shadow deciding by Jev
- no mechanical pre-check
- a non-numeric noul accepted
- no truncation

**Byte-identity:** `assertReviewOutput` and `review-guard.test.mjs` are byte-identical to `main`.

