---
epic: jev-semantic-guards
sprint: 1
title: Client, config, decision log and eval harness
risk: low
phase: Shipped
stories_total: 4
stories:
  - id: S1.1
    title: Jev client (template/scripts/lib/jev.mjs)
    as_a: a rail author
    i_want: "one zero-dep function that asks Jev typed questions and returns `{ok, answers, usage}` or `{ok:false, state:\"could-not-look\", error}`"
    so_that: "no rail ever mistakes \"Jev was unreachable\" for a verdict"
    risk: low
    status: done
  - id: S1.2
    title: Config + kill-switch (jev.config.json)
    as_a: the product owner
    i_want: "one committed file with per-rail `mode: off | shadow | jev`, thresholds, `model`, `shadowExpires` and `egress`"
    so_that: turning Jev off, on or into shadow is a one-line reviewed diff
    risk: low
    status: done
  - id: S1.3
    title: Decision log (.jev/decisions.jsonl)
    as_a: the product owner
    i_want: every guard decision recorded with who decided
    so_that: "a corpus of real disagreements exists — today rejected replies and drafts only reach stderr"
    risk: low
    status: done
  - id: S1.4
    title: Eval harness + shadow expiry (scripts/jev-eval.mjs)
    as_a: a builder bumping the model or thresholds
    i_want: a labelled fixture set replayed against recorded responses
    so_that: a bump is proven before it lands and shadow cannot rot
    risk: low
    status: done
---
# Jev semantic guards — Sprint 1: Client, config, decision log and eval harness

**Status:** ✅ Shipped — merged to `main` in [#34](https://github.com/danybgoode/dobby-foundation/pull/34) (`1f2290a`)

## Stories

### Story 1.1 — Jev client (`template/scripts/lib/jev.mjs`)
**As a** rail author, **I want** one zero-dep function that asks Jev typed questions and returns `{ok, answers, usage}` or `{ok:false, state:"could-not-look", error}`, **so that** no rail ever mistakes "Jev was unreachable" for a verdict.
**Acceptance:** no key / 401 / 422 / 429 / 529 / timeout / >32k state each return `could-not-look` (spec per case, injected `fetch`); 429/529 retry with exponential backoff (max 2); model comes from config and defaults to the pinned `jev-1.13.0`; key read from env, falling back to `.env.local`.
**Risk:** low

### Story 1.2 — Config + kill-switch (`jev.config.json`)
**As the** product owner, **I want** one committed file with per-rail `mode: off | shadow | jev`, thresholds, `model`, `shadowExpires` and `egress`, **so that** turning Jev off, on or into shadow is a one-line reviewed diff.
**Acceptance:** the template ships `jev.config.example.json` with both rails `off`; a malformed config fails loud (never silently `off`); `egress:false` or a missing key behaves exactly as `off`; values are TEMPLATE FILL-INs, no consumer names.
**Risk:** low

### Story 1.3 — Decision log (`.jev/decisions.jsonl`)
**As the** product owner, **I want** every guard decision recorded with who decided, **so that** a corpus of real disagreements exists — today rejected replies and drafts only reach stderr.
**Acceptance:** one JSONL line per decision: `{rail, mode, decider, regex, jev, confidence, textHash, text (truncated 4k), sha?, ts}`; `.jev/` and `.env*.local` added to `template/.gitignore`; a write failure warns and never changes the decision.
**Risk:** low

### Story 1.4 — Eval harness + shadow expiry (`scripts/jev-eval.mjs`)
**As a** builder bumping the model or thresholds, **I want** a labelled fixture set replayed against recorded responses, **so that** a bump is proven before it lands and shadow cannot rot.
**Acceptance:** `jev-eval.fixtures.json` holds ≥30 labelled cases per rail incl. both 2026-09-19 review cases; `node scripts/jev-eval.mjs` passes offline in CI; `--live` re-scores against the API and rewrites the recordings; CI fails when any rail is `shadow` past its `shadowExpires` date (default: 21 days after it was set).
**Risk:** low

## Sprint QA
- **specs:** `node --test` beside each new module — Jev is injected (`fetch` stub), CI never calls the network
- **browser smoke owed:** no — no UI
- **deterministic gate:** `node --test template/scripts` + `node scripts/check-skill-scripts.mjs` + `node scripts/check-plugin-leaks.mjs` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)
Env: a local checkout of the repo named in each step, with `TYPESAFE_API_KEY` in `.env.local`.

1. Run `node --test template/scripts/lib/jev.test.mjs`
   → all specs pass without network access.
2. Run `node scripts/jev-eval.mjs`
   → "offline: N/N fixtures match recordings".
3. Run `node scripts/jev-eval.mjs --live`
   → per-rail accuracy printed; the two 2026-09-19 review cases score correctly.
4. Set a rail to `shadow` with `shadowExpires` yesterday, run `node scripts/jev-eval.mjs`
   → exits non-zero naming the expired rail.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results — run 2026-09-22 (builder, worktree `feat/jev-semantic-guards`)

1. ✅ `node --test template/scripts/lib/jev.test.mjs` → 26/26 pass, no network: every could-not-look case
   (no key, 401, 422, 500, 429/529 after two backoff retries, timeout, network error, over-budget state,
   unparseable body, missing answer) is its own spec with an injected `fetch`.
2. ✅ `node template/scripts/jev-eval.mjs` → `offline: 0/0 fixtures match recordings`, exit 0. The fixture set
   is filled by S2.1 (review) and S3.1 (prose), because the recordings are answers to *their* questions.
3. ➡️ `--live` moves to S2/S3: it has nothing to score until the judges exist. Its results are recorded there.
4. ✅ With `rails.review` set to `shadow` and `shadowExpires: 2026-09-21`, the run exits 1 with
   `✗ rails.review has been in shadow past its shadowExpires (2026-09-21) — promote it to jev or set it off.`
   CI runs it in both the foundation workflow and the template's `guards.yml`, unconditionally, since
   expiry is a date and not a diff.

**Mutation check:** each of these was applied on its own and caught by at least 3 failing specs:
- zero retries
- no shadow-expiry requirement
- egress ignored
- alias model allowed
- a log failure reported as success
- an inverted expiry comparison

**Live API probe:** `curl` with this machine's key, where the timed-out banner scored `is_real_review = 0.10`
in 0.45 s.

