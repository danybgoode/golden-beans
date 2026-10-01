---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: board-sinks-and-scrumban
title: "One stage, every client: a six-stage board on the Hub, the CLI mod and every sink"
area: 02-commercial
risk: high
type: feature
sprints_total: 4
stories_total: 15   # the sum of every sprint's stories_total — keep it in step when a story is added
intent_match: null   # copied from the seed by scaffold-epic (intent-match); the reader at the lock may update it
build_order: 39      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: One stage, every client: a six-stage board on the Hub, the CLI mod and every sink

> **Area:** 02-commercial · **Risk:** high (S1.3 CI, S4.2 tenancy) · **Class:** Feature · **Appetite:** L · **Scope seed:** [`00-ideas/seeds/board-sinks-and-scrumban.md`](../../00-ideas/seeds/board-sinks-and-scrumban.md)
> **Visual review:** https://claude.ai/artifact/A7qv2qeBsmewdCkHXnf2UW (private to the product owner)

## Why
The product owner works in one rhythm: a raw ask becomes seeds, a seed gets groomed, an approved pitch is
scaffolded and ready to build, a kickoff starts the build, QA checks it, and it ships. Today that rhythm is written
in five places, in two vocabularies, mostly by hand, so the CLI mod, BUILD-ORDER.md and the Hub disagree, and the
Hub has no board at all. This epic computes one stage, once, from facts the docs, git and GitHub already hold, and
makes every client (the Hub board and roadmap, the CLI mod, BUILD-ORDER.md, Notion) read it. Each card opens to the
prose and commands the next step needs.

## Platform-first note
No new table, route or service. The Hub already stores pushed roadmap artifacts (`report_artifacts` via
`/api/v1/roadmap/push`), the extractor already feeds every sink, and the CLI mod already resolves branches to
epics. The engine stays LLM-free and never reads git: CI pushes, the Hub renders. The only cross-project read
(S4.2) goes through `getWorkspaceProjects()` from the `workspaces` epic.

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — Six stages, these words, this order:** To groom · Grooming · Ready to build · Building · QA · Shipped.
  (Locked by the product owner, 2026-10-01.) The seed's table says what enters each stage and what records it.
- **D2 — `lib/stage.mjs` is the only place stage is computed.** Every client imports it or reads its output.
- **D3 — Building and QA are facts, never fields:** a `feat/<slug>…` branch on origin = Building; a non-draft PR =
  QA; back to draft = Building. Grooming = seed `status: ready`, Ready to build = epic `status: scaffolded`, Shipped
  = `epic-dod` close. Nobody types a stage after scaffold.
- **D4 — Snapshot + honest age:** `.golden-frijoles/board.json` (gitignored) is the offline fallback; any client
  showing it prints its age.
- **D5 — The re-push runs on the event:** `roadmap-push.yml` on push, create and pull_request activity; forks skip.
- **D6 — Additive contract:** new row fields under `.passthrough()` + an optional envelope `board` block; **no
  `ROADMAP_SCHEMA_VERSION` bump.**
- **D7 — Cards are initiatives** (a seed or an epic). Stories live in the drawer. Filters: type, risk; project
  in S4.
- **D8 — The board is a read-only view.** No drag-and-drop, no writes, no command execution from the Hub.
- **D9 — WIP is advice:** `board.wip` per project in `golden-frijoles.config.json`; the kickoff warns, never blocks.
- **D10 — The Roadmap tab becomes areas × Shipped · Now · Next · Later**, replacing the journey track.
- **D11 — The workspace board reads only through `getWorkspaceProjects()`** and waits for `workspaces` to ship.
- **D12 — `phase:` stops driving stage.** The build view may still show it as a detail; a later chore retires it.
- **No-gos:** GitHub Projects and SmallDocs sinks, story-grain cards, writes from the board, a blocking WIP gate,
  the metrics portfolio (seed `portfolio-view`).

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/roadmap-extract.mjs` + this repo's `scripts/roadmap-extract.mjs` (→ `roadmap-to-notion.mjs --extract`).
- `scripts/lib/roadmap-status-buckets.mjs`, `scripts/lib/roadmap-contract.mjs`.
- `scripts/build-state.mjs` (branch → epic resolver, worktrees, journal) + `skills/plugins/golden-frijoles/hooks/build-view.mjs`.
- `scripts/roadmap-push.mjs`, `.github/workflows/roadmap-push.yml`, `apps/web/app/api/v1/roadmap/push/route.ts`,
  `apps/web/lib/roadmap-artifact-schema.ts`, `report_artifacts`.
- `apps/web/app/hub/*`, `lib/hub-query.ts`, `lib/hub-freshness.ts`, `lib/report-shares.ts`.
- `skills/template/optional/notion/roadmap-to-notion.mjs`; `scripts/build-order.mjs`; `scripts/epic-dod.mjs`.
- `skills/plugins/golden-frijoles/skills/groom/emit-epic-kickoff.mjs`; `Roadmap/SESSION-KICKOFFS.md` (the verbs).
- `golden-frijoles.config.json` + `scripts/lib/config.mjs` + `config-registry.mjs`.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| [S1 One stage resolver](sprint-1.md) | S1.1 `lib/stage.mjs` · S1.2 the projection carries stage + card prose · S1.3 CI re-push on events · S1.4 kickoff pushes its branch · S1.5 BUILD-ORDER.md in six stages | high (S1.3) |
| [S2 The board on the Hub](sprint-2.md) | S2.1 `lib/hub-board.ts` · S2.2 Board tab · S2.3 card drawer + stage commands · S2.4 filters | low |
| [S3 Every client reads it](sprint-3.md) | S3.1 CLI mod on the resolver + Hub link · S3.2 kit sinks + `roadmap-push` · S3.3 Notion stage · S3.4 WIP advice | low |
| [S4 Areas and the workspace board](sprint-4.md) | S4.1 Roadmap tab by area · S4.2 workspace board (after `workspaces`) | high (S4.2) |

## Model routing
S1 is the contract-defining sprint (the resolver, its hard cases and the CI trigger): strongest builder. S2 and S3
are mechanical against the locked contract. S4.2 (tenancy) gets the fresh reviewer subagent on top of the routed
external passes.

## Deploy order
1. S1: the resolver and extractor first, then the workflow trigger. The Hub keeps rendering the old journey view
   from the richer payload, because the fields are additive.
2. S2: the Board tab ships once S1's payload is live (run `roadmap-push` once by hand after merge to seed it).
3. S3: plugin + kit release (`skills/RELEASING.md`), then this repo's CLI mod picks it up.
4. S4.1 any time after S2. S4.2 only after `workspaces` is `status: shipped`.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] Kill-switch: none planned (carve-out recorded at grooming)
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — run `node scripts/build-order.mjs`)
