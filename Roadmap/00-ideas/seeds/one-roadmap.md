---
title: "One Roadmap: the plugin's epics and seeds move into this repo"
slug: one-roadmap
status: raw
area: "09"
type: chore
priority: "single-product-wave-A"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 37
updated: 2026-09-28
---

# Seed: One Roadmap: the plugin's epics and seeds move into this repo

**Portfolio-pass seed** (not yet deep-groomed), from the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). Class **chore**, appetite **S**,
to confirm at grooming.
**Decisions:** E1 (approved 2026-09-28).

## Problem

Golden Frijoles is one product with two planning homes. This Roadmap holds 37 seeds and 30 epics; dobby-foundation's
(`golden-frijoles/skills`) holds 6 epics and 12 seeds, its own bets, LEARNINGS and BUILD-ORDER. A seed for the product
(`think-skills`) lands in whichever repo the skills ship from, and the product owner can't see the whole funnel in one board.

## Sketch

- Move dobby-foundation's `Roadmap/09-platform-infra/*` epics, its seeds and its bets into this repo's `Roadmap/`
  (09 Platform & Infra). Renumber `build_order` into this repo's one global sequence.
- Merge its `LEARNINGS.md` into this one (dedupe; most entries were promoted to both already).
- Leave a one-line pointer README in dobby-foundation's `Roadmap/` until `public-monorepo` retires the folder.
- Regenerate `BUILD-ORDER.md`; the board shows one funnel.
- Prune stale local worktrees (`golden-beans-gfp`, `-s2`, `-s3`, `medusa-bonsai-gfp`) after checking for uncommitted work.

## Open questions

- Does dobby-foundation's CI (`epic-dod`, `doc-format`) need to stop checking a Roadmap that's gone, or does the pointer
  README satisfy it until the monorepo move?
