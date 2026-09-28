---
epic: public-monorepo
sprint: 2
title: "S2 The mirror cut-over"
risk: high
phase: Building
stories_total: 4
stories:
  - id: S2.1
    title: "A mirror job with an off switch"
    as_a: "the product owner"
    i_want: "every merge touching skills/ published to golden-frijoles/skills automatically"
    so_that: "strangers keep installing from the same place"
    risk: high
    status: done
  - id: S2.2
    title: "Dry run to a branch"
    as_a: "the product owner"
    i_want: "the first mirror push to land on a throwaway branch"
    so_that: "a wrong split can't reach main"
    risk: high
    status: done
  - id: S2.3
    title: "Go live with a real release"
    as_a: "a stranger"
    i_want: "the first release made through the mirror to install cleanly"
    so_that: "the move is proven, not assumed"
    risk: high
    status: planned
  - id: S2.4
    title: "The skills repo becomes a mirror"
    as_a: "the product owner"
    i_want: "golden-frijoles/skills writable only by the mirror"
    so_that: "two writable homes can't fork again"
    risk: high
    status: planned
---
# One public monorepo — Sprint 2: S2 The mirror cut-over

**Status:** 🚧 building

## Stories

### Story 2.1 — A mirror job with an off switch ✅ #181 `0932c7c`
**As the product owner**, **I want** every merge touching skills/ published to golden-frijoles/skills automatically, **so that** strangers keep installing from the same place.
**Acceptance:** On push to `main` touching `skills/**`, and when the `MIRROR_ENABLED` repo variable is `true`: split the prefix and push it to the skills repo with a deploy key (write access on that repo only). A non-fast-forward is refused, never forced.
**Risk:** high

### Story 2.2 — Dry run to a branch ✅ run 36482738077: pushed `80d050a` to `mirror-test`, which equalled skills `main` and the split; branch deleted
**As the product owner**, **I want** the first mirror push to land on a throwaway branch, **so that** a wrong split can't reach main.
**Acceptance:** A `workflow_dispatch` with `target=mirror-test` pushes the split. `git diff golden-frijoles/skills main mirror-test` is empty, or holds exactly the monorepo's skills changes. The branch is then deleted.
**Risk:** high

### Story 2.3 — Go live with a real release
**As a stranger**, **I want** the first release made through the mirror to install cleanly, **so that** the move is proven, not assumed.
**Acceptance:** A patch bump in `skills/` merges here. The mirror pushes it, and the skills repo's own `release.yml` publishes `@golden-frijoles/kit` with provenance and tags `v<version>`. The install prompt run in an isolated home installs that version.
**Risk:** high

### Story 2.4 — The skills repo becomes a mirror
**As the product owner**, **I want** golden-frijoles/skills writable only by the mirror, **so that** two writable homes can't fork again.
**Acceptance:** Branch protection on skills `main` allows only the deploy key. The skills README and CONTRIBUTING send PRs to this repo. `~/dobby/dobby-foundation` is archived locally (moved to `~/dobby/archive/`, since it's already clean and pushed).
**Risk:** high

> **Build notes (2026-09-28).**
> - The org had deploy keys **disabled**. Daniel approved enabling them (`deploy_keys_enabled_for_repositories=true`).
>   Key `golden-beans mirror (public-monorepo S2)` is read-write on `golden-frijoles/skills` only, and its private half
>   exists only in the `SKILLS_MIRROR_KEY` secret here.
> - After the #181 review, the key was **rotated into the `skills-mirror` Environment** (deployment branches: `main` only),
>   the repo-level secret and first key were deleted, and skills ruleset 23893033 gained a `DeployKey` bypass (the approved
>   S2.4 protection, done early so S2.3's push isn't rejected).
> - Skills ruleset 23893033 is now **`main: mirror-only`**: `required_status_checks` + `update` + `deletion` +
>   `non_fast_forward`, with bypass for `DeployKey` and, deliberately, the admin role as an emergency door (pr-reviewer, #182).
> - `MIRROR_ENABLED=false` until S2.3. The S2.2 dry run is a dispatch to `mirror-test`, which the job allows while
>   the switch is off. Only pushes to `main` need it on.
> - `workflow_dispatch` runs only once the workflow is on `main`, so the dry run (S2.2) comes right after this PR merges.

## Sprint QA
- The isolated-home install of the mirrored release is the gate (golden-frijoles-plugin S5's recipe). Browser smoke: none. **Owed to Daniel:** step 3 of the walkthrough (install in a scratch repo).
- **deterministic gate:** `npm run typecheck` + `npm run build` + Playwright `api` green, plus the skills checks from S1.2 on.

## Sprint 2 — Smoke walkthrough (do these in order)

1. Open https://github.com/golden-frijoles/skills/commits/main
   → the newest commit matches the last `skills/` change merged here.
2. Open https://www.npmjs.com/package/@golden-frijoles/kit
   → the new version shows a provenance badge.
3. In an empty folder, paste the install prompt from https://goldenfrijoles.com/install
   → the plugin installs at the new version.

If any step fails, note the step number + what you saw — that's the bug report.
