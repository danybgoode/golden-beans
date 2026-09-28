---
epic: build-visualization-claude-mods
sprint: 3
title: "`build-state.mjs` — one resolver"
risk: low
phase: Shipped
stories_total: 2
stories:
  - id: S3.1
    title: build-state.mjs --json
    as_a: any tool
    i_want: "one resolver that answers \"what is being built right now\""
    so_that: nothing else ever parses markdown to find out
    risk: low
    status: done
  - id: S3.2
    title: Story-in-flight derivation
    as_a: the resolver
    i_want: "an honest answer to \"which story is in flight\""
    so_that: "the build view doesn't report confidently while being wrong"
    risk: low
    status: done
---
# The build view — Sprint 3: `build-state.mjs` — one resolver

**Status:** ✅ Shipped — foundation [#27](https://github.com/danybgoode/dobby-foundation/pull/27) (`52b93f0`) + review rounds [#28](https://github.com/danybgoode/dobby-foundation/pull/28) (`4550687`), [#29](https://github.com/danybgoode/dobby-foundation/pull/29) (`7e00e89`), [#30](https://github.com/danybgoode/dobby-foundation/pull/30) (`992308d`) · copy-ins medusa-bonsai [#188](https://github.com/danybgoode/miyagi-product-management/pull/188) (`2e93a41`) · golden-beans [#158](https://github.com/danybgoode/golden-beans/pull/158)

**Epic:** [The build view](README.md) · **Risk: LOW**

**The sprint that makes Sprint 4 thin, and that pays even if Sprint 4 never ships.** `build-state.mjs`
is plain Node, testable, and immediately useful to `standup`, the Notion projection and `epic-dod` —
so the epic's value does not depend on a pre-release hook API (**D3**).

## Stories

### Story 3.1 — `build-state.mjs --json` ✅ `52b93f0`
**As** any tool, **I want** one resolver that answers "what is being built right now",
**so that** nothing else ever parses markdown to find out.
**Acceptance:** `node scripts/build-state.mjs --json` on a checked-out feature branch returns the
epic (title, area, risk), the story (`id`, `as_a`, `i_want`, `so_that`), `Story X of Y`,
`Sprint N of M`, and one of the six statuses. It reads **frontmatter + git + `gh`** and nothing else.
**It reads existing artefacts only — it never becomes a second source of truth.** Off a feature
branch, it says so cleanly rather than guessing.
**Risk:** low

### Story 3.2 — Story-in-flight derivation ✅ `52b93f0`
**As** the resolver, **I want** an honest answer to "which story is in flight",
**so that** the build view doesn't report confidently while being wrong.
**Acceptance:** per **D2**, derived from the last commit's `S<n>.<m>` prefix, **falling back to the
`session-note.mjs` intent journal** when the commit convention doesn't resolve — which is already the
doctrine (*journal intent, derive the rest*). When neither resolves, it returns `unknown` and says so.
**`unknown` is a correct answer; a confident wrong one is not.**
**Risk:** low

## Sprint QA
- **api spec(s):** `build-state.test.mjs` with fixtures for: a clean feature branch mid-sprint · a
  branch with no matching epic · a detached HEAD · an epic whose commit convention doesn't resolve
  (must return `unknown`, not a guess) · every one of the six statuses.
- **browser smoke owed:** no.
- **deterministic gate:** `node --test 'scripts/*.test.mjs'` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: local · `medusa-bonsai`, on a real feature branch mid-epic

1. Check out a feature branch with commits and run `node scripts/build-state.mjs --json`.
   → Correct epic title, area and risk; the right story with its full `as_a`/`i_want`/`so_that`;
     `Story X of Y`; `Sprint N of M`; one of the six statuses.
2. Compare every field against the sprint doc by eye.
   → They agree. **Nothing is invented.**
3. Commit a story and re-run.
   → `Story X of Y` advances by one.
4. Open a PR and re-run.
   → Status becomes `In review`.
5. Check out `main` and re-run.
   → It reports cleanly that no epic is in flight. It does not guess.
6. Check out a branch whose commits don't carry an `S<n>.<m>` prefix and have no journal entry.
   → Story is `unknown` — **not a wrong story.**
7. Add a `session-note.mjs` entry naming the story and re-run.
   → The fallback resolves it.
8. Time the command.
   → Fast enough to be called once per turn from a cache.

### Smoke results — run 2026-09-19
1. ✅ On a real medusa branch mid-epic (`feat/reporthub-as-notion`, with current `main` merged in):
   ```
   Currently building
     Epic     ReportHub as the Notion replacement    09-platform-infra · risk HIGH
     Story    S1.3 — Report scripts emit short links
              As Daniel reading Telegram, I want standup/weekly/PMO messages to carry real short URLs, so that links stop being HTML labels hiding URL-hash monsters.
     Progress Story 3 of 7 · Sprint 1 of 3
     Status   Shipped
   ```
   Before that branch had `main` merged in, it answered honestly instead: `… README.md predates the frontmatter contract — run scripts/roadmap-backfill.mjs`.
2. ✅ Every field agrees with `sprint-1.md`'s frontmatter. Status `Shipped` is the sprint's **written** phase; nothing was invented.
3. ✅ Committing the next story advances `Story X of Y` by one (`build-state.test.mjs`, real fixture repos).
4. ✅ An open PR advances the status to `In review`. This was proven with gh injected in `build-state.test.mjs`. Live, the `gh` path was only observed with **no** PR open (`evidence.gh: ok`, `pr: null` on this epic's S3 branch before its PR existed), so the live open-PR case is a stated gap, not a claim.
5. ✅ On `main` it prints `No epic in flight — on main — not an epic branch …`.
6. ✅ No story convention and no journal entry → `Story unknown`, **not a wrong story**. After the fresh review on #27, the same holds on a stacked `-sN` branch that carries the previous sprint's commits, and for an old journal entry about another epic.
7. ✅ A journal entry naming the story (and this epic, or written after the fork) resolves it (`story_source: journal`).
8. ✅ **0.06–0.08s** offline (the mod's path), about 0.5s with the one `gh` call. That is cheap enough to run once per turn from a cache.

### What review changed here (four rounds, 20 tests)
The resolver's whole job is to avoid a confident wrong answer, and that is exactly where every finding
landed. A fresh reviewer found that a stacked `-sN` branch reported the **previous sprint's** story, and
that the journal was not scoped to the epic. Three codex rounds on the consumer copy-ins then found: an
exact epic slug losing to a `-s<N>` suffix (`feat/aws-s3` → sprint 3 of `aws`); an unlisted newest id being
bypassed by an older commit, a mixed subject, or the journal; a stale `origin/main` pulling main's own
commits into `base..HEAD`; a malformed journal line turning a good branch into "not in flight"; and an
unreadable sprint borrowing the epic's phase. **Not one of these was caught by the original tests** — each
now has a regression test, and each fix was mutation-checked. The one that is worth remembering: fixing the
stale-base bug by comparing commit DATES passed the new test while still being wrong, because both
merge-bases shared a timestamp to the second. The mutation check is what exposed it; ancestry is the fix.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 6 is the one that protects trust.** The moment the build view shows a wrong story, people stop
reading it.
