---
epic: jev-semantic-guards
sprint: 3
title: Prose guard on Jev (semantic families)
risk: low
phase: Shipped
stories_total: 2
stories:
  - id: S3.1
    title: judgeProse() in prose-guard.mjs
    as_a: the reporting rail
    i_want: "the four semantic families — unsupported fix claim, invented beneficiary, flag-state claim, invented commitment — judged by one batched Jev call (one Noul per sentence per family, evidence pack as `state`)"
    so_that: honest negations stop tripping the guard and paraphrased inventions stop slipping past it
    risk: low
    status: done
  - id: S3.2
    title: Wire the prose callers
    as_a: the product owner
    i_want: prose-writer, standup and weekly-recap to use the judge
    so_that: every report and retro draft is guarded the same way
    risk: low
    status: done
---
# Jev semantic guards — Sprint 3: Prose guard on Jev (semantic families)

**Status:** ✅ Shipped — merged to `main` in [#36](https://github.com/danybgoode/dobby-foundation/pull/36) (`2bbb970`) · the fixture-leak fix [#37](https://github.com/danybgoode/dobby-foundation/pull/37) (`920a6c9`)

## Stories

### Story 3.1 — `judgeProse()` in `prose-guard.mjs`
**As the** reporting rail, **I want** the four semantic families — unsupported fix claim, invented beneficiary, flag-state claim, invented commitment — judged by one batched Jev call (one Noul per sentence per family, evidence pack as `state`), **so that** honest negations stop tripping the guard and paraphrased inventions stop slipping past it.
**Acceptance:** mechanical rules (length, banned phrases, tool names, unfinished) stay in code and always run; `checkProse` byte-unchanged and every existing prose-guard spec passes; `jev` mode emits the same finding codes and revision notes, quoting the offending sentence; claim threshold `noul ≥ 0.5`, regex per-family fallback on could-not-look; invented-commitment still has no evidence flag that disables it.
**Risk:** low

### Story 3.2 — Wire the prose callers
**As the** product owner, **I want** prose-writer, standup and weekly-recap to use the judge, **so that** every report and retro draft is guarded the same way.
**Acceptance:** `prose-writer.mjs` default `guard` becomes the async judge (the retry loop awaits it); `standup.mjs:555` and `weekly-recap.mjs:472` await it; each decision logged with `rail:"prose"`; a draft that the regex rejected and Jev accepts in `shadow` still takes the revision pass (regex decides in shadow).
**Risk:** low

## Sprint QA
- **specs:** `node --test` beside each new module — Jev is injected (`fetch` stub), CI never calls the network
- **browser smoke owed:** no — no UI
- **deterministic gate:** `node --test template/scripts` + `node scripts/check-skill-scripts.mjs` + `node scripts/check-plugin-leaks.mjs` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
Env: a local checkout of the repo named in each step, with `TYPESAFE_API_KEY` in `.env.local`.

1. Run `node scripts/jev-eval.mjs --live --rail prose`
   → per-family accuracy printed, incl. the "rather than anything a shopper would see" negation case scored as allowed.
2. With `rails.prose.mode: shadow`, run `node scripts/standup.mjs --dry-run`
   → the draft prints; `.jev/decisions.jsonl` gains `rail:"prose"` lines.
3. Set `mode: jev`, re-run step 2
   → stderr names `jev` as the decider for each semantic family.

If any step fails, note the step number + what you saw — that's the bug report.

### Smoke results — run 2026-09-23 (builder, worktree `feat/jev-semantic-guards-s3`)

1. ✅ `node scripts/jev-eval.mjs --live --rail prose` gives per-family accuracy on 62 labelled drafts:
   ```
   prose: 62 labelled · jev 96.8% · regex 85.5% · 11 disagreement(s)
     unsupported-fix-claim    jev 100.0% · regex 96.8%
     invented-beneficiary     jev 98.4% · regex 96.8%
     flag-state-claim         jev 98.4% · regex 96.8%
     invented-commitment      jev 100.0% · regex 95.2%
   ```
   The "rather than anything a shopper would see" negation is fixture `no-impact-shopper`. Jev scores it
   allowed.
2–3. ➡️ These run in the consumers in Sprint 4, where a real `reporting.config.json` exists. The form is
   `standup.mjs --post --prose-file <draft> --dry-run`, which judges and prints but never sends. The
   stderr line `prose guard: decided by <jev|jev+regex|regex> (<mode>) — <codes|clean>` is new in this
   sprint.

**The wording was measured, not guessed.** Whole-draft accuracy on the 62 fixtures:

| wording | Jev | regex |
|---|---|---|
| first draft | 48 / 62 | 53 / 62 |
| **shipped** | **59–60 / 62**, run to run | 53 / 62 |

The first liveness question flagged 12 sentences that only describe behaviour ("now groups", "no longer
breaks"). The shipped wording separates *release state* from *behaviour*. A threshold sweep from 0.4 to
0.7 moved the result by one case either way, which is noise, so the claim threshold stays 0.5 until S5.2.

**What Jev does NOT decide:** the evidence. `allowsFixClaim` and `allowsBeneficiary` still skip those
families, and a liveness claim is still cleared only by a `liveFlags` token in the same sentence. Jev
judges whether a sentence *asserts* liveness, and code judges whether the pack *corroborates* it.

**Scope correction (D7):** the live code has five prose callers, not three. `prose-draft.mjs` and
`merge-report.mjs` call `writeProse`, which is now async, so they changed too. The writer specs inject
`checkProse` explicitly, so a consumer's `jev.config.json` can never send a unit test to the network.

**Mutation check:** each of these was applied on its own and caught:
- corroboration removed
- evidence gating removed
- shadow deciding by Jev
- no per-family fallback
- no chunking
- the threshold ignored
- the writer not awaiting the guard

**Byte-identity:** `checkProse` and `prose-guard.test.mjs` are byte-identical to `main`. The only change to
the existing guard code is the `export` keyword on `sentences()`.

