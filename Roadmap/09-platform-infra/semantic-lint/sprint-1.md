---
epic: semantic-lint
sprint: 1
title: "The rail and rule 1, in shadow"
risk: low
phase: Building
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

## Build contract (locked by the architect before the builder started)

Cites the epic README's lock (C1–C7, D1–D9); nothing here restates a rule that lives there.

- **1.1** — `skills/template/scripts/semantic-lint.mjs` (+ `.test.mjs`), byte-identical copy in `scripts/`
  (`check-script-parity.mjs`). Pure core: `parseLintRules` (D4), `parseDiff` → hunks, `selectCandidates` (D1),
  `outcomeOf(p, threshold)` (D2), `judgeCandidate` (one ask, D6/D7), `lintRun` (budget, caps, summary line — D9).
  `lib/jev.mjs`: `RAILS` + `DEFAULT_CONFIG.rails.lint` + the lint threshold keys (D3). `lib/config.mjs`: `SECTIONS`
  gains `lint`; `lib/config-registry.mjs`: the `lint.rules` row (D4). Every lib change lands in both trees.
- **1.2** — rule 1 in `golden-frijoles.config.json` (D4); 30 `lint` fixtures (C3, D8) — history candidates the
  selector really picks from `main`, labelled by hand, plus constructed violations and hard negatives; `jev-eval.mjs`
  learns the `lint` set (D8); the wording and threshold chosen by `--live`, with the decided/right counts in a comment
  above the question. `scripts-guard.yml` paths gain `golden-frijoles.config.json`.
- **1.3** — both `.githooks/pre-push` pass the pushed ranges and call the lint in the ADVISORY section, `|| true`
  (C6, D5); `pre-push-hook.test.mjs` pins that a failing lint never fails the push and that the ranges reach it.
  `jev.config.json` → `rails.lint` shadow to `2026-10-14` (D3). `jev-report.mjs` gains the `lint` summary (C5).
  Plugin 0.13.0 + CHANGELOG (C4).

**Mutation checks owed (each observed red once, then reverted):** the allowlist (an allowlisted file becomes a
candidate), not-checked-never-a-pass (a could-not-look scores as clear), the hook's `|| true` (a failing lint fails the
push), the question-hash replay guard (an edited question still replays green).

## Stories

### Story 1.1 — `semantic-lint.mjs` and rules as data
**As** the product owner, **I want** a rail that runs each rule's selector over a push's added lines and asks Jev only about the candidates, **so that** a paraphrased rule break is caught without a Jev call on every line.
**Acceptance:** Rules load from the `lint` section; `RAILS` includes `lint`; mode, threshold and `shadowExpires` come from `jev.rails.lint`. No candidates → no Jev call. "Could not look" prints "not checked" and is logged, never counted as a pass. Decisions log as `rail: lint:<id>`. A registry row declares `lint.rules` (`gf doctor` cannot list it — README C2). Ships in `template/scripts/`, not the kit closure (README C4).
**Risk:** low

### Story 1.2 — Rule 1, measured
**As** a maintainer, **I want** AGENTS rule 1 expressed as a rule with measured wording, **so that** the judge's answers mean what we think they mean.
**Acceptance:** Selector: added lines in `apps/web/**` (migrations included — README C7) matching writes to `events`/`features`, new tables, new routes, or analytics-vendor calls; allowlist: the track and features/sync routes, `apps/web/e2e/**`, `scripts/seed-*`. 30 labelled diffs (README C3) (past real ones + constructed violations) recorded with `jev-eval --live`; the chosen wording's decided/right counts in a comment. The offline replay in `scripts-guard.yml` covers them.
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
5. Run `node scripts/config.mjs get lint.rules`.
   → it prints rule 1 (`"id": "rule-1"`). *(Was `gf doctor`; disproved at the lock — README C2.)*

Delete both scratch branches afterwards. If any step fails, note the step number + what you saw — that's the bug report.
