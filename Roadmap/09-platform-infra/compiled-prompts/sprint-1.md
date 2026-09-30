---
epic: compiled-prompts
sprint: 1
title: "Questions as data, optimize/ committed"
risk: low
phase: Building
stories_total: 4
stories:
  - id: S1.1
    title: "Jev questions as data"
    as_a: "a maintainer"
    i_want: "every Jev question in one JSON file per rail, with its measurement beside it"
    so_that: "the kit and DSPy read one copy, and a wording change is a data diff with evidence"
    risk: low
    status: planned
  - id: S1.2
    title: "A recording remembers its wording"
    as_a: "a maintainer"
    i_want: "offline replay to fail when a question's text differs from the one its answers were recorded against"
    so_that: "an edited question can't pass CI on stale answers"
    risk: low
    status: planned
  - id: S1.3
    title: "`optimize/`, reproducing the spike"
    as_a: "a maintainer"
    i_want: "the ReAnchor harness committed and runnable with one command"
    so_that: "a refit on a model bump or doubled fixtures costs minutes, not a rebuild"
    risk: low
    status: planned
  - id: S1.4
    title: "The leak guard"
    as_a: "a plugin user"
    i_want: "nothing from `optimize/` in what I install"
    so_that: "I never need Python"
    risk: low
    status: planned
---
# Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured — Sprint 1: Questions as data, optimize/ committed

**Status:** ⬜ not started

## Stories

### Story 1.1 — Jev questions as data
**As** a maintainer, **I want** every Jev question in one JSON file per rail, with its measurement beside it, **so that** the kit and DSPy read one copy, and a wording change is a data diff with evidence.
**Acceptance:** `lib/jev-questions/review.json` and `prose.json` hold the questions in D2's shape; `review-guard` and `prose-guard` load them and hold no question text. Offline `jev-eval` stays green with zero re-recordings. The files ship in the kit closure and `check-template-drift` covers the root copy.
**Risk:** low

### Story 1.2 — A recording remembers its wording
**As** a maintainer, **I want** offline replay to fail when a question's text differs from the one its answers were recorded against, **so that** an edited question can't pass CI on stale answers.
**Acceptance:** Each recording carries a hash per question id; existing recordings are stamped in the same PR without a Jev call. Changing one word of a question makes `node scripts/jev-eval.mjs` fail, naming the question and "run --live". `jev-eval.test.mjs` covers both, and the new case was observed failing first.
**Risk:** low

### Story 1.3 — `optimize/`, reproducing the spike
**As** a maintainer, **I want** the ReAnchor harness committed and runnable with one command, **so that** a refit on a model bump or doubled fixtures costs minutes, not a rebuild.
**Acceptance:** `optimize/` holds `requirements.lock` (DSPy 3.4.x pinned), `extract.mjs` (per-fixture statistic from the real Node judges, with the parity check against the judge), `refit.py` (ReAnchor with a replay client, `require_cache=False`), and a README. `npm run optimize:refit` prints the 2026-09-28 table (review kept 0.85/0.30, prose kept 0.80, held-out 76 and 141) and writes a dated report under `optimize/reports/`; it proposes a `jev.config.json` diff only if held-out improves. The parity check's Node half runs in `node --test`.
**Risk:** low

### Story 1.4 — The leak guard
**As** a plugin user, **I want** nothing from `optimize/` in what I install, **so that** I never need Python.
**Acceptance:** `kit-tarball.test.mjs` and `check-plugin-leaks.mjs` fail if any `optimize/` path or a Python import reaches the kit, the plugin or the skills mirror.
**Risk:** low

## Build contract (locked by the architect before the builder started)

Cites the epic README's D1–D12; nothing here restates a rule that lives there.

1. **Commit order is the proof (D3).** First commit: add `lib/jev-questions.mjs` with `questionHash` only, and
   add the stale hook to review, prose and intent in `jev-eval.mjs`. Stamp every existing recording from the
   **current JS constants**, with no Jev call. Second commit: move the constants into the JSON (D2), with no
   fixture change. Offline `node scripts/jev-eval.mjs` stays `310/310` across both commits, and
   `git diff scripts/jev-eval.fixtures.json` in the second commit is empty.
2. **Files (both trees, byte-identical, D8):** `lib/jev-questions.mjs`, `lib/jev-questions/{review,prose,intent}.json`,
   `lib/jev-questions.test.mjs`; the edited `lib/review-guard.mjs`, `lib/prose-guard.mjs`, `intent-match.mjs`,
   `jev-eval.mjs`, `jev-eval.test.mjs`, `jev-eval.fixtures.json`.
3. **Loader rules:** `loadQuestions('review'|'prose'|'intent')` reads the JSON next to it (`import.meta.url`), and
   throws on an unknown set, an unknown key, a duplicate id, the wrong `criteria` shape for its `type`, or a
   missing `measured` without an `unmeasured` reason. The guards' exported constants deep-equal their
   pre-move values: a test pins this by hashing each loaded question against the recordings' stamps.
4. **Kit (D9):** the six SKILL.md `requires_scripts` lists gain `lib/jev-questions.mjs` + the JSON each one needs
   (review and prose files for the guard skills; intent for `groom` and `golden-frijoles`, which carry
   `intent-match.mjs`). `kit-tarball.test.mjs` asserts the four files are in the packed kit.
5. **`optimize/` (D4, D6):** `requirements.lock`, `extract.mjs` (drives `loadRails()` + `replayAsk()` from the
   **root** `scripts/jev-eval.mjs`, emits per-fixture statistics, and runs the parity check over a threshold
   grid), `extract.test.mjs` (the Node half, run by `test:unit`), `refit.py` (ReAnchor on a replay client with
   `require_cache=False`, review as two `Noul` fields with the `nextafter` shim, prose as four; writes
   `optimize/folds.json` from DSPy's `_folds`, plus a no-DSPy grid control), a `README.md` with the one-time
   setup, and `npm run optimize:refit`. The report goes to `optimize/reports/refit-<date>.md`. It proposes a
   `jev.config.json` diff only if held-out improves.
6. **Leak guard (1.4):** `check-plugin-leaks.mjs` gains a path rule (no shipped file under an `optimize/`
   directory, and no `.py`, `.pyc` or `requirements*` file) and a line rule (no shipped JS importing from an
   `optimize/` path or spawning `python`). Prose that mentions them stays allowed. `kit-tarball.test.mjs`
   asserts the packed file list has neither. Each new rule is observed failing once on a planted file.
7. **Release (D11):** plugin + kit `0.15.0`, CHANGELOG section.

## Sprint QA
- `node --test` (guards, `jev-eval`, parity half); `jev-eval` offline replay green with zero re-recordings.
- `kit-tarball` / `check-plugin-leaks` show no `optimize/`.
- One local `npm run optimize:refit` reproducing the spike table, its report committed.
- Browser smoke owed: none.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. In a checkout, run `node scripts/jev-eval.mjs`
   → green, and no recording changed (`git status` is clean).
2. Change one word in `scripts/lib/jev-questions/prose.json` and run it again
   → it fails and names the question and "run --live". Revert the word.
3. After the one-time setup in `optimize/README.md`, run `npm run optimize:refit`
   → it prints review 0.85/0.30 and prose 0.80 kept, held-out 76 and 141.

If any step fails, note the step number + what you saw — that's the bug report.
