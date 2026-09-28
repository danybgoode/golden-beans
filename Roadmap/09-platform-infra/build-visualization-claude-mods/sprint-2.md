---
epic: build-visualization-claude-mods
sprint: 2
title: Enforcement and backfill
risk: low
phase: Shipped
stories_total: 3
stories:
  - id: S2.1
    title: doc-format.mjs enforces the contract
    as_a: the maintainer
    i_want: the frontmatter contract checked in CI
    so_that: it holds for hand-edited docs, not just freshly scaffolded ones
    risk: low
    status: done
  - id: S2.2
    title: "Backfill medusa-bonsai (~54 epics)"
    as_a: a tool reading this repo
    i_want: existing epics to carry the new frontmatter
    so_that: the build view works on real history rather than only on new work
    risk: low
    status: done
  - id: S2.3
    title: "Backfill golden-beans (~28 epics)"
    as_a: a tool reading the second consumer
    i_want: the same
    so_that: the contract is a workspace property, not a medusa one
    risk: low
    status: done
---
# The build view — Sprint 2: Enforcement and backfill

**Status:** ✅ Shipped — foundation [#26](https://github.com/danybgoode/dobby-foundation/pull/26) (`56088b4`) · medusa-bonsai [#186](https://github.com/danybgoode/miyagi-product-management/pull/186) (`430e5ff`) · golden-beans [#156](https://github.com/danybgoode/golden-beans/pull/156) (`6c1d727`, Vercel production deploy ✅)

**Epic:** [The build view](README.md) · **Risk: LOW**

**A contract that isn't checked drifts.** `doc-format.mjs` exists precisely because hand-edited epic
READMEs drift away from the templates they were scaffolded from — the zero-drift `00-ideas/seeds/`
control group (one authoring path, 81 files, identical shape) is the proof. This sprint makes the new
contract enforced, then brings 80+ existing epics onto it.

## Stories

### Story 2.1 — `doc-format.mjs` enforces the contract ✅ `56088b4` · `430e5ff` · `6c1d727`
**As the** maintainer, **I want** the frontmatter contract checked in CI,
**so that** it holds for hand-edited docs, not just freshly scaffolded ones.
**Acceptance:** `doc-format.mjs --check` fails on an epic missing a required field, on an invalid
`status` value, and on a `sprint-N.md` with no frontmatter; it passes on a compliant epic. Runs in
`guards.yml`. Follows the established discipline: **green on today's known state, red on anything
new** — a permanently-red check is worse than no check.
**Risk:** low

### Story 2.2 — Backfill `medusa-bonsai` (~54 epics) ✅ `56088b4` · `430e5ff` · `6c1d727`
**As a** tool reading this repo, **I want** existing epics to carry the new frontmatter,
**so that** the build view works on real history rather than only on new work.
**Acceptance:** **scripted, then spot-checked** — never hand-edited across 54 epics. Per **D5**, the
backfill emits a **report listing every doc it could not resolve, with a reason** (prose status
disagreeing with frontmatter, sprints with no clean story boundaries, pre-template epics). Those are
**findings, recorded in this file** — fixing them all is outside the appetite and would be a
different epic.
**Risk:** low

### Story 2.3 — Backfill `golden-beans` (~28 epics) ✅ `56088b4` · `430e5ff` · `6c1d727`
**As a** tool reading the second consumer, **I want** the same,
**so that** the contract is a workspace property, not a medusa one.
**Acceptance:** same script, same report, same triage. `check-template-drift.mjs` stays green.
**Risk:** low

## Sprint QA
- **api spec(s):** `doc-format.test.mjs` extended with fixtures for each failure mode (missing field ·
  bad status value · sprint file with no frontmatter · compliant epic). A backfill test asserts the
  script is **idempotent** — running it twice changes nothing.
- **browser smoke owed:** no.
- **deterministic gate:** `node --test` + `doc-format.mjs --check` + `build-order.mjs --check` +
  `check-template-drift.mjs` (golden-beans) green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: local · `medusa-bonsai` and `golden-beans`

1. Run `node scripts/doc-format.mjs --check`.
   → Green across the backfilled corpus.
2. Delete a required field from one epic README and re-run.
   → It **fails**, naming the file and the field. *(Then revert.)*
3. Set a sprint's `status` to an invalid value and re-run.
   → Fails.
4. Strip the frontmatter from one `sprint-N.md` and re-run.
   → Fails. *(Revert.)*
5. Open the backfill report.
   → Every unresolved doc is listed **with a reason**. Nothing was silently skipped.
6. Run the backfill script a second time.
   → `git status` is clean. It is idempotent.
7. Spot-check three epics of different vintages — a recent one, one from mid-2026, and a pre-template one.
   → Frontmatter matches what the prose says. Where it can't, the report says why.
8. Run `node scripts/build-order.mjs` and open `BUILD-ORDER.md`.
   → The board still renders correctly; nothing regressed.

### Smoke results — run 2026-09-19 (the real `medusa-bonsai` and `golden-beans` corpora)
1. ✅ `doc-format --check` is green across the backfilled corpus: medusa `clean (165 path(s) enforced, 224 advisory finding(s) elsewhere)`, with the 224 unchanged from before; golden-beans `clean (1 path(s) enforced …)`, which is all of `Roadmap/`.
2–4. ✅ A missing field, an invalid `phase` and a stripped sprint frontmatter each **fail**, naming the file (`doc-format.contract.test.mjs`, run end to end against a throwaway repo). The single-file path (`--files`, the pre-commit hook) fails too, and also re-checks the epic's totals.
5. ✅ The backfill report lists every unresolved doc **with a reason** (below). Nothing is silently skipped: archived epics are counted as skipped.
6. ✅ A second run writes nothing and leaves `git status` clean, and the report is not rewritten. Rehearsed on full copies of both repos before the PRs.
7. ✅ Spot-checked epics of three vintages in medusa (`build-order-ci-self-heal`, 2026-09; `promoter-program`, 2026-06; `ml-orders-native`, pre-user-story). The frontmatter matches the prose, and `ml-orders-native` writes `null` for its user stories, which the report explains.
8. ✅ `BUILD-ORDER.md is up to date` in both repos: the board did not change.

## Backfill findings (D5 — recorded, not fixed)

| Repo | Epics / sprints / stories written | Stories with a full user story | Findings | Report |
|---|---|---|---|---|
| medusa-bonsai | 154 / 385 / 1,064 | 980 | 267 | `Roadmap/00-ideas/audits/frontmatter-backfill-2026-09-19.md` |
| golden-beans | 29 / 86 / 329 | 296 | 54 | same path |
| dobby-foundation | 5 / 16 / 61 | 60 | 3 | moved to golden-beans as `frontmatter-backfill-2026-09-19-plugin.md` |

What the findings are, in both consumers combined:
- **117 stories have no "As a … I want … so that …" in their prose.** They are written `null`, an explicit unknown. Most are pre-template (`## US-N · … — high`) or implementation notes rather than user stories.
- **115 risk values that are neither low nor high** (`med`, `medium`). They are written `high`, per *unsure means HIGH*, and reported: 15 once at sprint level, the rest per story or epic.
- **44 medusa epics have no `**Class:**`** in their header. Their `type` is written `feature` (the scaffolder default) and reported.
- **13 sprints with duplicate story numbers.** Every id in the sprint is set to its position.
- **9 sprints with no story headings at all**, which have no clean boundaries; `stories: []` is written.
- **8 sprints with no `# … Sprint N: <title>` H1.** The title is written `Sprint N`.

**Corrections to this doc's grooming:** the corpus was **154 + 29** non-archived epics (**157 + 29** in total), not "~54 + ~28". Two things surfaced while shipping this sprint:
- `doc-format --files` now blocks only on findings a commit **introduces**. Otherwise a mechanical commit touching 539 legacy docs demanded an unrelated 251-finding sweep.
- A bare `stories:` is not a list (codex, golden-beans#156).

If any step fails, note the step number + what you saw — that's the bug report.

**Step 5 is the honesty check.** A backfill that silently skips what it couldn't parse produces a
contract that looks complete and isn't.
