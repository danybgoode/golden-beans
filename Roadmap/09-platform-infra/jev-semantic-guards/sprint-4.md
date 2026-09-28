---
epic: jev-semantic-guards
sprint: 4
title: Rollout to both consumers
risk: high
phase: Shipped
stories_total: 3
stories:
  - id: S4.1
    title: Adopt in medusa-bonsai
    as_a: the product owner
    i_want: "the Jev files and the patched call sites in medusa-bonsai with `mode: shadow`"
    so_that: it produces live shadow traffic
    risk: high
    status: done
  - id: S4.2
    title: Adopt in golden-beans
    as_a: the product owner
    i_want: the same in golden-beans
    so_that: both consumers feed the log
    risk: high
    status: done
  - id: S4.3
    title: Routine key + shadow on
    as_a: the product owner
    i_want: routines that post reviews or reports to have the key
    so_that: cloud runs are measured too
    risk: high
    status: done
---
# Jev semantic guards — Sprint 4: Rollout to both consumers

**Status:** ✅ Shipped — foundation [#38](https://github.com/danybgoode/dobby-foundation/pull/38) (`6324350`) · medusa-bonsai [#191](https://github.com/danybgoode/miyagi-product-management/pull/191) + agy pin [#190](https://github.com/danybgoode/miyagi-product-management/pull/190) · golden-beans [#159](https://github.com/danybgoode/golden-beans/pull/159) · S4.3 routine key owed to the product owner (smoke item 3)

> Cross-repo. The review rail is forked in three repos (seed `review-rail-one-implementation`) — this sprint hand-patches each fork's single call site; it does not unify them.

## Stories

### Story 4.1 — Adopt in medusa-bonsai
**As the** product owner, **I want** the Jev files and the patched call sites in medusa-bonsai with `mode: shadow`, **so that** it produces live shadow traffic.
**Acceptance:** the consumer's OLD review-guard and prose-guard tests (from `origin/main`) run green against the new files; every copied file `cmp`-identical to the template; the one-line `cross-review.mjs` patch recorded in its `scripts/README.md` fork notes; `shadowExpires` set.
**Risk:** high

### Story 4.2 — Adopt in golden-beans
**As the** product owner, **I want** the same in golden-beans, **so that** both consumers feed the log.
**Acceptance:** same checks as 4.1 in golden-beans.
**Risk:** high

### Story 4.3 — Routine key + shadow on
**As the** product owner, **I want** routines that post reviews or reports to have the key, **so that** cloud runs are measured too.
**Acceptance:** which routines need `TYPESAFE_API_KEY` is listed in each consumer's routines README; provisioning the secret is **owed to the product owner** (account step); a routine without it logs `could-not-look` and behaves as today.
**Risk:** high

## Sprint QA
- **specs:** `node --test` beside each new module — Jev is injected (`fetch` stub), CI never calls the network
- **browser smoke owed:** no — no UI
- **deterministic gate:** `node --test template/scripts` + `node scripts/check-skill-scripts.mjs` + `node scripts/check-plugin-leaks.mjs` green before merge

## Sprint 4 — Smoke walkthrough (do these in order)
Env: a local checkout of the repo named in each step, with `TYPESAFE_API_KEY` in `.env.local`.

1. In medusa-bonsai, open the next PR and run the routed cross-review
   → the posted comment carries a `<!-- jev:` marker.
2. In golden-beans, run its standup in dry-run
   → `.jev/decisions.jsonl` gains `rail:"prose"` lines.
3. (owed to the product owner) add `TYPESAFE_API_KEY` to each routine listed in the routines README, then wait for the next nightly
   → the routine's PR comment carries a marker.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results — run 2026-09-23 (builder; real consumer checkouts, key in the env)

1. ✅ **The routed cross-review of each consumer's own S4 PR** ran through the shadow judge, and each posted
   comment carries the marker. Jev's `severity` matched what each reviewer actually wrote.
   ```
   medusa #191  agy : review guard: severity-structured findings — decided by regex (shadow; jev 0.92)
                      <!-- jev:{"mode":"shadow","decider":"regex","noul":0.92,"severity":"blocking","model":"jev-1.13.0"} -->
   medusa #191  vibe: … decided by regex (shadow; jev 0.95)   severity blocking
   golden #159  agy : … decided by regex (shadow; jev 0.91)   severity blocking
   golden #159  vibe: … decided by regex (shadow; jev 0.98)   severity should_fix ("No blocking… Should-fix: …")
   ```
2. ✅ **The prose rail in medusa.** I ran `standup.mjs --post --prose-file <draft> --dry-run --force-post`
   on a draft that paraphrases a deadline ("bless the new layout before the Thursday demo"). Nothing was
   sent.
   ```
   shadow → prose guard: decided by regex (shadow) — clean
            .jev/decisions.jsonl: prose shadow regex  regex: []  jev: ['invented-commitment']  0.98
   jev    → prose guard: decided by jev (jev) — invented-commitment   ⚠ flagged draft — invented-commitment
   ```
3. 🟡 **The routines: the key is not provisioned, and no routine is live.** This was read live with the
   routines API on 2026-09-23.
   - The four routines in the medusa consumer (prod smoke, standup, smoke triage, roadmap hygiene) are all
     **disabled**. They were switched off together on 2026-09-18.
   - Only the standup routine runs a guard.
   - All four share environment `env_01PeaBUebiXBSnn8L169k7aM`. The routines API can't write that
     environment's secrets or network allow-list; it is an account step.
   - Each consumer's `scripts/routines/README.md` now names the routines that need `TYPESAFE_API_KEY` and
     `api.typesafe.ai` on the allow-list.
   - Without them a routine logs `jev could not look (no key)` and decides exactly as before. That is
     proven by the specs `no key behaves exactly as off` and `could-not-look falls back`.
   - **Owed to the product owner:** when the routines are re-enabled, add both to that one environment.

**Verification in each consumer:**

| | medusa | golden-beans |
|---|---|---|
| its OLD guard specs from `origin/main`, run against the new files | 57 / 57 | byte-identical to the template, pass within the suite |
| full `scripts/` suite | 1084 / 1084 | 872 / 872 |
| `jev-eval` offline replay | 138 / 138 | 138 / 138 |
| `cmp` against the template | 20 rails, no drift | 13 rails, no drift |
| skill contract | clean | clean |
| lint / format | — | ESLint `--max-warnings=0` clean, Prettier clean on added files |

The fixtures file goes in golden-beans' `.prettierignore`: it is machine-written and byte-identical to the
template, like `package-lock.json`.

**Found and fixed on the way:**
- **Both consumers' review rails refused the S4 diff: 315 KB, over the 256 KB argv cap.** The cause was
  `jev-eval.fixtures.json`. All three review rails (template and both forks) now strip it as generated
  data, the same way they strip `reports-data.json`.
- **golden-beans' agy pin was stale (1.2.7).** It was bumped to 1.2.8 by `agy-doctor --fix` on a green
  probe. medusa's bump was #190.
- **Incident: a golden-beans pre-push from a worktree rewrote that repo's local git state.**
  - **What happened:** an unsealed spec fixture (`build-state.test.mjs`, from the previous epic) ran
    `git init` / `config` / `commit` under the hook's inherited `GIT_DIR`.
  - **The damage:** `core.bare=true`, identity `t <t@t>`, three junk commits on local `main`, and a stray
    `claude/session-journal`. Nothing was pushed.
  - **The fix:** dobby-foundation #37 seals the fixture and the resolver. `git-fixtures-sealed.test.mjs`
    now fails any spec that builds a git fixture unsealed. This was the third time this leak happened, and
    the first time it was fixed as a class.
  - **The local repair of golden-beans' `.git`** was blocked by the auto-mode classifier. It is owed to the
    product owner; the commands are in the epic README.

