---
epic: distribute-what-we-use
sprint: 2
title: "What a stranger's kit carries"
risk: high
phase: Shaping
stories_total: 3
stories:
  - id: S2.1
    title: "The review rail in the kit closure"
    as_a: "a stranger who installed only the plugin"
    i_want: "the epic kickoff's review command to print a route in my repo"
    so_that: "the review step stops pointing at a script I don't have"
    risk: high
    status: planned
  - id: S2.2
    title: "The build view renders outside our projects"
    as_a: "a stranger on a `feat/*` branch"
    i_want: "the status line to show \"Currently building\""
    so_that: "the build view isn't silent in every repo but ours"
    risk: high
    status: planned
  - id: S2.3
    title: "Byte-parity guard over the shared scripts"
    as_a: "a maintainer"
    i_want: "a check that fails when a file in `scripts/` ∩ `skills/template/scripts/` differs without a listed reason"
    so_that: "the 81 copies can't drift into the next three-way fork"
    risk: low
    status: planned
---
# Distribute what we use — one review rail, Jev and notify setup, schedulers, build view — Sprint 2: What a stranger's kit carries

**Status:** ⬜ not started

## Stories

### Story 2.1 — The review rail in the kit closure
**As** a stranger who installed only the plugin, **I want** the epic kickoff's review command to print a route in my repo, **so that** the review step stops pointing at a script I don't have.
**Acceptance:** `node skills/scripts/build-kit.mjs --list` includes `cross-review.mjs`, `review-route.mjs`, `lib/review-guard.mjs`, `cross-agent-doctor.mjs`, both prompts and a default `review-config.json`, reached through a skill's `requires_scripts`. In an isolated home with only the plugin installed, `node scripts/review-route.mjs --builder claude 1` prints a route (or DARK with the install line), never a crash. Missing CLIs show the "could not look" state.
**Risk:** high

### Story 2.2 — The build view renders outside our projects
**As** a stranger on a `feat/*` branch, **I want** the status line to show "Currently building", **so that** the build view isn't silent in every repo but ours.
**Acceptance:** `build-state.mjs` is in the kit closure. `hooks/build-view.mjs` runs the kit's copy by absolute path when the project has no `scripts/build-state.mjs`, and never resolves a same-named file from the stranger's repo (D5). `build-view.test.mjs` covers both branches, and the new case was observed failing first.
**Risk:** high

### Story 2.3 — Byte-parity guard over the shared scripts
**As** a maintainer, **I want** a check that fails when a file in `scripts/` ∩ `skills/template/scripts/` differs without a listed reason, **so that** the 81 copies can't drift into the next three-way fork.
**Acceptance:** A guard (root CI) lists the intersection, passes when identical or listed in an allowlist with a one-line reason, and fails on an unlisted diff. A planted one-byte change turns it red. *(Cut line: second to go.)*
**Risk:** low

## Sprint QA
- Kit tarball test (`kit-tarball.test.mjs`) extended for the new closure; `check-skill-scripts` green.
- Isolated-home install (golden-frijoles-plugin S5 recipe): plugin only, no repo `scripts/`.
- Owed to Daniel: the stranger walkthrough below on a clean machine or fresh user account.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. On a clean machine (or a new macOS user), install the plugin from https://github.com/golden-frijoles/skills with the install prompt in its README.
   → the install finishes with no error.
2. In a fresh repo, run `git switch -c feat/smoke-test` and open Claude Code there.
   → the status line shows "Currently building".
3. Run `node scripts/review-route.mjs --builder claude 1` from the kit (the path the kickoff prints).
   → it prints which family takes the general pass, or says DARK and how to install one.

If any step fails, note the step number + what you saw — that's the bug report.
