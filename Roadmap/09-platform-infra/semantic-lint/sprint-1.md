---
epic: semantic-lint
sprint: 1
title: "The rail and rule 1, in shadow"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S1.1
    title: "`semantic-lint.mjs` and rules as data"
    as_a: "the product owner"
    i_want: "a rail that runs each rule's selector over a push's added lines and asks Jev only about the candidates"
    so_that: "a paraphrased rule break is caught without a Jev call on every line"
    risk: low
    status: planned
  - id: S1.2
    title: "Rule 1, measured"
    as_a: "a maintainer"
    i_want: "AGENTS rule 1 expressed as a rule with measured wording"
    so_that: "the judge's answers mean what we think they mean"
    risk: low
    status: planned
  - id: S1.3
    title: "In shadow on every push"
    as_a: "the product owner"
    i_want: "the pre-push hook to run it on changed files and never block"
    so_that: "we collect two weeks of real decisions before switching anything on"
    risk: low
    status: planned
---
# Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow) — Sprint 1: The rail and rule 1, in shadow

**Status:** ⬜ not started

## Stories

### Story 1.1 — `semantic-lint.mjs` and rules as data
**As** the product owner, **I want** a rail that runs each rule's selector over a push's added lines and asks Jev only about the candidates, **so that** a paraphrased rule break is caught without a Jev call on every line.
**Acceptance:** Rules load from the `lint` section; `RAILS` includes `lint`; mode, threshold and `shadowExpires` come from `jev.rails.lint`. No candidates → no Jev call. "Could not look" prints "not checked" and is logged, never counted as a pass. Decisions log as `rail: lint:<id>`. A registry row makes `gf doctor` show `lint.rules`. Ships in the kit closure.
**Risk:** low

### Story 1.2 — Rule 1, measured
**As** a maintainer, **I want** AGENTS rule 1 expressed as a rule with measured wording, **so that** the judge's answers mean what we think they mean.
**Acceptance:** Selector: added lines in `apps/web/**` and `supabase/migrations/**` matching writes to `events`/`features`, new tables, new routes, or analytics-vendor calls; allowlist: the track and features/sync routes, `apps/web/e2e/**`, `scripts/seed-*`. 10–20 labelled diffs (past real ones + constructed violations) recorded with `jev-eval --live`; the chosen wording's decided/right counts in a comment. The offline replay in `scripts-guard.yml` covers them.
**Risk:** low

### Story 1.3 — In shadow on every push
**As** the product owner, **I want** the pre-push hook to run it on changed files and never block, **so that** we collect two weeks of real decisions before switching anything on.
**Acceptance:** `.githooks/pre-push` (and the template's) run `semantic-lint.mjs` on the pushed diff; in shadow it logs and prints one summary line. `shadowExpires` is two weeks after merge, so `scripts-guard.yml` goes red if nobody decides. The hook still exits 0.
**Risk:** low

## Sprint QA
- `node --test` with a replay client (no key); the `jev-eval` offline replay in `scripts-guard.yml` covers the new fixtures.
- Owed to Daniel: read the shadow report on the `shadowExpires` date and decide promote / tune / drop.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. On a scratch branch, add `analytics.track('x')` to any file under `apps/web/app/api/`, commit, and `git push`.
   → the push goes through, and the hook prints one line naming `lint:rule-1` with Jev's probability.
2. Open `.jev/decisions.jsonl` in your checkout.
   → the last line has `"rail":"lint:rule-1"` for that push.
3. On another scratch branch, change only a file under `apps/web/e2e/` that writes to `events`, and push.
   → the hook says there was nothing to judge (no Jev call).
4. Run `TYPESAFE_API_KEY= git push` on the first branch again.
   → it prints "semantic-lint: not checked (no key)" and the push goes through.
5. Run `gf doctor`.
   → a `lint.rules` line is listed.

Delete both scratch branches afterwards. If any step fails, note the step number + what you saw — that's the bug report.
