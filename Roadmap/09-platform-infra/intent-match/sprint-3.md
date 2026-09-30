---
epic: intent-match
sprint: 3
title: "Learning from what shipped"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S3.1
    title: "The close question"
    as_a: "the product owner"
    i_want: "every scored epic's retrospective to record whether we built what I meant"
    so_that: "each epic adds a label the score can learn from"
    risk: low
    status: done
  - id: S3.2
    title: "`intent-outcomes.mjs` across repos"
    as_a: "the product owner"
    i_want: "one report joining each score with its answer and the derived corrections, across my projects"
    so_that: "I can see when there's enough data to set real thresholds"
    risk: low
    status: done
  - id: S3.3
    title: "Backfill from both projects"
    as_a: "the product owner"
    i_want: "past epics from golden-frijoles and medusa-bonsai scored and answered"
    so_that: "we get a first read now instead of in months"
    risk: low
    status: done
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 3: Learning from what shipped

**Status:** 🟦 In review

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

## As built (2026-09-30)

- **3.1** `templates/RETROSPECTIVE.md` gains `_Intent: yes | mostly | no_` (a one-word answer, the product owner's).
  `epic-dod` gains `intent-answered` in all three copies: a scored epic (numeric `intent_match:` in its README or
  seed) needs the line answered; an unscored one passes as "not scored". Five specs, **seen failing before the item
  existed**. Live: `one-roadmap` (unscored) passes; this epic (scored, 84) fails naming the missing line.
- **3.2** `intent-outcomes.mjs` (+12 specs over fixture repos with real, SEALED git; five mutations each killed a
  spec). `--repo` repeatable; the score from README, then seed, then `intent-backfill.json`; the answer from the retro;
  corrections derived from files. "Stories added" is `?` for READMEs that predate the `stories_total` field — unknown,
  never zero.
- **3.3 The backfill.** **23 shipped epics** scored on the seed as approved, with a proxy ask and claims split by the
  builder: **17 golden-frijoles** (`Roadmap/00-ideas/intent-backfill.json`, 64–98) and **6 medusa-bonsai**
  (danybgoode/miyagi-product-management#198, under that repo's own `jev.config.json`, 83–98). The proxy rule had to
  be corrected (C6, README): only 12 of 63 medusa seeds carry a recoverable ask at all.
  `intent-outcomes --repo . --repo ../medusa-bonsai` shows **24 scored rows, 0 of 20 answered** — the answers are
  owed to the product owner.

## Sprint QA
- `epic-dod.test.mjs` and `intent-outcomes` tests with fixture repos.
- Owed to Daniel: 20–30 yes/mostly/no answers (about fifteen minutes).
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

1. From a golden-frijoles checkout (with medusa-bonsai beside it and its #198 merged):
   `node scripts/intent-outcomes.mjs --repo . --repo ../medusa-bonsai`
   → one row per scored epic from both projects (`proxy ⚑` on every backfilled one), and a line starting
   `0 of 20:` until the answers below are in. *Ran 2026-09-30 against the branches: 24 rows.*
2. `node scripts/epic-dod.mjs --check 09-platform-infra/intent-match` before this epic's retro is answered
   → `✗ intent-answered … the retrospective needs _Intent: yes | mostly | no_ answered`. *Ran 2026-09-30.*
3. `node scripts/epic-dod.mjs --check 09-platform-infra/one-roadmap` → `✓ intent-answered … not scored`.
4. **Owed to Daniel (about fifteen minutes):** for each epic in step 1's table, add one line under `_Closed:` in its
   `RETROSPECTIVE.md`: `_Intent: yes_`, `_Intent: mostly_` or `_Intent: no_` — did we build what you meant? Re-run
   step 1: the footer counts them toward 20.

If any step fails, note the step number + what you saw — that's the bug report.
