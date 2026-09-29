---
epic: think-skills
sprint: 1
title: "The three skills, with files"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S1.1
    title: "Port the three coaches into the plugin"
    as_a: "a product owner using Golden Frijoles"
    i_want: "the PMF Narrative, North Star and Risk Validation coaches installed with the plugin"
    so_that: "I get them in any project, not just in one person's account"
    risk: low
    status: planned
  - id: S1.2
    title: "Each writes its file"
    as_a: "the product owner"
    i_want: "each coach to leave a file in `Roadmap/00-strategy/`"
    so_that: "the result outlives the chat and a later session can revise it"
    risk: low
    status: planned
  - id: S1.3
    title: "The chain"
    as_a: "the product owner"
    i_want: "each coach to offer the next, and Risk Validation to use my narrative"
    so_that: "I go from narrative to metric to riskiest bet without retyping"
    risk: low
    status: planned
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 1: The three skills, with files

**Status:** ⬜ not started

## Stories

### Story 1.1 — Port the three coaches into the plugin
**As** a product owner using Golden Frijoles, **I want** the PMF Narrative, North Star and Risk Validation coaches installed with the plugin, **so that** I get them in any project, not just in one person's account.
**Acceptance:** `skills/plugins/golden-frijoles/skills/{pmf-narrative,north-star,risk-validation}/SKILL.md` exist with `summary:` and their own `description`; `north-star`'s describes a North Star workshop, not risk validation. `render-skill-adverts --check` and `check-skill-scripts` pass; `plugin.json` lists 14 skills.
**Risk:** low

### Story 1.2 — Each writes its file
**As** the product owner, **I want** each coach to leave a file in `Roadmap/00-strategy/`, **so that** the result outlives the chat and a later session can revise it.
**Acceptance:** Each skill has a template for its contract (D3) and ends by writing or updating it with `status: draft`, asking before overwriting an `agreed` one. `north-star.md` includes a JSON block that validates against `northStarSyncSchema` (a test checks the template's example).
**Risk:** low

### Story 1.3 — The chain
**As** the product owner, **I want** each coach to offer the next, and Risk Validation to use my narrative, **so that** I go from narrative to metric to riskiest bet without retyping.
**Acceptance:** PMF Narrative ends offering North Star; North Star ends offering Risk Validation (and names `gf north-star set` once S3 ships); Risk Validation reads `pmf-narrative.md` when present and starts from its six dimensions.
**Risk:** low

## Sprint QA
- `render-skill-adverts --check`, `check-skill-scripts`, a template test per contract.
- Owed to Daniel: run the North Star skill once on Golden Frijoles and say whether the file is right; then remove the three account copies.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. In Claude Code in this repo, run `/plugin` and update Golden Frijoles
   → `pmf-narrative`, `north-star` and `risk-validation` are listed.
2. Ask "run a North Star workshop for Golden Frijoles"
   → the `north-star` skill starts (not risk validation), and at the end `Roadmap/00-strategy/north-star.md` exists with a metric, 3–5 inputs and a sync JSON block.
3. Ask for a risk validation after a PMF narrative exists
   → it starts from the narrative's six dimensions without asking for them again.

If any step fails, note the step number + what you saw — that's the bug report.
