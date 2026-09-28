---
title: "The board's epic links resolve one folder too high"
slug: board-link-depth
status: raw
area: "09"
type: bug
priority: unranked
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-09-28
---

# Seed: the board's epic links resolve one folder too high

Found by `one-roadmap` (PR #177: the author's link check, confirmed by the codex general pass).

## Problem

`scripts/build-order.mjs` renders each epic link as `../../${doc_link without "Roadmap/"}`. `BUILD-ORDER.md` lives at
`Roadmap/00-ideas/`, so `../../` resolves to the repo root, and every epic link on the board 404s on GitHub (37
links; 30 were already broken on `main` before the move). Seed links (`seeds/<slug>.md`) are fine.

## Sketch

- Change the one expression to `../${…}` and regenerate. Add a test that resolves every rendered link against the
  filesystem, so the link depth can't regress.
- **Shared-surface note:** the same generator ships in the kit and in `golden-frijoles/skills`' template, and that
  repo's CI byte-compares its copy with the template's. Fix it at the source (the template), then sync the copies.
  Don't let this repo's copy fork from the template.
