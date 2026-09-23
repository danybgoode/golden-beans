---
title: "Experiments for humans: a guided five-question flow replaces the JSON textarea"
slug: experiments-for-humans
status: raw
area: "01"
type: feature
priority: "audit-wave-A"
appetite: M
underwritten_by: null
risk: low
epic: null
build_order: 29
updated: 2026-09-23
---

# Seed: Experiments for humans: a guided five-question flow replaces the JSON textarea

**Portfolio-pass seed** (not yet deep-groomed). Seed 2 of the unification audit, [§9](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **feature**, appetite **M** (from the audit, to confirm at grooming). Audit wave **A**.
**Depends on:** none.

## Problem

"+ New experiment" opens a modal whose core is a 24-row **Definition JSON** textarea (`experiment-manager.tsx`), with flag binding as a second, separate step that only offers flags whose variant keys match exactly. A PM, the buyer, can't build the simplest A/B test without writing JSON.

## Sketch (from the audit; grooming will cut or reshape it)

- Five plain-language steps (what/why → who → what they see → how you'll know → how long) + a review sentence, filling the existing `ExperimentDefinition` contract. No migration expected.
- Reuse the flag rule builder for eligibility; auto-create/bind the flag variants.
- One new read: a project-scoped **event catalog** (names, 14-day counts, baselines, tag keys, entity types seen).
- Sample size → "≈ N days at your traffic"; a **computed** pre-launch checklist (including "your eligibility tags actually appear on recent events").
- Templates (copy test, pricing, onboarding step, guarded rollout); a decision-first readout; `gf experiments create` through one command core.

## Open questions for the deep groom

- Does the generalized rule builder move out of `flags/`, and where to?
- Readout statistics: keep the current frequentist interval or add a Bayesian view?
- Which templates ship in v1?
