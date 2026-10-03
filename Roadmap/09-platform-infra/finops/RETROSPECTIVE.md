# FinOps: quote vs actual per epic — measured from your own sessions, shown live in the build view, sent to the engine — Retrospective

_Closed: 2026-10-03_
_Intent: yes | mostly | no_
<!-- Did we build what the product owner meant? One word, THEIR answer: yes, mostly or no. Required by `epic-dod` only
     when the epic's seed or README carries a numeric `intent_match:` (intent-match D17); the calibration learns from
     it. Keep the line and leave exactly one of the three words between `_Intent: ` and the closing underscore. -->
_Quote vs actual: not quoted (this epic invents the quote) → ≈$56.13 (—)_
<!-- Stamped by `node scripts/epic-actuals.mjs --epic finops --write`: 182.2M tokens, one orchestrated Claude Code
     session (its fresh-reviewer subagents included) across feat/finops, -s2 and -s3. Codex/Agy/Vibe passes are not
     measured. For calibration: the L appetite's wide default today is $50–300 (n=2). -->

## What shipped
One orchestrated session, three stacked PRs, each merged, deployed to production and released.

- **Sprint 1 — actuals, measured locally** (#230, `6f3ac1e`; plugin + kit 0.22.0). `epic-actuals.mjs` reads Claude Code's
  own transcripts and totals each epic: tokens by kind, model and skill, and an ≈ API $ from one dated price table
  (`lib/model-prices.mjs`, read from the official pricing page on 2026-10-02, fast mode ×2). An incremental index in
  the main checkout (full scan ~1 s for 390 MB; incremental ~0.1 s; a 6 s budget that saves between files) and a summary
  the build view's new `$ Spend` row reads. The backfill stamped `actual_*` on 10 shipped epics; two partial ones and the
  two the C14 attribution limit affects are held, with the reason in their READMEs.
- **Sprint 2 — quotes, calibrated** (#231, `288a5a3`; 0.23.0). `quote.mjs` gives p25–p75 of shipped actuals at an
  appetite (today: S $11–17 n=3, M $24–35 n=4, L wide n=2). Groom Stage 1.5 records it in the seed, the scaffolder copies
  it into the README, the band shows the four approved states (inside, over — alert only, no quote, thin history), and
  `epic-dod` warns on a shipped epic with no actual.
- **Sprint 3 — the engine** (#232, `379b50d`; 0.24.0). `$agent_usage` rides the existing `POST /api/v1/track` with a
  closed, metrics-only envelope refused otherwise; the roadmap push carries the six quote/actual fields; the Hub
  drill-down shows `Quote … · Actual …`; `/app/finops/[projectSlug]` (tiles, Epics, By skill, By model, Export CSV);
  the kit's opt-in push (`spend.telemetry: on`); the landing's FinOps section flipped from "not built" to what ships.
  No migration.

## What went well
- **The lock earned its keep on real data.** Sixteen corrections came from reading the code and this Mac's 241
  transcripts before or during the build: duplicate entries per streamed message, resumed sessions re-stamping copied
  history with a new branch, subagent files, no floats in the frontmatter subset, appetite living on seeds,
  `/track`'s idempotency never replacing (so "replace" became latest-wins at read), and an existing `spend.telemetry`
  setting instead of a new key.
- **The fresh reviewer carried the security lens when no other family could**, and found real defects every time it
  ran on Sprint 3: an envelope still open beyond `metadata`, a push that one bad snapshot could jam forever, a config
  read that could throw and freeze the band, state that did not reach disk on an idle machine.
- **Mutation checks caught weak specs twice.** A spec for the idle-run fix passed with the fix reverted (its first run
  also read a transcript and saved anyway); restructuring it to a genuinely idle run made it fail the mutation.

## What we learned
- **`gitBranch` is the branch of the session's own checkout, not of the work.** `intent-match` was built from a
  session sitting on `feat/semantic-lint`; every turn is stamped with that branch, so neither epic can be costed.
  Build an epic from a session on its branch, or in a worktree on it.
- **A moved checkout keeps its old `cwd` in every transcript.** Claude Code moved the folder on the 2026-09-29 rename
  but 24k entries still say `~/dobby/golden-beans`; the folder, not the cwd, is the reliable signal. And its 30-day
  cleanup deleted the Sep-1 sessions on the very day the index that would have kept them was built.
- **A focused test run after a copy change is how a pinned sentence breaks CI.** The landing rewrite removed a sentence a
  vocabulary spec pins; I had run only the FinOps specs. The full local api suite would have caught it in one run, and
  the authed project would have caught the missing visual-gate entry the round after.
- **Squash merges of a stack need a "theirs-is-a-subset" check, not conflict resolution by hand.** Each squash
  conflicted on every shared file; confirming `main`'s tree equalled the parent's final tree made "ours" provably right.
- **An alarm needs a clear condition.** The refused-push counter took three rounds: first never cleared, then cleared
  on an idle run. "Clean" has to mean something actually went through.

## Gaps / follow-ups
- **Owed to Daniel (by name):** S1 steps 3–4 and S2 steps 2–4 (the band and groom in a live session on the released
  plugin); S3 steps 1–4 (`spend.telemetry on` + the prod ingest key, the signed-in `/app/finops`, the Hub line, the
  non-member 404); the `_Intent:` answer above.
- **External review was dark on all three PRs.** Codex was capped; agy's Gemini models were capped and gpt-oss could
  only read a 3-file scope (its two "should-fix" claims on #232 were false); vibe ended every `--agent plan` review
  on a tool call, even on an 11 KB scope, while answering a plain prompt. Vibe needs diagnosing.
- **`/app/finops` lands uncovered in the design ledger** (30 of 32) with a dated deferral to 2026-12-31: its three
  approved surfaces need a hashed state contract.
- **Not asserted:** the page's error state; the Hub drill-down line in a rendered page (unit-tested only).
- **Nit carried to the next kit release:** the comment at `scripts/epic-actuals.mjs:718-719` opens with the round-4
  wording.
- The first epic to carry a quote is the next one groomed.
