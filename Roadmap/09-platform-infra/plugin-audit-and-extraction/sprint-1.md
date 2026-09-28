---
epic: plugin-audit-and-extraction
sprint: 1
title: Pay or delete the dark-skill debt
risk: low
phase: Shipped
stories_total: 6
stories:
  - id: S1.1
    title: The debt decision, written down
    as_a: the maintainer
    i_want: an explicit, recorded pay-or-delete decision per dark skill
    so_that: the debt stops being carried silently for another six weeks
    risk: low
    status: done
  - id: S1.2
    title: Port weekly-recap + its 7 deps behind the config seam
    as_a: a spawned project
    i_want: the weekly recap skill to actually run
    so_that: "the marketplace's advert is true"
    risk: low
    status: done
  - id: S1.3
    title: Port standup-post (+11) and pmo-report (+14)
    as_a: a spawned project
    i_want: the remaining two reporting skills to run
    so_that: the family is whole rather than half-ported
    risk: low
    status: done
  - id: S1.4
    title: "live-smoke — port or drop"
    as_a: a spawned project
    i_want: "`live-smoke` to either work or not be offered"
    so_that: a browser-smoke skill with no script stops being advertised
    risk: low
    status: done
  - id: S1.5
    title: Housekeeping
    as_a: a consumer of this repo
    i_want: the noise gone
    so_that: a fresh clone is clean
    risk: low
    status: done
  - id: S1.6
    title: The advertised skill list becomes generated
    as_a: the maintainer
    i_want: the skill list generated from the skills directory
    so_that: "a dark or deleted skill can't linger in an advert"
    risk: low
    status: done
---
# Plugin audit + medusa extraction — Sprint 1: Pay or delete the dark-skill debt

**Status:** ✅ Shipped — [#20](https://github.com/danybgoode/dobby-foundation/pull/20) squash `2cfd281`; same-wave origin migration danybgoode/miyagi-product-management#182 `7ac3354`

**Epic:** [Plugin audit + medusa extraction](README.md) · **Risk: LOW**

**Wave 1 of 3.** The sprint opens with a **decision**, not a port — and the decision gets an architect
pass, because the reporting family's config seam is genuinely undesigned and is the reason this debt
has stood since 2026-08-06.

**The rule for this sprint:** deleting a dark skill from the marketplace is an **honest outcome, not a
failure.** Shipping a skill that cannot run is worse than not shipping it.

## Stories

### Story 1.1 — The debt decision, written down
**As the** maintainer, **I want** an explicit, recorded pay-or-delete decision per dark skill,
**so that** the debt stops being carried silently for another six weeks.
**Acceptance:** per **D1**, the epic README records the decision for `pmo-report`, `standup-post`,
`weekly-recap` and `live-smoke`. The reporting three are treated as **one unit** — `weekly-recap.mjs`
is imported by the other two, so it ports first or none of them do. The decision cites the ledger's
actual transitive counts (7 / 11 / 14), not a re-derivation.
**Risk:** low

### Story 1.2 — Port `weekly-recap` + its 7 deps behind the config seam
**As a** spawned project, **I want** the weekly recap skill to actually run,
**so that** the marketplace's advert is true.
**Acceptance:** *(conditional on 1.1 choosing to pay.)* `weekly-recap.mjs` plus
`lib/prose-{brief,guard,writer}.mjs`, `lib/telegram-format.mjs`, `lib/log-branch.mjs`,
`lib/gh-rest.mjs` and `lib/cross-agent-cli.mjs` land in `template/scripts/`. Per **D2**, delivery
config (Telegram target, repo list, thresholds) moves to `reporting.config.json`; **no consuming
project's values remain in the ported source** — `check-plugin-leaks.mjs` proves it.
**Risk:** low

### Story 1.3 — Port `standup-post` (+11) and `pmo-report` (+14)
**As a** spawned project, **I want** the remaining two reporting skills to run,
**so that** the family is whole rather than half-ported.
**Acceptance:** *(conditional on 1.1 and 1.2.)* Both port on top of `weekly-recap`, sharing
`lib/standup-deck.mjs`, `lib/report-registry.mjs`, `lib/pmo-{benchmarks,delivery,metrics,templates,window-log}.mjs`
via the same seam. Their `requires_scripts` frontmatter matches reality and
`check-skill-scripts.mjs` drops all three ledger entries **because the debt was paid, not because the
lines were removed** — the guard fails on a stale entry, which is what makes that distinction real.
**Risk:** low

### Story 1.4 — `live-smoke` — port or drop
**As a** spawned project, **I want** `live-smoke` to either work or not be offered,
**so that** a browser-smoke skill with no script stops being advertised.
**Acceptance:** per **D3**, either the origin script lands in `template/apps/example-app/scripts/`
with the skill's `requires_scripts` pointing at it, or the skill is removed from the marketplace and
the plugin. Not a third option.
**Risk:** low

### Story 1.5 — Housekeeping
**As a** consumer of this repo, **I want** the noise gone, **so that** a fresh clone is clean.
**Acceptance:** the 7 stray `.DS_Store` files are swept (they are **already gitignored** — this is a
local sweep, not a git problem, and `git ls-files | grep -c DS_Store` stays 0).
`roadmap-to-notion.mjs` (554 lines, the largest file in the template, for an integration most
projects won't use) becomes **opt-in** rather than part of the copy-once skeleton. Per the seed,
`template/apps/example-app/` either becomes a real runnable harness or is dropped.
**`dist/groom.skill` is untracked and that is correct** — the Cowork path rebuilds it with
`pack-skills.mjs`; don't "fix" it by committing it, do keep the rebuild instructions prominent.
**Risk:** low

### Story 1.6 — The advertised skill list becomes generated
**As the** maintainer, **I want** the skill list generated from the skills directory,
**so that** a dark or deleted skill can't linger in an advert.
**Acceptance:** `marketplace.json`, `plugin.json` and the README stop listing skills by hand (they
currently list them in prose, twice, in two different orders — and both lists are wrong today).
Adding or removing a skill without touching those files still produces a correct advert, and CI
fails if the generated list is stale.
**Risk:** low

## Sprint QA
- **api spec(s):** `check-skill-scripts.mjs`'s own test suite extended with fixtures for a **paid**
  ledger entry (must fail if the entry is left behind) and a **newly missing** script. A test asserts
  the generated skill list matches the skills directory.
- **browser smoke owed:** no.
- **deterministic gate:** `node --test 'scripts/*.test.mjs'` + `check-skill-scripts.mjs` +
  `check-plugin-leaks.mjs` + the CI throwaway-epic render green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: local · a freshly spawned project from `dobby-foundation/template/`

1. Spawn a clean project, install the plugin, and list the advertised skills.
   → The list matches the skills that actually exist. Nothing extra, nothing missing.
2. Invoke **every** advertised skill in turn.
   → None says "the script is missing" or stops on a missing dependency.
3. Run `node scripts/check-skill-scripts.mjs` in `dobby-foundation`.
   → Green, and `KNOWN_ABSENT` is empty (or names only skills no longer advertised).
4. Re-add a paid skill to `KNOWN_ABSENT` and re-run.
   → It **fails** on the stale entry. *(Then revert — this is what proves the debt was paid rather
     than the line deleted.)*
5. Run `node scripts/check-plugin-leaks.mjs`.
   → Green. No Telegram target, repo name or threshold from a consuming project survives in the
     ported source.
6. Copy `reporting.config.example.json` to `reporting.config.json`, fill it, and run the weekly recap.
   → It produces a recap using **your** config, not medusa's.
7. Run it with the config absent.
   → It fails with a readable message naming the file, rather than silently using someone else's target.
8. `git ls-files | grep -c DS_Store` in `dobby-foundation`, and `ls -a` the seven directories.
   → 0, and no stray files on disk.
9. Add a new skill directory and run CI without touching `marketplace.json`.
   → The generated advert includes it; a hand-stale list fails.

If any step fails, note the step number + what you saw — that's the bug report.

**Steps 2 and 4 are the point of the sprint.** Everything else is housekeeping.

## Sprint 1 — Smoke walkthrough results (2026-09-18)

Run by the building agent in a project freshly spawned from `template/` (`cp -R template/.` into a
scratch dir, `git init`), with live GitHub data. Every step was run, none skipped.

1. **Advertised list = skills that exist.** `node scripts/render-skill-adverts.mjs --check` →
   *"every advert matches plugins/ways-of-work/skills/"*. All 10 are listed. `prose-draft`, which the
   marketplace's plugin entry had dropped, is back.
2. **Every advertised skill's script runs.** `check-skill-scripts --repo-root <spawn>` → 10/10 `ok`,
   full closures present. Real runs: `weekly-recap --dry-run` and `--brief`, `standup --dry-run` and
   `--brief`, `pmo-report --dry-run --weekly` (all live GitHub), `live-smoke --path=/` (a real
   Chromium run: report.json `httpStatus: 200`, screenshot read back), `build-order-sync`
   (*"up to date — no PR needed"*), `doc-hygiene --check`, `babysit-pr 19 --dry-run`. `vercel-prune`,
   `prose-draft` and `cross-panel` stop on their own required arguments, never on a missing module.
3. **`check-skill-scripts` green, `KNOWN_ABSENT` empty.** `✓ every declared script is present.`
4. **Re-adding a paid skill fails.** Adding `weekly-recap` back produced
   *"1 STALE LEDGER ENTRY — the debt was paid: weekly-recap"*. Reverted. The same assertion is a test
   for all four paid skills.
5. **Leak guard green.** `check-plugin-leaks: clean (141 files scanned, 4 deliberate matches allowed)`.
   It caught 4 personal names in the ported code on the way, now replaced with the role name.
6. **Recap uses *your* config.** With `repos: [dobby-foundation, golden-beans]` and a `Foundation`
   deploy repo, the recap listed exactly those repos (9 and 16 merged PRs) and
   `📦 Deploys … Foundation: 9`. No origin-project repo appears.
7. **Config absent → readable refusal naming the file.** All three scripts exit 1 with
   *"…/reporting.config.json not found — the reporting scripts refuse to guess which repos to read or
   where to post. Copy reporting.config.example.json…"*. `live-smoke` does the same for its config.
8. **`.DS_Store`.** `git ls-files | grep -c DS_Store` → `0`. The 11 on disk were swept (the plan said
   7; the README said 10). `find . -name .DS_Store` → `0`.
9. **A new skill directory needs no advert edit.** Covered by `render-skill-adverts.test.mjs`
   ("smoke step 9"). The new skill appears in all four adverts, and CI's `--check` fails on a
   hand-stale list.

**Gaps, stated:** no Telegram message was actually *sent*. Every run was `--dry-run`/`--brief`,
because a real send would post into a live channel. The send path is the origin's unchanged
`sendMessage` shape, and it already runs nightly in the origin project.
