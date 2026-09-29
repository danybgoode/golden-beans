---
epic: distribute-what-we-use
sprint: 4
title: "Schedulers"
risk: low
phase: Building
stories_total: 2
stories:
  - id: S4.1
    title: "Routines as kit assets + a `/schedule`-ready bootstrap"
    as_a: "a stranger who wants the nightly and weekly reports"
    i_want: "a command that fills the routine prompts from `golden-frijoles.config.json` and prints one ready to paste into `/schedule`"
    so_that: "I can stand up a routine without hand-editing placeholders"
    risk: low
    status: planned
  - id: S4.2
    title: "GitHub Actions cron templates for model-free parts"
    as_a: "a stranger without routines"
    i_want: "cron workflow templates for the parts that need no model"
    so_that: "the model-free reports still run on a schedule"
    risk: low
    status: planned
---
# Distribute what we use — one review rail, Jev and notify setup, schedulers, build view — Sprint 4: Schedulers

**Status:** 🟦 In review

## Stories

### Story 4.1 — Routines as kit assets + a `/schedule`-ready bootstrap
**As** a stranger who wants the nightly and weekly reports, **I want** a command that fills the routine prompts from `golden-frijoles.config.json` and prints one ready to paste into `/schedule`, **so that** I can stand up a routine without hand-editing placeholders.
**Acceptance:** The seven prompts + runbook ship in the kit. The bootstrap refuses while any `TEMPLATE FILL-IN` / `<app-repo>` placeholder remains (grep-to-zero, `check-template-drift` grammar). The runbook says: minimum interval one hour, a daily run cap, and a custom network environment for a routine that posts to Telegram. `routines.test.mjs` covers fill and refusal.
**Risk:** low

### Story 4.2 — GitHub Actions cron templates for model-free parts
**As** a stranger without routines, **I want** cron workflow templates for the parts that need no model, **so that** the model-free reports still run on a schedule.
**Acceptance:** Templates under `skills/template/.github/workflows/` carry a loud note (or keep-alive) because Actions disables `schedule` after 60 quiet days. *(Cut line: first to go.)*
**Risk:** low

## Build contract (locked by the architect before the builder started)
Builds **D10** (README → *Architecture lock*). Builder: Codex.
- **4.1:** `routines/` (the seven prompts + README) enters the kit through a skill's `requires_scripts`. A
  `routine-bootstrap.mjs <name>` fills the declared fill-ins from `golden-frijoles.config.json` → `routines`
  (a new registry row, `askWhen: 'first-routine'`) and prints the paste-ready prompt. It refuses (exit 1, naming
  every one) while any fill-in or `TEMPLATE FILL-IN` remains, and never touches a runtime token. The runbook
  states: one-hour minimum interval, a daily run cap, and a custom network environment for any routine that posts
  to Telegram. `routines.test.mjs` covers fill, refusal and runtime-token passthrough.
- **4.2 (cut line, first to go):** model-free cron templates (`standup`, `build-order-sync --check`) under
  `skills/template/.github/workflows/` as `.yml.example`, each with the 60-day-disable note in its header.
- **Release:** one plugin/kit bump (D9).

## Build notes

- **4.1 + 4.2 (Codex, finished by Claude).** Codex hit its usage cap mid-run (resets 2026-10-29). Its partial apply
  was read before being kept:
  - **Kept:** the bootstrap, its token table (it read each token in context and classified 28, beyond D10's
    list), the `routines` config section and registry row (all three registry copies byte-equal), the kit
    declaration, the runbook section and the cron templates.
  - **Removed:** its copies of the template's seven fill-in prompts into THIS repo's `scripts/routines/`, which
    is project-owned.
  - **Added by Claude:** a grep-to-zero backstop, so any placeholder the table does not classify refuses, plus a
    spec that every real prompt is fully classified.
  - **Live smoke steps 1–2:** with a filled config, `routine-bootstrap.mjs weekly-recap` printed 68 lines with no
    placeholder left. With one value removed it refused, naming `root-repo`. Mutations were observed red.
- **Release 0.9.0.**

## Sprint QA
- `routines.test.mjs` extended (fill from config, refuse on a leftover placeholder).
- Owed to Daniel: stand up one routine from the bootstrap at https://claude.ai/code/routines.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)

1. In a repo with `golden-frijoles.config.json` filled, run the bootstrap for `weekly-recap`.
   → it prints a full prompt with no `TEMPLATE FILL-IN` or `<app-repo>` left.
2. Delete one value from the config and run it again.
   → it refuses and names the missing value.
3. Paste the printed prompt into `/schedule` in Claude Code (or at https://claude.ai/code/routines).
   → the routine is created and appears in the list.

If any step fails, note the step number + what you saw — that's the bug report.
