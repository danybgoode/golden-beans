---
title: "Session budget: replace 'one deep ask per run' with a measured line"
slug: session-budget
status: raw
area: "09"
type: chore
priority: "single-product-wave-B"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 43
updated: 2026-09-28
---

# Seed: Session budget: replace 'one deep ask per run' with a measured line

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **chore**, appetite **S**,
to confirm at grooming.
**Decisions:** E7 (approved 2026-09-28).

## Problem

Groom's "one *deep* ask per run" and LEARNINGS' "fresh session per sprint" were calibrated for earlier models. The
binding constraint is now the product owner's decision bandwidth, and nothing measures either.

## Sketch

- Reword the guardrail to "one deep ask per approval gate" (groom SKILL.md, WAYS-OF-WORKING, LEARNINGS).
- A resolver computes per turn: share of context used, asks open but not at a gate, questions waiting on the product
  owner, how much the asks share, drift markers (contradicting a written decision, repeated re-reads, tool errors).
- Prior at start: asks × appetite. Output: keep going / checkpoint / hand off (the `backlog-cadence.md` handoff).
- One more build-view line: `Session  48% · 2 asks open · 5 questions waiting → keep going`. Thresholds provisional
  until fitted on logged sessions (Claude Code's per-session OpenTelemetry token metrics + later corrections).
