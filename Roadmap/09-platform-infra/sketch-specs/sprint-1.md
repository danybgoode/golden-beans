---
epic: sketch-specs
sprint: 1
title: "The format and the grey wireframe"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S1.1
    title: "The `surface` grammar and parser"
    as_a: "the product owner"
    i_want: "a screen written as a short ordered list of blocks that a script can read"
    so_that: "one description serves the sketch, the review and the contract"
    risk: low
    status: planned
  - id: S1.2
    title: "Generic vocabulary and project mapping"
    as_a: "a project using the plugin"
    i_want: "a small shared set of block kinds I can map onto my own components"
    so_that: "sketches work in any project, not just this one"
    risk: low
    status: planned
  - id: S1.3
    title: "The grey renderer"
    as_a: "the product owner"
    i_want: "every `surface` block in a seed drawn as a plain grey wireframe"
    so_that: "I approve a picture, not a text list"
    risk: low
    status: planned
---
# Sketch specs — a surface spec renders the grey wireframe and becomes the state contract — Sprint 1: The format and the grey wireframe

**Status:** ⬜ not started

## Stories

### Story 1.1 — The `surface` grammar and parser
**As** the product owner, **I want** a screen written as a short ordered list of blocks that a script can read, **so that** one description serves the sketch, the review and the contract.
**Acceptance:** `lib/surface.mjs` parses fenced `surface` blocks from any markdown file into `{ state, route, blocks: [{ kind, words, action?, count?, columns? }] }`. Errors carry the line number and the known kinds (`- lsit columns …` fails helpfully). Zero dependencies; in the kit closure.
**Risk:** low

### Story 1.2 — Generic vocabulary and project mapping
**As** a project using the plugin, **I want** a small shared set of block kinds I can map onto my own components, **so that** sketches work in any project, not just this one.
**Acceptance:** About twelve kinds ship in the kit (head, answer, summary, tiles, toolbar, list, empty, card, steps, field, tabs, note). `surface.map.json` maps kind → project kind; this repo's map targets `BLOCK_KINDS`, and a test fails if it names a kind that doesn't exist there.
**Risk:** low

### Story 1.3 — The grey renderer
**As** the product owner, **I want** every `surface` block in a seed drawn as a plain grey wireframe, **so that** I approve a picture, not a text list.
**Acceptance:** `node scripts/sketch-render.mjs <file.md> [--out <file.html>]` writes one static HTML page, a section per state, grey boxes with the words and facts; no design-system import. A snapshot test covers each kind. The groom visuals rule says to render and publish it for review.
**Risk:** low

## Sprint QA
- `node --test` (parser, validator, renderer snapshots).
- Owed to Daniel: open one rendered wireframe and say whether it reads.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. Run `node scripts/sketch-render.mjs Roadmap/00-ideas/seeds/sketch-specs.md --out /tmp/sketch.html` and open the file
   → one grey wireframe for the `ship-features` example: a head with "+ new feature", an answer line, a summary of 4, a toolbar, a list with four column names.
2. Change `list` to `lsit` in a copy of the seed and run it on the copy
   → it fails with the line number and the list of known kinds.

If any step fails, note the step number + what you saw — that's the bug report.
