---
epic: compiled-prompts
sprint: 2
title: "Measure a wording"
risk: low
phase: Locking architecture
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

## Build contract (locked by the architect before the builder started)

Cites the epic README's D6, D10 and D11.

1. **`optimize/wording.mjs`** takes `--rail prose --question <id> --candidates <file>`, plus `--yes` for a
   non-interactive run. It prints the live question count (current wording + each candidate × eligible
   sentences, where the families asked follow each fixture's evidence), and asks before sending unless
   `--yes` is given. It refuses without `jev.egress: true` and a key, the same as `jev-eval --live`.
2. **One live pass per wording, cached:** `optimize/.cache/wording/<questionHash>.json` holds the answers per
   fixture. A cached wording is never re-asked. The current wording is also served from the committed
   recordings, which D3's stamp proves are its answers, so it costs nothing.
3. **Scoring (D6):** every other family is replayed from the recordings, and the question under test is swapped
   through the real `judgeProse` (deps inject the question). Folds come from `optimize/folds.json`. The report
   has, per wording, the held-out right count per fold and in total (whole-draft), family accuracy, decided
   counts, the win verdict under D6's rule, and the informational refit column. It is written to
   `optimize/reports/wording-<question>-<date>.md`, with the raw numbers in a `.json` beside it.
4. **Tests:** `optimize/wording.test.mjs` with a replay client and no key. It covers the count, refusal without
   egress, the cache (a second run asks nothing), and the D6 win rule, including a one-fixture tie.
5. **2.2:** candidates are committed in `optimize/candidates/flag-state-claim.json` **before** the live run, which
   happens only after S1's release. The report is committed. A winner means a separate PR with the product
   owner's OK. Otherwise the seed gets `## Wording result` as a clean negative.

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
