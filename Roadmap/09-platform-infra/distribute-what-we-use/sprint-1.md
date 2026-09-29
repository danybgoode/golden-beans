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

## Build notes — what the old tests said, and what was done (S1.1, the D1 evidence)

The three-way byte-compare is in the README (*Architecture lock*). The superset was then run against **every
consumer's old tests**: ours from `origin/main`, the template's, and medusa-bonsai's from its `main` @ 7a7c709.
Every failure was read. None was deleted as superseded.

| Old test | Result against the superset | Resolution |
|---|---|---|
| ours `agy-doctor.test.mjs` (17) | 17/17 through the alias | none needed |
| medusa `cross-agent-doctor.{agy,codex}.test.mjs` (27) | 27/27 | adopted into both trees |
| medusa `lib/cross-agent-cli.test.mjs` (56) | 54/56 at first | `AGENTS.devin` missing → **devin kept as an explicit-only reviewer** (no consumer loses a behaviour); `AGY_PINNED === '1.2.8'` → the superset takes the newer verified 1.2.12, and the adopted copy asserts *constant = marker* instead, because `--fix` runs this suite right after it bumps |
| medusa `cross-review.test.mjs` (8), template `cross-review.test.mjs` (9) | one failure each at first | `buildComment(label, findings, fellBack, opts)` adopted as the signature (two of three copies); the older `(label, findings, opts)` shape still works and is pinned by a new test |
| medusa `cross-review.lens.test.mjs` | import error, then 3 failures | `resolveReviewModel` ported (the comment records the model). Three assertions changed **premise**: medusa read `~/.codex/config.toml` when `CODEX_MODEL` was unset; the superset pins the model execCodex actually passes, and `CODEX_MODEL=default` returns to the config, where medusa's null-on-unreadable rule still holds (pinned) |
| ours `lib/vibe-invocation.test.mjs` | 1 failure | **deliberate stance change** (D1, stricter wins): the read-only allow-list is removed; the test now pins `--disabled-tools '*'`, no `--auto-approve`, no tool named, and a disabled-tool request refused |
| template + medusa `lib/vibe-invocation.test.mjs` | file exits | their stub returns the bare word `findings`, which our stricter truncation guard (kept) rejects as not-a-review before the argv assertions run; the merged test uses a review-shaped stub and carries both copies' assertions |

**Found while building, fixed in S1:**
- The Vibe reviewer's allow-list could read `.env.local` into a public PR comment (the reason for D1's stricter-wins rule).
- The codex→agy heal could become a same-family review; it now re-checks the builder (`lib/codex-fallback-pairing.test.mjs`).
- **agy is signed out right now** (1.2.13 auto-updated mid-session). Both the old and the new doctor called that "contract
  broken, every model NOT LISTED" and spent a minute per probe waiting for a login. The doctor now says *could not
  look: signed out* in under a second (`isAgySignedOut`, observed failing first by mutation). **Owed to the product
  owner:** run `agy` once to sign in, then `node scripts/cross-agent-doctor.mjs agy --fix` (1.2.12 → 1.2.13).
- The shared lib named the product owner and the origin project in comments. The template's leak guard caught it
  (the copy-in is a gate); scrubbed in the source so both trees stay byte-equal.
- The marker anchor stays `// agy-doctor: last verified …` (README D2 amended).

Mutation checks: the pairing refusal, the Vibe tool filter and the signed-out branch were each removed and the
suite went red, then restored byte-for-byte.

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
