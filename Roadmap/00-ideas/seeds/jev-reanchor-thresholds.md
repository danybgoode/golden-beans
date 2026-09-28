---
title: "Refit the Jev guard thresholds with DSPy ReAnchor on the labelled fixtures"
slug: jev-reanchor-thresholds
status: raw
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

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **spike**, appetite **S**,
to confirm at grooming.
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
