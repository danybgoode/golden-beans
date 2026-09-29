---
epic: think-skills
sprint: 2
title: "Groom reads strategy"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S2.1
    title: "Groom reads `00-strategy/`"
    as_a: "the product owner"
    i_want: "groom to say which input metric a seed moves and which risky dimension it tests"
    so_that: "every pitch is tied to the strategy I agreed"
    risk: low
    status: planned
  - id: S2.2
    title: "The Roadmap tools ignore `00-strategy/`"
    as_a: "a maintainer"
    i_want: "the board, the extractor and the doc-format check to pass with the new folder"
    so_that: "strategy files never show up as epics or seeds, or fail CI"
    risk: low
    status: planned
  - id: S2.3
    title: "`intent-match`'s think-chain route names the skills"
    as_a: "the product owner"
    i_want: "an \"is it worth doing?\" gap to point at the right coach"
    so_that: "the route leads somewhere real instead of \"answer by hand\""
    risk: low
    status: planned
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 2: Groom reads strategy

**Status:** ⬜ not started

## Stories

### Story 2.1 — Groom reads `00-strategy/`
**As** the product owner, **I want** groom to say which input metric a seed moves and which risky dimension it tests, **so that** every pitch is tied to the strategy I agreed.
**Acceptance:** Groom Stage 0 loads `Roadmap/00-strategy/` when present; the seed template gains an optional line "Moves: <input> · Tests: <dimension>" (or "neither: <why>"). With no folder, groom says nothing about strategy. Groom's tests cover both.
**Risk:** low

### Story 2.2 — The Roadmap tools ignore `00-strategy/`
**As** a maintainer, **I want** the board, the extractor and the doc-format check to pass with the new folder, **so that** strategy files never show up as epics or seeds, or fail CI.
**Acceptance:** `roadmap-extract`, `build-order` and `doc-format --check` pass with a fixture `00-strategy/`; a test per tool, observed failing first if the tool didn't already skip it.
**Risk:** low

### Story 2.3 — `intent-match`'s think-chain route names the skills
**As** the product owner, **I want** an "is it worth doing?" gap to point at the right coach, **so that** the route leads somewhere real instead of "answer by hand".
**Acceptance:** The think-chain route's text names `pmf-narrative` / `risk-validation`. Only if `intent-match` S1.2 has shipped; otherwise cut.
**Risk:** low

## Sprint QA
- Groom and scaffold tests; a groom dry run with and without `00-strategy/`.
- Browser smoke owed: none.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. With `Roadmap/00-strategy/north-star.md` present, groom any small seed
   → the pitch has a "Moves: … · Tests: …" line.
2. Run `node scripts/build-order.mjs` and `node scripts/doc-format.mjs --check`
   → both pass, and no strategy file appears on the board.

If any step fails, note the step number + what you saw — that's the bug report.
