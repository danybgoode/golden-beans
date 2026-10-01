---
epic: think-skills
sprint: 1
title: "The three skills, with files"
risk: low
phase: Building
stories_total: 3
stories:
  - id: S1.1
    title: "Port the three coaches into the plugin"
    as_a: "a product owner using Golden Frijoles"
    i_want: "the PMF Narrative, North Star and Risk Validation coaches installed with the plugin"
    so_that: "I get them in any project, not just in one person's account"
    risk: low
    status: done
  - id: S1.2
    title: "Each writes its file"
    as_a: "the product owner"
    i_want: "each coach to leave a file in `Roadmap/00-strategy/`"
    so_that: "the result outlives the chat and a later session can revise it"
    risk: low
    status: done
  - id: S1.3
    title: "The chain"
    as_a: "the product owner"
    i_want: "each coach to offer the next, and Risk Validation to use my narrative"
    so_that: "I go from narrative to metric to riskiest bet without retyping"
    risk: low
    status: done
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 1: The three skills, with files

**Status:** 🟦 In review

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

## Build contract (locked by the architect before the builder started)

Cites the epic README's C1–C7 and D1–D11. Nothing here restates a rule that lives there.

1. **Files (D2):** `skills/plugins/golden-frijoles/skills/{pmf-narrative,north-star,risk-validation}/SKILL.md` and
   `…/<name>/templates/<name>.md`. Nothing else under `plugins/` is hand-edited. The adverts are regenerated with
   `node skills/scripts/render-skill-adverts.mjs`, and `plugin.json` ends up listing 14 skills.
2. **Text (D1, source per C6):** the account copy's body, verbatim, plus the D1 edits and nothing more.
   `north-star`'s `description` describes a North Star workshop (its trigger words: "North Star", "input metrics",
   "leading indicator").
3. **Contracts (D3):** each template has the D3 frontmatter and headings, and the North Star template's example sync
   block passes `northStarSyncSchema`. Tests: `skills/scripts/strategy-templates.test.mjs` (added to skills-ci's
   harness list through `scripts/render-skills-ci.mjs`) and `apps/web/lib/north-star-template.test.ts`. Each is seen
   failing once by mutating a template.
4. **Chain (D4):** the offer-next endings. Risk Validation's Step 1 reads the narrative file when it exists. The North
   Star skill doesn't name `gf north-star set` yet; S3 adds that (D10).
5. **Release (D10):** plugin and kit move to 0.17.0, with a CHANGELOG section. The gates are `check-release`,
   `check-skill-scripts`, `check-plugin-leaks`, `render-skill-adverts --check`, `render-skills-ci --check`, and the
   root CI gate.

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
