---
title: "Refit the Jev guard thresholds with DSPy ReAnchor on the labelled fixtures"
slug: jev-reanchor-thresholds
status: ready
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
