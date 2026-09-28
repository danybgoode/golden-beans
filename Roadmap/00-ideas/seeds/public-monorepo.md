---
title: "One public monorepo with per-folder licences, a private docs repo, and a lean install mirror"
slug: public-monorepo
status: scaffolded
area: "09"
type: feature
priority: "single-product-wave-A"
appetite: M
underwritten_by: null
risk: high
epic: "09-platform-infra/public-monorepo"
build_order: 45
updated: 2026-09-28
---

# Seed: One public monorepo with per-folder licences, a private docs repo, and a lean install mirror

From the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). **Decisions:** E1, E2, E8
(approved 2026-09-28). Groomed 2026-09-28: **feature · shaped bet · appetite M (one wave) · risk high** (shared infra:
CI, release and deploy). Stage-2.5 bucket: **genuinely new**. No existing primitive moves repos, but every rail it
needs already exists.

**As the product owner, I want** the engine, CLI/SDK, plugin, kit and template in one public repo, with licences
that say what's open, **so that** a rail change is one PR instead of a cross-repo pair. Strangers keep installing
from `golden-frijoles/skills` exactly as today, and nothing business-sensitive keeps accumulating in public.

## Problem

Two code repos mean most rail changes need a cross-repo PR pair, plus a "copy-in" step whose consumer gates keep
finding defects the source repo can't see (five in golden-frijoles-plugin wave 2). Both repos are public. This one
has no licence (`packages/cli` says `UNLICENSED`), and client, pricing and strategy material sits in its public
Roadmap.

## What grooming measured (2026-09-28)

- **dobby-foundation:** 128 commits, 3.2 MB of source (`template/` 2.5 MB, `scripts/` 404 KB, `plugins/` 288 KB,
  `kit/` 16 KB) and two workflows. `ci.yml` has 22 steps and runs from the repo root. `release.yml` publishes
  `@golden-frijoles/kit` with **npm OIDC trusted publishing plus provenance**, which npm binds to *this repo +
  `release.yml`*, then tags `v<version>`.
- **golden-beans:** 362 commits, npm workspaces `apps/*` + `packages/*`, and ten workflows (PR `ci.yml`, main-push
  guards, crons).
  - **81 of its `scripts/` are byte-identical copies** of dobby-foundation's `template/scripts/`, and 5 differ.
  - It has three absolute-path references to `/Users/cosmo/dobby/golden-beans`.
- **Vercel team `danybgoodes-projects` is on the Hobby plan.** Vercel doesn't connect a Hobby team to an
  **organization-owned** GitHub repo, so transferring this repo into `golden-frijoles` would cut the Git integration,
  and with it the "merge to `main` = deploy" pipeline (AGENTS rule #4). Hobby is also Vercel's non-commercial tier,
  and goldenfrijoles.com takes signups. **→ Decision 1 below.**
- **GitHub org `golden-frijoles`:** free plan, Daniel is admin, 1 public repo (`skills`). A free org can hold private
  repos.
- **Sensitive material is woven through the Roadmap:** "miyagi" appears in 124 tracked files, "medusa" in 88,
  "pricing" in 42, "mutiny" in 5. The repo has been public since 2026-07-14, so **moving files out doesn't remove
  them from public history.** **→ Decision 2 below.**
- No secret scanner is installed locally (no gitleaks or trufflehog). GitHub secret scanning with push protection has
  been on since 2026-09-16, but it covers pushes, not the history before that.

## Bill of materials

| What | Why |
|---|---|
| dobby-foundation subtree-merged **with history** under **one** prefix, `skills/` | One prefix makes the mirror a plain `git subtree split --prefix=skills`, byte-for-byte what `golden-frijoles/skills` holds today. Every relative path, `ci.yml` step and `release.yml` keeps working inside the folder. `skills/kit` is outside the `apps/*`/`packages/*` workspaces, so npm installs are unaffected. |
| A root `skills-ci.yml` (PRs touching `skills/**`, `working-directory: skills`), held identical to `skills/.github/workflows/ci.yml` by a check | GitHub reads workflows only from the root `.github/`. Without it, a skills change would reach the mirror unreviewed by CI. |
| A `mirror` job: on push to `main` touching `skills/**`, push the split to `golden-frijoles/skills` `main` with a deploy key; `MIRROR_ENABLED` repo variable as its off switch | The mirror **keeps its own `release.yml`**, so npm trusted publishing, provenance and tags don't change. There's no npm settings change and no 2FA step. The install prompt, parity check and landing copy stay as they are. |
| The skills repo marked as a mirror: branch protection allowing only the deploy key, plus a README/CONTRIBUTING line pointing PRs to the monorepo | Two writable homes is the fork problem again. |
| A one-time **full-history secret scan** (gitleaks, run in CI or with `npx`, report only) of both repos | Push protection started 2026-09-16, and history before that was never scanned. |
| A **private** repo `golden-frijoles/internal`, and an approved inventory of business-sensitive docs moved there with pointers left behind | E1 says sensitive material stops accruing in public. |
| Per-folder licences: `skills/` Apache-2.0 + NOTICE (already), `packages/cli` + `packages/sdk` Apache-2.0 (replacing `UNLICENSED`), `apps/web` + `supabase/` FSL-1.1-ALv2, and a root LICENSE that maps them | E8. **Merges only after Daniel confirms the lawyer's OK.** |
| Repo identity per **Decision 1**, the Vercel Git connection re-verified by a real merge deploy, and the owed steps for the local folder + Claude Code memory path | E2, and rule #4: the deploy pipeline must be proven after the move, not assumed. |

## Rabbit holes

- **Deduplicating the 81 copied scripts** (`scripts/` vs `skills/template/scripts/`) is tempting once they share a
  repo. It's out of scope and belongs to `distribute-what-we-use` / `review-rail-one-implementation`. The copies stay
  as they are, and this epic only moves them.
- **Rewriting history** to erase already-public docs: see Decision 2. It breaks every SHA cited in PRs, docs and
  memory, and it can't recall existing clones.
- **Moving npm publishing into the monorepo** would need npm-side trusted-publisher changes (Daniel's 2FA). The mirror
  keeps publishing instead.
- **Renaming addresses** (Vercel project, `golden-beans-gamma.vercel.app`, tenant slugs, `GOLDEN_BEANS_*`, the MCP
  id, the webhook envelope) is out per E2 and belongs to the rebrand close-out A3/A4/A6.

## No-gos

- No manual `vercel deploy`, ever (rule #4). The deploy is proven by a merge.
- No change to the kit's npm publishing path or the plugin install prompt.
- No new runtime dependency. gitleaks runs in CI or through `npx`, not as a repo dependency.
- No LICENSE file merges before the lawyer's OK.

## Slices (one wave, stacked branches, each sprint an integration + rollback boundary)

| Sprint | Stories | Risk | QA stage |
|---|---|---|---|
| **S1 — One repo, nothing published differently** | 1.1 subtree-merge dobby-foundation → `skills/` with history · 1.2 root `skills-ci.yml` + a sync check against `skills/.github/workflows/ci.yml` · 1.3 fix the 3 absolute paths | high | Both CIs green on the PR, with every skills step run from `skills/`. The skills repo is untouched. |
| **S2 — The mirror cut-over** | 2.1 deploy key + `mirror` job + `MIRROR_ENABLED` · 2.2 dry run to a `mirror-test` branch, then a diff of that branch against skills `main` must be empty · 2.3 go live with a patch release through the mirror (tag + npm + provenance), then install it in an isolated home · 2.4 mark skills as a mirror, and archive `~/dobby/dobby-foundation` | high | The isolated-home install of the mirrored release is the gate. Smoke walkthrough owed to Daniel: install the plugin in a scratch repo. |
| **S3 — Secrets and sensitive docs** | 3.1 full-history secret scan of both repos (report) · 3.2 create `golden-frijoles/internal` (private) · 3.3 move the **Daniel-approved** inventory (proposed at the lock) with pointers | low | Scan report in `00-ideas/audits/`. The link check stays green after the move. |
| **S4 — Licences and identity** | 4.1 per-folder LICENSEs + `package.json` `license` fields (**held until Daniel confirms the lawyer's OK**) · 4.2 repo identity per Decision 1, with Vercel Git reconnected · 4.3 a merge to `main` deploys, confirmed by `gh api …/deployments` showing that SHA live · 4.4 owed: the local folder rename + Claude memory move (exact commands for Daniel) | high | The deploy proof of 4.3. Smoke owed to Daniel: open goldenfrijoles.com after the first post-move merge. |

**Kill switch (Stage 6b):** no Golden Frijoles flag, because a repo move isn't a runtime behaviour. The mirror job's
`MIRROR_ENABLED` repo variable stops publishing without a revert. Rollback: S1 is one revertible merge, and while the
mirror is off, the skills repo keeps working as it does today.

## Acceptance (Daniel can check)

- One repo holds `apps/`, `packages/` and `skills/`, and `git log -- skills/plugins` shows dobby-foundation's history.
- A merge touching `skills/**` produces a new `golden-frijoles/skills` commit, and a version bump there tags and
  publishes the kit with provenance. The install prompt installs it in a clean home.
- Nobody can push to `golden-frijoles/skills` except the mirror.
- A secret-scan report exists for both repos' full history.
- The approved sensitive docs are only in the private repo.
- LICENSE files match E8 (after the lawyer's OK). A post-move merge deploys goldenfrijoles.com.

## Reuse

`skills/.github/workflows/{ci,release}.yml` as they are, `scripts/check-release.mjs`, the isolated-home install check
from golden-frijoles-plugin S5, `gh api repos/<o>/<r>/deployments` for deploy proof, and the review rail
(`review-route.mjs`, both lenses: this touches CI and release paths).

## Decisions of record (Daniel, 2026-09-28, at the approval gate)

- **Decision 1 → B, rename in place.** The repo becomes `danybgoode/golden-frijoles`, with **no transfer** into the
  org, so the Vercel Hobby Git integration keeps working. This **amends E2's** `golden-frijoles/golden-frijoles`, to
  be revisited if the team moves to Pro. The org holds `skills` (the mirror) and `internal` (private).
- **Decision 2 → A, forward-only.** The approved inventory moves to `golden-frijoles/internal` with pointers left
  behind, and there's no history rewrite.
- **Scope approved: build it.** The LICENSE story is held for the lawyer's OK, and the sensitive-doc inventory goes
  to Daniel before anything moves.

### The options as put

1. **Vercel Hobby vs the org transfer (E2).**
   - **(A, recommended)** Upgrade the Vercel team to Pro, then transfer to `golden-frijoles/golden-frijoles` as E2
     says. Hobby is the non-commercial tier anyway, and the site takes signups.
   - **(B)** Rename in place to `danybgoode/golden-frijoles` with no transfer, and revisit when Pro is needed. The org
     holds only the mirror and the private repo.
2. **Sensitive docs.**
   - **(A, recommended)** Forward-only: move the approved inventory to `golden-frijoles/internal` and leave pointers.
     Git history keeps what was already public, because it has been public since July.
   - **(B)** Also rewrite history (`git filter-repo` on those paths + force-push). That breaks every cited SHA and
     open PR, and still can't recall existing clones or forks.
