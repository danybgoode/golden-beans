# Plugin audit + medusa extraction — pay the dark-skill debt, port what's stranded — Retrospective

_Closed: 2026-09-18_

## What shipped

Three sprints in one orchestrated run (Opus 5). Each sprint landed in the same wave in the origin
project (danybgoode/miyagi-product-management) and, in S3, in golden-beans.

**Sprint 1 — the dark-skill debt, paid.** [#20](https://github.com/danybgoode/dobby-foundation/pull/20)
`2cfd281` · miyagi-product-management#182 `7ac3354`.
- The reporting family (`weekly-recap`, `standup-post`, `pmo-report`, with their libs) was ported behind
  one committed `reporting.config.json` (D2). With no config, each script refuses in words that name the
  file. `live-smoke` was ported as a runnable harness (D3). `KNOWN_ABSENT` is empty (D1).
- `check-skill-scripts` walks each declared script's **import closure** and fails on an undeclared import.
  `--repo-root` runs the same check against a consumer.
- **The advertised skill list is generated.** `render-skill-adverts.mjs` writes it from each `SKILL.md`'s
  `summary:` into both marketplace entries, `plugin.json` and the README, and CI's `--check` fails on a
  stale list. This replaces the four hand-kept copies. `prose-draft`, which had been dropped from the
  advert, is listed again.
- Housekeeping: the stray `.DS_Store` files are gone (11 on disk, not the 7 or 10 planned), and
  `roadmap-to-notion` is opt-in under `optional/notion/`, with `roadmap-extract.mjs` split out.

**Sprint 2 — the stranded rails.** [#21](https://github.com/danybgoode/dobby-foundation/pull/21)
`f8be490` · miyagi-product-management#183 `d8e84d6`.
- `scripts/routines/` (7 prompts plus a fill-in README), the three-stage hook budget (a guarded
  `prepare`, a pre-commit on staged files, and a pre-push scoped from stdin), `session-note` and
  `session-resume`, `doc-format` (enforced paths from `doc-format.enforced.json`), and `owed-ledger`.

**Sprint 3 — Tier 2 behind config seams, and one implementation per rail.**
[#22](https://github.com/danybgoode/dobby-foundation/pull/22) `8aa5e54` · miyagi-product-management#184
`cf99bb8` · golden-beans#154 `965567a`.
- `prod-smoke` is an engine plus the project's committed `prod-smoke.checks.mjs`. Every way of being
  unable to check exits 2, never 1.
- `smoke-triage-scope` takes its policy from `smoke-triage.config.json`. A missing or malformed policy
  is `undecidable` (D4), and a PR that edits the gate itself is always blocked.
- Also ported: `merge-report` with its hooks, `vercel-env`, and `perf-probe` (from `perf-probe.config.json`).
- golden-beans runs the shared prose writer and guard, every skill's scripts, and docs in template shape.
  Its surviving forks each carry a written reason.
- The origin runs the template's bytes for every ported rail. Its report-hub publisher reads the
  registry from config.

## What went well

- **Equivalence was proven rail by rail on live data, not asserted.** The weekly recap and the owed
  ledger gave identical output; doc-format gave the same 165 enforced and 224 advisory findings; prod-smoke
  passed 8/8 against production both ways; the gate BLOCKed `miyagisanchezcommerce#422` with the same two
  blockers; and perf-probe's fixture URLs were identical.
- **The merge rail ran live on the new code the moment it merged.** Pulling the origin's `main` posted the
  report for `cf99bb8` in the background, and a second pull posted nothing. That closed S3's step-4 partial
  (once-per-commit with a configured chat) by running the real thing.
- **Fail-closed paid off in review.** Each gap reviewers found, fixed before merge, was a case of
  "could not look" being reported as something else: a checks file that failed to import exited 1
  (read as a production regression), and a malformed policy rule threw instead of refusing.

## What we learned

- **"Byte-identical" is a claim until a byte-compare runs.** S3's walkthrough said the origin was 10/10 on
  `check-skill-scripts`, and it was not: 4 skills had undeclared imports, and eight ported rails still ran
  the origin's pre-generalization copies. One reviewer finding about `vercel-prune` callers exposed a
  bug live since S1: the standup's stale-preview count read "unavailable" in every run, because its
  callee had lost its default project. Chasing it led to comparing every template script against every
  consumer, and that comparison found the eight rails.
- **"The template takes the superset" has to be checked in both directions.** The template's prose guard
  came from the origin. golden-beans had since made it stricter: the no-impact exemption was per
  sentence, with more nouns. Adopting the template's copy silently undid that, and deleted the two tests
  that pinned it. Running golden-beans' *old* test suite against the *new* code caught it, and that is a
  cheap check for any migration that replaces a file.
- **Excluding "copies" from a consumer's review hides regressions against the consumer's own code.** The
  own-surface pass skipped byte-identical files as "reviewed on the foundation PRs". The foundation
  review can't see that a file is weaker than the one it replaced in golden-beans.
- **A reviewer can be right about the gap and wrong about the mechanism.** "The sentence split misses
  newlines" was false, because `\s+` matches `\n`. Bullets with no terminal period were the real gap.
  Reproduce the claim before fixing or dismissing it.

## Gaps / follow-ups

- **The live stale-preview count was not observed.** The build machine's Vercel token is invalid (HTTP
  403), so `vercel-prune-previews --project <name>` could not be run here. The first real value arrives
  with the next ops-nightly routine run.
- **`vercel-env set` was not run against a production project**, by rule. `verify` was run live.
- **No Telegram message was sent as a test**, by rule. The merge rail's live post above is the product
  doing its job on a real merge, not a test.
- **The live merge report went out marked FLAGGED.** Devin's drafts twice tripped
  `unsupported-fix-claim`, agy's twice tripped `unfinished`, and codex is out of quota until October. The
  rail's designed fallback posts the last draft with the flag. This predates the epic (an earlier post,
  `4d05b0d`, shows the same), but a flagged post reaching the channel is worth a look on the prose rail.
- **The review rail stays forked in both consumers.** `cross-review`, `cross-panel`, `cross-agent-cli` and
  their prompts are out of this epic's scope, and each consumer's `scripts/README.md` records that.
  Unifying them belongs to the review-stack work. Found at close: the template's agy pin error names an
  `agy-doctor.mjs` it doesn't ship, so with agy at 1.2.7 against a 1.2.5 pin, the agy seat is refused in
  the foundation. Seeded as [`review-rail-one-implementation`](../../00-ideas/seeds/review-rail-one-implementation.md).
- **golden-beans' `prose/cpo-persona.md` is still the template's neutral copy.** It only reaches
  `prose-draft` there, so filling it in with this product's real people is a voice decision for the
  product owner.
