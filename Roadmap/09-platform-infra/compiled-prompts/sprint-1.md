---
epic: compiled-prompts
sprint: 1
title: "Questions as data, optimize/ committed"
risk: low
phase: Shaping
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
