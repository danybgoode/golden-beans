---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: plugin-audit-and-extraction
build_order: 30
title: "✅ Epic: Plugin audit + medusa extraction — pay the dark-skill debt, port what's stranded"
area: 09-platform-infra
risk: low
type: chore
phase: Shipped
sprints_total: 3
stories_total: 14
---

# ✅ Epic: Plugin audit + medusa extraction — pay the dark-skill debt, port what's stranded

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Chore · **Archetype:** Sweeper · **Scope seed:** [`00-ideas/seeds/plugin-audit-and-extraction.md`](../../00-ideas/seeds/plugin-audit-and-extraction.md)
> **Appetite:** L (multi-wave — one wave per sprint, re-bet at each boundary) · **Bet:** [`bets/wave-2026-09-16-plugin.md`](../../bets/wave-2026-09-16-plugin.md)

> ✅ **The lean pass shipped (2026-09-17), which unblocks this epic and shrinks it.** That epic decided
> the policy; this one executes the inventory against the decision. It also closed several items this
> epic was originally scoped to do — see *Already closed* below. Re-read that section before slicing:
> **the appetite was set against the larger scope and should be re-bet down.**

## Already closed by the lean pass — do not re-plan these

Verified in this repo on 2026-09-17:

- **`plugins/ways-of-work/agents/pr-reviewer.md` is ported.** Story 2.3 of the lean pass did it.
- **`live-smoke`'s debt is resolved, by reclassification rather than a port** — the ledger now reads
  *"project-local by design — the script lives at `apps/<app>/scripts/live-smoke.mjs` and needs that
  app's Playwright browser project + auth helpers; the template seeds the pattern, not the file."*
  That is a legitimate answer to Story 1.4's "port or drop", and it is already recorded honestly.
- **`epic-dod.mjs`, `render-ways-of-working.mjs`, `permissions-smoke.mjs`** all exist in
  `template/scripts/`, with tests.
- **The review plumbing is already collapsed** — `review-config.json` replaced the router table, and
  `cross-review.test.mjs` exists.

**Still open, and this epic's real remaining scope:**

- **Three dark skills:** `weekly-recap` (7 deps), `standup-post` (11), `pmo-report` (14). The ledger is
  honest and unchanged. Port as one unit behind a config seam, or delete all three from the
  marketplace. **`weekly-recap` first — the other two import it.**
- **`template/scripts/routines/` is still just `README.md` + `example-routine.prompt.md`.** The seven
  real routine prompts have not been ported. This remains the largest stranded asset.
- **`template/.githooks/` has both hooks but not the enforcement**: the header still says *"Enable once
  per clone"* rather than shipping the `package.json` `prepare` wiring, so a fresh clone gets no hooks
  until someone remembers.
- **`session-note.mjs`, `session-resume.mjs`, `doc-format.mjs`, `owed-ledger.mjs`** are not in
  `template/scripts/`.
- **Housekeeping is untouched:** 10 stray `.DS_Store` files; `roadmap-to-notion.mjs` still part of the
  copy-once skeleton; the advertised skill list is still hand-maintained in two files.

## Why

**The plugin advertises ten skills and four of them are decoration.** `check-skill-scripts.mjs`'s
`KNOWN_ABSENT` ledger is admirably honest and the news is bad: `pmo-report`, `standup-post`,
`weekly-recap` and `live-smoke` have **never had a script anywhere** — not in `template/`, not in any
consuming project. A new project spawned from this template installs ten skills and four fail on
first use. The ledger says it plainly: *"They are dark, not working — porting them is outstanding
work, not a documentation problem to reword away."* It has said that since **2026-08-06**.

**Meanwhile real practice is trapped in one repo.** `medusa-bonsai` has 71 scripts; `template/` has
19, and the gap includes things the plugin's own doctrine *depends on* — most of all
`scripts/routines/`, seven committed routine prompts that are the Step-3 "routines and loops" rail
from `references/Steps-of-AI-Adoption.md`, already written and proven, against which the template
offers a single stub.

After this epic, every skill the marketplace advertises actually runs in a freshly spawned project,
and the practices that make `medusa-bonsai` mature reach `golden-beans` and the next project without
anyone copying a file.

## Platform-first note

**This is a move-and-generalize epic, not a build epic.** The one genuinely new design is the
**config seam** for the reporting family — and that seam is precisely why the debt has stood for six
weeks, so it gets an architect pass rather than being treated as an afternoon.

`check-skill-scripts.mjs` already **is** the work list: transitive dependency closures were resolved
on 2026-08-06 and recorded per skill. **Verify it; don't re-derive it.** The ledger's own header
records that an earlier version of itself *undercounted* badly (it said `pmo-report` needed "four
helpers"; the real answer is 14 files) — *"a debt ledger that understates the debt is worse than no
ledger — it makes the remaining work look like an afternoon and gets scheduled as one."*

## What already exists (reuse, don't rebuild)

- `dobby-foundation/scripts/check-skill-scripts.mjs` + `KNOWN_ABSENT` — **the work list, with counts.**
- `dobby-foundation/scripts/pack-skills.mjs` — reproducible `.skill` archives, already tested.
- `dobby-foundation/scripts/check-plugin-leaks.mjs` — the portability guard every ported script must pass.
- Every skill already ships a `config.example.json` — **the seam has a shape to follow.**
- `medusa-bonsai/scripts/routines/` — 7 prompts + README.
- `medusa-bonsai/.githooks/{pre-commit,pre-push}` — the three-stage cost budget, with its measured story.
- `medusa-bonsai/scripts/{session-note,session-resume,doc-format,owed-ledger}.mjs`.
- `medusa-bonsai/scripts/{prod-smoke,smoke-triage-scope,merge-report,vercel-env,perf-probe}.mjs` (Tier 2).
- `medusa-bonsai/scripts/README.md` — documents the existing inventory.
- `dobby-foundation/scripts/port-reviewer-roster.mjs` — a porting precedent (**and a deletion candidate
  once the lean pass has retired the roster**).

## Architecture decisions to lock before any builder starts

- **D1 — pay or delete, decided explicitly in Sprint 1.** The reporting family (`weekly-recap` +7,
  `standup-post` +11, `pmo-report` +14) shares one dependency web and `weekly-recap.mjs` is imported
  by the other two. **They port as one unit or not at all.** If the appetite says no, deleting all
  three from the marketplace is an **honest outcome, not a failure.**
- **D2 — the reporting config seam.** Telegram target, benchmark thresholds, repo list → one
  `reporting.config.json` the consuming project fills. Locked against what the three scripts actually
  read, not against what they appear to read.
- **D3 — `live-smoke`'s fate.** Its origin script lives under `apps/<app>/scripts/`, never extracted.
  Port to `template/apps/example-app/scripts/` or **drop the skill** — a browser-smoke skill with no
  script is worse than none.
- **D4 — generalize without neutering.** `smoke-triage-scope.mjs` answers *"may the nightly routine
  merge this diff by itself?"* — an autonomy boundary. Template-ising its thresholds without a
  project supplying real ones produces a routine that merges things it shouldn't. Every ported
  threshold is either required from config or fails closed.
- **D5 — the third-copy trap.** `golden-beans` has its **own** forks (`standup-report.mjs`,
  `pod-report.mjs`, `commit-report.mjs`, `report-main-daemon.mjs`). Porting medusa's versions into the
  template creates a **third** copy unless golden-beans migrates onto the ported ones in the same run.
  **This is the most likely way this epic increases duplication instead of reducing it.** Decide here.

## Decisions — locked 2026-09-18 (Story 1.1)

The product owner's direction for this run was explicit: **nothing ships dark, nothing is disabled,
everything is in production.** That settles D1 and D3 as *pay*, not *delete*. Deleting would have been
honest, but it would also have left the advertised capability absent.

- **D1 — PAY, as one unit.** `weekly-recap`, `standup-post` and `pmo-report` port together. The ledger's
  counts (+7 / +11 / +14) were verified by walking the real import graph, not re-derived by hand. The
  real closures are larger once subprocess scripts and data files are counted: 12 / 20 / 23 declared
  paths, including the seam, prompts and templates. `weekly-recap.mjs` ported first, and the other two
  import it.
- **D2 — one committed `reporting.config.json`, locked against what the scripts actually read.** Only
  `repos` is required. `deployRepos`, `telegram.{chatId,chatIds}`, `smoke`, `stalePreviewAgeDays`,
  `liveFlags`, `artifacts.{docViewerUrl,registry}` and `prose.extraBannedToolNames` are each **off when
  absent, never defaulted**. Absent or malformed config exits with a message naming the file and key.
  The origin's hard-coded Cloud Run doc-viewer URL and GCS bucket became config, with no default. The
  config is **committed** (it holds nothing secret), which also fixes the old trap of a gitignored
  per-skill `config.json` never surviving a routine's fresh checkout. The three per-skill
  `config.example.json` files are retired.
- **D3 — PORT `live-smoke`.** It is now `template/scripts/live-smoke.mjs` plus `live-smoke.config.json`,
  and it drives `apps/example-app`, which became a real runnable harness (story 1.5's
  "example-app's fate"). The origin's refusals are kept: authed-against-prod, and production-looking
  keys even locally.
- **D4 — generalize without neutering.** It applies here to the prose guard: the origin's own
  stack names moved to `prose.extraBannedToolNames` rather than being dropped. It applies fully to
  Sprint 3's `smoke-triage-scope`, where thresholds are required and fail closed.
- **D5 — one implementation per rail, decided per rail in Sprint 3.** The rule: the template takes
  whichever existing implementation is the superset. The other consumer either migrates onto it in the
  same wave, or records a written divergence reason in its own docs. Finding from the S1 survey:
  golden-beans is the **origin** of the prose rail (`prose-guard`/`prose-writer`) that medusa forked,
  and it runs its own merge-report stack (`commit-report` + `report-new-commits` +
  `report-main-daemon`, with Slack and a launchd retry daemon). So the "third copy" risk is real for
  the prose libs and the merge-report rail specifically.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The debt decision — pay or delete, written down | low |
| 1 | 1.2 If paying: `weekly-recap` + its 7 deps, behind the config seam | low |
| 1 | 1.3 If paying: `standup-post` (+11) and `pmo-report` (+14) | low |
| 1 | 1.4 `live-smoke` — port or drop (D3) | low |
| 1 | 1.5 Housekeeping — stray `.DS_Store`, `roadmap-to-notion` opt-in, `example-app`'s fate | low |
| 1 | 1.6 The advertised skill list becomes generated | low |
| 2 | 2.1 Port `scripts/routines/` — the Step-3 rail | low |
| 2 | 2.2 Port the three-stage hook budget | low |
| 2 | 2.3 Port `session-note.mjs` + `session-resume.mjs` | low |
| 2 | 2.4 Port `doc-format.mjs` — the producer validates its own templates | low |
| 2 | 2.5 Port `owed-ledger.mjs` | low |
| 3 | 3.1 Tier 2 behind a config seam — `prod-smoke`, `smoke-triage-scope` | low |
| 3 | 3.2 Tier 2 — `merge-report` + its hooks, `vercel-env`, `perf-probe` | low |
| 3 | 3.3 Migrate `golden-beans` onto the ported scripts (D5) | low |

## Deploy order

**No runtime deploy.** Plugin and template content, plus consuming-repo migrations.

- **Sprint 3 is the first thing to drop** if the appetite runs out. Sprints 1 and 2 carry the epic.
- Stories that change a consuming project's git hooks touch **shared surface** — announce them, per
  the Chore class rule, before merging.
- `D5`'s golden-beans migration (3.3) must land in the **same wave** as the ports it consumes, or the
  third copy exists in the interim and someone builds on it.

Branches stack: `feat/plugin-audit-and-extraction` → `-s2` → `-s3`, cut from the lean pass's final branch.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated): #20 `2cfd281`, #21 `f8be490`, #22 `8aa5e54`.
      *`epic-dod --check` shows `sprints-merged` as `?`: the sprint status lines also cite the consumers'
      squash SHAs, which this repo cannot resolve. The linked `owner/repo#N` PRs are the proof, and all
      are MERGED.*
- [x] Each `sprint-N.md` has its smoke walkthrough (S3's carries a correction after review)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch: carve-out (risk: low).** Plugin/template content; git is the rollback.
- [x] **`KNOWN_ABSENT` is empty**, or the skills it named are no longer advertised. **No skill ships
      dark** — an advertised skill that cannot run is the same failure as a review layer that reads
      clean while being absent. *(Empty. `check-skill-scripts --repo-root` is 10/10 against both
      consumers, and the adverts are generated, with CI failing on a stale one.)*
- [x] **No third copy exists** — golden-beans runs the ported scripts, not its own forks (D5). *(Checked
      by a byte-compare of every template script against both consumers: each shared rail is ONE set of
      bytes in all three repos. Where a consumer keeps its own rail instead, such as golden-beans'
      merge-report rail, that is a second, documented sibling and never a third copy, and its reason is in
      that consumer's `scripts/README.md`.)*
- [x] Feature branches deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
