---
title: "Compiled prompts: the kickoff and build/QA prompts assembled from measured parts"
slug: compiled-prompts
status: raw
area: "09"
type: feature
priority: "single-product-wave-C"
appetite: L
underwritten_by: null
risk: low
epic: null
build_order: 44
updated: 2026-09-28
---

# Seed: Compiled prompts: the kickoff and build/QA prompts assembled from measured parts

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **L**,
to confirm at grooming.
**Decisions:** E5 (approved 2026-09-28).

## Problem

`emit-epic-kickoff.mjs` pours title, slug and sprint list into one fixed 94-line template, so every epic gets the same
doctrine whatever its risk, type or blast radius. Mechanical was the right fix for hand-written drift, but the doctrine
is tuned by hand from incidents and the review, smoke and prose prompts have no optimization loop.

## Sketch (multi-wave; re-bet at each boundary)

- **Wave 1 — plumbing:** `optimize/` (DSPy pinned) writes versioned `compiled/jev-thresholds.json` and
  `compiled/prompts/<name>.json`; the kit reads them; every compiled change is a reviewed PR diff.
- **Wave 2 — kickoff assembly:** Jev `Noul` per doctrine block over the epic docs, labels from retros/LEARNINGS
  incidents across the frontmatter-contract corpus (188 epics / 1,454 stories); architecture-lock check as a Jev `Score`
  per decision; model routing per sprint as a `Choice` once outcomes are logged.
- **Wave 3 — generative prompts with GEPA:** review prompts (metric: review-guard real-review rate + findings fixed vs
  dismissed), smoke walkthrough writer (format rules + the product owner's pass/fail), report prose (prose guard passes
  without a retry); QA per acceptance criterion and smoke-triage as Jev decisions.

## Risks

Experimental DSPy APIs (pin); small-data overfit; ReAnchor doesn't calibrate probabilities (measure Brier/ECE
separately); GEPA against the review guard can teach reviewers to *look* real — keep a human-labelled hold-out.

## No-gos

Raw product-owner asks stay in groom; this compiles the prompts the system writes to itself after groom.
