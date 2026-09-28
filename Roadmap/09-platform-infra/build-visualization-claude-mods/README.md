---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: build-visualization-claude-mods
build_order: 32
title: "The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod"
area: 09-platform-infra
risk: low
type: feature
phase: Shipped
sprints_total: 4
stories_total: 13
---

# Epic: The build view — a machine-readable frontmatter contract, rendered in the CLI as a Claude Mod

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/build-visualization-claude-mods.md`](../../00-ideas/seeds/build-visualization-claude-mods.md)
> **Appetite:** M (one wave — architect session + builder fan-out + one review round) · **Bet:** [`bets/wave-2026-09-16-plugin.md`](../../bets/wave-2026-09-16-plugin.md)

> ⛔ **Stacks on** [`plugin-audit-and-extraction`](../plugin-audit-and-extraction/README.md) — this epic
> changes the `groom` scaffolder templates and extends `doc-format.mjs`, which that epic ports here
> first. The backfill (Sprint 2) reaches into `medusa-bonsai` (~54 epics) and `golden-beans` (~28);
> both keep a pointer README on their own boards.

## Why

While an agent builds, the CLI should show what it is working on at an executive level — the epic,
the story and its user story, progress through the sprint, and a status like *Locking architecture /
Building / In review / Shipped*.

**The renderer is nearly here. The data is not.** Claude Mods are confirmed and committed to ship "on
the scale of weeks": plugins using **function hooks**, declared in `hooks/hooks.json`, written in
TypeScript against a middleware/continuation model (`on('ui.render', …)`, `on('turn.start', …)`,
`$.ui.status`, `$.ui.log`, `$.store.get/set`, `$.fs.readFile`), validated offline with
`claude plugin validate`, gated today behind `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

But what the docs carry today is this, and only this:

```yaml
# epic README.md — the ENTIRE frontmatter
---
status: shipped   # scaffolded | in-progress | shipped | archived
slug: arranged-only-delivery
---
```

`sprint-N.md` files have **no frontmatter at all** — epic, risk and status live in bold prose. Story
status is an inline `✅ MERGED — backend 21b1874 (PR #84 squash)` appended to a `### S1.1 —` heading.
The user story is prose inside the story block. **Nothing anywhere says which story is in flight.**

A mod built on today's docs would scrape bold markdown, break the first time someone reworded a
sprint header, and **report confidently while being wrong**.

**So: the frontmatter contract is the epic. The mod is the last sprint.** That ordering is also the
insurance — the contract feeds `build-order.mjs`, `doc-format.mjs`, `epic-dod.mjs` and the Notion
projection, so **if function hooks slip, Sprints 1–3 still ship and still pay.**

## The status ladder

Executive-level, and — the important property — **each status maps to a cadence event the docs
already mandate**, so the mod reads the process rather than becoming a second source of truth.

| Status | Entered when | Already observable? |
|---|---|---|
| `Shaping` | groom running, before the scope-doc gate | seed `status: ready` |
| `Locking architecture` | the epic-mode orchestrator is writing `D1…Dn` into the epic README | ✅ a real, named step in WAYS-OF-WORKING |
| `Building` | first story commit on `feat/<slug>` | ✅ git |
| `Verifying` | the deterministic gate is running (tsc + build + tests) | ✅ CI |
| `In review` | PR open with findings outstanding | ✅ `gh` |
| `Shipped` | merged **and deployed** — the doctrine's own *"done means shipped"* | 🟡 needs the deploy confirm |

Six, not four. `Locking architecture` and `Verifying` are the two the existing cadence makes free, and
dropping them would hide the most interesting minutes of an epic-mode run. **`Shipped` is deliberately
not `Merged`**: the docs already insist a merged-but-undeployed PR isn't done, and a ladder that said
"Deployed" when it meant "merged" would quietly contradict that.

## The target render

```
Currently building
  Epic     Arranged-only delivery            04 · Shipping & Delivery · risk HIGH
  Story    S2.1 — Agent surface parity
           As a buyer's agent, I want checkout options to reflect arranged-only listings,
           so that I'm never offered a carrier rail the seller can't fulfil.
  Progress Story 4 of 7 · Sprint 2 of 2
  Status   Building
```

## Platform-first note

**~70% of the value is a frontmatter schema plus a guard, and both have existing homes.**

- `groom/scaffold-epic.mjs` + `templates/` already generate the docs, and CI already renders a
  throwaway epic on every run to prove the templates still substitute. Widening the schema rides that.
- `doc-format.mjs` already validates epic docs against those exact templates — it exists *because*
  hand-edited epic READMEs drift away from them. Extending it is the natural home for enforcement.
- `build-order.mjs` already parses epic frontmatter across the whole corpus. **The frontmatter reader
  exists.**
- The `status:`-as-SSOT rule is **already established doctrine**. This epic widens the schema; it does
  not invent the concept.
- `session-note.mjs`'s intent journal (ported by the previous epic) is already the doctrinal answer to
  "what can't be derived".

## What already exists (reuse, don't rebuild)

- `groom/scaffold-epic.mjs`, `templates/{epic-README,sprint-N,RETROSPECTIVE}.md`, and the generator
  tests in `ci.yml`.
- `medusa-bonsai/scripts/doc-format.mjs` (ported by the previous epic).
- `template/scripts/build-order.mjs` — the corpus-wide frontmatter reader.
- `medusa-bonsai/scripts/{session-note,session-resume}.mjs` — the intent journal.
- `template/scripts/lib/gh-rest.mjs` — REST-only `gh` reads, already used by the reporting rail.
- `medusa-bonsai/scripts/merge-report.mjs` + the prod-smoke rail — the closest thing we have to a
  deploy confirmation, which `Shipped` needs.

## Architecture — locked 2026-09-19, verified against the live corpus and code

The corpus was read before deciding: **medusa-bonsai 157 epics / 396 sprint files, golden-beans 29 / 86,
dobby-foundation 5 / 16** — not the "~54 / ~28" this README was groomed with. **Zero** sprint files carry
frontmatter. The 1,480 story headings come in six shapes (`### Story N.N` 1,062 · `## US-N` 143 ·
`### SN.N` 129 · `### US-N` 64 · `## Story N.N` 45 · letter forms `### BN.N`/`## C.N` 14), and ~65% have an
"As a" line within a few lines of the heading.

- **D1 — per-story data lives in the sprint's frontmatter, as a `stories:` list.** Each entry is a flat map:
  `id`, `title`, `as_a`, `i_want`, `so_that`, `risk`, `status`. One parser-owned block per file. A fenced
  block per story was rejected: it renders the user story twice on GitHub, and six heading shapes mean the
  block would still be *found* by scraping. The existing frontmatter reader (`roadmap-extract.mjs`
  `parseFrontmatter`) matches `^(\w+):` per line, so indented list lines are invisible to it — **additive,
  no parser change**, verified. `id` is always `S<sprint>.<m>`: a heading's own `N.M` when it has one,
  else its ordinal in the sprint. Values the prose does not carry are written `null` — an explicit
  unknown, never a guess.
- **D2 — the story in flight is derived from commits, falling back to the journal.** The newest commit on
  the branch (`main..HEAD`) whose subject names `S<n>.<m>` / `Story n.m` wins; else the newest
  `claude/session-journal` entry that names one; else `unknown`. A named story that is not in the epic's
  `stories:` lists is **`unknown`, not the nearest match**.
- **D3 — the mod is a thin renderer.** All logic is `scripts/build-state.mjs` (plain Node, zero deps). The
  hook module only calls it and prints its `lines`.
- **D4 — latency.** The mod calls `build-state.mjs --offline` (git only, no `gh`) once per cache key —
  `HEAD` sha + branch + newest `Roadmap/` mtime — and serves the cached lines otherwise.
- **D5 — the backfill's failure policy.** Scripted (`scripts/roadmap-backfill.mjs`), idempotent, and it
  writes a report of every doc it could not fully resolve **with a reason**. Findings are recorded, not
  fixed.
- **D6 — DEVIATION: the ladder field is `phase:`, not `status:`.** Story 1.4 asked for the ladder in
  `status`. Two live facts forbid it. The epic README's `status:` is the lifecycle SSOT
  (`scaffolded|in-progress|shipped|archived`). `roadmap-extract`, `build-order`, `epic-dod`, `doc-format`
  and the Notion sync all read it, and an unknown value **hard-fails** the extractor. And on a sprint
  file, a frontmatter `status:` line would be captured first by the extractor's case-insensitive
  multiline `^Status:` regex, silently re-deriving every sprint's board status. So the ladder is a
  **new** field, `phase:`, on the epic README and on every sprint, with the six values verbatim. The
  lifecycle `status:` is untouched. A story's own `status` is `planned | in-progress | done`, because a
  story is not an epic.
- **D7 — how the displayed status resolves.** The base is the **written** `phase` of the sprint in flight
  (else the epic's). Evidence may only *advance* it on the two rungs the cadence table marks as directly
  observable: story commits on the branch lift anything below `Building` to `Building`, and an open PR
  (via `gh`, skipped under `--offline`) lifts to `In review`. `Locking architecture`, `Verifying` and
  `Shipped` are **never inferred** — `Shipped` needs the deploy confirmation only a person or a
  prod-smoke gives. The JSON always carries `phase_written` and `status_source`, so a disagreement is
  visible, never hidden.
- **D8 — where the contract lives, once.** The field lists, the ladder and the validators are in
  `template/scripts/lib/roadmap-contract.mjs`. `doc-format`, the backfill and `build-state` import it. The
  scaffolder (a plugin, which cannot import a project's scripts) is held to it by CI: the throwaway epic
  it renders must pass `doc-format --check`.

**Model routing:** one orchestrator session builds every sprint. The contract (S1) and the resolver (S3)
are the uphill work, and they stay on the strongest model. There is no fan-out: the sprints share
`roadmap-contract.mjs`, and a hand-off would cost more than it saves.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Epic README frontmatter schema | low |
| 1 | 1.2 `sprint-N.md` frontmatter — it has none today | low |
| 1 | 1.3 The per-story block (D1) | low |
| 1 | 1.4 The six-value status ladder, written not inferred | low |
| 1 | 1.5 `groom` scaffolder templates emit the new shape | low |
| 2 | 2.1 `doc-format.mjs` enforces the contract | low |
| 2 | 2.2 Backfill `medusa-bonsai` (~54 epics) | low |
| 2 | 2.3 Backfill `golden-beans` (~28 epics) | low |
| 3 | 3.1 `build-state.mjs --json` — one resolver | low |
| 3 | 3.2 Story-in-flight derivation (D2) | low |
| 4 | 4.1 `hooks/hooks.json` + the thin renderer | low |
| 4 | 4.2 `claude plugin validate` in CI | low |
| 4 | 4.3 The latency budget, measured | low |

## Deploy order

**No runtime deploy.** Docs, a generator, a check, a resolver and an opt-in plugin hook.

1. **Sprint 1 before Sprint 2** — enforce a schema only once the scaffolder emits it, or every
   existing doc fails on day one.
2. **Sprint 2 before Sprint 3** — `build-state.mjs` reads the contract; backfill first or it resolves
   nothing on real epics.
3. **Sprint 4 last, and independently droppable.** If function hooks haven't landed, Sprints 1–3 ship
   and Sprint 4 waits. **The epic is not blocked on a pre-release API.**

Branches stack: `feat/build-visualization-claude-mods` → `-s2` → `-s3` → `-s4`, cut from the previous
epic's final branch.

## Definition of Done (epic) — ✅ closed 2026-09-19
- [x] All sprints merged to `main` + smoke-tested (gaps stated)
- [x] Each `sprint-N.md` has its smoke walkthrough
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] **Kill-switch: carve-out (risk: low).** The mod's own gate is its `hooks.json` registration.
      **Corrected while shipping S4:** *deleting* `plugins/ways-of-work/hooks/hooks.json` is the switch —
      emptying `modules` fails validation, because the file must declare `hooks` or `modules`. Verified:
      with the file gone the plugin still validates, the mod produces no hook at all, and `doc-format`,
      `build-order` and `build-state` are untouched. Everything else is docs and checks; git is the rollback.
- [x] **Uninstalling the mod changes nothing about how the docs work.** The contract stands alone.
- [x] **The mod never shows a status the docs don't.** One source of truth, or it becomes a dashboard
      people stop trusting.
- [x] Feature branches deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
