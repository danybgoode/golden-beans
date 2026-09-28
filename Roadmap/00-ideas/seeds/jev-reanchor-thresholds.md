---
title: "Refit the Jev guard thresholds with DSPy ReAnchor on the labelled fixtures"
slug: jev-reanchor-thresholds
status: shipped   # spike decided 2026-09-28: clean negative, see ## Decision
area: "09"
type: spike
priority: "single-product-wave-A"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 44
updated: 2026-09-28
---

# Seed: Refit the Jev guard thresholds with DSPy ReAnchor on the labelled fixtures

From the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Groomed 2026-09-28: **spike ·
fixed-scope lane · appetite S · risk low** · Stage-2.5 bucket **already possible**. The fixtures store Jev's
answers, so a refit needs no live calls and no key.
**Decisions:** E5 (approved 2026-09-28).

## Question

Do thresholds fitted by DSPy 3.4's `ReAnchor` beat the three hand-measured ones in `jev.config.json`
(review real ≥ 0.85 / not-real ≤ 0.30, prose claim ≥ 0.80, measured in jev-semantic-guards S5)?

## Sketch

- A throwaway `optimize/` Python workspace (DSPy pinned to 3.4.x, `jev-1.13.0` pinned) re-expresses the review and
  prose questions as DSPy signatures with `Noul` outputs.
- Train on the 240 labelled fixtures in `scripts/jev-eval.fixtures.json`; ReAnchor's k-fold check guards overfit.
- Compare against the hand thresholds on held-out folds: agreement, precision on "not real", Brier score.
- **Written decision, no production change:** adopt the fitted numbers (a one-line `jev.config.json` PR each), or
  record a clean negative result.

## Why first

It is the cheapest proof of the "DSPy compiles, the kit runs" pattern that `compiled-prompts`, `semantic-lint`,
`intent-match` and `session-budget` all lean on. The APIs are experimental; this spike also finds their sharp edges.

## Grooming notes (2026-09-28)

- **What ReAnchor fits** (read from `dspy/teleprompt/reanchor/calibrate.py`, 3.4.0): for a `Noul` output, **one** cut
  `P(true) ≥ t`. It tries the midpoints between observed probabilities and keeps a candidate only when it strictly
  beats the start on the whole train set **and** on the held-out folds (up to 5 folds, seeded shuffle). It never
  changes the probabilities: "it does not make the raw probabilities truer".
- **So the Brier score cannot move.** Brier is computed on the probabilities, which ReAnchor leaves unchanged. The
  seed's third metric is replaced by *decision accuracy* and *precision/recall on the "not real" class*.
- **Shape mismatch:** the review rail is a **three-way band**, not one cut. `real ≥ 0.85` passes, `≤ 0.30` fails, and
  anything in between goes to the regex. Prose has one `claim` cut shared by four families, and evidence gates
  (`allowsFixClaim`, `liveFlags`) sit outside Jev. A single-cut `Noul` can express `claim` and each band edge
  separately, but not the band.
- **Evidence pass:** ReAnchor normally asks Jev once per example (live, cached). The fixtures already hold those
  answers, so a replay client serves them. That means no egress, no `TYPESAFE_API_KEY` and no cost.

## Investigation prompt (spike — no branch, no production change)

> Answer: **do thresholds fitted by DSPy 3.4 ReAnchor beat the hand-measured ones in `jev.config.json` (review
> real 0.85 / not-real 0.30, prose claim 0.80) on `scripts/jev-eval.fixtures.json`?** Work offline on the recorded
> answers only: no key, no egress. Nothing is committed under `scripts/`, `apps/` or `jev.config.json`, and any
> workspace lives in a scratch directory.
>
> 1. **Baseline (the real judges):** score the hand thresholds with `evaluate()` from `scripts/jev-eval.mjs`, the
>    same replay CI runs. Report accuracy per rail/family, plus precision and recall on "not real" (review).
> 2. **DSPy ReAnchor:** in a throwaway venv (`dspy[typesafe]==3.4.0`), express each question as a `Predict` with
>    a `Noul` output, backed by a replay subclass of `dspy.experimental.TypeSafe` that returns the recorded
>    `noul`. The metric is the judge's decision vs the label. Fit with `ReAnchor`, and record its report (fitted
>    value, fold check, train before/after). Where the rail's rule is a band, fit each edge as its own cut and say
>    so.
> 3. **Put the fitted values back into the real judges** with `evaluate()`, and compare them to the baseline on
>    held-out folds (5-fold, same seed). The ReAnchor train score doesn't count as evidence on its own.
> 4. **Sharp edges:** log every place where the experimental API fought the job (imports, caching requirement,
>    the band, multi-question signatures).
> 5. **End with a written decision in this seed:** *adopt* (one-line `jev.config.json` PR per rail, product owner's
>    OK first) or *clean negative*, plus what it means for `compiled-prompts` / `semantic-lint` / `intent-match`,
>    which lean on the "DSPy compiles, the kit runs" pattern.

## Result (run 2026-09-28, offline, 240 recorded fixtures, `jev-1.13.0`, DSPy 3.4.0)

**Method.** Instead of porting the judges to Python, the harness drove the **real Node judges**
(`loadRails()` + `replayAsk()` from `scripts/jev-eval.mjs`) to derive, per fixture, the one number each threshold
acts on:
- **review:** Jev's `noul` plus the regex verdict;
- **prose:** per family, the highest *eligible* `noul`. The evidence gates and `liveFlags` are already applied.

That reduction was checked against the judges on a grid of thresholds: **1,363 checks, 0 mismatches**. ReAnchor then
fitted a `dspy.Predict` with `Noul` outputs. It was backed by a replay subclass of `dspy.experimental.TypeSafe` that
serves the recorded probability, so there was **no egress, no key and no cost**. As a no-DSPy control, a plain
exhaustive grid refit ran on the same folds.

| Rail | Hand thresholds (all 240) | ReAnchor fit (all) | Grid fit (all) | **Held-out, 5-fold: hand · ReAnchor · grid** |
|---|---|---|---|---|
| review (77) | 98.7% · 1 wrong · not-real precision 1.00, recall 0.94 | **kept 0.85 / 0.30** (no candidate beat them) | 0.85 / 0.30 | **76 · 76 · 74** correct |
| prose (163, exact code set) | 86.5% · 22 wrong | **kept 0.80** for all four families (fold check refused 2 train-only gains) | 0.765 → 87.7% on train | **141 · 141 · 137** correct |

- **Review:** the thresholds are already at the optimum. The one miss (`corpus-b-trail`, label not-real, `noul` 0.89,
  regex also wrong) is Jev being confidently wrong. No threshold fixes it.
- **Prose:** almost all the error is `flag-state-claim`: 13 misses from 0.33 to 0.79 and 6 false alarms from 0.80 to
  0.96. **The two distributions overlap, so no single cut separates them.** A naive refit to 0.765 gains 2 on the
  data it was fitted on and **loses 4 held out**. ReAnchor's fold check caught exactly that overfit and kept 0.80.
- **Brier** can't be compared: ReAnchor never changes the probabilities, so it's identical by construction.

**Sharp edges in the experimental API** (for `compiled-prompts`, `semantic-lint`, `intent-match`):
1. `ReAnchor`, `Noul` and `TypeSafe` import only from `dspy.experimental`. They aren't at the top level.
2. A `Noul` output **requires** `OutputField(desc=...)`, which is the question sent to Jev. The question text then
   lives in two places (the kit's JS and the DSPy signature) unless the compiled artifact becomes the single source.
3. `ReAnchor` refuses by default without a response cache (`require_cache=True`). A replay client needs
   `require_cache=False`.
4. **One cut per field.** The review rail's three-way band (pass / regex / fail) had to be two `Noul` fields over the
   same probability plus a custom metric. The rail's inclusive `≤` needed a `nextafter` shim against ReAnchor's `≥`.
5. **Aggregation and evidence gates live outside DSPy.** Prose fitting was only faithful because the judge reduces to
   "max eligible noul ≥ t", and that reduction was verified against the Node judge. A rule with no such reduction
   can't be fitted this way.
6. ReAnchor fits **per field**, but `jev.config.json` has one shared `prose.thresholds.claim`. Per-family thresholds
   would be a schema change (code), not a one-line config PR.
7. Its normal evidence pass is **live** (one Jev call per example). Our recorded fixtures make it free. Keep that
   property.

## Decision (2026-09-28)

**Clean negative: keep the hand thresholds** (review 0.85 / 0.30, prose 0.80). No `jev.config.json` PR and no
production change. The hand numbers are already optimal for this data, and no refit beats them on held-out folds.

**What it means for the pattern "DSPy compiles, the kit runs":** it **works**. It runs offline from recorded answers
and writes plain numbers the zero-dependency kit already reads. The part worth keeping is ReAnchor's **fold check**:
it refused the overfit a hand-rolled grid would have shipped. But **the bottleneck is the question and the data, not
the threshold**:
- `flag-state-claim`'s overlap is a question-wording or evidence problem. That's `compiled-prompts`' territory (improve
  the question), not ReAnchor's.
- 240 labels can't move a threshold with confidence. Grow the labelled set from the logged decisions
  (`.jev/decisions.jsonl`) before any refit.
- `semantic-lint` and `intent-match` should design each judge's rule as **one statistic per Noul/Score** (or a
  verified reduction) from day one, or they won't be fittable.

**Re-run this spike when** the fixtures roughly double, or on a Jev model bump (after `jev-eval --live` re-records).
The harness is ~200 lines: a Node extractor plus a Python ReAnchor script. It was deliberately **not committed**,
because it would land as `optimize/` under E5 when `compiled-prompts` starts.
