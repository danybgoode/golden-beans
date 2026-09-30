---
epic: intent-match
sprint: 3
title: "Learning from what shipped"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S3.1
    title: "The close question"
    as_a: "the product owner"
    i_want: "every scored epic's retrospective to record whether we built what I meant"
    so_that: "each epic adds a label the score can learn from"
    risk: low
    status: planned
  - id: S3.2
    title: "`intent-outcomes.mjs` across repos"
    as_a: "the product owner"
    i_want: "one report joining each score with its answer and the derived corrections, across my projects"
    so_that: "I can see when there's enough data to set real thresholds"
    risk: low
    status: planned
  - id: S3.3
    title: "Backfill from both projects"
    as_a: "the product owner"
    i_want: "past epics from golden-frijoles and medusa-bonsai scored and answered"
    so_that: "we get a first read now instead of in months"
    risk: low
    status: planned
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 3: Learning from what shipped

**Status:** ⬜ not started

## Stories

### Story 3.1 — The close question
**As** the product owner, **I want** every scored epic's retrospective to record whether we built what I meant, **so that** each epic adds a label the score can learn from.
**Acceptance:** `templates/RETROSPECTIVE.md` gains `_Intent: yes | mostly | no_`. `epic-dod --check` fails a scored epic without it and ignores older epics. `epic-dod.test.mjs` covers both, and the new case was observed failing first.
**Risk:** low

### Story 3.2 — `intent-outcomes.mjs` across repos
**As** the product owner, **I want** one report joining each score with its answer and the derived corrections, across my projects, **so that** I can see when there's enough data to set real thresholds.
**Acceptance:** `--repo <path>` repeatable. Corrections are derived from files (stories added after scaffold, dated amendments, disproved scope), never self-reported. It prints one row per epic and "n of 20", and flags `ask: proxy` rows.
**Risk:** low

### Story 3.3 — Backfill from both projects
**As** the product owner, **I want** past epics from golden-frijoles and medusa-bonsai scored and answered, **so that** we get a first read now instead of in months.
**Acceptance:** A sample of 20–30 shipped epics (mixed across repos and sizes) is scored on each pitch as approved (from git), flagged `ask: proxy`; Daniel's yes/mostly/no answers are recorded; `intent-outcomes` shows them. medusa-bonsai runs under its own `jev.config.json`. *(Cut line: the medusa half goes second.)*
**Risk:** low

## Sprint QA
- `epic-dod.test.mjs` and `intent-outcomes` tests with fixture repos.
- Owed to Daniel: 20–30 yes/mostly/no answers (about fifteen minutes).
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

1. Run `node scripts/intent-outcomes.mjs --repo . --repo ../medusa-bonsai`
   → one row per scored epic from both projects, and a line saying how many of 20.
2. Close a scored epic without the `_Intent:` line and run `node scripts/epic-dod.mjs --check 09-platform-infra/<slug>`
   → it fails and names the missing line.

If any step fails, note the step number + what you saw — that's the bug report.
