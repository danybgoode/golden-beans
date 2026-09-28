---
title: "Jev semantic guards: review-guard and prose-guard decide with Jev, not regex"
slug: jev-semantic-guards
status: shipped
area: "09"
type: feature
priority: wave-2026-09-19
appetite: L
underwritten_by: wave-2026-09-19
risk: high
epic: "09-platform-infra/jev-semantic-guards"
build_order: 33
updated: 2026-09-19
---

# Pitch: Jev semantic guards

Origin: Bet 1 in [`audits/jev-fit-audit-2026-09-19.md`](../audits/jev-fit-audit-2026-09-19.md).
Class **Feature**, archetype **Grower** (acceptance is tied to a measured signal, not only "it works"). Lane:
**shaped bet**.

## Problem

Two guards in the review and reporting rails make *language* judgements with regexes:

- **`review-guard.assertReviewOutput`** decides whether an external reviewer actually reviewed. When it
  says no, the PR's `cross-review/<lens>` status fails. On 2026-09-19 it **rejected** a real finding written
  in prose and **accepted** `## Findings (reviewer timed out…)`. Jev got both right, but that is two samples,
  so treat it as anecdotal.
- **`prose-guard.checkProse`** blocks invented claims in standups, weekly recaps and merge reports: fixes,
  beneficiaries, liveness and commitments. It uses about 15 hand-tuned regex families, each with an incident
  comment explaining the phrasing it missed last time. Every false positive costs a frontier-model
  revision pass, and every false negative posts a falsehood.

The product owner's call (2026-09-19): **Jev becomes the decider in production.** A shadow period is
allowed only as a short, expiring measurement step, never as a permanent "regex and Jev together". The
regexes survive only as the offline fallback for when Jev can't be reached.

## Appetite

**L: two waves, re-bet at the boundary.** Wave 1 builds the client, both rails in shadow and the rollout to
both consumers. Wave 2 promotes Jev to decider and retires the semantic regexes to fallback-only. If wave 1
runs out, S4 (rollout) is what gets cut. Promotion is never cut, because it is the point of the bet.

## Outcome & signal

After this ships, in all three repos: the semantic questions in both guards are answered by Jev
(`jev-1.13.0`, pinned). The regexes run only when Jev could not be reached. A committed eval set proves each
model bump before it lands.

**Signal:** on the product owner's hand-labelled disagreements from the shadow log, Jev is right more often
than the regex. **Rot guard:** CI fails when any rail has been in `shadow` longer than its expiry date, so
shadow can't quietly become permanent.

## Stage-2.5 bucket

**Genuinely new.** Nothing in the three repos calls a classifier model, and the guards are pure functions.
No lighter path reaches the outcome.

## Bill of materials (What / Why)

_Product owner: edit the Why column. A Why you can't defend is a part we cut._

| What | Why |
|---|---|
| `lib/jev.mjs`: a zero-dependency `fetch` client with an injectable `fetch`, a three-state result, backoff on 429/529, a timeout and the pinned model | One place that knows the API. House rule: no npm dependencies. "Could not look" is its own state, never pass or fail |
| `jev.config.json`: per-rail `mode: off \| shadow \| jev`, thresholds, `model`, `shadowExpires`, `egress: true` | The kill-switch and the promotion lever are one committed, reviewable line. Each consumer tunes its own |
| `.jev/decisions.jsonl` (gitignored) + a hidden `<!-- jev:… -->` marker on posted cross-review comments | This creates the corpus that doesn't exist today, because rejected replies and drafts only ever reached stderr. The marker survives cloud routines and can be harvested with `gh api` |
| `judgeReviewOutput()` (async) in `review-guard.mjs`: Jev Noul `is_real_review` + Choice `severity` | This replaces the regex's semantic decision. It is a one-line `await` change in each repo's `cross-review.mjs` |
| `judgeProse()` (async) in `prose-guard.mjs`: one batched Jev call per draft, one Noul per sentence for each semantic family, with the evidence pack as `state` | The four semantic families (fix, beneficiary, liveness, commitment) move to Jev. Mechanical rules (length, banned words, tool names, unfinished sentence) stay in code, because they are real if-statements |
| `scripts/jev-eval.mjs` + `jev-eval.fixtures.json` (labelled cases, recorded responses) | CI replays the recorded responses offline, and `--live` re-scores before a model bump. This is the agy-pin lesson applied to a model |
| `scripts/jev-report.mjs`: agreement and disagreement per rail, read from the log and the PR markers | Turns shadow into a decision. The product owner labels only the disagreements |
| The `shadowExpires` check in the `jev-eval` CI step | Makes "shadow won't rot" enforceable instead of a promise |

## Scope

**In (wave 1):** the client, config, decision log and eval harness (S1). `review-guard` on Jev in shadow,
with the PR marker and a backtest over historical cross-review comments (S2). `prose-guard`'s four semantic
families on Jev in shadow, across all prose callers (S3). Rollout to **medusa-bonsai and golden-beans**, with
shadow on and the key provisioned for local runs and cloud routines (S4).

**In (wave 2, re-bet):** the agreement report, the product owner's labels, the flip to `mode: jev` in all
three repos, and retiring the semantic regexes to fallback-only (S5).

**Out:** Jev in `review-route` or the security-lens trigger. Bet 2 (routine pre-triage). The TypeSafe SDK
as a dependency. Jev writing any text. Replacing the mechanical prose rules. A new plugin skill (the
TypeSafe plugin already teaches question-writing). The review-rail unification seed (sequenced, see the
rabbit holes).

## Rabbit holes

- **Sync → async on shared, byte-identical files.** `assertReviewOutput` and `checkProse` stay as they are,
  pure and synchronous, and they become the fallback. New async `judge*` functions sit beside them. Callers
  change one line each: `cross-review.mjs`, `lib/prose-writer.mjs`, `standup.mjs`, `weekly-recap.mjs`.
  Existing tests keep passing unchanged. That is the proof the fallback didn't move.
- **The review rail is forked in three repos** (seed `review-rail-one-implementation`). S4 applies the
  one-line `cross-review.mjs` change to each fork by hand. It doesn't unify them, and it records the patch in
  each consumer's `scripts/README.md` fork notes.
- **Consumer adoption can silently weaken a guard** (LEARNINGS, 2026-09-18). S4 runs each consumer's *old*
  guard tests against the new files and byte-compares every copied file.
- **Thresholds are uncalibrated for our text.** Starting defaults: review decides at `noul ≥ 0.85` = real
  and `≤ 0.15` = not real. A claim counts at `noul ≥ 0.5`. Anything in between falls back to the regex for
  that one decision and is logged as `uncertain`. The shadow data sets the final values in S5.
- **Per-sentence prose checks** reuse `prose-guard`'s own `sentences()` splitter, so the unit of judgement
  doesn't change. Negation ("no customer-visible effect") becomes Jev's job, and it is exactly the case the
  NO_IMPACT regexes kept missing.
- **32k state limit.** Oversized reviewer replies are truncated with a note, and the case is logged. If
  truncation can't produce a valid request, the result is "could not look" and the regex decides.
- **Cloud routines need the key.** Provisioning `TYPESAFE_API_KEY` as a routine secret is an account step
  owed to the product owner, the same as the other routine secrets.
- **Vendor drift.** Gates pin `jev-1.13.0`, never `jev-latest`. Rate limits are "adjusting dynamically", so
  a 429 falls back to the regex and never blocks.

## What already exists (reuse, don't rebuild)

- `template/scripts/lib/review-guard.mjs`: `assertReviewOutput` (becomes the fallback), `reviewMarker` (the
  pattern to copy for the jev marker).
- `template/scripts/cross-review.mjs:429`: the single call site; the failure-status and "never destroy a paid
  reply" handling stay as they are.
- `template/scripts/lib/prose-guard.mjs`: `checkProse`, `sentences()`, `findingsToRevisionNote` (Jev hits
  feed the same revision note, so the writer loop doesn't change).
- `template/scripts/lib/prose-writer.mjs` (`guard` is already injectable via `deps`), plus `standup.mjs` and
  `weekly-recap.mjs`.
- `scripts/check-skill-scripts.mjs`: it will enforce the new import closure once the skills declare
  `lib/jev.mjs`.
- `template/.gitignore` already ignores `.env.local`. It gets widened to `.env*.local` and `.jev/`.
- Probe from 2026-09-19: the API contract works end to end with the key in `.env.local`, at 0.37–0.48 s per
  call, with 324–583 input tokens.

## UX heuristics & rails check

There is no app UI. The operator-facing surface is stderr and the PR comment and status. Every decision line
names its decider (`decided by jev (0.97)` or `decided by regex: jev could not look (429)`), so a fallback
never looks like a Jev verdict. `check-plugin-leaks` covers every new file. The configs are `TEMPLATE
FILL-IN`s with no consumer names.

## Kill-switch / runtime gate (risk:high only, Stage 6b)

**Yes, there is a seam.** The flag is `jev.config.json → rails.<review|prose>.mode`.
**Polarity:** it defaults to `off` in the template (a dark launch), and each consumer sets `shadow`, then
`jev`. A missing key or `egress: false` behaves as `off`.
**Seam:** the async `judge*` functions, the only place Jev is consulted.
**Mechanism:** a committed config file, not the flag provider. These guards run in scripts and routines,
not in app runtime, and `golden-flags-by-default` hasn't shipped. The kill takes one line, and the regex
path it falls back to is the code that runs today.

## Acceptance criteria

1. With no key, or with `mode: off`, every existing guard test in all three repos passes byte-for-byte, and
   the outputs are identical to today's.
2. In `shadow`, every guard decision appends one JSONL line
   `{rail, decider, regex, jev, confidence, textHash, sha?, ts}`. Posted cross-review comments carry the
   marker, and the outcome is still the regex's.
3. In `jev`, Jev's answer decides. The regex decides only on could-not-look or uncertain, and stderr says
   which one decided.
4. `node scripts/jev-eval.mjs` passes offline in CI against the recorded fixtures, including the two
   2026-09-19 cases. `--live` re-scores against the API.
5. CI fails when `shadowExpires` is in the past for any rail still in `shadow`.
6. After S5, `mode: jev` is live for both rails in all three repos, and the report behind the flip is linked
   from the epic README.

## Open risks / research

- TypeSafe docs (read 2026-09-19): [API](https://docs.typesafe.ai/api.md) ·
  [models](https://docs.typesafe.ai/models.md) (`jev-1.13.0`, 64k/32k, $0.042/M input, output free,
  1,200 rpm) · [confidence](https://docs.typesafe.ai/confidence.md) (per-domain thresholds, start
  conservative) · [legal](https://docs.typesafe.ai/legal.md): no training on user data; zero data retention
  (ZDR) is enterprise-only.
- **Egress:** reviewer replies quote private code, and drafts summarise private roadmaps. The product owner
  accepted this on 2026-09-19 (single operator across all projects). `egress` still exists per project, so
  a future consumer with other owners can opt out.
- **Single-vendor dependency on a young API.** Mitigated by the regex fallback and the pinned model. If
  TypeSafe disappears, the rails degrade to today's behaviour. They don't break.
