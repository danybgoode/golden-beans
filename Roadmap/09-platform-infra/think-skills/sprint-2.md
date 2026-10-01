---
epic: think-skills
sprint: 2
title: "Groom reads strategy"
risk: low
phase: Shipped
stories_total: 3
stories:
  - id: S2.1
    title: "Groom reads `00-strategy/`"
    as_a: "the product owner"
    i_want: "groom to say which input metric a seed moves and which risky dimension it tests"
    so_that: "every pitch is tied to the strategy I agreed"
    risk: low
    status: done
  - id: S2.2
    title: "The Roadmap tools ignore `00-strategy/`"
    as_a: "a maintainer"
    i_want: "the board, the extractor and the doc-format check to pass with the new folder"
    so_that: "strategy files never show up as epics or seeds, or fail CI"
    risk: low
    status: done
  - id: S2.3
    title: "`intent-match`'s think-chain route names the skills"
    as_a: "the product owner"
    i_want: "an \"is it worth doing?\" gap to point at the right coach"
    so_that: "the route leads somewhere real instead of \"answer by hand\""
    risk: low
    status: done
---
# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Sprint 2: Groom reads strategy

**Status:** ✅ Shipped — #215 (`ac13f46`), merged 2026-10-01; plugin + kit **0.18.0** released (`v0.18.0`)

## Stories

### Story 2.1 — Groom reads `00-strategy/` ✅
**As** the product owner, **I want** groom to say which input metric a seed moves and which risky dimension it tests, **so that** every pitch is tied to the strategy I agreed.
**Acceptance:** Groom Stage 0 loads `Roadmap/00-strategy/` when present; the seed template gains an optional line "Moves: <input> · Tests: <dimension>" (or "neither: <why>"). With no folder, groom says nothing about strategy. Groom's tests cover both.
**Risk:** low

### Story 2.2 — The Roadmap tools ignore `00-strategy/` ✅
**As** a maintainer, **I want** the board, the extractor and the doc-format check to pass with the new folder, **so that** strategy files never show up as epics or seeds, or fail CI.
**Acceptance:** `roadmap-extract`, `build-order` and `doc-format --check` pass with a fixture `00-strategy/`; a test per tool, observed failing first if the tool didn't already skip it.
**Risk:** low

### Story 2.3 — `intent-match`'s think-chain route names the skills ✅
**As** the product owner, **I want** an "is it worth doing?" gap to point at the right coach, **so that** the route leads somewhere real instead of "answer by hand".
**Acceptance:** The think-chain route's text names `pmf-narrative` / `risk-validation`. Only if `intent-match` S1.2 has shipped; otherwise cut.
**Risk:** low

## Build contract (locked by the architect before the builder started)

Cites the epic README's C3–C5 and D3, D5, D8, D9 and D10. Nothing here restates a rule that lives there.

1. **2.1 (D5):** `skills/plugins/golden-frijoles/skills/groom/strategy.mjs` plus `strategy.test.mjs`, added to
   skills-ci's groom test list through `render-skills-ci.mjs`. The test's fixtures are the three S1 templates, read
   from their skill folders. It covers four cases: folder absent (no output, exit 0), all three present, only one
   present, and a malformed sync block (the file is named, no crash). Stage 0 in `groom/SKILL.md` gains one sentence.
   `templates/scope-seed.md` gains the optional line.
2. **2.2 (D8, C3):** pins only, no walker change. `roadmap-extract` is covered in `skills/template/scripts` and the
   root, with a fixture root through the extractor's root option or `cwd`, whichever it already supports; the builder
   checks which. `doc-format` is covered through its exported `checkOneDoc`. Each pin is seen failing once through a
   walker mutation. **Deviation, said out loud (the build):** no walker mutation exists to observe. A flat file is skipped
   twice over (it isn't a directory, and it has no README), so no plausible one-line change to the extractor's or the
   board's walk picks it up. Each pin is seen failing on the D8 violation instead: a strategy subfolder with a
   `README.md`. doc-format's per-file path is the exception: widening its sprint-file match to `/\.md$/` does turn its
   `--files` pin red (fresh review, #215). The template's
   extractor and doc-format run through `GF_PROJECT_ROOT`. This repo's `roadmap-to-notion.mjs` ignores that variable, so
   it runs from a temp copy (`scripts/roadmap-to-notion.strategy.test.mjs`).
3. **2.3 (D9):** `ROUTES.think_chain` changes in both copies, `check-script-parity` stays green, and the groom
   reference line changes with it. `intent.json` is not touched.
4. **Release (D10):** plugin and kit move to 0.18.0, with a CHANGELOG section.

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

### Smoke results (2026-10-01, `main` @ `fbce291`)

1. ✅ (the reader half) With a filled `Roadmap/00-strategy/north-star.md` in this repo, `node
   skills/plugins/golden-frijoles/skills/groom/strategy.mjs` printed the metric `weekly_planned_seeds` and the inputs
   `activated_projects · seeds_groomed`, plus the pitch-line shape. Without the folder it prints nothing (exit 0). A
   full groom of a seed with the line written is ⬜ **owed to Daniel**, once a real `north-star.md` exists.
2. ✅ With `north-star.md` and `risk-validation.md` in `Roadmap/00-strategy/`, `node scripts/build-order.mjs --check`
   reported the board up to date (after regenerating it for unrelated merge drift on `main`). `node
   scripts/doc-format.mjs` named no strategy file, and `roadmap-extract` emitted no `00-strategy` row. The files were
   removed afterwards.
