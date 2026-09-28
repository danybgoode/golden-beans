---
epic: public-monorepo
sprint: 4
title: "S4 Licences and identity"
risk: high
phase: Building
stories_total: 4
stories:
  - id: S4.1
    title: "Per-folder licences"
    as_a: "a stranger reading the repo"
    i_want: "each folder to say what I may do with it"
    so_that: "the engine is source-available and the funnel is open (E8)"
    risk: high
    status: planned
  - id: S4.2
    title: "Rename in place to danybgoode/golden-frijoles"
    as_a: "the product owner"
    i_want: "the repo named for the product"
    so_that: "one name everywhere (Decision 1 → B: no org transfer, because Vercel Hobby)"
    risk: high
    status: done
  - id: S4.3
    title: "A merge still deploys"
    as_a: "the product owner"
    i_want: "proof that merge-to-main still ships"
    so_that: "rule #4 holds after the rename"
    risk: high
    status: planned
  - id: S4.4
    title: "Local folder and Claude memory (owed to Daniel)"
    as_a: "the product owner"
    i_want: "exact commands to rename ~/dobby/golden-beans and move Claude Code's per-project history"
    so_that: "my sessions keep their memory after the move"
    risk: high
    status: planned
---
# One public monorepo — Sprint 4: S4 Licences and identity

**Status:** 🚧 building: S4.1 is held (draft #184, awaiting the lawyer).

## Stories

### Story 4.1 — Per-folder licences
**As a stranger reading the repo**, **I want** each folder to say what I may do with it, **so that** the engine is source-available and the funnel is open (E8).
**Acceptance:** `skills/` keeps Apache-2.0 + NOTICE. `packages/cli` and `packages/sdk` get Apache-2.0 (`license` field + LICENSE). `apps/web` and `supabase/` get FSL-1.1-ALv2. A root LICENSE maps the folders. **This is held unmerged until Daniel confirms the lawyer's OK.**
**Risk:** high

### Story 4.2 — Rename in place to danybgoode/golden-frijoles ✅ renamed 2026-09-28 with `gh repo rename`; the old URL redirects. Vercel `link.repoId` 1299999527 = the repo id, so the link survives the rename (proven by S4.3). References updated: `reporting.config.json`, `commit-report.mjs`, both `epic-dod.exemptions.json`, and the skills README/CONTRIBUTING/fill-ins/Roadmap pointers. Historical Roadmap mentions (97 files), test fixtures and labelled Jev data are left as they are, since redirects cover them.
**As the product owner**, **I want** the repo named for the product, **so that** one name everywhere (Decision 1 → B: no org transfer, because Vercel Hobby).
**Acceptance:** The repo is renamed on GitHub, and the old URL redirects. Every hard-coded `danybgoode/golden-beans` in scripts and docs is updated. Vercel's Git connection is verified or reconnected in the dashboard (**no CLI deploy**).
**Risk:** high

### Story 4.3 — A merge still deploys
**As the product owner**, **I want** proof that merge-to-main still ships, **so that** rule #4 holds after the rename.
**Acceptance:** The first merge after the rename appears in `gh api repos/danybgoode/golden-frijoles/deployments` with its SHA, and goldenfrijoles.com serves it.
**Risk:** high

### Story 4.4 — Local folder and Claude memory (owed to Daniel)
**As the product owner**, **I want** exact commands to rename ~/dobby/golden-beans and move Claude Code's per-project history, **so that** my sessions keep their memory after the move.
**Acceptance:** The sprint doc lists the `mv` commands for the folder and `~/.claude/projects/-Users-cosmo-dobby-golden-beans` → `-golden-frijoles`, to run between sessions. It's done when the next session starts in the new folder with its memory index loaded.
**Risk:** high

## Sprint QA
- The deploy proof (S4.3) is the gate. **Owed to Daniel:** the lawyer's OK before S4.1 merges, the Vercel dashboard check if it needs reconnecting, and S4.4's local moves.
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` green, plus the skills checks from S1.2 on.

## Sprint 4 — Smoke walkthrough (do these in order)

1. Open https://github.com/danybgoode/golden-beans
   → it redirects to danybgoode/golden-frijoles.
2. Open https://goldenfrijoles.com after the first post-rename merge
   → the site serves normally, and the footer or build id matches that merge.

If any step fails, note the step number + what you saw — that's the bug report.
