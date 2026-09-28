---
epic: one-roadmap
sprint: 1
title: "S1 Move, renumber, regenerate"
risk: low
phase: Building
stories_total: 4
stories:
  - id: S1.1
    title: "Move the plugin Roadmap here"
    as_a: "the product owner"
    i_want: "dobby-foundation's epics, seeds, audits and bets in this repo's Roadmap"
    so_that: "one repo holds every Golden Frijoles plan"
    risk: low
    status: in-progress
  - id: S1.2
    title: "Renumber build_order as ship history"
    as_a: "the product owner"
    i_want: "one unique build_order sequence across both repos' work"
    so_that: "the board reads as one list from the first thing built to the last thing planned"
    risk: low
    status: in-progress
  - id: S1.3
    title: "LEARNINGS, poster and board"
    as_a: "an agent starting a session"
    i_want: "the plugin repo's learnings and shipped epics in the docs I already read"
    so_that: "a past retro reaches me without opening a second repo"
    risk: low
    status: in-progress
  - id: S1.4
    title: "dobby-foundation pointer and worktree prune"
    as_a: "the product owner"
    i_want: "dobby-foundation's Roadmap to point here and the stale local worktrees gone"
    so_that: "nobody plans in the old home by accident"
    risk: low
    status: planned
---
# One Roadmap — the plugin's epics, seeds, bets and learnings move here — Sprint 1: S1 Move, renumber, regenerate

**Status:** 🚧 building

## Stories

### Story 1.1 — Move the plugin Roadmap here
**As a** product owner, **I want** dobby-foundation's epics, seeds, audits and bets in this repo's Roadmap, **so that**
one repo holds every Golden Frijoles plan.
**Acceptance:** the 6 plugin epics are under `Roadmap/09-platform-infra/`, the 12 seeds are in `00-ideas/seeds/`, the
3 audits are in `00-ideas/audits/` and the 3 wave bets are in `bets/`. Colliding names get a `-plugin` suffix,
every link to them is updated, and no relative link in a moved file is broken.
**Risk:** low

### Story 1.2 — Renumber build_order as ship history
**As a** product owner, **I want** one unique `build_order` sequence, **so that** the board reads as ship history.
**Acceptance:** 28–54 are unique, and each epic's README and seed agree on its number. The plugin epics are 29–34,
`experiments-for-humans` is 35, the queue runs 36–54, and `review-rail-one-implementation` (46) comes before
`distribute-what-we-use` (47).
**Risk:** low

### Story 1.3 — LEARNINGS, poster and board
**As an** agent starting a session, **I want** the plugin's learnings and shipped epics in the docs I already
read, **so that** a past retro reaches me.
**Acceptance:** dobby-foundation's 45 LEARNINGS entries that were not already here are appended verbatim under
"From the plugin repo". The poster's 09 section lists the 6 epics. `node scripts/build-order.mjs --check` and
`node scripts/doc-format.mjs --check` report no new drift.
**Risk:** low

### Story 1.4 — dobby-foundation pointer and worktree prune
**As a** product owner, **I want** dobby-foundation's `Roadmap/README.md` to point here and the stale worktrees gone,
**so that** nobody plans in the old home.
**Acceptance:** the dobby-foundation PR removes the moved docs and LEARNINGS, replaces the poster with a pointer and
regenerates its board, and CI is green. The clean, merged worktrees are removed. `golden-beans-gfp-s2`, which has
uncommitted work, is reported and not touched.
**Risk:** low

## Sprint QA
- **api spec(s):** none, because nothing here is code. The checks are `build-order.mjs --check`, `doc-format.mjs --check`
  and a relative-link check over the moved files, all run in both repos.
- **browser smoke owed:** no (no rendered surface).
- **deterministic gate:** this repo's CI on the docs PR, and dobby-foundation's CI (board, doc-format, build-state and
  WAYS-OF-WORKING checks) on the pointer PR.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: GitHub, `main` of both repos, after both PRs merge.

1. Open https://github.com/danybgoode/golden-beans/blob/main/Roadmap/00-ideas/BUILD-ORDER.md
   → "Shipped" lists Ways-of-work lean pass, Plugin audit + extraction, Golden Frijoles by default, the build view
   and Jev semantic guards. "Building now" lists One plugin, one install and One Roadmap.
2. Open https://github.com/danybgoode/golden-beans/blob/main/Roadmap/09-platform-infra/jev-semantic-guards/README.md
   → the epic README is here, with `build_order: 33`. (Don't click it from the board: the board's epic links
   resolve one folder too high. That bug predates this epic and is logged in the retro.)
3. Open https://github.com/golden-frijoles/skills/blob/main/Roadmap/README.md
   → a short pointer README that links back to the golden-beans Roadmap. It has no feature map.

If any step fails, note the step number + what you saw — that's the bug report.
