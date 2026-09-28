---
title: "The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod"
slug: build-visualization-claude-mods
status: scaffolded
area: "09"
type: feature
priority: wave-2026-09-16-plugin
appetite: M
underwritten_by: wave-2026-09-16-plugin
risk: low
epic: "09-platform-infra/build-visualization-claude-mods"
build_order: 32
updated: 2026-09-16
---

# Pitch — The build view

> **Repo note.** Lands in `dobby-foundation`. **Depends on**
> [`plugin-audit-and-extraction`](plugin-audit-and-extraction.md) — this epic changes the `groom`
> scaffolder templates and `doc-format.mjs`, both of which that epic touches. Stack, don't parallel.

## Mirror-back
> While an agent is building, show — right there in the CLI — what it is working on, at an executive
> level: the epic, the story and its user story, progress through the sprint, and a status like
> *Locking architecture / Building / In review / Shipped*. Claude Mods (plugins using function
> hooks) are the rendering mechanism.

## Problem

**The renderer is nearly here; the data is not.**

Claude Mods are confirmed and committed to ship "on the scale of weeks": plugins using **function
hooks**, declared in `hooks/hooks.json`, written in TypeScript against a middleware/continuation
model (`on('ui.render', …)`, `on('turn.start', …)`, `$.ui.status`, `$.ui.log`, `$.store.get/set`,
`$.fs.readFile`), validated offline with `claude plugin validate`, gated today behind
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. So yes — it renders in the CLI while the agent works.

But what the docs actually carry is this, and only this:

```yaml
# epic README.md — the ENTIRE frontmatter
---
status: shipped   # scaffolded | in-progress | shipped | archived
slug: arranged-only-delivery
---
```

- **`sprint-N.md` has no frontmatter at all.** Epic, risk and status live in bold prose.
- Story status is an inline `✅ MERGED — backend 21b1874 (PR #84 squash)` on a `### S1.1 —` heading.
- The user story is prose inside the story block.
- **Nothing anywhere says which story is in flight right now.**

A mod built on today's docs would be scraping bold markdown — it would break the first time someone
rewords a sprint header, and it would report confidently while being wrong. **The frontmatter
contract is the epic. The mod is the last sprint.**

## Appetite

**M — one wave:** an architect session locking the frontmatter schema and the status ladder, builders
for the schema + scaffolder + `doc-format` enforcement + backfill, then the mod. If the mod slips
(function hooks are pre-release), **the frontmatter contract still ships and still pays** — it feeds
`build-order.mjs`, `doc-format.mjs`, `epic-dod.mjs` and the Notion projection. That independence is
what makes this an M instead of a gamble.

## Outcome & signal

While an agent builds, the CLI shows:

```
Currently building
  Epic     Arranged-only delivery            04 · Shipping & Delivery · risk HIGH
  Story    S2.1 — Agent surface parity
           As a buyer's agent, I want checkout options to reflect arranged-only listings,
           so that I'm never offered a carrier rail the seller can't fulfil.
  Progress Story 4 of 7 · Sprint 2 of 2
  Status   Building
```

**How you test it:** with the mod installed, start a build session on a scaffolded epic and look at
the CLI. Then merge a story and watch Progress advance without anyone editing a dashboard.

## Stage-2.5 bucket

**Genuinely new** — but much smaller than it looks, because ~70% of the value is a frontmatter schema
plus a guard, and both have existing homes (`groom/templates/`, `doc-format.mjs`).

## The status ladder (the part you asked to be open to suggestions on)

Executive-level, and — the important property — **each status maps to a cadence event the docs
already mandate**, so the mod reads the process rather than becoming a second source of truth:

| Status | Entered when | Already observable? |
|---|---|---|
| `Shaping` | groom running, before the scope-doc gate | seed `status: ready` |
| `Locking architecture` | the epic-mode orchestrator is writing `D1…Dn` into the epic README | ✅ a real, named step in WAYS-OF-WORKING |
| `Building` | first story commit on `feat/<slug>` | ✅ git |
| `Verifying` | the deterministic gate is running (tsc + build + tests) | ✅ CI |
| `In review` | PR open with findings outstanding | ✅ `gh` |
| `Shipped` | merged **and deployed** — the doctrine's own *"done means shipped"* | 🟡 needs the deploy confirm |

Six, not four — `Locking architecture` and `Verifying` are the two the existing cadence makes free,
and dropping them would hide the most interesting minutes of an epic-mode run. **`Shipped` is
deliberately not `Merged`**: the docs already insist a merged-but-undeployed PR isn't done, and a
status ladder that says "Deployed" when it means "merged" would quietly contradict that.

## Bill of materials (What / Why)

| What | Why |
|---|---|
| **Frontmatter schema for epic `README.md`** | Add: `title`, `area`, `risk`, `type`, `sprints_total`, `stories_total`, `build_order`. Today: `status` + `slug` only |
| **Frontmatter for `sprint-N.md` — it has none** | `epic`, `sprint`, `title`, `risk`, `status`, `stories_total`. The biggest single gap |
| **A per-story block the scaffolder emits** | `id`, `as_a`, `i_want`, `so_that`, `risk`, `status`. Either YAML in the sprint frontmatter or a fenced block per story — **decide in the lock**; scraping `###` headings is what we're escaping |
| **`status` field with the six-value ladder** | Above. Written by the agent at the moments the cadence defines, never inferred |
| **`groom` scaffolder templates updated** | `scaffold-epic.mjs` + `templates/` emit the new shape; the generators already exist and are CI-tested |
| **`doc-format.mjs` enforces it** | Ported by the previous epic; extend it. **A contract that isn't checked drifts** — this file already exists *because* hand-edited epic READMEs drift away from the templates |
| **Backfill** | ~54 epics in medusa, ~28 in golden-beans. Scripted + spot-checked, never by hand |
| **`build-state.mjs` — one resolver** | Reads frontmatter + git + `gh` and returns the current epic/story/progress/status as JSON. **The mod calls this; it does not parse markdown itself.** Also usable by `standup`, the Notion projection and `epic-dod` |
| **The mod** — `plugins/ways-of-work/hooks/hooks.json` + `index.ts` | `on('turn.start')` refreshes via `$.store`, `$.ui.status` renders. Cached — this must never add latency to a turn |
| **`claude plugin validate` in CI** | Validates offline with no API key; cheap to gate on |

## Scope

**In v1:** the frontmatter contract, scaffolder + `doc-format` enforcement, the backfill,
`build-state.mjs`, and the mod rendering the five lines above.

**Out of v1 (no-gos):**
- **No web dashboard, no Notion view, no TUI.** `build-state.mjs` makes those cheap later; building
  one now doubles the epic.
- No per-agent view in a multi-builder run. One session, one view.
- No editing from the mod. Read-only render.
- No token/cost display. Different problem.
- Not blocking on function hooks reaching GA — if they slip, sprints 1–3 ship and sprint 4 waits.

## Rabbit holes

- **Function hooks are pre-release.** Behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, with an API that
  can still move. **Mitigation is structural, not hopeful:** all logic lives in `build-state.mjs`
  (plain Node, testable, useful on its own); the hook file is a thin renderer. If the hook API
  changes, one thin file changes.
- **`$.ui.status` on every turn is a latency risk.** Derive on `turn.start`, cache in `$.store`,
  invalidate on branch change or a `Roadmap/` file write. Never shell out to `gh` inside a hook.
- **Backfilling 80+ epics will surface real inconsistencies** — epics whose prose status disagrees
  with their frontmatter, sprints with no clean story boundaries. That is a *finding*, not a
  blocker: record them, don't fix them all inside this epic's appetite.
- **"Which story is in flight" has no honest source today.** Options: the last commit's `S<n>.<m>`
  prefix (cheap, needs a commit convention we nearly have), an explicit agent write (accurate,
  another thing to forget), or `session-note.mjs`'s journal (already ported by the previous epic —
  and already doctrine: *journal intent, derive the rest*). **Recommendation: derive from commits,
  fall back to the journal.** Decide in the lock.
- **Two sources of truth is the failure mode.** If the mod ever shows a status that the docs don't,
  it becomes a dashboard people stop trusting. The resolver reads existing artefacts only.

## What already exists (reuse, don't rebuild)

- `groom/scaffold-epic.mjs` + `templates/{epic-README,sprint-N,RETROSPECTIVE}.md` — generators with
  CI tests that render a throwaway epic on every run.
- `medusa-bonsai/scripts/doc-format.mjs` — already validates epic docs against those templates.
- `template/scripts/build-order.mjs` — already parses epic frontmatter across the corpus; the
  frontmatter reader exists.
- `medusa-bonsai/scripts/session-note.mjs` / `session-resume.mjs` — the intent journal.
- `template/scripts/lib/gh-rest.mjs` — REST-only `gh` reads, already used by the reporting rail.
- The `status:` SSOT rule — **already established doctrine**. This epic widens the schema; it does
  not invent the concept.

## UX heuristics & rails check
- **CI guards covering this surface:** `doc-format.mjs` (after its port), `build-order.mjs --check`,
  the groom generator tests in `ci.yml`. New: `claude plugin validate`.
- **Audits-lens findings that apply:**
  [`ways-of-work-audit-2026-09-16.md`](../audits/ways-of-work-audit-2026-09-16.md) §8.
- **Design-language debt:** terminal output — keep it to five lines and let `$.ui.status` own the
  styling. A mod that draws a box is a mod that fights the CLI.

## Kill-switch / runtime gate

**risk: low — carve-out.** Docs, a generator, a check and an opt-in plugin hook. The mod's own gate
is the `hooks.json` registration: removing the entry disables it with no deploy.

## Acceptance criteria

1. A newly scaffolded epic emits the full frontmatter on the epic README **and** every `sprint-N.md`,
   including per-story `as_a`/`i_want`/`so_that`.
2. `doc-format.mjs --check` fails on an epic missing a required field and passes on a compliant one.
3. All existing epics in `medusa-bonsai` and `golden-beans` carry the new frontmatter; the backfill
   report lists every doc it couldn't resolve, with a reason.
4. `node scripts/build-state.mjs --json` on a checked-out feature branch returns the right epic,
   story, `as_a/i_want/so_that`, `Story X of Y`, `Sprint N of M`, and one of the six statuses.
5. With the mod installed, that information appears in the CLI during a build session and updates
   when a story lands — without being asked.
6. The mod adds **no measurable latency** to a turn (measured, not asserted).
7. `claude plugin validate` passes in CI and lists the registered hooks.
8. Uninstalling the mod changes nothing about how the docs work.

## Open risks / research

- **Function-hook API stability** — the one real unknown; mitigated by the thin-renderer split.
- **Story-in-flight derivation** (see rabbit holes) — needs a decision, not research.
- **`Shipped` requires a deploy confirmation** the system doesn't consistently produce today.
  `merge-report.mjs` and the prod smoke rail are the closest thing. If it can't be made honest inside
  the appetite, **ship five statuses and say so** rather than letting `Shipped` mean `Merged`.
