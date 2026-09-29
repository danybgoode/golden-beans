---
epic: distribute-what-we-use
sprint: 1
title: "One review rail"
risk: high
phase: Building
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

**Status:** 🟨 in progress

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
**Acceptance:** `cmp` of every review-rail **code** file (the four project-owned prompt/config files excepted — README deviation 1) between `scripts/` and `skills/template/scripts/` prints nothing. A medusa-bonsai PR is open (or merged) with the same bytes, or the PR is named as owed if the repo was unreachable. `scripts/README.md`'s fork note is removed.
**Risk:** high

## Build contract (locked by the architect before the builder started)
Builds **D1, D2, D3** (README → *Architecture lock*). Builder: Claude (orchestrator). Nothing is delegated.
- **Superset base = `scripts/lib/cross-agent-cli.mjs` + `scripts/cross-review.mjs` (ours).** Imported by name: the
  template's `readSection('review')` loader and codex auth fallback, and medusa's `isCodexOutdated` / `cliOutdated` /
  nullable `CODEX_MODEL` / doctor-naming fix messages. Stricter-wins on vibe (no host tools) and fallback pairing (D1).
- **Exports:** the result exports all 52 names in the union. None is dropped.
- **Old tests, both consumers:** our `origin/main` tests (`cross-review*.test.mjs`, `cross-agent-pairing`,
  `agy-doctor`, `lib/{file-context,transient-agy-error,vibe-invocation,prose-writer}.test.mjs`), the template's
  (`cross-review.test.mjs`, `lib/vibe-invocation.test.mjs`) and medusa's (`lib/cross-agent-cli.test.mjs`,
  `cross-review{,.lens}.test.mjs`, `cross-agent-doctor.{agy,codex}.test.mjs`) run against the superset from a
  temp copy. Each failure is resolved by a code change, or by a test edit **with the reason recorded below**
  (a deliberate stance change, such as vibe's tools).
- **Byte-equal after S1 (code):** `cross-review.mjs`, `lib/cross-agent-cli.mjs`, `cross-agent-doctor.mjs`,
  `agy-doctor.mjs`, and their tests, between `scripts/` and `skills/template/scripts/`. Project-owned, **not**
  byte-equal: the three prompts and `review-config.json` (deviation 1).
- **Release:** plugin + kit version bump + CHANGELOG entry in this PR (D9).
- **medusa-bonsai:** PR with the same code bytes, opened after this PR merges and its kit version returns 200.

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
