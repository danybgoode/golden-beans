---
epic: golden-frijoles-plugin
sprint: 2
title: "The kit"
risk: high
phase: Shipped
stories_total: 5
stories:
  - id: S2.1
    title: "Two roots: the project and the kit"
    as_a: "a script running from node_modules"
    i_want: "to find the user's project and my own templates separately"
    so_that: "I work the same whether I was copied into `scripts/` or installed as a package"
    risk: high
    status: done
  - id: S2.2
    title: "Build the kit from the skills' closure"
    as_a: "a maintainer"
    i_want: "`@golden-frijoles/kit` generated from `requires_scripts`"
    so_that: "there's one list of what the skills need and no second copy of any script"
    risk: high
    status: done
  - id: S2.3
    title: "Tag publishes the kit with provenance"
    as_a: "Daniel"
    i_want: "a pushed `v*` tag to publish the kit from CI"
    so_that: "a release needs no npm token on any machine"
    risk: high
    status: done
  - id: S2.4
    title: "Skills run the kit unless the project has its own copy"
    as_a: "a skill"
    i_want: "to run a local `scripts/<x>.mjs` when the project has one, and the pinned kit otherwise"
    so_that: "strangers are served and deliberate forks keep working"
    risk: high
    status: done
  - id: S2.5
    title: "golden-beans runs on the kit (the dogfood)"
    as_a: "Daniel"
    i_want: "golden-beans to run its skills through the kit"
    so_that: "the release is proven in a real repo before a stranger meets it"
    risk: high
    status: done
---
# One plugin, one install — Golden Frijoles ships as a public plugin whose skills run in anyone's repo — Sprint 2: The kit

**Status:** ✅ shipped 2026-09-23. golden-frijoles/skills#45 (`088512d`, S2.1–S2.4) + #46 (`8dca371`, the publish-auth fix) → `@golden-frijoles/kit@0.2.0` on npm with verified provenance, release `v0.2.0` cut by CI; danybgoode/golden-beans#162 (`e6f748c`, S2.5, Vercel production ✅) · **Wave:** 1

Scripts reach any repo. `@golden-frijoles/kit` is built from the skills' declared closure, learns to tell the project apart from itself, and is published by a tag. golden-beans proves it by deleting its copies.

## Build contract (locked by the architect before the builder started)

Cites the epic README's D1, D2, D3, D4, D5, D7, D8 and deviations X1–X4, X6. **Builder:** the orchestrator (Opus),
per the routing table. **Branch:** `feat/golden-frijoles-plugin-s2`, cut from the S1 branch. One PR in this repo,
plus one golden-beans PR for S2.5 (danybgoode/golden-beans#162).

**S2.1: `template/scripts/lib/project-root.mjs` (D2).** It exports `kitRoot`, `projectRoot`, `projectAsset` and
`isInstalled`, with no side effects at import. *(Amended in review of #45: it also exports `KIT_PACKAGE_NAME` and
`findProjectRoot`, which the unit tests exercise directly. They're pure helpers and don't form a second contract.)* Convert **exactly these sites** in the closure, and
leave nothing outside it changed:

| Class | Sites |
|---|---|
| project → `projectRoot()` | `build-order-sync.mjs:27` · `build-order.mjs:20` · `doc-format.mjs:44` · `doc-hygiene.mjs:21` · `lib/jev.mjs:38` (`repoRoot`) · `lib/reporting-config.mjs:34` · `live-smoke.mjs:39` · `pmo-report.mjs:35` · `preflight.mjs:80` · `prose-draft.mjs:31` · `roadmap-extract.mjs:48` · `standup.mjs:59` · `weekly-recap.mjs:54` |
| kit asset / sibling script → `kitRoot()` | `build-order.mjs:22` · `doc-format.mjs:45` · `doc-hygiene.mjs:75` · `lib/pmo-benchmarks.mjs:6-7` · `lib/pmo-templates.mjs:8-9` · `lib/standup-deck.mjs:12-13` · `lib/prose-writer.mjs:75,112` (task files) · `prose-draft.mjs:118` · `standup.mjs:527` / `weekly-recap.mjs:450` (`scriptsDir`) |
| hidden subprocess → `process.execPath` + `join(kitRoot(), …)`, `cwd: projectRoot()` | `build-order-sync.mjs:68,73` · `pmo-report.mjs:66` · `standup.mjs:176,184` |
| project-owned asset → `projectAsset()` | `cross-panel.mjs:34` (`cross-panel.prompt.md`) · `lib/prose-writer.mjs:74,76` + `prose-draft.mjs:117` + `lib/prose-brief.mjs:136` (`cpo-persona.md`, `prose-lessons.md`) · `doc-format.mjs:46` (`doc-format.enforced.json`) |

- **Addendum (the architect, during S2.1):** the "kit asset / sibling script" row lists some sites in **top-level**
  scripts (`build-order.mjs:22`, `doc-format.mjs:45`, `doc-hygiene.mjs:75`, `prose-draft.mjs:118`, the two `scriptsDir`
  args). A top-level script's `__dirname` **is** `kitRoot()` in both modes by construction, since it sits at the root of
  the set. So those lines were already correct and were left untouched: the shared rails' byte churn stays smaller, and
  nothing changes behaviour. Every site that was actually wrong was converted: the project roots, the `lib/` files that
  climbed to `<project>/scripts/`, the five hidden spawns (now `process.execPath` + a sibling path), and the four
  project-owned assets. Four test fixtures and CI's scaffolder smoke hand-copy these files into temp projects, and each
  now copies `lib/project-root.mjs` too.
- Every converted file adds `lib/project-root.mjs` to its skills' `requires_scripts`. `check-skill-scripts` forces
  that.
- **Copied mode must behave identically.** Every existing `template/scripts` test stays green without edits to its
  assertions.
- Unit tests for all three functions: the copied vs installed branch, the `GF_PROJECT_ROOT` override, walking up to
  `Roadmap/` or `.git`, the `cwd` fallback, and `projectAsset`'s override vs fallback.
- The tarball spec (`scripts/kit-tarball.test.mjs`): `npm pack` the built kit, install it into a temp repo with
  `Roadmap/` and a nested subdir, and run `gf-kit build-order` from the subdir. Assert that repo's
  `Roadmap/00-ideas/BUILD-ORDER.md` was written, and that nothing was written inside the installed package.
  Git fixtures use `sealedEnv()`. Skip loudly if `npm` is absent.

**S2.2: `kit/` (D1, D7).**
- `kit/package.json`: `name @golden-frijoles/kit`, `version` = `plugin.json`, `type: module`,
  `bin: { "gf-kit": "bin.mjs" }`, `files: ["bin.mjs", "dist/", "README.md"]`, `license: Apache-2.0`,
  `repository: { type: git, url: "git+https://github.com/golden-frijoles/skills.git", directory: "kit" }` (it must
  match exactly for OIDC), `engines.node >=20`, `publishConfig.access public`. **No `dependencies` key.**
- `kit/bin.mjs`:
  - It dispatches `gf-kit <name> …` by **spawning** `process.execPath dist/<name>.mjs …` with inherited stdio, and it
    propagates the exit code and signal. A spawn keeps every entry's `isMain` guard and `process.exit` semantics
    intact, where an `import()` would silently skip `main()`.
  - It parses `--root` into `GF_PROJECT_ROOT`.
  - `--list` prints the dist's top-level `.mjs` names.
  - An unknown name exits 2 and prints the list.
  - `--version` works.
- `scripts/build-kit.mjs` (zero deps):
  - It wipes `kit/dist/`, then copies the union of every skill's declared `requires_scripts` from `template/scripts/`,
    preserving relative paths.
  - It also copies `LICENSE` and `NOTICE` into `kit/dist/`.
  - It fails when a declared file is absent.
- `check-skill-scripts.mjs --kit`: audit with `scriptsDir = kit/dist`, so every declared file must be present and its
  closure must be whole. CI builds the kit, then runs it.
- `build-kit.test.mjs`: a missing declared file fails the build (watch it fail once by mutation).

**S2.3: The publish job (D5).**
- `release.yml`: a `publish` job before the S1 tag job, on Node `22.14+`, running `npm i -g npm@^11.5.1`, with
  `permissions: id-token: write, contents: read`.
  - It runs only when the `v<version>` tag is absent and `npm view @golden-frijoles/kit@<version>` 404s.
  - Its steps: `node scripts/build-kit.mjs`, then `cd kit && npm publish --provenance --access public`, then
    `npm view` to confirm.
  - The tag job `needs: publish`.
- A `kit dry-run` CI step on PRs: build, then `npm publish --dry-run` in `kit/` (it needs no credential).
- **Owed to Daniel before the S2 merge (one focused question):**
  1. In an empty temp dir, publish a README-only `@golden-frijoles/kit@0.0.0` by hand.
  2. `npm deprecate @golden-frijoles/kit@0.0.0 "bootstrap placeholder — use ≥0.2.0"`.
  3. On npmjs.com → the package → Settings → Trusted publisher: GitHub Actions, org `golden-frijoles`, repo
     `skills`, workflow `release.yml`, no environment.

  The builder writes the exact commands into this sprint's walkthrough.

**S2.4: The run rule (D3).**
- `render-skill-adverts.mjs` stamps a generated block between `<!-- kit:start -->` / `<!-- kit:end -->` in every
  SKILL.md whose `requires_scripts` is non-empty. It says:
  - Every `node scripts/<x>.mjs …` in this skill means: if `scripts/<x>.mjs` exists at the project root, run it;
    otherwise run `npx -y @golden-frijoles/kit@<version> <x> …`.
  - If npx can't reach the registry, report **could not look (kit unreachable)**, name the escape hatch (copy the
    script into `scripts/`, or retry online), and never say the project is broken.
- The version comes from `plugin.json`. `--check` covers the stamp.
- The rule's text lives **once**, in the renderer.
- Measure npx offline behaviour with a warm cache before adding `--prefer-offline`, and record the measurement.
  **Measured 2026-09-23** (`@golden-frijoles/cli@0.1.0`, network cut with an unreachable proxy, same registry): warm
  cache + exact pin → **exit 0** with or without `--prefer-offline`. Cold cache → exit 1 with an npm network error.
  So there's no `--prefer-offline`, and the rule reports a network or registry error as *could not look*.
- `groom`'s generator lookup gains the `npx skills` install paths (measured, not guessed). **Measured** with
  `skills@1.7.0`: `./.agents/skills/groom` (project), `~/.agents/skills/groom` (global), `~/.claude/skills/groom`
  (`-a claude-code -g`). The whole skill directory travels, generators included.
- Spec: running an entry through the rule with a fake local `scripts/<x>.mjs` present runs the local one, and with it
  absent runs `kit/bin.mjs`.
- `check-skill-scripts --repo-root` learns the same rule. A skill whose entry is absent locally reports
  `kit` (passing). A skill whose entry is present must have its whole closure present, which is today's rule.

**S2.5: golden-beans on the kit (D3, X6).** A mechanical rule decides which files go, applied after `0.2.0` is on npm.
*Corrected by the architect during S2.4:* S2.1 changed the template, so golden-beans' untouched copies are no longer
byte-identical to `kit/dist@0.2.0`, and "identical to the kit" would delete almost nothing. The test is **byte-identical
to the pre-epic template** (`origin/main` `12fcc06`, the version it was copied from), i.e. an unmodified shared copy.
Every file it keeps is re-copied from the new template in the same PR (`lib/project-root.mjs` included), which is the
shared-rails rule:
- **Deletable** = byte-identical to `kit/dist/<f>` at `0.2.0` **and** not reached from anything golden-beans keeps.
  "Reached" means an import closure, a `scripts/<f>` path in `.github/`, `.githooks/`, `package.json` or a kept
  script, or a kept test.
- A skill runs from the kit iff its entry was deleted.
- The PR body carries:
  - the `cmp` table for all 45 files;
  - the deleted list, and the kept list with each reason (fork / CI-invoked / reached-by-kept);
  - for each moved skill, a before (local, `main`) / after (kit) run in its dry mode, `diff`ed.
- golden-beans' OLD tests for each deleted script run against `kit/dist` (import paths rewritten in a temp copy)
  before deletion, and the output is pasted.
- golden-beans' gate: `tsc`, ESLint over `scripts/`, format-changed, the Playwright `api` project, and its
  `scripts-guard` (update it to the S2.4 `--repo-root` rule if it runs `check-skill-scripts`).

**Stop and escalate** on any trigger in WAYS-OF-WORKING → *Escalate, don't guess*: any npm credential, token or
secret handling, and anything S2.3 would need beyond the steps above.

## Stories

### Story 2.1 — Two roots: the project and the kit
**As** a script running from node_modules, **I want** to find the user's project and my own templates separately, **so that** I work the same whether I was copied into `scripts/` or installed as a package.
**Acceptance:** `template/scripts/lib/project-root.mjs` exports `projectRoot()` (walk up from `process.cwd()` to the nearest dir with `Roadmap/` or `.git`; `--root` / `GF_PROJECT_ROOT` override) and `kitRoot()` (this package's own dir). Every site the build contract lists is converted (*lock X1: the live count was 18 self-rooted files, 5 hidden subprocess sites and 4 project-owned assets, not "14"*): project paths via `projectRoot()`, kit assets and spawned siblings via `kitRoot()`, project-owned assets via `projectAsset()`. Copied mode keeps working unchanged.
**QA:** unit tests for both roots; **a tarball spec**: `npm pack` the kit, install it in a temp repo, run `gf-kit build-order` from a subdirectory, and assert it wrote *that* repo's `BUILD-ORDER.md`
**Risk:** high

### Story 2.2 — Build the kit from the skills' closure
**As** a maintainer, **I want** `@golden-frijoles/kit` generated from `requires_scripts`, **so that** there's one list of what the skills need and no second copy of any script.
**Acceptance:** `kit/package.json` (zero deps, `bin: { "gf-kit": "bin.mjs" }`, `license: Apache-2.0`, `files` = the built closure). `scripts/build-kit.mjs` copies the **union of every skill's declared closure** from `template/scripts/` into `kit/dist/` (gitignored). `gf-kit <name>` dispatches to `<name>.mjs`, and `gf-kit --list` prints what's inside. `check-skill-scripts.mjs` asserts the built kit contains every declared file. The repo root still has **no package.json** (D7).
**QA:** `check-skill-scripts` + a `build-kit.test.mjs` that fails when a declared file is missing from the build
**Risk:** high

### Story 2.3 — Tag publishes the kit with provenance
**As** Daniel, **I want** a pushed `v*` tag to publish the kit from CI, **so that** a release needs no npm token on any machine.
**Acceptance:** `.github/workflows/release.yml`: on a version bump merged to `main` (*lock X3/D5: CI creates the tag, it doesn't react to one*), verify = `plugin.json` version = `kit/package.json` version (D4), build the kit, `npm publish --provenance --access public` via **trusted publishing (OIDC)**. npm requires the package to exist before a trusted publisher can be attached (*confirmed by the lock, D5*), so a **`0.0.0` placeholder publish, then deprecate + attach, is owed to Daniel by hand** (lock X4). The npm page shows provenance.
**QA:** a dry-run job on PRs (`npm publish --dry-run`) so the workflow can't rot between releases
**Risk:** high

### Story 2.4 — Skills run the kit unless the project has its own copy
**As** a skill, **I want** to run a local `scripts/<x>.mjs` when the project has one, and the pinned kit otherwise, **so that** strangers are served and deliberate forks keep working.
**Acceptance:** Every SKILL.md's run instruction becomes the two-step rule (D3), with the kit version **stamped by `render-skill-adverts.mjs`** (never hand-typed) and CI failing if the stamped version isn't published or being released in the same tag. Offline or unreachable npm → the skill reports **could not look**, names the local-override escape hatch, and does not claim the project is broken.
**QA:** `render-skill-adverts --check` covers the stamp; a spec runs a skill's command with a fake local script present (local wins) and absent (kit runs)
**Risk:** high

### Story 2.5 — golden-beans runs on the kit (the dogfood)
**As** Daniel, **I want** golden-beans to run its skills through the kit, **so that** the release is proven in a real repo before a stranger meets it.
**Acceptance:** In golden-beans: a `cmp` loop of every kit file against its local copy goes in the PR body. **Byte-identical copies are deleted**; every surviving difference is listed with its reason (a deliberate fork stays, and local wins). The skills whose entries the deletion rule removes run through the kit, and their output matches the pre-change run. (*Lock X6: golden-beans forks `roadmap-extract.mjs` + `cross-agent-cli.mjs`, and its CI calls `build-order.mjs`, so which skills move is computed, not promised.*) golden-beans' OLD tests for the deleted scripts run against the kit build before deletion (LEARNINGS: *Replacing a file with the shared copy? Run the consumer's OLD tests against the NEW code*).
**QA:** golden-beans CI green; the before/after output diff in the PR
**Risk:** high

## Sprint QA
- **specs:** named per story above. This repo's gate is `node --test` + the CI checks in `.github/workflows/ci.yml`; golden-beans stories use its own gate (`tsc` + build + Playwright `api`).
- **owed to Daniel:** Story 2.3
- **deterministic gate:** every CI check green before merge; high-risk stories → Daniel merges

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production (npm, GitHub). Steps 1–3 are **owed to Daniel** before the S2 PR merges (a new external publish). The
rest runs after it merges.

1. **Bootstrap the package (owed to Daniel; npm account with 2FA).** In an empty folder:
   ```
   mkdir gf-kit-bootstrap && cd gf-kit-bootstrap
   printf '%s\n' '{"name":"@golden-frijoles/kit","version":"0.0.0","description":"Bootstrap placeholder. Install @golden-frijoles/kit@>=0.2.0.","license":"Apache-2.0","repository":{"type":"git","url":"git+https://github.com/golden-frijoles/skills.git","directory":"kit"}}' > package.json
   printf '# @golden-frijoles/kit\n\nBootstrap placeholder. Use >= 0.2.0.\n' > README.md
   npm login
   npm publish --access public
   npm deprecate @golden-frijoles/kit@0.0.0 "bootstrap placeholder, use @golden-frijoles/kit@>=0.2.0"
   ```
   → https://www.npmjs.com/package/@golden-frijoles/kit shows 0.0.0, marked deprecated.
2. **Attach the trusted publisher (owed to Daniel).** npmjs.com → the package → **Settings** → *Trusted Publisher* →
   GitHub Actions: organization `golden-frijoles`, repository `skills`, workflow `release.yml`, environment blank → Save.
   → The settings page lists the GitHub Actions publisher.
3. *(Optional, recommended)* Same page → *Publishing access* → "Require two-factor authentication and disallow tokens".
   → From then on, only the workflow can publish.
4. After the S2 PR merges, open https://github.com/golden-frijoles/skills/actions/workflows/release.yml
   → The run for the merge commit is green: `publish` then `release`.
5. Open https://www.npmjs.com/package/@golden-frijoles/kit
   → Version **0.2.0** is `latest`, with a **Provenance** badge linking to that workflow run.
6. Open https://github.com/golden-frijoles/skills/releases
   → **v0.2.0** exists, and its notes are CHANGELOG.md's `0.2.0` section.
7. In an empty folder: `git init demo && cd demo && mkdir Roadmap && npx -y @golden-frijoles/kit@0.2.0 --list`
   → It prints the 14 scripts the kit carries, and `ls` shows nothing new in `demo/`.
8. Same folder: `npx -y @golden-frijoles/kit@0.2.0 build-order && ls Roadmap/00-ideas`
   → `BUILD-ORDER.md` appears in *this* folder's `Roadmap/00-ideas/`, and there's still no `scripts/` folder.
9. In `~/dobby/golden-beans` after its S2.5 PR (danybgoode/golden-beans#162) merges: ask Claude Code to "check doc hygiene"
   → The transcript shows the run rule taking the kit branch: `npx -y @golden-frijoles/kit@0.2.0 doc-hygiene --check`
     (golden-beans no longer has `scripts/doc-hygiene.mjs`), and it prints the same report as before.
10. Same repo: ask it to "sync the build order"
   → This one stays **local** (`node scripts/build-order-sync.mjs`). golden-beans' extractor is a fork, and through the
     kit the board would differ (measured in S2.5, see golden-beans `scripts/README.md`). It reports no drift, or opens
     its PR as before.

**Run by the orchestrator, 2026-09-23:**
- Steps 1–3 were done by Daniel (the bootstrap `0.0.0` exists and is deprecated, and the trusted publisher is attached).
- **Two npm-side settings were also needed, and they're not in the steps above:** the trusted publisher's *Allowed actions* must include `npm publish` (it was stage-only), and npm validates a publish asynchronously (`PUT 202`, live minutes later). Both are recorded in `release.yml`.
- Step 4 ✅ (run 35933854829 re-run: publish ✅, release ✅).
- Step 5 ✅ `latest` = 0.2.0, with a verified attestation (`npm audit signatures`). Now 0.3.0.
- Step 6 ✅ `v0.2.0` → `8dca371`.
- Steps 7–8 ✅, via `gf-kit` in empty repos: the tarball spec plus a live `npx`.
- Step 9 ✅ through the published kit: `doc-hygiene --check` is byte-identical to the old local run.
- Step 10 ✅ `build-order-sync` stays local, by measurement.

If any step fails, note the step number + what you saw — that's the bug report.
