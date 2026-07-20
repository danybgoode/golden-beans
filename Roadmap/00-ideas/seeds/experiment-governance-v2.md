---
title: "Experiment governance v2 — registry, metrics, guardrails, and decision record"
slug: experiment-governance-v2
status: raw
area: "01"
type: feature
priority: "#2c"
risk: high
epic: null
build_order: "#2c"
updated: 2026-07-20
---

# Seed — Experiment governance v2

Turn shipped deterministic bucketing + exposure events + basic lift into an experiment operating primitive:
experiment registry, owner/hypothesis, eligibility and allocation, primary/guardrail metrics, start/stop
window, sample-ratio-mismatch checks, exposure integrity, minimum sample guidance, segment cuts, and a durable
decision record. Preserve the v1 rule that normal conversion events are joined to exposures by subject id and
do not need the experiment key on the conversion row.

First dogfood: the Tiendas Fundadoras acquisition promise/CTA, only after consent-safe previews and merchant
activation tracking exist. Out: automated winner rollout, a claim of statistical certainty from tiny samples,
and moving Miyagi's feature-flag serving into this epic (that remains E5a). Groom after the event subject
contract and journey definitions settle; the cross-panel offer applies to experiment/flag boundary choices.
