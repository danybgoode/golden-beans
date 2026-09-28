# The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod — Retrospective

_Closed: 2026-09-19 · 4 sprints · 13 stories · 10 PRs across 3 repos_

## What shipped

**S1 — the contract** ([#25](https://github.com/danybgoode/dobby-foundation/pull/25) `1ecd016`).
`template/scripts/lib/roadmap-contract.mjs`: the field lists for an epic README, a `sprint-N.md` and a
per-story entry, the six-rung `phase:` ladder, a zero-dependency parser/serializer for a small YAML
subset, and the validators. The `groom` scaffolder emits the whole shape, and a generator test holds it
to the contract.

**S2 — enforcement and the backfill** ([#26](https://github.com/danybgoode/dobby-foundation/pull/26)
`56088b4` · medusa [#186](https://github.com/danybgoode/miyagi-product-management/pull/186) `430e5ff` ·
golden-beans [#156](https://github.com/danybgoode/golden-beans/pull/156) `6c1d727`).
`doc-format.mjs` enforces the contract on the full walk, on `--files` (pre-commit) and on `--hook`.
`roadmap-backfill.mjs` brought **188 epics, 487 sprint files and 1,454 stories** across the three repos
onto it — scripted, idempotent, prose untouched — and reported the 324 docs it could not fully resolve,
each with a reason.

**S3 — the resolver** ([#27](https://github.com/danybgoode/dobby-foundation/pull/27) `52b93f0`, plus
[#28](https://github.com/danybgoode/dobby-foundation/pull/28), [#29](https://github.com/danybgoode/dobby-foundation/pull/29),
[#30](https://github.com/danybgoode/dobby-foundation/pull/30) from review; copy-ins medusa
[#188](https://github.com/danybgoode/miyagi-product-management/pull/188) and golden-beans
[#158](https://github.com/danybgoode/golden-beans/pull/158)). `build-state.mjs` answers "what is being
built right now" from frontmatter + git + one `gh` call, in ~60ms offline, and says `unknown` rather
than guessing.

**S4 — the mod** ([#32](https://github.com/danybgoode/dobby-foundation/pull/32)). Function hooks turned
out to exist in Claude Code 2.1.278 behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, so the sprint that was
planned as droppable shipped: `hooks/hooks.json` + a thin renderer that runs the resolver on
`turn.start`, caches the view in `$.store`, and prints it with `$.ui.status`. 175ms cold, 36ms cached.

## What went well

- **Ordering the contract before the renderer was the whole bet, and it paid.** Sprints 1–3 are useful
  with no mod at all, and the mod ended up being ~40 lines with no logic in it.
- **Rehearsing the backfill on full copies of both consumers** before opening any PR. The dress rehearsal
  is where the idempotency bug (the report being rewritten by a no-op run) surfaced, not in review.
- **The reviews did their job, loudly.** Nine findings across four rounds on the resolver alone, and
  *every single one* was a way it could report a confident wrong answer — the exact failure the epic was
  written to prevent. None of them was caught by the tests I wrote first.

## What we learned

- **A resolver that answers "what is in flight" attracts exactly one class of bug: the plausible wrong
  answer.** Stacked branches inherit the previous sprint's commits; a shared journal holds other epics'
  entries; `feat/aws-s3` looks like sprint 3 of `aws`; a stale `origin/main` puts main's commits in
  `base..HEAD`. Scope every input explicitly (this epic, this sprint) and prefer `unknown`.
- **Mutation-check the test, not just the code.** The stale-base fix passed its new test while still
  being wrong: both merge-bases shared a commit timestamp, so the date comparison never fired. The
  mutation is what exposed it; ancestry replaced the clock.
- **A mechanical migration must not be gated on unrelated pre-existing findings.** `doc-format --files`
  blocked on every finding in a touched doc, so a commit that only adds frontmatter to 539 legacy docs
  demanded a 251-finding sweep. It now blocks only on what the commit introduces — which is the
  checker's own stated doctrine, applied at last.
- **Probing an undocumented pre-release API has a loop: `claude plugin validate` for the shape, a
  headless session plus the debug log for the runtime.** It took four attempts to learn that `$` may
  only appear as `$.noun.event(...)`, that hooks must call `next(e)`, and that a module may import only
  its own files. Then pin the CLI version in CI: the first unpinned run failed on a schema the probed
  version doesn't have.

## Gaps / follow-ups

- **Owed to the product owner:** the interactive-TUI half of the Sprint 4 smoke (watching Progress
  advance and the status become `In review` across turns, with a status row that a headless `-p` session
  does not have). The mechanics under it are tested; the pixels are not.
- **D4 deviation, deliberate:** a `Roadmap/` write is picked up within 15s rather than instantly.
- **The cross-family review layer is DARK in this repo** (no `review-route.mjs`/`cross-review.mjs` here);
  the consumer PRs got codex, and it found three Blocking bugs the fresh reviewer had not. Giving this
  repo a review rail of its own is its own chore epic.
- **324 backfill findings are recorded, not fixed** (D5), in each repo's
  `Roadmap/00-ideas/audits/frontmatter-backfill-2026-09-19.md` (dobby-foundation's copy now lives here as `frontmatter-backfill-2026-09-19-plugin.md`). The biggest group — 117 stories with no
  user story in their prose — is a genuine content gap, not a parser failure.
- **Two agy pin bumps** fell out of routing the security lens (golden-beans #157, medusa #187, both
  merged): every agy review in both consumers had been stalled on a stale pin.
