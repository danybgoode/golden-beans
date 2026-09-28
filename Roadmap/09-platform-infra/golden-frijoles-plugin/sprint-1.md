---
epic: golden-frijoles-plugin
sprint: 1
title: "Identity, license, releases"
risk: high
phase: Shipped
stories_total: 5
stories:
  - id: S1.1
    title: "License the public repo"
    as_a: "a stranger who found the repo"
    i_want: "an Apache-2.0 license and a NOTICE"
    so_that: "I'm allowed to use what I install"
    risk: low
    status: done
  - id: S1.2
    title: "Create the org and transfer the repo (owed to Daniel)"
    as_a: "Daniel"
    i_want: "the `golden-frijoles` org to own the repo as `golden-frijoles/skills`"
    so_that: "the install line names the product, not a person"
    risk: high
    status: done
  - id: S1.3
    title: "Rename the marketplace and plugin to golden-frijoles"
    as_a: "a Claude Code user"
    i_want: "`claude plugin install golden-frijoles@golden-frijoles`"
    so_that: "the install line is the product's name"
    risk: high
    status: done
  - id: S1.4
    title: "Switch both consumers in the same sprint"
    as_a: "Daniel"
    i_want: "golden-beans and medusa-bonsai to load `golden-frijoles@golden-frijoles`"
    so_that: "no session in either repo loses its skills on the day the rename lands"
    risk: high
    status: done
  - id: S1.5
    title: "Tagged releases a user can pin"
    as_a: "a stranger"
    i_want: "versioned releases with a changelog"
    so_that: "I can pin a release and roll back from a bad one"
    risk: low
    status: done
---
# One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo — Sprint 1: Identity, license, releases

**Status:** ✅ shipped 2026-09-23. golden-frijoles/skills#44 (`0c33e53`, release `v0.1.0` cut by CI), danybgoode/golden-beans#161 (`a8aec53`, Vercel production ✅), danybgoode/miyagi-product-management#194 (`ac450c1`), all merged within 8 s · **Wave:** 1

The skateboard: the plugin anyone can already install gets the product's name, a license that permits using it, and releases people can pin and roll back to.

## Build contract (locked by the architect before the builder started)

Cites the epic README's D4, D5, D6, D8 and deviations X3, X5, X8, X11. **Branch:** `feat/golden-frijoles-plugin`
(base `main`). **One PR** holds S1.1, S1.3 and S1.5. S1.4 is **two consumer PRs**, one in golden-beans and one in
medusa-bonsai, on `feat/golden-frijoles-plugin` in each. S1.2 is Daniel's. Commit per story, path-scoped, with the
story id in the subject.

**S1.1: License.**
- Root `LICENSE` holds the canonical Apache-2.0 text, byte-for-byte from `gh api licenses/apache-2.0 --jq .body` (that's
  what GitHub's detector matches). Leave the appendix placeholders as they are.
- Root `NOTICE`: `Golden Frijoles skills` / `Copyright 2026 The Golden Frijoles authors`. One paragraph says that
  "Golden Frijoles" and its logo are trademarks, that Apache-2.0 §6 grants no trademark rights, and that forks must not
  use the name for their own distribution. **No personal name** (role-name rule).
- Add `LICENSE` and `NOTICE` to the leak guard's `SCAN_FILES`.
- The `kit/package.json` license line is S2's to write.

**S1.3: Rename (D6: identifiers only).**
- `git mv plugins/ways-of-work plugins/golden-frijoles`. In `marketplace.json`: `name: golden-frijoles`, and the plugin
  entry `name: golden-frijoles`, `source: ./plugins/golden-frijoles`. In `plugin.json`: `name: golden-frijoles`.
- Every path constant that names the dir: `render-skill-adverts.mjs`, `check-skill-scripts.mjs`, `pack-skills.mjs`,
  `check-onboarding-parity.mjs`, every `ci.yml` step, and their tests.
- `hooks/index.ts` `STORE_KEY` → `golden-frijoles/build-view`.
- `renderDescriptions()`: rewrite the three description strings for a public product. Drop "~/dobby sibling projects",
  "internal plugin" and "Every git commit is a new version" (that's false after S1.5). Say "Golden Frijoles: the
  planning, build and operate skills (N): …".
- Shipped files that name the old identity: rewrite each one, don't allowlist it. That covers `README.md` install
  lines + the settings snippet, `template/.claude/settings.json` (marketplace key `golden-frijoles`, repo
  `golden-frijoles/skills`, `golden-frijoles@golden-frijoles: true`), `template/README.md`,
  `template/Roadmap/00-ideas/README.md`, `template/scripts/routines/*.prompt.md` + `routines/README.md`, the
  header comments of `template/scripts/doc-hygiene.mjs:6` and `doc-format.mjs:3`, and
  `template/Roadmap/WAYS-OF-WORKING.template.md`'s two links (→ `golden-frijoles/skills`). Then re-render both
  WAYS-OF-WORKINGs, re-copy `scripts/doc-format.mjs` and `Roadmap/WAYS-OF-WORKING.template.md` so the `cmp` steps
  hold, and update `scripts/epic-dod.exemptions.json`.
- **Don't** touch `ways-of-work-lean-pass` provenance, `render-ways-of-working`, or `Roadmap/` history.
- New leak-guard rule `retired plugin identity`:
  `/ways-of-work@|plugins\/ways-of-work|`ways-of-work` plugin|dobby-foundation marketplace|danybgoode\/dobby-foundation/`.
  The `## Origin` provenance lines in `README.md` get `ALLOW` entries with a reason, and they're the only ones.
  Fixtures in `check-plugin-leaks.test.mjs`: it fires on `ways-of-work@dobby-foundation` in a shipped file, and it
  doesn't fire on `ways-of-work-lean-pass` or `render-ways-of-working`. Watch the test fail once by mutation.
- `claude plugin validate plugins/golden-frijoles` passes locally, and the full CI gate passes locally (every `ci.yml`
  step, run by hand).

**S1.5: Releases (D4, D5).**
- `plugin.json` `"version": "0.1.0"`, with no `version` on the marketplace entry (plugin.json wins).
- `CHANGELOG.md` (Keep a Changelog, `## [0.1.0] - 2026-09-23`).
- `RELEASING.md`: bump `plugin.json` (+ `kit/package.json` from S2) + CHANGELOG in the PR; merge; CI publishes and
  tags. Pinning: `claude plugin marketplace add golden-frijoles/skills@v0.1.0`. Rollback = revert + bump.
- `scripts/check-release.mjs` (zero deps, `isMain`-guarded, pure core exported). On a PR (`--base <ref>`) it fails
  when the diff touches `plugins/**`, `kit/**` or any file in the kit closure (import `parseRequiresScripts` +
  `listSkills` from `check-skill-scripts.mjs`, and don't copy the list) **and** the version isn't greater than base.
  Always: `plugin.json` = newest CHANGELOG heading (= `kit/package.json` once that exists).
- `check-release.test.mjs`: it fires on a plugin change without a bump, it doesn't fire on a docs-only change, and it
  fires on a CHANGELOG mismatch.
- CI: a `check-release` step on `pull_request` with `--base origin/${{ github.base_ref }}`.
- `.github/workflows/release.yml`: `on: push: branches [main]`, `permissions: contents: write`. If there's no
  `v<version>` tag yet: create the tag + GitHub Release with the CHANGELOG section (`gh release create`). S2 adds the
  publish job in front of it. Use `fetch-depth: 0`.

**S1.4: Consumers (X11).** In each consumer:
- `.claude/settings.json`: marketplace key `golden-frijoles`, repo `golden-frijoles/skills`, and
  `enabledPlugins: { "golden-frijoles@golden-frijoles": true }`. The old key and entry are removed.
- Byte copies of the changed shared rails: `scripts/doc-format.mjs`, `scripts/doc-hygiene.mjs`,
  `Roadmap/WAYS-OF-WORKING.template.md` + re-render. Use `cmp` after copying. medusa's differing files stay theirs.
- `scripts/epic-dod.exemptions.json` repo slug.
- Every doc that tells someone to *install* `ways-of-work` (golden-beans `README.md:6` link, medusa `README.md:38`).
  Not `Roadmap/` history.
- The consumer's own gate. golden-beans: `tsc`, lint (ESLint over `scripts/`), format-changed, and the Playwright
  `api` project. medusa: its gate.
- **Don't merge before the S1 PR merges** (the deploy order is in the README). golden-beans session check:
  `claude plugin list` / a headless session in `~/dobby/golden-beans` shows `golden-frijoles`. medusa's is owed to
  Daniel.

**Stop and escalate** on any trigger in WAYS-OF-WORKING → *Escalate, don't guess*. It also covers any need to touch GitHub org/repo
settings (those are Daniel's, S1.2). Pushing the branch and opening the PR on the current repo is fine: a transfer
carries open PRs with it.

## Stories

### Story 1.1 — License the public repo
**As** a stranger who found the repo, **I want** an Apache-2.0 license and a NOTICE, **so that** I'm allowed to use what I install.
**Acceptance:** `LICENSE` (Apache-2.0) and `NOTICE` at the repo root. NOTICE states that "Golden Frijoles" is a trademark and is not licensed. GitHub's sidebar shows **Apache-2.0**. `kit/package.json` (S2) carries `"license": "Apache-2.0"`.
**QA:** none beyond CI
**Risk:** low

### Story 1.2 — Create the org and transfer the repo (owed to Daniel)
**As** Daniel, **I want** the `golden-frijoles` org to own the repo as `golden-frijoles/skills`, **so that** the install line names the product, not a person.
**Acceptance:** Daniel creates the `golden-frijoles` GitHub org (the name had no user or org on 2026-09-23) and transfers + renames `danybgoode/dobby-foundation` → `golden-frijoles/skills`. Check: `git ls-remote https://github.com/danybgoode/dobby-foundation HEAD` returns the same SHA as `git ls-remote https://github.com/golden-frijoles/skills HEAD`. The builder updates `origin` in every local checkout it touches.
**QA:** owed to Daniel. The builder writes the exact steps into this sprint's walkthrough
**Risk:** high

### Story 1.3 — Rename the marketplace and plugin to golden-frijoles
**As** a Claude Code user, **I want** `claude plugin install golden-frijoles@golden-frijoles`, **so that** the install line is the product's name.
**Acceptance:** `.claude-plugin/marketplace.json` `name: golden-frijoles`; `plugins/ways-of-work/` → `plugins/golden-frijoles/`; `plugin.json` `name: golden-frijoles`. `render-skill-adverts.mjs` regenerates every advert. `check-plugin-leaks.mjs` rules and fixtures are **rewritten, not allowlisted** for the old names (provenance prose excepted, each with a reason). `claude plugin validate plugins/golden-frijoles` is green, and so is the CI path filter / every workflow path that named `ways-of-work`.
**QA:** leak-guard fixtures (fires on `ways-of-work@dobby-foundation` in shipped files, not on the provenance lines); `claude plugin validate`
**Risk:** high

### Story 1.4 — Switch both consumers in the same sprint
**As** Daniel, **I want** golden-beans and medusa-bonsai to load `golden-frijoles@golden-frijoles`, **so that** no session in either repo loses its skills on the day the rename lands.
**Acceptance:** One PR per consumer: `.claude/settings.json` `extraKnownMarketplaces.golden-frijoles` → `golden-frijoles/skills`, `enabledPlugins` `golden-frijoles@golden-frijoles: true`, the old entries removed, and every doc that tells someone to install `ways-of-work` updated. They merge **the same day as S1.3**. Check: a fresh Claude Code session in each repo lists `golden-frijoles:groom`.
**QA:** golden-beans session check by the builder; **medusa-bonsai session check owed to Daniel** (private repo)
**Risk:** high

### Story 1.5 — Tagged releases a user can pin
**As** a stranger, **I want** versioned releases with a changelog, **so that** I can pin a release and roll back from a bad one.
**Acceptance:** `plugin.json` gets `"version": "0.1.0"`; `CHANGELOG.md` (Keep a Changelog shape); tag `v0.1.0`. `scripts/check-release.mjs` in CI fails when `plugins/` changed and the `version` didn't (on PRs to `main`), and when the tag, `plugin.json` and the newest CHANGELOG heading disagree. `RELEASING.md` has the three-line release procedure.
**QA:** `check-release.test.mjs`: fires on a plugin change without a bump, and doesn't fire on a docs-only change
**Risk:** low

## Sprint QA
- **specs:** named per story above. This repo's gate is `node --test` + the CI checks in `.github/workflows/ci.yml`; golden-beans stories use its own gate (`tsc` + build + Playwright `api`).
- **owed to Daniel:** Story 1.2, Story 1.4
- **deterministic gate:** every CI check green before merge; high-risk stories → Daniel merges

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production (GitHub). Nothing here is pre-merge: run it after the S1 PR **and** both S1.4 consumer PRs have merged.

1. Open https://github.com/golden-frijoles/skills
   → The repo loads. The sidebar says **Apache-2.0**, and `NOTICE` is at the root.
2. Open https://github.com/danybgoode/dobby-foundation
   → GitHub redirects you to `golden-frijoles/skills`.
3. Open https://github.com/golden-frijoles/skills/releases
   → A **v0.1.0** release exists, created by the `Release` workflow (not by hand). Its notes are CHANGELOG.md's `0.1.0` section.
4. In any terminal: `npx -y skills@1.7.0 add golden-frijoles/skills --list`
   → It lists the ten skills (babysit-pr … weekly-recap).
5. In a throwaway shell: `export CLAUDE_CONFIG_DIR=$(mktemp -d)`, then `claude plugin marketplace add golden-frijoles/skills@v0.1.0` and `claude plugin install golden-frijoles@golden-frijoles`
   → Both succeed. This is the **pinned** install a stranger uses to hold a release.
6. In `~/dobby/golden-beans` (on `main`, after its S1.4 PR merged): start `claude`, type `/plugin`
   → The installed list shows **golden-frijoles**, not ways-of-work, with groom and the other skills under it. If it still shows ways-of-work, use `/plugin` → refresh (team memory: the project-scope cache is refreshed interactively).
7. Same in `~/dobby/medusa-bonsai` (**owed to Daniel**)
   → Same result: `golden-frijoles:groom` is available.

**Run by the orchestrator, 2026-09-23 after the merges:** step 1 ✅ (the API reports license `Apache-2.0`) · step 2 ✅ (`git ls-remote` on both URLs → the same SHA) · step 3 ✅ (`v0.1.0` → `0c33e53`, created by the `Release` run 35932042074) · step 6 ✅, run in an isolated `CLAUDE_CONFIG_DIR` against golden-beans' merged settings: `golden-frijoles@golden-frijoles` Version 0.1.0, enabled, all ten skills. Step 7 ✅, confirmed by Daniel 2026-09-24 (medusa-bonsai loads `golden-frijoles@golden-frijoles`). Steps 4–5 are covered by S3.4's `--exec`, re-run after the S3 merge.

If any step fails, note the step number + what you saw — that's the bug report.
