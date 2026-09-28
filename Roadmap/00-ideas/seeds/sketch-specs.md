---
title: "Sketch specs: approved specs render the wireframe and become the build contract"
slug: sketch-specs
status: raw
area: "09"
type: feature
priority: "single-product-wave-C"
appetite: L
underwritten_by: null
risk: low
epic: null
build_order: 52
updated: 2026-09-28
---

# Seed: Sketch specs: approved specs render the wireframe and become the build contract

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **feature**, appetite **L**,
to confirm at grooming.

## Problem

Prototypes and mockups are free-form HTML. `apps/web/design-system/state-contract*.mjs` then extracts a block signature
from the approved prototype into `STATE-CONTRACT.json` so CI can check built routes (22 of 22). The arrow runs
prototype → contract, so every sketch is hand-made and "mostly matches" is possible.

## Sketch (intent-match wave 2)

- Spec formats, versioned beside the epic: `surface.yaml` (route, states from the ten-state taxonomy, ordered blocks
  with the words that matter), `flow.yaml`, `data.yaml`, `state.yaml`, `arch.yaml`, `copy.yaml`.
- Zero-dependency renderers in the kit: a deliberately grey wireframe (published for review), Mermaid/SVG for flow,
  state and architecture, tables and fixtures for data.
- After approval the same spec generates the route's state contract, and `state.yaml` generates property tests
  (the unification audit's "light" verify depth).
- A generic vocabulary of about a dozen block kinds ships in the kit; a project maps each kind to its own components, as
  `state-contract-core.mjs` maps prototype classes to product classes today.

## Depends on

`intent-match` (the routing that decides which spec a gap needs).
