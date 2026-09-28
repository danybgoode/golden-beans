---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Verifying    # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: public-monorepo
title: "One public monorepo — skills/ subtree, a lean install mirror, licences, a private docs repo"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 4
stories_total: 14  # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 45      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: One public monorepo — skills/ subtree, a lean install mirror, licences, a private docs repo

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/public-monorepo.md`](../../00-ideas/seeds/public-monorepo.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why, not here).
     Optional: if this epic was ALSO tagged with an archetype at grooming (see spike-role-archetypes.md),
     append " · **Archetype:** <Prototyper|Builder|Sweeper|Grower|Maintainer>" after Class. Omit entirely
     for the Builder default — untagged is fine.
     Scope-seed link: always points at seeds/ — lifecycle lives in the seed's `status:` frontmatter, not
     in a folder path (see 00-ideas/README.md). If this epic was scaffolded from a doc that has no seeds/
     entry, link that doc instead and migrate it to seeds/ when convenient — don't fabricate a seeds/ file
     that doesn't exist. -->

## Why
One repo for one product. A rail change becomes one PR, strangers keep installing from `golden-frijoles/skills` (now a mirror), each folder says what you may do with it, and business-sensitive docs stop accumulating in public. The full pitch, measurements and decisions are in the [seed](../../00-ideas/seeds/public-monorepo.md).

## Platform-first note
Nothing here touches the engine's data (rule #1 n/a). **Rules in play:** #4, merge = deploy, which is why the rename is proven by a real merge deploy with no CLI deploy (S4.3). Tenancy and the connector are untouched.

## Architecture lock (D1–D7, checked against live code and repos 2026-09-28)
- **D1 — One prefix, `skills/`, subtree-added unsquashed.** Proven in a scratch clone: `git subtree split --prefix=skills` returns **`80d050a`, the skills repo's exact `main`** (in about 2 s). The mirror push is a fast-forward and every existing tag stays valid. The seed's `packages/kit` + top-level `template/` layout is **disproved**: it would break the split and every relative path. **Merge rule (pr-reviewer, #180): S1 merges with a MERGE COMMIT (`gh pr merge --merge`), never squash or rebase.** A squash flattens the subtree merge to one parent, the split then roots a new history that doesn't descend from `80d050a`, and the mirror fast-forward and every tag are lost. After the merge, `git subtree split --prefix=skills origin/main` must equal `80d050a`. **The mirror is frozen from S1's merge until S2.3:** any direct commit to `golden-frijoles/skills` `main` would make `skills/` stale and the S2 push non-fast-forward.
- **D2 — The mirror publishes.** The skills repo keeps its `ci.yml` and `release.yml`, and npm OIDC trusted publishing stays bound to that repo + workflow. There's no npm-side change and no 2FA.
- **D3 — Skills CI runs on the split, not the prefix.** 20 skills scripts call git (`check-release`, `doc-format`, `build-state`, …). From a subfolder they'd see `skills/…` paths. The root job splits into a temporary worktree and runs the skills steps there.
- **D4 — Root lint/format ignore `skills/`.** Measured: eslint finds 1 error + 1 warning there, and `format:changed` would prettier-check about 300 "added" files. Fixing them would force a plugin release. `foundation-lint-gate` owns it.
- **D5 — No script dedupe.** 81 of this repo's `scripts/` are byte-identical to `skills/template/scripts/` (5 differ). They stay as they are (`distribute-what-we-use` owns it).
- **D6 — Identity: rename in place** (Decision 1 → B), because Vercel Hobby can't deploy an org-owned repo.
- **D7 — Sensitive docs: forward-only** (Decision 2 → A). The inventory needs Daniel's approval before anything moves.

## What already exists (reuse, don't rebuild)
- `skills/.github/workflows/{ci,release}.yml`, `scripts/check-release.mjs` (skills), and the isolated-home install recipe (golden-frijoles-plugin S5).
- The review rail (`scripts/review-route.mjs`, both lenses: CI and release paths trigger the security lens).
- `gh api repos/<o>/<r>/deployments` for the deploy proof.


## Routing
The architect (Claude Opus 5.5) builds all four sprints. The work is shared infra (CI, release, repo identity) rather
than mechanical code over a locked contract, so there's no faster-model split. Review is per the router, with codex or
agy as the external family and the security lens on S1/S2 (workflow paths).

## Build contracts (locked by the architect before the builder started)
- **S1:** cite D1, D3, D4, D5. The `skills/` bytes are imported **unchanged**, and any edit inside `skills/` is a
  plugin release (check-release). The only files S1 touches outside `skills/` are `.prettierignore`,
  `eslint.config.mjs`, `.github/workflows/skills-ci.yml`, the three absolute-path files, and AGENTS.md. The
  skills-ci job must run on `git subtree split --prefix=skills` output, never from the prefix.
- **S2:** cite D1, D2. The mirror job only ever fast-forwards the skills repo (`git push` without `--force`) and runs
  only from `main`. Pushes to the mirror's `main` need `vars.MIRROR_ENABLED == 'true'`, while a dispatch to a scratch branch
  (the dry run) may run with it off. The deploy key is scoped to that one repo and held in the `skills-mirror` Environment
  (deployment branches: `main` only). The skills ruleset lists `DeployKey` as a bypass actor. **The deploy key is a new
  production credential and needs Daniel's named OK before it's minted.** The live cut-over is a real patch release,
  proven by an isolated-home install.
- **S3:** cite D7. Scan output is dispositioned without printing any secret value. **Nothing moves to `internal`
  before Daniel approves the file list.** Creating the private repo is a new IAM surface, asked with the key.
- **S4:** cite D6. **S4.1 is not merged before the lawyer's OK.** The rename is a GitHub setting, and it's proven by a
  merge deploy (`gh api …/deployments`), never by a CLI deploy.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | S1.1 Subtree-merge dobby-foundation into skills/, with history · S1.2 Skills CI gates monorepo PRs, run on the split · S1.3 Absolute paths and the docs that describe the layout | high |
| 2 | S2.1 A mirror job with an off switch · S2.2 Dry run to a branch · S2.3 Go live with a real release · S2.4 The skills repo becomes a mirror | high |
| 3 | S3.1 Full-history secret scan · S3.2 A private repo for business-sensitive docs · S3.3 Move the approved inventory, forward-only | low |
| 4 | S4.1 Per-folder licences · S4.2 Rename in place to danybgoode/golden-frijoles · S4.3 A merge still deploys · S4.4 Local folder and Claude memory (owed to Daniel) | high |

## Deploy order
S1 → S2 → S3 → S4, with stacked branches. Nothing changes for strangers until S2.3, and `MIRROR_ENABLED=false` stops the mirror without a revert. S4.1 is held for the lawyer. The S4.2 rename goes last, so every earlier PR uses today's URLs.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch:** N/A. There's no Golden Frijoles flag, because a repo move isn't a runtime behaviour. The mirror's off switch is the `MIRROR_ENABLED` repo variable (Stage 6b).
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
