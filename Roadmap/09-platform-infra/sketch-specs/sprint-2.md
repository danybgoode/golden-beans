---
epic: sketch-specs
sprint: 2
title: "The spec becomes the contract"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S2.1
    title: "Approved surfaces feed the state contract"
    as_a: "the product owner"
    i_want: "an approved surface to be the contract CI checks the built route against"
    so_that: "what I approved is exactly what's enforced"
    risk: low
    status: planned
  - id: S2.2
    title: "Parity on three approved states"
    as_a: "a maintainer"
    i_want: "proof the format loses nothing"
    so_that: "we trust it before a new state depends on it"
    risk: low
    status: planned
  - id: S2.3
    title: "First state built from a spec"
    as_a: "the product owner"
    i_want: "the next new console state approved as a surface and built against it, with no prototype edit"
    so_that: "the arrow runs spec \u2192 build for real"
    risk: low
    status: planned
---
# Sketch specs — a surface spec renders the grey wireframe and becomes the state contract — Sprint 2: The spec becomes the contract

**Status:** ⬜ not started

## Stories

### Story 2.1 — Approved surfaces feed the state contract
**As** the product owner, **I want** an approved surface to be the contract CI checks the built route against, **so that** what I approved is exactly what's enforced.
**Acceptance:** `state-contract.mjs` also reads `apps/web/design-system/surfaces/*.surface` through the project map, emits their entries with `source: spec`, fails on a state id defined twice, and `--check` fails when a surface's SHA-256 doesn't match its `APPROVED.md` line.
**Risk:** low

### Story 2.2 — Parity on three approved states
**As** a maintainer, **I want** proof the format loses nothing, **so that** we trust it before a new state depends on it.
**Acceptance:** Three of the 33 approved states, chosen from those the grammar covers, written as surfaces produce entries byte-identical to their prototype-derived ones (a test compares them). `console-visual.authed.spec.ts` stays green.
**Risk:** low

### Story 2.3 — First state built from a spec
**As** the product owner, **I want** the next new console state approved as a surface and built against it, with no prototype edit, **so that** the arrow runs spec → build for real.
**Acceptance:** One new state has a surface, an `APPROVED.md` line and a built route that passes the gate. Waits for an epic that adds a console state.
**Risk:** low

## Sprint QA
- `state-contract.mjs --check` in CI; `console-visual.authed.spec.ts` unchanged and green; the parity test.
- Browser smoke owed: none (the gate is the check).
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. Run `node apps/web/design-system/state-contract.mjs --check`
   → passes, and `STATE-CONTRACT.json` shows three entries with `"source": "spec"`.
2. Edit one word in one of those `.surface` files and run it again
   → it fails, naming the surface and the `APPROVED.md` hash it no longer matches. Revert the word.
3. After deploy, open https://goldenfrijoles.com/app/flags/<your-project> signed in
   → the page is unchanged from before this epic (the parity states render and pass exactly as they did).

If any step fails, note the step number + what you saw — that's the bug report.
