---
epic: board-sinks-and-scrumban
sprint: 3
title: "Every client reads it"
risk: low
phase: Shaping
stories_total: 4
stories:
  - id: S3.1
    title: "The CLI mod is a client of the resolver"
    as_a: "a builder watching the terminal"
    i_want: "`build-state.mjs` to take stage from `resolveStage` (one `gh` call when online) or from the snapshot with its age when offline, and to end with a link to the card on the Hub"
    so_that: "the mod stops guessing and agrees with the Hub"
    risk: low
    status: planned
  - id: S3.2
    title: "Strangers can feed the Hub from the kit"
    as_a: "a user of the plugin in another repo"
    i_want: "`roadmap-push.mjs` in the kit and `roadmap-extract --sink terminal|hub|notion`"
    so_that: "one projector feeds every sink, including the hosted board"
    risk: low
    status: planned
  - id: S3.3
    title: "Notion gets the stage column"
    as_a: "a team that keeps a Notion board"
    i_want: "the optional Notion sink to write the six-stage `stage` value"
    so_that: "Notion agrees with the Hub too"
    risk: low
    status: planned
  - id: S3.4
    title: "WIP is advice at the moment of pulling"
    as_a: "the product owner"
    i_want: "`board.wip` (Building, QA) in `golden-frijoles.config.json` and a one-line warning from `emit-epic-kickoff` when Building is at its limit"
    so_that: "scrumban's pull is visible without a gate"
    risk: low
    status: planned
---
# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Sprint 3: Every client reads it

**Status:** ⬜ not started

## Build contract (to be locked by the architect before the builder starts)
- D2/D4 from the README. Every change under `skills/` is a plugin release (`skills/RELEASING.md`), mirrored to `golden-frijoles/skills`.

## Stories

### Story 3.1 — The CLI mod is a client of the resolver
**As** a builder watching the terminal, **I want** `build-state.mjs` to take stage from `resolveStage` (one `gh` call when online) or from the snapshot with its age when offline, and to end with a link to the card on the Hub, **so that** the mod stops guessing and agrees with the Hub.
**Acceptance:** The five-line view prints the stage word, its source and age, and `Board ↗ <hub url>?card=<slug>`; the hub URL comes from config (`hub.url`) or is omitted with no error when unset; the 2026-10-01 mismatches (Scenarios at 10/10 shown as Building) can't recur (fixture spec).
**Risk:** low

### Story 3.2 — Strangers can feed the Hub from the kit
**As** a user of the plugin in another repo, **I want** `roadmap-push.mjs` in the kit and `roadmap-extract --sink terminal|hub|notion`, **so that** one projector feeds every sink, including the hosted board.
**Acceptance:** `npx -y @golden-frijoles/kit roadmap-extract --sink hub` pushes with `GROWTH_ENGINE_URL` + the project key; `--sink terminal` prints BUILD-ORDER-style text; `check-skill-scripts` and the kit tarball test pass. Plugin release noted in `skills/CHANGELOG.md`.
**Risk:** low

### Story 3.3 — Notion gets the stage column
**As** a team that keeps a Notion board, **I want** the optional Notion sink to write the six-stage `stage` value, **so that** Notion agrees with the Hub too.
**Acceptance:** `optional/notion/roadmap-to-notion.mjs` maps `stage` to a select property; this repo's `notion-sync.yml` run shows the new column.
**Risk:** low

### Story 3.4 — WIP is advice at the moment of pulling
**As** the product owner, **I want** `board.wip` (Building, QA) in `golden-frijoles.config.json` and a one-line warning from `emit-epic-kickoff` when Building is at its limit, **so that** scrumban's pull is visible without a gate.
**Acceptance:** Config key registered in `config-registry.mjs` with a default; the warning names the limit and the cards in Building; the kickoff is still printed (never blocks).
**Risk:** low

## Sprint QA
- **api spec(s):** S3.1 `build-state.test.mjs` fixtures; S3.2 kit tarball + `--sink` spec; S3.3 notion mapping spec; S3.4 config + kickoff warning spec.
- **browser smoke owed:** no (terminal steps in the walkthrough).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge (and `skills-ci` for anything under `skills/`).

## Sprint 3 — Smoke walkthrough (do these in order)
Env: your terminal + production · https://goldenfrijoles.com

1. In Claude Code on a `feat/<slug>` branch, look at the build view above the prompt.
   → It shows the stage word, "stage from GitHub, <age>", and a `Board ↗` link.
2. Click the `Board ↗` link.
   → https://goldenfrijoles.com/hub/golden-frijoles/board opens with that card's drawer.
3. Turn the network off and open a new Claude Code turn.
   → The build view says "stage from snapshot, <age>".
4. In a scratch repo with the plugin installed, run `npx -y @golden-frijoles/kit roadmap-extract --sink terminal`.
   → A six-stage board prints in the terminal.
5. With Building at its WIP limit, run `emit-epic-kickoff` for a Ready to build epic.
   → One warning line names the limit; the kickoff still prints.

If any step fails, note the step number + what you saw — that's the bug report.
