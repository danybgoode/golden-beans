---
epic: board-sinks-and-scrumban
sprint: 4
title: "Areas and the workspace board"
risk: high
phase: Shaping
stories_total: 2
stories:
  - id: S4.1
    title: "The Roadmap tab shows areas on a horizon"
    as_a: "the product owner or a stakeholder"
    i_want: "the Roadmap tab to show functional areas as rows and Shipped · Now · Next · Later as columns, each row in build order"
    so_that: "the high-level view answers \"where is each area heading\" with both seeds and scaffolded work"
    risk: low
    status: planned
  - id: S4.2
    title: "One board across a workspace"
    as_a: "a person with several products"
    i_want: "`/hub/w/<workspace>/board` showing initiatives from every project in that workspace I belong to, with a project filter"
    so_that: "I see all my work in one place"
    risk: high
    status: planned
---
# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Sprint 4: Areas and the workspace board

**Status:** ⬜ not started

## Build contract (locked by the architect before the builder started — README § Architecture lock)
- **S4.1** — D10, D19: the areas view groups rows by `area` and `stage` (Now = Building + QA, Next = Ready to
  build, Later = To groom + Grooming, Shipped = Shipped); `hub-roadmap-areas` registered per D23; the journey track
  retires.
- **S4.2** — D11, C8, C9: `/hub/w/<workspaceId>/board`. Reads only through `getWorkspaceProjects()` (AGENTS §
  The tenancy invariant; cite it, don't restate it), then each project's latest artifact by id. A workspace the
  viewer is not in, a malformed id, and a `?project=` outside the result all 404. The fresh reviewer and the
  security lens are mandatory.

## Stories

### Story 4.1 — The Roadmap tab shows areas on a horizon
**As** the product owner or a stakeholder, **I want** the Roadmap tab to show functional areas as rows and Shipped · Now · Next · Later as columns, each row in build order, **so that** the high-level view answers "where is each area heading" with both seeds and scaffolded work.
**Acceptance:** Matches the approved `hub-roadmap-areas` state; Now = Building + QA, Next = Ready to build, Later = To groom + Grooming; the journey track is retired and its "you are here" lives in the board's answer line; `hub.spec.ts` updated.
**Risk:** low

### Story 4.2 — One board across a workspace
**As** a person with several products, **I want** `/hub/w/<workspace>/board` showing initiatives from every project in that workspace I belong to, with a project filter, **so that** I see all my work in one place.
**Acceptance:** Reads only through `getWorkspaceProjects()` (workspaces epic). A project from another workspace in the filter 404s (api spec). ~~Before the workspaces epic ships, the route renders the `hub-workspace-board-unbuilt` state.~~ Moot: `workspaces` shipped 2026-10-01 (lock C9).
**Risk:** high — tenancy (cross-project read)

## Sprint QA
- **api spec(s):** S4.1 `e2e/hub.spec.ts` areas view; S4.2 cross-workspace 404 + member-only filter spec.
- **browser smoke owed:** yes, to Daniel: the workspace board (auth/tenancy path).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge (and `skills-ci` for anything under `skills/`).

## Sprint 4 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com

1. Go to https://goldenfrijoles.com/hub/golden-beans-demo **(auth path — owed to Daniel by name)**.
   → Areas as rows; Shipped · Now · Next · Later as columns.
2. Go to https://goldenfrijoles.com/hub/w/9e58bc7d-a0a8-43c9-89a2-c544cab854f2/board (Daniel's products — workspaces have ids, not slugs: C8).
   → Cards from every project in your workspace; a project filter lists only your projects.
3. Edit the URL to the other workspace's id, `01e9568b-f7d5-4d39-b8b5-d05e9c9d09b5`.
   → A 404 page.

If any step fails, note the step number + what you saw — that's the bug report.
