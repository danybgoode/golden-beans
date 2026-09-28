---
title: "Plugin audit + medusa extraction — pay the dark-skill debt, port what's stranded"
slug: plugin-audit-and-extraction
status: scaffolded
area: "09"
type: chore
priority: wave-2026-09-16-plugin
appetite: L
underwritten_by: wave-2026-09-16-plugin
risk: low
epic: "09-platform-infra/plugin-audit-and-extraction"
build_order: 30
updated: 2026-09-16
---

# Pitch — Plugin audit + medusa extraction

> **Repo note.** Lands in `dobby-foundation`. **Depends on**
> [`ways-of-work-lean-pass`](ways-of-work-lean-pass.md) — that epic *decides* what the docs and the
> review policy say; this one *executes* the inventory against the decision. They both edit
> `SKILL.md` files and `template/`, so they **stack** (`feat/...` → `-s2`), they don't run parallel.

## Mirror-back
> The plugin advertises ten skills and four of them cannot run. Meanwhile `medusa-bonsai` has grown
> a lot of real engineering and product practice — routines, hooks with a cost budget, session
> continuity, doc-format enforcement, an owed-work ledger — none of which is portable. Audit the
> plugin for stale/dark/duplicated, pay or delete the debt, and extract what's stranded.

## Problem

### The plugin ships four skills that are decoration

`check-skill-scripts.mjs`'s `KNOWN_ABSENT` ledger is honest and the news is bad: **`pmo-report`,
`standup-post`, `weekly-recap` and `live-smoke` have never had a script anywhere** — not in
`template/`, not in any consuming project. A new project installs ten skills and four fail on first
use. The ledger says it plainly: *"They are dark, not working — porting them is outstanding work,
not a documentation problem to reword away."* It has said that since **2026-08-06**.

`marketplace.json` and `plugin.json` both advertise all ten, in prose, in two different orders.

### Real practice is trapped in one repo

`medusa-bonsai` has **71 scripts**; `template/` has 19. The gap includes things the plugin's own
doctrine *depends on*:

- **`scripts/routines/` — 7 committed routine prompts** (ops-nightly, prod-smoke, smoke-triage,
  roadmap-hygiene, pmo-report, weekly-recap, pr-review). This is the Step-3 "routines / loops" rail
  from `Steps-of-AI-Adoption`, already written and proven. The template has one `example-routine`
  stub. **This is the single biggest stranded asset in the workspace.**
- **`.githooks/pre-commit` + `pre-push` — the three-stage cost budget** (`<2s` staged-only / `<30s`
  whole-repo / unbounded CI), with the measured story in the header: one commit took **119.7s**, of
  which ~119s was the same corpus walk repeated eight times. The template's hooks carry no budget
  doctrine at all.
- **`session-note.mjs` + `session-resume.mjs`.** `WAYS-OF-WORKING` → *"derive what is derivable;
  journal only what isn't"* is already doctrine. These two scripts **are** that doctrine, executable.
  Prose without them is a wish.
- **`doc-format.mjs`** — checks epic docs against the `groom` plugin's own scaffolding templates. It
  lives in the consumer and validates the producer. Backwards.
- **`owed-ledger.mjs`** — turns scattered "owed to the product owner" comments into one generated,
  categorised number. Directly implements the DoD's "gaps stated explicitly" rule, which is
  otherwise unmeasurable (an external audit counted 80 occurrences across 75 files).

### Housekeeping

`.DS_Store` litters 7 directories (untracked — `.gitignore` catches them, so this is a local sweep,
not a git problem) · `roadmap-to-notion.mjs` is **554 lines**, the largest file in the template, for an integration most
projects won't use · `template/apps/example-app/` is a `playwright.config.ts` and a README and
nothing else.

## Appetite

**L — multi-wave.**
- **W1 — the debt decision + housekeeping.** Port `weekly-recap` first (the other two import it), or
  delete all four dark skills from the marketplace. Kill the committed junk.
- **W2 — Tier-1 extraction:** routines, hooks-with-budget, session continuity, `doc-format`,
  `owed-ledger`. (`pr-reviewer.md` is extracted by the lean-pass epic, not here.)
- **W3 — Tier-2 behind a config seam:** `prod-smoke`, `smoke-triage-scope`, `merge-report` + its
  hooks, `vercel-env`, `perf-probe`.

W3 is the first thing to drop if the appetite runs out.

## Outcome & signal

After this ships, every skill the marketplace advertises actually runs in a freshly spawned project,
and the practices that make `medusa-bonsai` mature are available to `golden-beans` and to the next
project without anyone copying a file.

**How you test it:** spawn a clean project from `template/`, install the plugin, and invoke **every**
advertised skill. None should say "the script is missing." Then check that `scripts/routines/` has
the real prompts and that a commit touching `Roadmap/` and `scripts/` finishes in **under 2 seconds**.

## Stage-2.5 bucket

**Genuinely new only in the config seams.** Everything else is a move + a generalize. The reporting
family is the exception: it carries project-specific delivery config (Telegram targets, benchmark
thresholds) that needs a seam designed before it can be templated — which is precisely why it has
been outstanding for six weeks.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| **The debt decision, made explicitly** | Port `weekly-recap` + 7 deps first (the other two import it), then `standup-post` (+11), then `pmo-report` (+14) — **or delete all four from `marketplace.json`/`plugin.json` until ported.** Shipping a dark skill is the same failure as a review layer that reads clean while being absent |
| **A config seam for the reporting family** | `config.example.json` files already exist per skill; they carry no delivery config. Telegram target, benchmark thresholds, repo list → one `reporting.config.json` the consuming project fills |
| **`live-smoke`** | Its origin script lives under `apps/<app>/scripts/`, never extracted. Decide: port to `template/apps/example-app/scripts/`, or drop the skill — a browser-smoke skill with no script is worse than none |
| **Port `scripts/routines/` (7 prompts + README)** | The Step-3 rail. Generalize repo names; keep the doctrine — especially *"a routine's assertions belong in a reviewable file, not in a prompt in someone's account"* (learned the expensive way) |
| **Port the 3-stage hook budget** | Header doctrine + both hooks + the `package.json` `prepare` auto-enable. The budget rule (`cost decides which stage a check belongs to, not importance`) is the transferable part |
| **Port `session-note.mjs` + `session-resume.mjs`** | Makes existing doctrine executable |
| **Port `doc-format.mjs`** | The producer should validate its own templates |
| **Port `owed-ledger.mjs`** | Makes "gaps stated explicitly" countable |
| **Housekeeping** | Sweep the 7 stray `.DS_Store` files (already gitignored); make `roadmap-to-notion.mjs` opt-in rather than part of the copy-once skeleton; decide `example-app`'s fate |
| **One generated skill list** | `marketplace.json` + `plugin.json` + README stop listing skills by hand — generate from the skills dir, so a dark or deleted skill can't linger in an advert |

## Scope

**In v1:** W1–W3 above.

**Out of v1 (no-gos):**
- **The review roster retirement** — owned by [`ways-of-work-lean-pass`](ways-of-work-lean-pass.md).
- Tier-3 project-specific scripts: `gcp-project-refs`, `neon-egress`, `flags.mjs`,
  `publish-live-views`, `sync-*-from-miyagi`, `live-views-count-parity`. They stay in medusa.
- `codex-delegate.mjs` — a separate call (see the lean-pass no-gos).
- The frontmatter contract — that's the next epic, and it *changes the scaffolder templates*, so
  doing it here would collide with `doc-format`'s port.
- Rewriting any ported script's logic. **Port, generalize the names, add a config seam. Nothing else.**

## Rabbit holes

- **The reporting family ports as one unit or not at all.** 14 + 11 + 7 transitive deps with
  `weekly-recap.mjs` imported by the other two. The ledger explicitly warns that an earlier version
  of itself *undercounted* this and "made the remaining work look like an afternoon and got scheduled
  as one." **Do not schedule it as an afternoon.** If W1's appetite says no, delete the three skills
  from the marketplace — that is an honest outcome, not a failure.
- **Generalizing a routine can silently neuter it.** `smoke-triage-scope.mjs` answers "may the
  nightly routine merge this diff by itself?" — an autonomy boundary. Template-ising its thresholds
  without a project supplying real ones produces a routine that merges things it shouldn't.
- **Hooks that block are hooks that get disabled.** The 2-second budget is the reason the medusa
  hooks survived. A ported hook that runs a corpus walk in a bigger repo breaks the budget and
  someone sets `core.hooksPath` back. **Port the budget, not just the scripts.**
- **`doc-format.mjs` will fail on existing consumer docs.** It was tuned against medusa's corpus; run
  it over `golden-beans` before shipping and decide what's a real finding vs. a medusa-ism.
- **`dist/groom.skill` is untracked and that is correct** — the Cowork install path rebuilds it with
  `node scripts/pack-skills.mjs`. Don't "fix" it by committing it; do make sure the README's rebuild
  instructions stay prominent, because an absent archive reads like a broken install.

## What already exists (reuse, don't rebuild)

- `scripts/check-skill-scripts.mjs` + its `KNOWN_ABSENT` ledger — **the work list is already
  written**, with transitive dep counts resolved on 2026-08-06. Don't re-derive it; verify it.
- `scripts/pack-skills.mjs` — reproducible `.skill` archives, already tested.
- `scripts/check-plugin-leaks.mjs` — the portability guard every ported script must pass.
- `scripts/port-reviewer-roster.mjs` — a porting precedent (and a candidate for deletion once the
  roster is gone).
- Every skill already has a `config.example.json` convention — the seam has a shape to follow.
- `medusa-bonsai/scripts/README.md` — documents the existing script inventory.

## UX heuristics & rails check
- **CI guards covering this surface:** `check-skill-scripts.mjs` (the gate this epic is *about*),
  `check-plugin-leaks.mjs`, `.github/workflows/ci.yml` (renders a throwaway epic to prove the
  scaffolder still substitutes).
- **Audits-lens findings that apply:**
  [`ways-of-work-audit-2026-09-16.md`](../audits/ways-of-work-audit-2026-09-16.md) §5, §6.
- **Design-language debt:** n/a.

## Kill-switch / runtime gate

**risk: low — no block.** Plugin/template content only; git is the rollback. Individual stories that
touch a consuming project's hooks are announced (shared surface) per the Chore class rule.

## Acceptance criteria

1. In a freshly spawned project, **every** skill the marketplace advertises runs — or is no longer
   advertised. `KNOWN_ABSENT` is empty, or the skills it names are gone.
2. `node scripts/check-skill-scripts.mjs` is green with no debt entries, and a deliberately broken
   skill still makes it fail.
3. `scripts/routines/` in the template contains the real routine prompts, generalized, with the
   "assertions live in a reviewable file" doctrine intact.
4. A commit touching `Roadmap/` and `scripts/` in a spawned project completes in **under 2 seconds**;
   a push completes in under 30.
5. `session-resume.mjs` in a spawned project derives live state across its repos and leads with what
   is surprising.
6. `git ls-files | grep -c DS_Store` stays 0 and no stray `.DS_Store` remains on disk in the repo.
7. The advertised skill list in `marketplace.json`, `plugin.json` and the README is **generated**, and
   adding a skill without updating them by hand still produces a correct advert.

## Open risks / research

- **The reporting family's config seam is genuinely undesigned.** It is the reason for six weeks of
  debt, not an oversight. Budget an architect pass for it in W1 or take the delete option.
- **`golden-beans` has its own forks** of several of these (`standup-report.mjs`, `pod-report.mjs`,
  `commit-report.mjs`, `report-main-daemon.mjs`). Porting the medusa versions into the template
  creates a **third** copy unless golden-beans is migrated onto the ported ones in the same run.
  Decide in the lock. **This is the most likely way this epic increases duplication instead of
  reducing it.**
