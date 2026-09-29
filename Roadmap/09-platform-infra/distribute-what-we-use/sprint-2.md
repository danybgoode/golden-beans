---
epic: distribute-what-we-use
sprint: 2
title: "What a stranger's kit carries"
risk: high
phase: In review
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

**Status:** 🟦 In review

## Stories

### Story 2.1 — The review rail in the kit closure
**As** a stranger who installed only the plugin, **I want** the epic kickoff's review command to print a route in my repo, **so that** the review step stops pointing at a script I don't have.
**Acceptance:** `node skills/scripts/build-kit.mjs --list` includes `cross-review.mjs`, `review-route.mjs`, `lib/review-guard.mjs`, `cross-agent-doctor.mjs`, both prompts and a default `review-config.json`, reached through a skill's `requires_scripts`. In an isolated home with only the plugin installed, `node scripts/review-route.mjs --builder claude 1` prints a route (or DARK with the install line), never a crash. Missing CLIs show the "could not look" state.
**Risk:** high

### Story 2.2 — The build view renders outside our projects
**As** a stranger on a `feat/*` branch, **I want** the status line to show "Currently building", **so that** the build view isn't silent in every repo but ours.
**Acceptance:** `build-state.mjs` is in the kit closure. The hook always runs the copy bundled in the plugin and never a repo's `scripts/build-state.mjs`, present or not (D5 as corrected, README deviation 2). `build-view.test.mjs` covers both branches, and the new case was observed failing first.
**Risk:** high

### Story 2.3 — Byte-parity guard over the shared scripts
**As** a maintainer, **I want** a check that fails when a file in `scripts/` ∩ `skills/template/scripts/` differs without a listed reason, **so that** the 81 copies can't drift into the next three-way fork.
**Acceptance:** A guard (root CI) lists the intersection, passes when identical or listed in an allowlist with a one-line reason, and fails on an unlisted diff. A planted one-byte change turns it red. *(Cut line: second to go.)*
**Risk:** low

## Build contract (locked by the architect before the builder started)
Builds **D4, D5, D6** (README → *Architecture lock*).
- **2.1 (Codex):** extend `groom`'s `requires_scripts` with the review rail (D4 list) and `session-resume.mjs`
  + `session-note.mjs` (deviation 4), letting `check-skill-scripts` force the true closure. The default
  `review-config.json` in the kit is the template's (fill-in globs). `review-route.mjs` run with no `gh`/CLIs
  prints its DARK / could-not-look state and exits 0, never a stack trace. Proven in an isolated `HOME` with the
  packed kit tarball (`kit-tarball.test.mjs` extended). `golden-frijoles/SKILL.md:96` stops calling the
  cross-review rails "project-local". This repo gets byte-equal `scripts/session-resume.mjs` + `session-note.mjs`
  (and their libs).
- **2.2 (Claude):** `hooks/vendor/{build-state.mjs,lib/roadmap-contract.mjs,lib/session-journal.mjs}`, generated
  from `template/scripts/` by `render-skill-adverts.mjs` or a sibling `--check` script, and failing CI when stale.
  `index.ts` always runs the vendored copy, located from the module's own URL, and never `${root}/scripts/…`
  (D5). `build-view.test.mjs` pins the path choice (observed failing first against today's code). The
  runtime's support for `import.meta.url` inside a function-hooks module is **probed live** (`claude -p
  --plugin-dir … --debug`), not assumed (LEARNINGS, golden-frijoles-plugin).
- **2.3 (Codex):** `scripts/check-script-parity.mjs` over `scripts/` ∩ `skills/template/scripts/`. It passes on
  identical files or files listed in `scripts/script-parity.allowlist.json` with a reason, and it fails on an
  unlisted diff or a **stale** allowlist entry (listed but now identical, or missing). It is wired into root CI.
  A planted one-byte change turns it red.
- **Release:** one plugin/kit bump (D9).

## Build notes — what was built, and what the live system said

- **2.1 (Codex, finished by Claude).** Codex hit its usage cap mid-run (resets 2026-10-28) and left a partial
  apply. It had rewritten large parts of `groom/SKILL.md` to fit the new list under groom's 220-line budget, which
  cut meaning. That was reverted. The closure lives on the **umbrella `golden-frijoles` skill** instead (the
  stranger's front door; no line budget), with D4 unchanged in substance (the kit is the union of every skill's
  `requires_scripts`). Codex's other change was kept: `review-route.mjs` forces the security lens and renders a
  route when `gh` cannot read the PR, where it used to exit. Proof is on the **packed tarball**
  (`kit-tarball.test.mjs`): offline install into a stranger repo, `PATH` = node only, blank `HOME`.
  `review-route` prints DARK / could-not-look with the install line, and the project's config beats the kit's
  default. `session-resume` degrades. There is no stack trace. The test goes red with `review-route.mjs` out of
  the closure.
- **2.2 (Claude).**
  - The function-hooks runtime was probed live before designing: `import.meta.url` in a hook helper is the
    plugin's installed directory, and `$.process.run` can execute a file there.
  - `hooks/vendor/` holds `build-state.mjs` + `lib/{roadmap-contract,session-journal}.mjs`, derived by
    `render-hook-vendor.mjs` from the real import closure; `--check` runs in skills-ci.
  - **Live:** in a stranger repo on `feat/smoke-test` with a *hostile* `scripts/build-state.mjs` (it writes a
    marker file), a real `claude -p --plugin-dir …` session logged `build view: resolved (feat/smoke-test@…) (ok)`,
    and the marker never appeared.
  - The new specs were observed failing against the old hook.
- **2.3 (Claude subagent, Sonnet).** `check-script-parity.mjs` runs in the scripts guard, whose paths now include
  `skills/template/scripts/**`. Measured: 114 identical, 6 allowed with reasons. The planted one-byte change went
  red. It corrected the lock: `cross-panel.prompt.md` is identical here (deviation 1 amended).
- **Release 0.7.0.** The kit gains the rail, the session scripts and `build-state.mjs`.

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
