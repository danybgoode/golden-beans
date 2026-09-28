---
title: "One plugin, one install: Golden Frijoles ships as a public plugin whose skills run in anyone's repo"
slug: golden-frijoles-plugin
status: scaffolded
area: "09"
type: feature
priority: null
appetite: L
underwritten_by: null
risk: high
epic: "09-platform-infra/golden-frijoles-plugin"
build_order: 34
updated: 2026-09-23
---

# Pitch: one plugin, one install

Origin: Seed 1 (+ Seed 4, folded in as wave 2) of
[`golden-beans/Roadmap/00-ideas/audits/golden-frijoles-unification-2026-09-23.md`](https://github.com/danybgoode/golden-beans/blob/main/Roadmap/00-ideas/audits/golden-frijoles-unification-2026-09-23.md),
decisions D1–D4 and D8 of record (approved 2026-09-23). Class **Feature**, archetype **Builder**. Lane: **shaped bet**.

## Problem

The landing is about to hand strangers a prompt that installs Golden Frijoles into their agent. Today that
prompt would install **ten skills that stop**. Every skill wraps scripts (`requires_scripts`) that live in the
*consuming repo's* `scripts/`, copied once from `template/`. That's right for sibling repos Daniel owns and
fails for anyone else's. The rest of the install story is unsettled too:

- **Identity:** the plugin is `ways-of-work@dobby-foundation`, and the product is Golden Frijoles.
- **License:** the repo is **public with no license** (checked 2026-09-23: public, 0 stars, 0 forks,
  no tags). In practice anyone can read it and nobody may use it.
- **Versions:** "every commit is a version" means no release anyone can pin or roll back to.
- **Config:** there are seven config files, so no stranger will ever configure it.

## Appetite

**L: two waves, re-bet at the boundary.**
- **Wave 1 (M), install:** identity, license, the kit, the umbrella skill, the install prompt + parity, semver,
  golden-beans on the kit.
- **Wave 2 (M), configure:** one config file, the setup interview, `gf setup` / `gf config`, doctor lines.

If wave 1 exhausts its appetite, wave 2 goes back to shaping. It doesn't extend in flight.

## Outcome & signal

After wave 1, a stranger in an **empty repo** pastes the install prompt into Claude Code, or into Codex/Cursor via
`npx skills`. The `golden-frijoles` skill loads, and `groom` scaffolds a seed **with no `scripts/` folder in the repo**.
After wave 2, the same stranger answers ≤5 skippable questions, gets one `golden-frijoles.config.json`, and can change any setting
later with `gf config` or by asking the agent. `gf doctor` names each module as *configured / not configured / could not look*.

**Signal the product owner can test:** the two stranger walkthroughs (S3.5, S5.5) pass on a machine that has never seen
this repo, and golden-beans runs `build-order-sync` and `standup` through the kit with its copies of those scripts deleted.

## Stage-2.5 bucket

**Genuinely new, on rails that half exist.** The public marketplace already works:
`npx skills add danybgoode/dobby-foundation --list` lists all ten skills today, and `/plugin marketplace add` works.
What doesn't exist is a way for the scripts to reach a repo that didn't copy them, and a way to configure the result.

## Bill of materials (What / Why)

_Product owner: edit the Why column. A Why you can't defend is a part we cut._

| What | Why |
|---|---|
| **Apache-2.0** `LICENSE` + `NOTICE` (the name "Golden Frijoles" is a trademark, not licensed) | The repo is already public and unusable. Apache adds the patent grant and keeps the name yours |
| GitHub org `golden-frijoles`; repo transferred + renamed to `golden-frijoles/skills` | D1/D2. One identity in the install line. The transfer keeps history, CI and guards, and GitHub redirects the old URL |
| Marketplace `name: golden-frijoles`, plugin `golden-frijoles` (was `ways-of-work`) | `claude plugin install golden-frijoles@golden-frijoles`. The part after `@` is the marketplace `name`, not the owner |
| `version` in `plugin.json` + `CHANGELOG.md` + `v*` tags; a CI check that a plugin change carries a version bump | Strangers need releases to pin and roll back to. Once `version` exists, Claude Code only updates on a bump, so forgetting one strands users, and CI has to catch it |
| **`@golden-frijoles/kit`**: a zero-dep npm package with bin `gf-kit`, built from the skills' declared closure (~45 files) in `template/scripts/` | D3. Scripts reach any repo, versioned, in every agent channel. Built *from* the template, so there's one source and no second copy |
| **Two roots** (`lib/project-root.mjs`): project root = walk up from cwd (`--root` overrides); kit root = the package's own folder, for templates and data | 14 scripts find the repo as `join(__dirname, '..')`. Inside `node_modules` that's the package, not the project |
| **Resolution order in every skill:** a local `scripts/<x>.mjs` wins (the documented fork), else `npx -y @golden-frijoles/kit@<pinned> <x>` | Strangers get the kit. golden-beans' and medusa-bonsai's deliberate forks keep working unchanged, with no silent swap of a stricter local copy (LEARNINGS: "Replacing a file with the shared copy…") |
| `render-skill-adverts.mjs` stamps the pinned kit version into every SKILL.md | Generated, never hand-typed, like the skill list already is |
| `check-skill-scripts.mjs` checks the closure against the **kit**, not the project | The contract moves to where the scripts now live |
| `.github/workflows/release.yml`: on a `v*` tag, npm **trusted publishing** (OIDC, `--provenance`), no stored token | Your answer. You push the tag, and CI publishes with provenance |
| The **`golden-frijoles` umbrella skill**: detects state, routes by job, says what the `npx skills` channel lacks (no hooks, no agents), offers setup | The one name the prompt tells an agent to use |
| `gf-kit init`: adopt an existing repo by writing the `Roadmap/` skeleton; never overwrites | The minimum "setup" in wave 1, so groom has somewhere to write |
| golden-beans `lib/install-prompt.ts`: one module, rendered on the landing, `/install` and the signed-in onboarding page | The brief's copy-box, "even from the landing page and after they have signed up" |
| Parity: `check-onboarding-parity.mjs` + a golden-beans spec. `--exec`: `npx skills add golden-frijoles/skills --list` must list `golden-frijoles`; `claude plugin marketplace add` + `install` run in a scrubbed `HOME` / `CLAUDE_CONFIG_DIR` | LEARNINGS: "presence is not execution", and "construct the harmless state, then assert it" |
| Consumers' `.claude/settings.json` switched (golden-beans, medusa-bonsai); golden-beans deletes its byte-identical copies | No alias: 0 stars, 0 forks, and both known consumers are ours. golden-beans is the dogfood proof |
| **Wave 2:** `golden-frijoles.config.json` + one loader (`lib/config.mjs` in the kit), reading the seven legacy files as fallback; `gf-kit config migrate` | One file a person can read. Legacy fallback means no consumer breaks on the day it lands |
| **Wave 2:** a just-in-time registry (each setting declares when it's asked, its default, its section) | The audit's Stage-2 rule: nothing is asked before it's needed |
| **Wave 2:** the setup interview (5 questions, all skippable) in the umbrella skill; `gf setup` / `gf config` in the CLI **importing the kit's config core** | One command core, so agent and CLI parity is structural (the `gf flags` pattern) |
| **Wave 2:** `gf doctor` gets one line per module; Jev egress becomes an explicit yes/no (template default `egress: false` until answered) | Three-state rule. Sending diffs to a third party is a stranger's call, not a default |

## Scope

**In, wave 1:** everything above not marked wave 2. **In, wave 2:** the four wave-2 rows.

**No-gos:**
- No Think skills (Seed 5), no board sinks (Seed 8), no FinOps, no Verify.
- **No alias** for `ways-of-work@dobby-foundation`.
- **medusa-bonsai does not adopt the kit.** Only its `settings.json` changes, and its local copies keep winning.
- The CI-guard scripts (`doc-format`, `render-ways-of-working`, `permissions-smoke`, `jev-eval`) stay copy-once.
- **No telemetry from the kit.** It phones nothing home.
- **No engine change** beyond the install-prompt module/pages and the CLI's `setup` / `config` / `doctor`.
- The landing hero keeps its workshop prompt. The install prompt goes in the closing CTA (scope-gate decision).

## Rabbit holes

1. **The two roots.** Fourteen `__dirname/..` sites plus data files read by path (`pmo/templates`, `prose/*.task.md`,
   `standup/templates`). Patch it now: *project* paths come from `project-root.mjs`, *asset* paths from the kit root,
   and a test runs every command from a subdirectory **and** from an installed tarball (`npm pack` → temp dir).
2. **The rename breaks the consumers' `enabledPlugins` key.** Ship the marketplace/plugin rename and both consumer PRs in
   the same sprint, and verify with a real session listing `golden-frijoles:groom`.
3. **npm trusted publishing may need the package to exist first.** Verify at the lock. If so, the first `0.1.0` is one
   manual publish owed to Daniel, and every later release comes from the tag.
4. **`npx` cold start and offline.** Pin exact versions so the npm cache serves repeats. Offline, the skill reports
   *could not look*, names the local-override escape hatch, and never fails as if the project were broken.
5. **Runtime dependencies the kit can't carry.** `live-smoke` needs `@playwright/test` in the project, and `prose-draft`
   needs a second-family CLI. The kit checks and prints the install line. It doesn't bundle them.
6. **The version field changes update behaviour.** Without a bump nobody updates, so the CI check from the bill of materials is mandatory, not nice-to-have.
7. **The leak guard and the rename.** `ways-of-work` / `dobby-foundation` strings are provenance in some places and
   residue in others. **Rewrite, don't allowlist** (LEARNINGS).
8. **Wave 2, legacy config precedence.** Rule: the new file wins per key, legacy files fill gaps, and `doctor` names any key
   defined in both. Write it once, in the loader.
9. **groom's generators already travel inside the skill folder** (`$GROOM/scaffold-epic.mjs`). They stay there, not in
   the kit.

## What already exists (reuse, don't rebuild)

| Need | Already in the repo |
|---|---|
| Public marketplace, both channels | `.claude-plugin/marketplace.json`; `npx skills add … --list` works today |
| Generated skill adverts | `scripts/render-skill-adverts.mjs` (+ `--check` in CI) |
| Script contract + closure walk | `scripts/check-skill-scripts.mjs` |
| Portability guard with fixtures | `scripts/check-plugin-leaks.mjs` |
| `.skill` archives for Cowork / the Claude app | `scripts/pack-skills.mjs` (reproducible) |
| One onboarding surface + `--exec` parity with a scrubbed env | `template/scripts/lib/golden-onboarding.mjs`, `scripts/check-onboarding-parity.mjs` |
| Offline plugin validation in CI | `claude plugin validate` step in `.github/workflows/ci.yml` |
| The CLI's account side, doctor, init | golden-beans `packages/cli` (`doctor`, `init`, exit-code vocabulary) |
| One-module copy with drift welds | golden-beans `lib/cli-install.ts`, `lib/landing-prompts.ts`, `CopyPromptCard` |
| The three-state doctrine | LEARNINGS → *"Could not look" is its own exit code* |

## UX heuristics & rails check

- The prompt is **one string from one module**. Every surface imports it, and the parity check executes it.
- The umbrella skill states channel limits in words ("in Codex you get the skills, not the build view").
- Setup (wave 2): every question is skippable, has a default, and says where to change it later.
- golden-beans' landing and `/install` are under the design-system rails (the structural state contract and the visual
  gate). The new card uses `CopyPromptCard`, and the approved-state contract is updated rather than bypassed.

## Kill-switch / runtime gate (Stage 6b)

**Carve-out, no runtime seam:** this is distribution, not a code path in a running app. Rollback comes from the release
rails this epic builds: consumers pin the previous plugin `version`, the kit pins the previous package, a bad tag is
deprecated on npm, and the repo transfer is reversible. The existing build-view kill-switch (`hooks.json`) is untouched.
The landing card is copy, and `git revert` removes it.

## Acceptance criteria

1. GitHub shows **Apache-2.0** on `golden-frijoles/skills`, and `danybgoode/dobby-foundation` redirects to it.
2. **Stranger walkthrough (Claude Code):** in an empty git repo on a clean machine, paste the prompt → the plugin installs →
   `golden-frijoles` offers setup → "groom an idea" lands a seed in `Roadmap/00-ideas/seeds/`. **No `scripts/` folder exists.**
3. **Stranger walkthrough (Codex via `npx skills`):** same, and the umbrella skill says hooks and agents aren't available.
4. `npmjs.com/package/@golden-frijoles/kit` shows the release **with provenance**, published by the tag workflow.
5. golden-beans runs `build-order-sync` and `standup` through the kit, and its byte-identical copies are deleted
   (a `cmp` loop recorded in the PR).
6. The landing, `/install` and signed-in onboarding each show the install prompt with a copy button. The parity check
   (with `--exec`) is green in CI.
7. **Wave 2:** setup writes `golden-frijoles.config.json`; `gf config set review.scope every-pr` changes the next review
   routing; `gf doctor` prints one line per module; a repo with only legacy files behaves exactly as before.

## Scope-gate decisions (Daniel, 2026-09-23 10:14)

- **Landing placement:** the hero keeps its workshop prompt ("try the method"). The install prompt goes in the **closing
  CTA** ("use it in your repo"), plus `/install` and signed-in onboarding.
- **Cross-agent planning panel:** offered and declined.
- **golden-beans stays public.** Recorded, and it's out of this epic. Its license (the repo, `@golden-frijoles/cli` and `sdk`,
  all `UNLICENSED` today) is a separate chore.

## Open risks / research

- Research, 2026-09-23: the marketplace `name` sets the `@` suffix, and `claude plugin install <p>@<m>` works non-interactively
  (code.claude.com/docs/en/plugin-marketplaces). `npx skills add` installs SKILL.md folders only, reads
  `.claude-plugin/*.json`, and has a non-installing `--list` (github.com/vercel-labs/skills). The GitHub name `golden-frijoles`
  had no user or org (API 404) on 2026-09-23.
- **Out of this epic:** `golden-beans` stays public (decided 2026-09-23). Its README still says "private", and the
  published `@golden-frijoles/cli` and `sdk` are `UNLICENSED`. Customers can't use the SDK in their apps with a clear
  conscience until that changes. It's a separate chore.

## Slicing (skateboard → car), risk tiers, QA

> **Superseded by the epic docs** (`Roadmap/09-platform-infra/golden-frijoles-plugin/`), which are authoritative. S2's order was changed there to match the deploy order: publishing comes before the skills pin a version.

Branches stack `feat/golden-frijoles-plugin` → `-s2` → … (sprints share hot files by construction). **H** = high risk
(Daniel merges), **L** = low risk.

**Wave 1 · S1: Identity, license, releases** (the skateboard: the plugin you can install is correctly named, licensed and versioned)
- 1.1 **L** · As a stranger, I want a license on the repo, so that I may use what I install. *Accept:* `LICENSE` (Apache-2.0) + `NOTICE`; GitHub shows it. *QA:* none beyond CI.
- 1.2 **Owed to Daniel** · Create the `golden-frijoles` org; transfer + rename the repo. *Accept:* `git ls-remote https://github.com/danybgoode/dobby-foundation` resolves to the new repo.
- 1.3 **H** · As a consumer, I want the plugin named `golden-frijoles@golden-frijoles`, so that the install line is the product's. *Accept:* the marketplace/plugin rename, adverts regenerated, leak guard rewritten (not allowlisted), `claude plugin validate` green. *QA:* extended leak-guard fixtures.
- 1.4 **H** · As Daniel, I want both consumers switched in the same sprint, so that no session loses its skills. *Accept:* golden-beans + medusa-bonsai `settings.json` PRs; a real session in each lists `golden-frijoles:groom`. *Smoke owed to Daniel:* medusa-bonsai (private).
- 1.5 **L** · As a stranger, I want tagged releases, so that I can pin and roll back. *Accept:* `version` in `plugin.json`, `CHANGELOG.md`, tag `v0.1.0`; a CI check fails a plugin change without a bump. *QA:* unit test for the check (fires + doesn't fire).

**Wave 1 · S2: The kit**
- 2.1 **H** · As a skill, I want to find the project and my own assets separately, so that I work from `node_modules`. *Accept:* `lib/project-root.mjs`, 14 sites converted; tests run each command from a subdirectory and from an `npm pack` tarball in a temp dir. *QA:* unit + tarball spec.
- 2.2 **H** · As a stranger, I want `@golden-frijoles/kit` with a `gf-kit` bin, built from the skills' closure, so that skills run without copied scripts. *Accept:* the build derives the file list from `requires_scripts` (one list); `check-skill-scripts` checks the kit. *QA:* the closure walk.
- 2.3 **H** · As a skill, I want "local script wins, else pinned kit", so that forks survive and strangers are served. *Accept:* SKILL.md invocations generated with the stamped version; the offline path prints *could not look* + the override. *QA:* spec with a fake local script and with none.
- 2.4 **H** · As Daniel, I want a tag to publish with provenance, so that releases need no token. *Accept:* `release.yml` (OIDC); provenance visible on npm. *Owed:* the first publish, if trusted publishing requires an existing package.
- 2.5 **H** · As Daniel, I want golden-beans on the kit, so that the release is proven in a real repo. *Accept:* `cmp` loop in the PR body; byte-identical copies deleted; `build-order-sync` + `standup` run via the kit; deliberate forks listed with reasons.

**Wave 1 · S3: The front door**
- 3.1 **L** · As a stranger's agent, I want one `golden-frijoles` skill, so that I know where to start. *Accept:* state detection, job routing, channel limits stated, setup offered. *QA:* `claude plugin validate`; `npx skills … --list` includes it.
- 3.2 **L** · As a stranger, I want `gf-kit init` to adopt my repo, so that groom has somewhere to write. *Accept:* writes the `Roadmap/` skeleton; refuses to overwrite; idempotent. *QA:* unit on a temp repo.
- 3.3 **L** · As a visitor or a new signup, I want the install prompt in a copy box on the landing, `/install` and onboarding, so that I can paste it into my agent. *Accept:* one module `lib/install-prompt.ts`; the design contract updated. *QA:* api spec + browser smoke (landing, `/install`); signed-in onboarding **smoke owed to Daniel**.
- 3.4 **L** · As Daniel, I want the prompt checked by execution, so that no surface advertises a dead command. *Accept:* parity across plugin README, umbrella SKILL.md and golden-beans module; `--exec` runs `npx skills … --list` and the `claude plugin` pair in a scrubbed `HOME`/`CLAUDE_CONFIG_DIR`, asserting isolation with a negative control; skips loudly without the binaries.
- 3.5 **L** · **The stranger walkthroughs** (acceptance 2 + 3) on a clean machine, written as the sprint smoke walkthrough. *Owed to Daniel:* running them.

**Re-bet at the wave boundary.**

**Wave 2 · S4: One config file**
- 4.1 **H** · As a user, I want one `golden-frijoles.config.json`, so that I can read my whole setup. *Accept:* schema + `lib/config.mjs` loader in the kit; legacy files as fallback (new wins per key; doctor names duplicates); `gf-kit config migrate`. *QA:* unit on every precedence case.
- 4.2 **H** · As a rail, I want to read config through the loader, so that there's one seam. *Accept:* review routing, Jev, reporting, live-smoke, smoke-triage, perf-probe and WAYS fill-ins read through it; a repo with only legacy files behaves byte-identically (golden-beans' old tests run against the new code).
- 4.3 **L** · As a skill, I want a just-in-time registry, so that I ask once and write the answer. *Accept:* each setting declares {when asked, default, section}; a skill that hits an unset key asks, writes it, and says where to change it.

**Wave 2 · S5: Setup and adjust**
- 5.1 **L** · As a stranger, I want five skippable setup questions, so that I'm configured in two minutes. *Accept:* the umbrella skill's interview writes through the kit core.
- 5.2 **H** · As a terminal user, I want `gf setup` and `gf config`, so that I don't need the agent to change a setting. *Accept:* the CLI imports the kit's config core (one core); `--json`; golden help-text files updated. *QA:* CLI golden tests.
- 5.3 **L** · As a user, I want `gf doctor` to name each module's state, so that I know what's missing. *Accept:* *configured / not configured / could not look* per module.
- 5.4 **H** · As a stranger, I want Jev egress to be my explicit choice, so that my diffs don't leave by default. *Accept:* template `egress: false` until answered; the question is asked at the first PR; existing consumers keep their committed `true`.
- 5.5 **L** · Stranger walkthrough #2: setup end to end, then `gf config set …` changes behaviour. *Owed to Daniel.*
