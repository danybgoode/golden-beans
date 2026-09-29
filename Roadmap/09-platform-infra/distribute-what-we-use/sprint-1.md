---
epic: distribute-what-we-use
sprint: 1
title: "One review rail"
risk: high
phase: Shaping
stories_total: 3
stories:
  - id: S1.1
    title: "Superset review rail in the template"
    as_a: "a maintainer"
    i_want: "one `cross-agent-cli` + `cross-review` + `cross-review.prompt.md` + `review-config.json` in `skills/template/scripts/`, built as the superset of all three copies"
    so_that: "a reviewer fix is one PR, and no consumer loses behaviour it had"
    risk: high
    status: planned
  - id: S1.2
    title: "One doctor, and every fix instruction names it"
    as_a: "a user whose `agy` or `codex` moved past the pin"
    i_want: "`node scripts/cross-agent-doctor.mjs --fix` in the template, the same command every fix message prints"
    so_that: "the refused reviewer seat comes back without a hand-edited pin"
    risk: high
    status: planned
  - id: S1.3
    title: "Copy-back: this repo byte-equal, medusa-bonsai PR"
    as_a: "a maintainer"
    i_want: "this repo's `scripts/` and medusa-bonsai running the same rail bytes"
    so_that: "consumer gates find what the source can't, and the fork can't reopen"
    risk: high
    status: planned
---
# Distribute what we use — one review rail, Jev and notify setup, schedulers, build view — Sprint 1: One review rail

**Status:** ⬜ not started

## Stories

### Story 1.1 — Superset review rail in the template
**As** a maintainer, **I want** one `cross-agent-cli` + `cross-review` + `cross-review.prompt.md` + `review-config.json` in `skills/template/scripts/`, built as the superset of all three copies, **so that** a reviewer fix is one PR, and no consumer loses behaviour it had.
**Acceptance:** The lock's byte-compare of the three copies is recorded in this file. Every export from either in-repo copy exists in the superset (or is named as dropped, with the reason). Both consumers' **old** tests (`git show origin/main:<test>` into a temp file) pass against it; each failure was read and resolved, not deleted. `node --test` is green in `skills/` and at the root.
**Risk:** high

### Story 1.2 — One doctor, and every fix instruction names it
**As** a user whose `agy` or `codex` moved past the pin, **I want** `node scripts/cross-agent-doctor.mjs --fix` in the template, the same command every fix message prints, **so that** the refused reviewer seat comes back without a hand-edited pin.
**Acceptance:** `cross-agent-doctor.mjs` (+ its tests) exists in `skills/template/scripts/`. `agy-doctor.mjs` delegates to it. `grep -rn "agy-doctor\|cross-agent-doctor" skills/template scripts` names only files that exist. The pin marker is current (agy 1.2.12 or later).
**Risk:** high

### Story 1.3 — Copy-back: this repo byte-equal, medusa-bonsai PR
**As** a maintainer, **I want** this repo's `scripts/` and medusa-bonsai running the same rail bytes, **so that** consumer gates find what the source can't, and the fork can't reopen.
**Acceptance:** `cmp` of every review-rail file between `scripts/` and `skills/template/scripts/` prints nothing. A medusa-bonsai PR is open (or merged) with the same bytes, or the PR is named as owed if the repo was unreachable. `scripts/README.md`'s fork note is removed.
**Risk:** high

## Sprint QA
- `node --test` on both trees (root `scripts/` and `skills/`), including both consumers' old tests against the superset.
- Live check: S1's own PR is reviewed through the new rail (`node scripts/review-route.mjs --builder <who> <PR#>` then the routed passes). A silent reviewer is a failed run.
- Browser smoke owed: none.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. Open https://github.com/danybgoode/golden-frijoles/tree/main/skills/template/scripts
   → `cross-agent-doctor.mjs` is listed.
2. Open S1's pull request on https://github.com/danybgoode/golden-frijoles/pulls?q=distribute-what-we-use
   → it carries `cross-review/general` (and `cross-review/security`) statuses posted by the new rail.
3. In your checkout, run `node scripts/cross-agent-doctor.mjs`
   → one line per reviewer (codex, agy) saying installed version vs pin, and no crash.

If any step fails, note the step number + what you saw — that's the bug report.
