---
title: "Intent match: a score for how well the agent understood the ask, with routed follow-ups"
slug: intent-match
status: raw
area: "09"
type: feature
priority: "single-product-wave-B"
appetite: M
underwritten_by: null
risk: low
epic: null
build_order: 48
updated: 2026-09-28
---

# Seed: Intent match: a score for how well the agent understood the ask, with routed follow-ups

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **M**,
to confirm at grooming.
**Decisions:** E6 (approved 2026-09-28).

## Problem

Nothing measures whether the groomed pitch captures what the product owner meant, or whether a builder will read it
the same way. Gaps surface as "that's not what I meant" after the build, and there's no rule for when a wireframe,
flow, data sample or spike should come first.

## Sketch (wave 1: planning-only, logged)

- Groom Stage 3.5 computes four signals: coverage both ways (Jev `Noul` per raw-ask claim and per acceptance
  criterion), ambiguity left (Jev `Score` per criterion), **divergence of three independent readings** (fresh agents,
  pitch only, "what I'll build"; Jev `Noul` per pair; reuses `cross-panel.mjs`), and the Stage 1 teach-back outcome.
- Shows a 0–100 total labelled "uncalibrated" plus the components; bands 80+ build, 60–79 resolve follow-ups,
  below 60 sketch or spike first. Advisory only (E6): it can add a step, never remove approval.
- Each gap classified (Jev `Choice`) and routed: copy deck, wireframe, flow, data sample, state machine, sequence /
  data-flow diagram, container diagram, spike, or the think chain.
- At epic close: "Did we build what you meant?" (yes / mostly / no) plus scope corrections after scaffold and reopened
  stories, logged for later calibration with ReAnchor (~20 epics).

Wave 2 is `sketch-specs`.
