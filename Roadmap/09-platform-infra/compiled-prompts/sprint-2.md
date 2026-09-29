---
epic: compiled-prompts
sprint: 2
title: "Measure a wording"
risk: low
phase: Shaping
stories_total: 2
stories:
  - id: S2.1
    title: "The wording harness"
    as_a: "a maintainer"
    i_want: "to test candidate wordings for one question against the current one on held-out data"
    so_that: "a question changes only when it measurably decides better"
    risk: low
    status: planned
  - id: S2.2
    title: "First run: `flag-state-claim`"
    as_a: "the product owner"
    i_want: "the prose rail's worst question tested against 3 to 5 better-argued wordings"
    so_that: "the 19 errors it causes shrink, or we learn the fix is evidence rather than wording"
    risk: low
    status: planned
---
# Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured — Sprint 2: Measure a wording

**Status:** ⬜ not started

## Stories

### Story 2.1 — The wording harness
**As** a maintainer, **I want** to test candidate wordings for one question against the current one on held-out data, **so that** a question changes only when it measurably decides better.
**Acceptance:** `node optimize/wording.mjs --rail prose --question flag-state-claim --candidates <file>` prints the question count and asks before sending; asks each candidate live once per eligible sentence, cached by wording hash (a re-run is free); scores the current wording and each candidate on the spike's 5 seeded folds; writes a report with held-out right/decided per candidate. `node --test` covers it with a replay client.
**Risk:** low

### Story 2.2 — First run: `flag-state-claim`
**As** the product owner, **I want** the prose rail's worst question tested against 3 to 5 better-argued wordings, **so that** the 19 errors it causes shrink, or we learn the fix is evidence rather than wording.
**Acceptance:** Candidates are written and committed before the run. The report is committed under `optimize/reports/`. If a candidate strictly wins held-out, a separate PR changes `prose.json` (with its `measured` block) and re-records the fixtures with `jev-eval --live`, merged only with the product owner's OK; otherwise the seed gets a `## Wording result` clean negative.
**Risk:** low

## Sprint QA
- `node --test` with a replay client (no key); one live run, its report committed.
- Owed to Daniel: read the report and approve or reject the winning wording.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. Run `node optimize/wording.mjs --rail prose --question flag-state-claim --candidates optimize/candidates/flag-state-claim.json`
   → it prints how many questions it will ask and waits for yes.
2. Answer yes, then run the same command again
   → the second run asks Jev nothing (all cached) and prints the same table.
3. Open the newest file in `optimize/reports/`
   → held-out right/decided for the current wording and each candidate, and which one (if any) wins.

If any step fails, note the step number + what you saw — that's the bug report.
