---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: jev-semantic-guards
build_order: 33
title: "Jev semantic guards — review-guard and prose-guard decide with Jev, not regex"
area: 09-platform-infra
risk: high
type: feature
phase: Shipped
sprints_total: 5
stories_total: 15
---

# Epic: Jev semantic guards — review-guard and prose-guard decide with Jev, not regex

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Archetype:** Grower · **Scope seed:** [`00-ideas/seeds/jev-semantic-guards.md`](../../00-ideas/seeds/jev-semantic-guards.md)
> **Appetite:** L (two waves, re-bet at the boundary — S1–S4 wave 1, S5 wave 2) · **Bet:** [`bets/wave-2026-09-19.md`](../../bets/wave-2026-09-19.md)

## Why

Two guards that decide things on every PR and every report — "did the external reviewer actually
review?" and "does this standup invent a fix, a beneficiary, a live capability or a deadline?" — make
**language** judgements with regexes. They fail in both directions (2026-09-19: a real prose review
rejected, a timed-out one accepted). This epic makes **Jev** (TypeSafe's typed-judgement model) the
decider for those semantic questions across the template, `medusa-bonsai` and `golden-beans`, with the
regexes kept only as the fallback when Jev cannot be reached. A short, CI-expiring shadow period
measures the swap; promotion to production is part of this epic, not a later bet (product owner,
2026-09-19).

## Platform-first note

No new store, no new dependency. The guards stay pure functions (`assertReviewOutput`, `checkProse`)
and become the fallback; new async `judge*` functions sit beside them and call Jev through one zero-dep
`fetch` client. The switch is a committed config line, not the flag provider — these run in scripts and
routines, not app runtime, and `golden-flags-by-default` has not shipped.

## What already exists (reuse, don't rebuild)
- `template/scripts/lib/review-guard.mjs` — `assertReviewOutput` (fallback), `reviewMarker` (pattern for the jev marker)
- `template/scripts/cross-review.mjs:429` — the one review-guard call site; failure status + "never destroy a paid reply" untouched
- `template/scripts/lib/prose-guard.mjs` — `checkProse`, `sentences()`, `findingsToRevisionNote`
- `template/scripts/lib/prose-writer.mjs` (`guard` already injectable via `deps`), `standup.mjs:555`, `weekly-recap.mjs:472`
- `scripts/check-skill-scripts.mjs` — enforces the new `lib/jev.mjs` import closure once declared
- `template/.gitignore` — already ignores `.env.local`; widen to `.env*.local` + `.jev/`
- The 2026-09-19 probe (audit §1): API contract proven, 0.37–0.48 s, 324–583 input tokens/call

## Architecture — locked 2026-09-22, verified against the live code, the three repos and the live API

**Read before deciding:** `review-guard.mjs`, `prose-guard.mjs`, `prose-writer.mjs`, the one guard call in
`cross-review.mjs` (template, medusa-bonsai and golden-beans forks), `standup.mjs`, `weekly-recap.mjs`,
`prose-draft.mjs` and `merge-report.mjs`.

**`cmp` across the three repos:**
- **Byte-identical everywhere:** `review-guard`, `prose-guard`, `prose-writer`, `standup`, `weekly-recap`,
  `prose-draft`, and all three guard/writer test files.
- **Forked in both consumers:** `cross-review.mjs`.
- **Absent from golden-beans:** `merge-report.mjs`.

**Live API, probed 2026-09-22 with this machine's key:** `jev-1.13.0` returned HTTP 200 in 0.45 s, and
scored the timed-out banner `is_real_review = 0.10`.

- **D1: the client (`template/scripts/lib/jev.mjs`).** `askJev({ state, questions }, deps)` returns
  `{ ok: true, answers, usage, model }` or `{ ok: false, state: 'could-not-look', error }`. It never
  throws, and `fetch`, `env`, the clock and the file reader are all injected. Each of these comes back as
  could-not-look, with `error` naming which one:
  - no key
  - a 401 or a 422
  - a 429 or 529 after 2 backoff retries
  - a timeout (default 8 s) or a network error
  - an unparseable body, or a response missing an answer
  - a `state` over the size budget

  The key comes from `TYPESAFE_API_KEY` in the environment, then `.env.local` at the repo root, then the
  cwd. The model comes from config, defaulting to the pinned `jev-1.13.0` and never an alias.
- **D2: config (`jev.config.json` at the repo root, next to `scripts/`).** It holds `model`, `egress`,
  and `rails.review` / `rails.prose`. Each rail has `mode: off | shadow | jev`, `thresholds` and
  `shadowExpires`.
  - A **missing file** means the built-in defaults, with both rails `off`.
  - A **malformed file** throws and names the problem, so a bad config never silently means `off`.
  - `egress: false` or no key makes the *effective* mode `off`, and the reason is reported.

  **Two deviations:**
  - The template ships a real `template/jev.config.json`, not a `.example.json`. A file a spawned
    project must rename is a step the spawn forgets, and a missing file already means the defaults.
  - `mode: shadow` **requires** an explicit `shadowExpires` date, and the loader refuses a shadow rail
    without one. "21 days after it was set" can't be derived from a file, so whoever sets shadow writes
    the date.
- **D3: the decision log.** `logDecision()` appends one JSONL line to `<root>/.jev/decisions.jsonl`:
  `{rail, mode, decider, regex, jev, confidence, textHash, text (≤4k), sha?, source?, ts}`. If the write
  fails, it warns on stderr and returns. It never changes a decision and never throws past one. `.jev/`
  and `.env*.local` are gitignored in the template and in both consumers.
- **D4: mechanical checks stay in code and run first.** Jev only ever answers the *semantic* questions.
  - Review: `assertReviewOutput` rejects an empty reply or a raw tool-call transcript before Jev is
    asked. Those are shapes, not language.
  - Prose: length, banned phrases, tool names and `unfinished` always come from `checkProse`.
- **D5: `judgeReviewOutput(text, opts, deps)`, async, in `review-guard.mjs`.** It asks two questions in
  one call: `is_real_review` (Noul) and `severity` (Choice: `blocking | should_fix | nit | clean`). What
  decides depends on the effective mode:
  - **`off`:** the regex verdict, with no call and no log line.
  - **`shadow`:** the regex verdict, with both verdicts logged.
  - **`jev`:** Jev decides when `noul ≥ thresholds.real` (0.85) or `noul ≤ thresholds.notReal` (0.15).
    Between those, or when Jev could not look, the regex decides, and the reason says why (`uncertain`
    or `jev could not look (…)`).

  `reason` always names the decider, and `assertReviewOutput` is byte-unchanged. The PR marker is
  `jevMarker(verdict)`, which renders as
  `<!-- jev:{"mode","decider","noul","severity","model"} -->` and never carries the reply text.
- **D6: `judgeProse(draft, evidence, deps)`, async, in `prose-guard.mjs`.** It returns the `checkProse`
  shape `{ ok, findings }` plus `decider`, so the writer loop needs no other change.
  - **Sentences** come from the guard's own `sentences()`, now exported. That export keyword is the only
    other edit to the file, so `checkProse` is byte-unchanged.
  - **One batched call.** It has one key per `(sentence, family)`, and the full draft in `state`. The
    evidence pack is deliberately **not** sent: code applies it (the family gating and the `liveFlags`
    corroboration), so Jev judges language and never evidence. *(Corrected in review of PR #36; the pitch
    said "evidence pack as `state`".)*
  - **Only the families the evidence hasn't already allowed are asked.** Fix is skipped under
    `allowsFixClaim` and beneficiary under `allowsBeneficiary`. Liveness and commitment are always asked.
  - **Over 120 questions**, the call splits into parallel chunks.
  - **A claim counts** at `noul ≥ thresholds.claim` (0.5). If a family's chunk could not look, that
    family alone falls back to the regex.
  - **Findings** use the same codes and notes as `checkProse` (one map, held to `checkProse`'s own text
    by a test) and quote the offending sentence.
- **D7: the callers go async.**
  - **Review:** `cross-review.mjs`'s `main()` becomes `async`. Its guard line becomes one
    `await judgeReviewOutput(...)`, and the marker is appended after `reviewMarker`.
  - **Prose:** `writeProse` becomes `async`, with `judgeProse` as its default `guard`. So its two callers
    change too: `prose-draft.mjs`'s `main()` goes `async` and `merge-report.mjs` gets an `await`.
    `standup.mjs:555` and `weekly-recap.mjs:472` `await judgeProse`.
  - **Scope correction:** the epic lists three prose callers, but the live code has **five**.
  - **Tests:** only `prose-writer.test.mjs` changes, gaining `await`s. The review-guard and prose-guard
    specs stay byte-identical.
- **D8: the eval harness (`template/scripts/jev-eval.mjs` + `jev-eval.fixtures.json`).** It is a shared
  rail, copied to the consumers.
  - **Offline**, it needs no network and runs in CI in all three repos. It recomputes every fixture's
    decision from its **recorded** Jev answers through the same decide functions, checks that against the
    recording, and checks every rail's `shadowExpires` in the repo's `jev.config.json`.
  - **`--live`** re-asks Jev, rewrites the recordings, and prints per-rail and per-family accuracy
    against the labels.
- **D9: shadow traffic is built from history, not waited for (a DEVIATION the product owner directed).**
  The pitch plans a calendar shadow period (≥50 decisions per rail *or* `shadowExpires`), re-bet at the
  wave boundary. For this run (2026-09-22) the product owner instructed that done means Jev live in
  production in this session, with nothing left waiting, and live traffic is low anyway. So wave 2 runs on
  **recorded history, replayed through the shadow judge**:
  - the review rail, over every historical cross-review comment in the three repos (the S2.3 backtest);
  - the prose rail, over real committed prose plus the labelled fixtures.

  Every decision is logged in `shadow` mode exactly as live traffic would be, and that log feeds the S5
  report. The builder labels the disagreements and commits the labels in `jev-eval.fixtures.json`, where
  the product owner can overrule them.

  **The honest limit:** the review corpus holds only replies the regex **accepted**, so it can find false
  passes but not false fails.

  **The flip gate is unchanged:** Jev must be at least as accurate as the regex on the labelled
  disagreements, per rail. If Jev loses on a rail, that rail doesn't flip, and the result is escalated
  rather than forced.
- **D10: rollout (S4).**
  - **Byte-identical copies** go to both consumers: `lib/jev.mjs`, `lib/review-guard.mjs`,
    `lib/prose-guard.mjs`, `lib/prose-writer.mjs`, `standup.mjs`, `weekly-recap.mjs`, `prose-draft.mjs`,
    `merge-report.mjs` (medusa only), `jev-eval.mjs`, `jev-backtest.mjs`, `jev-report.mjs` and the
    fixtures.
  - **The forked `cross-review.mjs`** in each consumer gets the same two-line patch by hand, recorded in
    that consumer's `scripts/README.md` fork notes.
  - **Each consumer also gets** its own `jev.config.json`, a `jev-eval` CI step and the key in its local
    `.env.local`.
  - **Cloud routines** that post reviews or reports need `TYPESAFE_API_KEY` in their environment **and**
    `api.typesafe.ai` on the environment's network allow-list. Without both, they log could-not-look and
    behave exactly as they do today.
- **D11: the kill-switch.** It is `rails.<rail>.mode: off` in `jev.config.json`, a one-line reviewed
  diff. It falls back to the regex path, which is the unchanged code that runs today. A test proves it:
  in `off` mode, `judge*` returns exactly what `assertReviewOutput`/`checkProse` return and makes no call.

**Model routing.** One orchestrator session on the strongest model builds every sprint, with no fan-out.
S2 and S3 import S1's client and config, S4 copies the result, and S5 needs the data S2–S4 produce, so a
hand-off would cost more than it saves.

**Review.** Each PR gets the fresh `pr-reviewer` subagent. The cross-family layer runs from a consumer
checkout (`review-route.mjs`, then `cross-review.mjs --repo danybgoode/dobby-foundation`) when a family is
available. When none is, the PR says the layer is DARK.

### Decided during the build (named deviations)
- **D12: the report behind the flip** is [`shadow-report-2026-09-23.md`](shadow-report-2026-09-23.md). The
  gate passed on both rails and every family: review 98.7% vs 87.0%, prose 86.5% vs 71.2%.
- **D13: measured thresholds.** Review is `real ≥ 0.85` / `not-real ≤ 0.3` (the pitch guessed 0.15). Prose is
  `claim ≥ 0.8` (the pitch guessed 0.5). Both are swept in the report.
- **D14: headings are never claims.** Markdown headings are dropped from prose units. "## What shipped" scored
  as a liveness claim across the retro backtest.
- **D15: a repo with NO `jev.config.json` stays `off`.** The template's shipped config is `jev` both ways, and
  it takes effect only with a key. A repo that never added the file never opted in to sending text to Jev.
- **D16: the question wording is measured.** Both rails' first wordings lost to the regex, or barely beat it
  (review "genuine review?" 0.73 on a real finding; prose liveness 48/62). The shipped wordings were chosen on
  the labelled fixtures. The tables are in sprint-2.md and sprint-3.md.

### Build contracts (locked by the architect before the builder started)

- **Sprint 1:** D1, D2, D3, D8. `jev.mjs` exports `askJev`, `loadJevConfig`, `effectiveMode`,
  `logDecision`, `textHash` and `repoRoot`. Specs inject `fetch`, and CI never touches the network.
- **Sprint 2:** D4, D5, the review half of D7, and the backtest in D9. `assertReviewOutput` and
  `review-guard.test.mjs` stay byte-identical.
- **Sprint 3:** D4, D6, and the prose half of D7. `checkProse` and `prose-guard.test.mjs` stay
  byte-identical.
- **Sprint 4:** D10. Consumers' old guard tests from `origin/main` pass against the new files, and every
  copy passes `cmp`.
- **Sprint 5:** D9, the flip gate, and D11. All three repos end at `mode: jev`, with no rail left in
  `shadow`.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Jev client · 1.2 config + kill-switch · 1.3 decision log · 1.4 eval harness + shadow expiry | low |
| 2 | 2.1 `judgeReviewOutput` · 2.2 wire cross-review + PR marker · 2.3 backtest | high |
| 3 | 3.1 `judgeProse` · 3.2 wire the three prose callers | low |
| 4 | 4.1 medusa-bonsai · 4.2 golden-beans · 4.3 routine key + shadow on | high |
| 5 | 5.1 agreement report + labels · 5.2 thresholds · 5.3 flip to `jev` everywhere, regex fallback-only | high |

## Deploy order

Template first (S1–S3), consumers after (S4) — each consumer ships with `mode: shadow` and degrades to
today's behaviour with no key. Wave 2 (S5) flips `mode: jev` in the template and both consumers in one
coordinated PR set. There is no app deploy; "shipped" = merged to `main` in each repo with the config set.

## Definition of Done (epic) — ✅ closed 2026-09-23
- [x] All sprints merged to `main` and smoke-tested, with the gaps stated. Each sprint file lists its PRs.
      Two items are owed to the product owner: the routine key, and golden-beans' `.git` repair (below).
- [x] Each `sprint-N.md` has its smoke walkthrough and recorded results.
- [x] This README is marked ✅, and every sprint status is ticked with commit refs.
- [x] `RETROSPECTIVE.md` is written.
- [x] The product poster (`Roadmap/README.md`) is updated.
- [x] Team memory and the `MEMORY.md` index are updated.
- [x] Durable learnings are promoted to `Roadmap/LEARNINGS.md`.
- [x] **Kill-switch (Stage 6b):**
  - `jev.config.json → rails.<review|prose>.mode` exists in all three repos.
  - Setting it to `off` restores today's regex-only behaviour, proven by test: `off: exactly
    assertReviewOutput` and `off: exactly checkProse`, with no call and no log line.
  - With no key or `egress:false`, the effective mode is also `off`, and the reason says so.
  - **Deviation:** the template ships `jev`, not `off`. That is the S5.3 promotion. It takes effect only with
    a key, and a repo with no config file stays `off` (D15).
- [x] **Promotion done, not deferred:**
  - `mode: jev` is live for both rails in all three repos, and no rail is in `shadow`.
  - The agreement report is [`shadow-report-2026-09-23.md`](shadow-report-2026-09-23.md).
  - Live production decisions on the promotion PRs read `decided by jev (0.91 / 0.95 / 0.97)`.
- [x] Feature branches are deleted, and this README's frontmatter reads `status: shipped`.

## Owed to the product owner

1. **Repair golden-beans' local git state.** It was damaged on 2026-09-23 by the unsealed spec fixture that
   #37 fixed. Nothing reached the remote. The auto-mode classifier (correctly) refused to let the agent move
   or delete refs. Run these from `~/dobby/golden-beans`:
   ```
   git --git-dir=.git config core.bare false
   git config --unset user.name; git config --unset user.email   # the fixture's "t <t@t>"; your global identity stays
   git update-ref refs/heads/main a1f2bc4f1b529e372a20a0679f0e15640872bb3a fb2cbbb   # drop 3 "plan: scaffold" commits
   git update-ref -d refs/heads/claude/session-journal 3711af1                      # created by the fixture
   git worktree remove --force ../golden-beans-jev-pin                               # the worktree the leak ran in
   git status   # should show only your own .claude/settings.json change and "Claude outputs/"
   git pull --ff-only
   ```
2. **Give the routines the key when you re-enable them.** They share one environment. Add
   `TYPESAFE_API_KEY`, and put `api.typesafe.ai` under Network access → Custom. Until then a routine
   falls back to the regex, and its output says `jev could not look`.
