---
title: "One Roadmap: the plugin's epics and seeds move into this repo"
slug: one-roadmap
status: scaffolded
area: "09"
type: chore
priority: "single-product-wave-A"
appetite: S
underwritten_by: null
risk: low
epic: "09-platform-infra/one-roadmap"
build_order: 43
updated: 2026-09-28
---

# Seed: One Roadmap: the plugin's epics and seeds move into this repo

From the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md). **Decisions:** E1 (approved
2026-09-28). Groomed 2026-09-28: **chore · fixed-scope lane · appetite S · risk low** · Stage-2.5 bucket **light
enhancement** (only docs move, no code changes; the board generator already handles one funnel).

## Problem

Golden Frijoles is one product with two planning homes. This Roadmap holds 37 seeds and 30 epics. dobby-foundation's
(`golden-frijoles/skills`) holds 6 epics and 12 seeds, plus its own bets, LEARNINGS and BUILD-ORDER. A seed for the
product (`think-skills`) lands in whichever repo the skills ship from, and the product owner can't see the whole
funnel on one board.

**As the product owner, I want** every Golden Frijoles epic, seed, bet and learning in this repo's `Roadmap/`, **so
that** one generated board answers "what's next?" for the whole product.

## What grooming found (measured 2026-09-28)

- **The two build orders collide.** dobby-foundation numbers its epics 3–8, and this repo already uses 3–8 for its
  shipped history. This repo also has two existing duplicates: `7` (pod-report / ai-adoption-maturity-lens seed) and
  `16` (landing-redesign-v2 / scenarios-pm-operable).
- **Three filenames collide:** `bets/README.md`, `bets/wave-2026-09-16.md` (two different bets from the same day) and
  `00-ideas/audits/frontmatter-backfill-2026-09-19.md` (one backfill per repo).
- **LEARNINGS is not mostly duplicated.** The seed guessed that most entries had been promoted to both files. In fact,
  about **44 of dobby-foundation's 75 bold-led entries are not in this file**. That is 8 of its 11 sections.
- **dobby-foundation's CI reads its Roadmap.** `build-order.mjs --check`, `doc-format.mjs --check`,
  `build-state.mjs --offline` and `render-ways-of-working.mjs --check` all run against `Roadmap/`. That answers the
  seed's open question: **CI keeps checking; the move must leave it green.** `WAYS-OF-WORKING{,.template}.md`,
  `fill-ins.yml`, `SESSION-KICKOFFS.md` and `00-ideas/README.md` are **template sources**, not planning, so they stay.
- **Worktrees:** `golden-beans-gfp`, `-gfp-s3` and `medusa-bonsai-gfp` are clean. **`golden-beans-gfp-s2` has 1
  uncommitted file.**
- dobby-foundation's `verify-module` (audit-wave-D, L) overlaps with this repo's `verify-spike` (31). It moves as-is;
  the overlap is flagged for the portfolio pass, not resolved here.

## Scope (in)

1. **Move** (with `git mv` semantics, as new files here plus deletions there) dobby-foundation's
   `Roadmap/09-platform-infra/*` (6 epics, including retros, wave retros and the jev shadow report), its 12 seeds, 3
   audits and 3 wave bets into the same paths here.
   Collisions are renamed with a `-plugin` suffix (`bets/wave-2026-09-16-plugin.md`,
   `audits/frontmatter-backfill-2026-09-19-plugin.md`), and inbound links are fixed. dobby-foundation's `bets/README.md`
   is folded into this one only where it says something ours doesn't.
2. **Renumber `build_order` so the sequence reads as ship history** (00-ideas/README: "to insert, renumber"). Only the
   tail moves, because the plugin epics all shipped 2026-09-16 → 09-23:

   | # | Item | was |
   |---|---|---|
   | 28 | golden-frijoles-cli (shipped 09-16) | 28 |
   | 29–33 | ways-of-work-lean-pass · plugin-audit-and-extraction · golden-flags-by-default · build-visualization-claude-mods · jev-semantic-guards (DF, shipped 09-16 → 09-19) | DF 3–7 |
   | 34 | golden-frijoles-plugin (DF, **in-progress**, S5.5 owed) | DF 8 |
   | 35 | experiments-for-humans (shipped 09-24) | 29 |
   | 36–42 | scenarios-freeze … finops-quotes | 30–36 |
   | 43 · 44 · 45 | **one-roadmap · jev-reanchor-thresholds · public-monorepo** | 37 · 38 · 39 |
   | 46 | review-rail-one-implementation (DF, was unranked; `distribute-what-we-use` depends on it) | — |
   | 47–52 | distribute-what-we-use … sketch-specs | 40–45 |
   | 53 · 54 | think-skills (after intent-match, per the audit) · verify-module | DF 9 · 10 |

   The three unranked DF chores (`foundation-lint-gate`, `perf-probe-target-allowlist`, `script-ismain-realpath`) stay
   `null`. **The existing 7/16 duplicates are out of scope** because they are older history; they are logged in the
   retro. The audit's §3 table keeps its old numbers as a dated record, with a one-line "renumbered by one-roadmap"
   note.
3. **LEARNINGS:** add dobby-foundation's 44 unique entries as one section, "From the plugin repo (moved
   2026-09-28)". The 31 duplicates are dropped and the text is otherwise verbatim. Rewriting or re-sectioning is
   `doc-hygiene`'s job, not this chore's.
4. **Poster:** add the 6 plugin epics under `### 09 · Platform & Infra` in `Roadmap/README.md`. Each gets one line,
   taken from dobby-foundation's poster.
5. **Regenerate** `BUILD-ORDER.md` here with `node scripts/build-order.mjs` and run `doc-format --check`.
6. **dobby-foundation:** `Roadmap/README.md` becomes the pointer README ("planning moved to
   danybgoode/golden-beans `Roadmap/`; this folder keeps only the template sources until `public-monorepo`").
   Delete `LEARNINGS.md`, regenerate its (now empty) board and keep its four CI checks green.
7. **Worktrees:** remove the three clean ones with `git worktree remove`, and first confirm that each branch is merged
   or pushed. **`golden-beans-gfp-s2` is reported, not touched.**

## Out (no-gos)

- No code, script or template change in either repo. The pointer README and the regenerated boards are generated or
  doc-only.
- No `public-monorepo` work: nothing is renamed, and no repos or folders move.
- No reconciling `verify-module` with `verify-spike`, and no fixing the old 7/16 duplicates.
- No LEARNINGS rewrite.

## Acceptance (the product owner can check)

- `Roadmap/00-ideas/BUILD-ORDER.md` here lists the 6 plugin epics (5 ✅ shipped, 1 🏗️ building) and dobby-foundation's
  seeds in the funnel. Numbers 28–54 are unique.
- `node scripts/build-order.mjs --check` and `node scripts/doc-format.mjs --check` pass in **both** repos. The
  dobby-foundation PR's CI is green.
- dobby-foundation `Roadmap/` has no epics, seeds, bets or LEARNINGS, and its README points here.
- No broken relative links in moved files (scripted check over the moved paths).

## Delivery

One sprint, two PRs, both docs-only and **low-risk**: (1) this repo, `chore/one-roadmap`; (2) dobby-foundation,
`chore/one-roadmap-pointer`, opened **after** (1) merges so the pointer never points at nothing. Review per
WAYS-OF-WORKING for low risk. **QA stage:** the two `--check` commands plus a link check, with no browser smoke (no
rendered surface). **Smoke walkthrough owner:** Daniel. Step 1: open BUILD-ORDER.md on GitHub. Step 2: click one moved
epic. Step 3: open dobby-foundation's `Roadmap/README.md` and confirm it points here.

## Reuse

`scripts/build-order.mjs`, `scripts/roadmap-extract.mjs`, `scripts/doc-format.mjs` (both repos, byte-identical per
dobby-foundation CI), the groom scaffolder for the epic shell.

## Open risk

- If dobby-foundation's `build-state.mjs --offline` or `doc-format --check` refuses an empty `09-platform-infra`,
  the fallback is a `.gitkeep`, not a code change. If even that fails, stop and escalate.
