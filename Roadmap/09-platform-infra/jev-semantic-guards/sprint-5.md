---
epic: jev-semantic-guards
sprint: 5
title: "Promotion — Jev decides, regex becomes fallback"
risk: high
phase: Shipped
stories_total: 3
stories:
  - id: S5.1
    title: Agreement report + labels (scripts/jev-report.mjs)
    as_a: the product owner
    i_want: a report of every regex/Jev disagreement from the logs and PR markers across all three repos
    so_that: I label only the cases that matter
    risk: high
    status: done
  - id: S5.2
    title: Set thresholds from data
    as_a: a builder
    i_want: thresholds tuned against the labelled set
    so_that: production uses measured values, not starting guesses
    risk: high
    status: done
  - id: S5.3
    title: "Flip to jev everywhere; regex is fallback-only"
    as_a: the product owner
    i_want: "`mode: jev` in the template and both consumers"
    so_that: Jev decides in production and the regexes run only when Jev cannot
    risk: high
    status: done
---
# Jev semantic guards — Sprint 5: Promotion — Jev decides, regex becomes fallback

**Status:** ✅ Shipped — foundation [#39](https://github.com/danybgoode/dobby-foundation/pull/39) (`692ebcf`) + follow-ups [#40](https://github.com/danybgoode/dobby-foundation/pull/40) (`c6843ce`), [#41](https://github.com/danybgoode/dobby-foundation/pull/41) (`7944b34`), [#42](https://github.com/danybgoode/dobby-foundation/pull/42) (`6146847`) · medusa-bonsai [#192](https://github.com/danybgoode/miyagi-product-management/pull/192), [#193](https://github.com/danybgoode/miyagi-product-management/pull/193) · golden-beans [#160](https://github.com/danybgoode/golden-beans/pull/160)

> **Wave 2 — re-bet at the boundary.** Starts when shadow has run its course (≥50 decisions per rail or the `shadowExpires` date, whichever first). Not optional: the CI expiry fails otherwise.

## Stories

### Story 5.1 — Agreement report + labels (`scripts/jev-report.mjs`)
**As the** product owner, **I want** a report of every regex/Jev disagreement from the logs and PR markers across all three repos, **so that** I label only the cases that matter.
**Acceptance:** `node scripts/jev-report.mjs` prints per rail: decisions, agreement %, uncertain %, could-not-look %, and a disagreement table with a `label:` column; labelled rows are appended to `jev-eval.fixtures.json`.
**Risk:** high

### Story 5.2 — Set thresholds from data
**As a** builder, **I want** thresholds tuned against the labelled set, **so that** production uses measured values, not starting guesses.
**Acceptance:** `jev-eval --live` shows Jev ≥ regex accuracy on the labelled disagreements per rail; chosen thresholds committed with the report linked in the epic README.
**Risk:** high

### Story 5.3 — Flip to `jev` everywhere; regex is fallback-only
**As the** product owner, **I want** `mode: jev` in the template and both consumers, **so that** Jev decides in production and the regexes run only when Jev cannot.
**Acceptance:** all three repos `mode: jev`, no rail in `shadow`; the template default becomes `jev` when a key is present; prose-guard and review-guard header comments rewritten to say the regex families are the offline fallback; LEARNINGS gets one entry on what the measurement found.
**Risk:** high

## Sprint QA
- **specs:** `node --test` beside each new module — Jev is injected (`fetch` stub), CI never calls the network
- **browser smoke owed:** no — no UI
- **deterministic gate:** `node --test template/scripts` + `node scripts/check-skill-scripts.mjs` + `node scripts/check-plugin-leaks.mjs` green before merge

## Sprint 5 — Smoke walkthrough (do these in order)
Env: a local checkout of the repo named in each step, with `TYPESAFE_API_KEY` in `.env.local`.

1. Run `node scripts/jev-report.mjs`
   → the per-rail summary and a disagreement table print.
2. In each repo, run `grep -A2 '"review"\|"prose"' jev.config.json`
   → both rails read `"mode": "jev"`.
3. Remove the key temporarily and run a cross-review dry-run
   → stderr says `decided by regex: jev could not look (no key)` and the result matches today's behaviour.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results — run 2026-09-23 (builder; production checkouts)

1. ✅ `node scripts/jev-report.mjs` ran over every shadow decision. The full report, with the labelled
   disagreements, is [`shadow-report-2026-09-23.md`](shadow-report-2026-09-23.md).
   ```
   | review | 663 | 99.7% | 0.5% | 0.0% | 2 |
   | prose  | 187 | 56.1% | —    | 0.0% | 82 |
   ```
2. ✅ All three repos read `"mode": "jev"` for both rails, and no rail is in `shadow`:
   - the template, `template/jev.config.json`
   - medusa-bonsai, `jev.config.json` (#192)
   - golden-beans, `jev.config.json` (#160)
3. ✅ **Keyless fallback.** This ran in medusa-bonsai's own `main` checkout with no key (`env -u TYPESAFE_API_KEY`):
   ```
   ok= true | decider= regex | severity-structured findings — decided by regex: jev could not look (no TYPESAFE_API_KEY)
   ```
   The result matches today's behaviour exactly, and that includes accepting the timed-out banner.
   **With the key added** to that checkout's gitignored `.env.local`, the same banner gives:
   ```
   ok= false | decider= jev | the reviewer's reply is not a review — decided by jev (0.05)
   ```

**Live production decisions by Jev on routed reviews:**
- medusa #192: `a real review (should_fix) — decided by jev (0.91)` and `(clean) — decided by jev (0.97)`
- golden-beans #160: `(clean) — decided by jev (0.97)` and `(should_fix) — decided by jev (0.95)`

Every marker carries `regexOk`, so the report sees Jev-only passes as disagreements.

**The flip gate (S5.2)** is Jev ≥ regex on labelled data, per rail and per family:
- review 98.7% vs 87.0% (77 cases)
- prose 86.5% vs 71.2% (163 cases)

The thresholds were set from a sweep over the recordings: review real 0.85 / not-real 0.3, prose claim 0.8.

**LEARNINGS** carries the measurement finding. The follow-ups from review, all merged, were:
- markers carry the regex's own verdict
- harvest provenance, so forged comments are not evidence
- could-not-look markers are counted
- an empty report fails

