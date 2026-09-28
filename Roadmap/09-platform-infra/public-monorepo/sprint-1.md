---
epic: public-monorepo
sprint: 1
title: "S1 One repo, nothing published differently"
risk: high
phase: Locking architecture
stories_total: 3
stories:
  - id: S1.1
    title: "Subtree-merge dobby-foundation into skills/, with history"
    as_a: "a maintainer"
    i_want: "dobby-foundation's full history under skills/ in this repo"
    so_that: "a rail change is one PR, and the split still reproduces golden-frijoles/skills byte for byte"
    risk: high
    status: planned
  - id: S1.2
    title: "Skills CI gates monorepo PRs, run on the split"
    as_a: "a maintainer"
    i_want: "a PR touching skills/ gated by the same checks the mirror runs"
    so_that: "nothing reaches the mirror that its own CI would reject"
    risk: high
    status: planned
  - id: S1.3
    title: "The docs that describe the layout (absolute paths: disproved)"
    as_a: "an agent starting a session"
    i_want: "AGENTS.md and the repo layout to say skills/ exists and what it is"
    so_that: "nobody edits the mirror or the copies by mistake"
    risk: high
    status: planned
---
# One public monorepo — Sprint 1: S1 One repo, nothing published differently

**Status:** ⬜ not started

## Stories

### Story 1.1 — Subtree-merge dobby-foundation into skills/, with history
**As a maintainer**, **I want** dobby-foundation's full history under skills/ in this repo, **so that** a rail change is one PR, and the split still reproduces golden-frijoles/skills byte for byte.
**Acceptance:** `git subtree add --prefix=skills` (not squashed). `git subtree split --prefix=skills` equals the skills repo's `main` SHA (proven at the lock: `80d050a` = `80d050a`). Root eslint and prettier ignore `skills/`, because it keeps its own gates. This repo's CI is green.
**Risk:** high

### Story 1.2 — Skills CI gates monorepo PRs, run on the split
**As a maintainer**, **I want** a PR touching skills/ gated by the same checks the mirror runs, **so that** nothing reaches the mirror that its own CI would reject.
**Acceptance:** A root `skills-ci.yml` (PRs with `skills/**` changes) splits the prefix into a temporary worktree and runs `skills/.github/workflows/ci.yml`'s steps there, so git-reading scripts see mirror-relative paths. A sync check fails if the two step lists drift. A planted failure in `skills/` turns the job red.
**Risk:** high

### Story 1.3 — Absolute paths and the docs that describe the layout
**As an agent starting a session**, **I want** AGENTS.md and the repo layout to say skills/ exists and what it is, **so that** nobody edits the mirror or the copies by mistake.
**Acceptance:** AGENTS.md's layout and routing table name `skills/` and the mirror rule. *Scope disproved at build (2026-09-28):* the three `/Users/cosmo/dobby/golden-beans` hits are **quotations**: a retro note, a handoff doc, and a labelled fixture's text (byte-identical to the template's copy, so it must not be edited). No tool resolves them, so they stay as they are.
**Risk:** high

## Sprint QA
- Both CIs green on the PR (this repo's full gate + the new skills-ci on the split). A mutation check plants a failing skills test and sees skills-ci go red. No browser smoke.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` green, plus the skills checks from S1.2 on.

## Sprint 1 — Smoke walkthrough (do these in order)

1. Open https://github.com/danybgoode/golden-beans/tree/main/skills
   → the plugin, kit and template folders are there.
2. In a checkout, run `git log --oneline -- plugins/golden-frijoles | head` (the imported history keeps its original, unprefixed paths)
   → dobby-foundation's commits are listed.

If any step fails, note the step number + what you saw — that's the bug report.
