---
epic: sketch-specs
sprint: 1
title: "The format and the grey wireframe"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S1.1
    title: "The `surface` grammar and parser"
    as_a: "the product owner"
    i_want: "a screen written as a short ordered list of blocks that a script can read"
    so_that: "one description serves the sketch, the review and the contract"
    risk: low
    status: done
  - id: S1.2
    title: "Generic vocabulary and project mapping"
    as_a: "a project using the plugin"
    i_want: "a small shared set of block kinds I can map onto my own components"
    so_that: "sketches work in any project, not just this one"
    risk: low
    status: done
  - id: S1.3
    title: "The grey renderer"
    as_a: "the product owner"
    i_want: "every `surface` block in a seed drawn as a plain grey wireframe"
    so_that: "I approve a picture, not a text list"
    risk: low
    status: done
---
# Sketch specs — a surface spec renders the grey wireframe and becomes the state contract — Sprint 1: The format and the grey wireframe

**Status:** 🟦 In review

## Stories

### Story 1.1 — The `surface` grammar and parser ✅
**As** the product owner, **I want** a screen written as a short ordered list of blocks that a script can read, **so that** one description serves the sketch, the review and the contract.
**Acceptance:** `lib/surface.mjs` parses fenced `surface` blocks from any markdown file into `{ state, route, blocks: [{ kind, words, action?, count?, columns? }] }`. Errors carry the line number and the known kinds (`- lsit columns …` fails helpfully). Zero dependencies; in the kit closure.
**Risk:** low

### Story 1.2 — Generic vocabulary and project mapping ✅
**As** a project using the plugin, **I want** a small shared set of block kinds I can map onto my own components, **so that** sketches work in any project, not just this one.
**Acceptance:** About twelve kinds ship in the kit (head, answer, summary, tiles, toolbar, list, empty, card, steps, field, tabs, note). `surface.map.json` maps kind → project kind; this repo's map targets `BLOCK_KINDS`, and a test fails if it names a kind that doesn't exist there.
**Risk:** low

### Story 1.3 — The grey renderer ✅
**As** the product owner, **I want** every `surface` block in a seed drawn as a plain grey wireframe, **so that** I approve a picture, not a text list.
**Acceptance:** `node scripts/sketch-render.mjs <file.md> [--out <file.html>]` writes one static HTML page, a section per state, grey boxes with the words and facts; no design-system import. A snapshot test covers each kind. The groom visuals rule says to render and publish it for review.
**Risk:** low

## Build contract (locked by the architect before the builder started)

Cites the epic README's C1–C6 and D8–D16; nothing here restates a rule that lives there.

1. **Files, both trees, byte-identical (D15):** `lib/surface.mjs`, `lib/surface.test.mjs`, `sketch-render.mjs`,
   `sketch-render.test.mjs`, `sketch-render.snapshot.html` in `scripts/` and `skills/template/scripts/`.
   `node scripts/check-script-parity.mjs` is green.
2. **1.1 — `lib/surface.mjs`** implements D8 and D9 exactly: `parseSurfaces`, `parseSurface`, `SURFACE_KINDS`
   (D10, with each kind's allowed facts), `SurfaceError`, `validateMap` (D11). Node built-ins only. Tests: every D8
   refusal (unknown kind with the suggestion and the list, a fact on the wrong kind, a repeated fact, a bad count, an
   unterminated string, a missing `state:`/`route:`, an unknown header key, `when:`, the C3 legacy shape, a block with
   no lines); the file line number in each; the fence rules (≤3 spaces, tildes, info string exactly `surface`); the
   trailing-bar column; two blocks in one file.
3. **1.2 — the map (D11):** `apps/web/design-system/surface.map.json` and a test in
   `apps/web/design-system/surface-map.test.ts` that fails when a value is not a `BLOCK_KINDS` kind or a generic kind
   is unmapped, and passes `validateMap`. Observed failing once on a planted `"lsit"`.
4. **1.3 — `sketch-render.mjs` (D16):** one exported `renderSketch(surfaces, { title })` → HTML string, and a CLI.
   Every one of the twelve kinds draws something visibly different (a `head` with its action as a button box, a
   `summary`/`tiles`/`steps` drawing `count` boxes, a `list` drawing its column words over grey placeholder rows,
   `tabs` splitting its words on `|`). The snapshot test renders a fixture that uses all twelve and compares with
   `sketch-render.snapshot.html` (`UPDATE_SNAPSHOT=1` rewrites it); a second test reads `sketch-render.mjs`'s imports
   and fails on anything but `node:*` and `./lib/surface.mjs`; a third asserts escaping (`<script>` in words).
5. **The author side (C3, D7):** `groom/templates/scope-seed.md`'s example and `groom/references/intent-and-visuals.md`
   are rewritten to D8; the visuals rule says to render every `surface` block with
   `node scripts/sketch-render.mjs <seed> --out <file>.html` and publish it for review. The seed
   `Roadmap/00-ideas/seeds/sketch-specs.md` drops its `when: empty` line (D8 refuses it), so walkthrough step 1 runs.
6. **Kit (D15):** `groom`'s `requires_scripts` gains `sketch-render.mjs` and `lib/surface.mjs`;
   `check-skill-scripts` and `kit-tarball.test.mjs` are green; plugin + kit `0.16.0`, a CHANGELOG section, adverts
   re-rendered (`skills/scripts/render-skill-adverts.mjs`).

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
