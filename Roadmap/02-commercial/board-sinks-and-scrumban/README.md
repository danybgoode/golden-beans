---
status: shipped  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped      # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
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

## Architecture lock (2026-10-01, by the architect, before any builder started)

Verified against live code on `main` at `826fa64` and against production (Supabase `slweidgffcfndnskcskc`,
read-only queries) and GitHub (`danybgoode/golden-frijoles`, public). Builders cite these; they are not paraphrased
in the sprint files.

### Corrections — scope the live system disproves (said out loud)
- **C1 — The self-tenant is `golden-beans-demo`, not `golden-frijoles`.** Prod `projects` holds `golden-beans`,
  `golden-beans-demo`, `miyagi`, `miyagisanchez`; every `SELF_PROJECT_API_KEY` push landed on `golden-beans-demo`
  (204 roadmap versions, 2026-07-25 → 2026-10-01). Every smoke URL `/hub/golden-frijoles/…` in the sprint files
  is rewritten to `/hub/golden-beans-demo/…`.
- **C2 — That project is the demo, so its hub is public by design** (`requireDashboardAccess` →
  `isPubliclyReadable`, AGENTS rule #2). The board inherits that: S2's "a private window is asked to sign in" is
  true for any OTHER project and false for this one. No new exposure — the roadmap it projects lives in a public repo.
- **C3 — BUILD-ORDER.md cannot carry live facts.** It is committed and `--check`ed by `build-order-guard.yml` and
  the nightly `build-order-sync`; a stage that moves on a PR event would make every unrelated PR red. So the
  committed file is the **docs-only** projection (Building and QA appear there as "live — see the Hub or
  `build-order --live`"), and `node scripts/build-order.mjs --live` prints the full six-stage board to the terminal
  and writes nothing. The "stage agreement" spec compares the extract, `build-state --json` and `build-order --live`
  over one fixture with fixed facts.
- **C4 — doc-format never computed a stage.** It checks the *format* of the `**Status:**` line
  (`doc-format.mjs:279-315`) and the `phase:` vocabulary (`roadmap-contract.mjs:187`). Nothing to stop there; S1.5's
  doc-format half is dropped. The real stage readers of those fields are the extractor's sprint-status parse (kept as
  the legacy `status` / `status_derived` fields, which Notion's Status column and the old hub views still read) and
  `build-state`'s D7 phase ladder (replaced in S3.1).
- **C5 — The two extractors already forked.** `scripts/roadmap-to-notion.mjs --extract` (this repo: folder-derived
  area names, `status_date`, `build_order_num`) and `skills/template/scripts/roadmap-extract.mjs` (the kit: Miyagi's
  hardcoded area names, neither field). A parity spec over two forks would pin the fork. D15 removes it.
- **C6 — The envelope is a plain `z.object`, not `.strict()`,** so an extra `board` key passes validation — and is
  silently **stripped**, because the route stores only `{ items }`. D6's `board` block needs a schema field AND the
  route storing it.
- **C7 — 12 of the 13 work branches on origin are merged and were never deleted** (e.g. `feat/public-monorepo-s3`,
  #183 merged). "A branch exists ⇒ Building" alone would put five shipped or closing epics back in Building. D13.
- **C8 — Workspaces have no slug** (columns `id, name, created_by, created_at`; 2 live workspaces). S4.2's route is
  `/hub/w/<workspaceId>/board`, no migration. The surface's `daniels-products` was illustrative.
- **C9 — `workspaces` shipped 2026-10-01** (#220, #221; README `status: shipped`). S4.2 is unblocked and the
  `hub-workspace-board-unbuilt` state is moot: not built, not registered.
- **C10 — A share link never opens a hub tab.** `/s/<token>` renders its own `public-share` document (Pod Report +
  journey/horizon by policy). "A share link scoped to the project also opens [the board]" (S2.2) needs a new share
  policy and a new design state — **out of v1**.
- **C11 — The kickoff text lives in the plugin** (`skills/plugins/golden-frijoles/skills/groom/`), which the kit
  does not ship and an installed extractor cannot import. D17 moves the pure builder.
- **C12 — The CLI mod never goes online.** Its hook always runs `build-state --offline` (`hooks/index.tsx`: no `gh`
  inside a turn). So the mod's stage always comes from the snapshot plus its age (D14); the online paths are the CLI
  run and `session-resume`.
- **C13 — Storage, measured.** `report_artifacts` holds 204 roadmap versions at ~13 KB compressed (2.6 MB of a
  23 MB database). D5's event triggers at the measured ~11 PRs/day are ~60 events/day; with the richer payload that
  is ~1 MB/day, unbounded. So the push route skips a write whose content equals the latest version (D16). Actions
  minutes are not the constraint: the repo is public.

### Decisions (D1–D12 from grooming, verified; D13+ added at the lock)
- **D1** holds. **D2** holds and is placed: `scripts/lib/stage.mjs`, byte-identical in `skills/template/scripts/lib/`
  (`check-script-parity.mjs` enforces it).
- **D3** holds, made exact by D13.
- **D4** holds, made exact by D14 (the snapshot stores *facts*, not stages).
- **D5** amended by D18 (`delete` added, `push` only on `main`, one concurrency group).
- **D6** holds with C6's fix; contents in D21.
- **D7–D10, D12** hold. **D11** holds and is unblocked (C9).
- **D13 — The stage rule, exactly** (`resolveStage(row, gitFacts, prFacts)`, pure):
  1. Off the board (`stage: null`): epic or seed `status: archived`.
  2. **Shipped**: epic `status: shipped`, or a seed `status: shipped`. Docs win over a stale branch
     (`feat/mockups-as-built-s3` survives on origin; that epic is Shipped).
  3. **Git and GitHub next.** The initiative's branches are the origin branches whose `branchCandidates` reading
     (longest slug first, the parser `build-state.mjs` already has — moved to `lib/work-branch.mjs`, not
     rewritten) names it; a seed with `epic:` set names that epic. A branch is **live** when its newest PR (by
     number) is OPEN, or it has no PR; MERGED or CLOSED means done or abandoned.
     - Any live branch: take the one with the highest sprint (`-s<N>`, else 1; on a tie, the one without a ready PR).
       Open and not draft → **QA**; otherwise → **Building**.
     - No live branch but a MERGED PR → **QA** (merged, close-out owed), unless a sprint AFTER the highest merged
       one is still Planned by its own docs → **Ready to build** (paused between sprints). *Amended while building
       S1 (2026-10-01): the lock's "highest merged sprint ≥ the sprint count" read an epic shipped in ONE PR from
       `feat/<slug>` (scenarios-pm-operable, #98) as paused at S1 — see sprint-1.md.*
  4. **Docs last**: seed `raw` → To groom · `ready` → Grooming · `queued` → Ready to build; epic `scaffolded`,
     `queued` or `in-progress` → Ready to build. `in-progress` is never Building on its own word (D3).
  Every answer carries `stage_source`: `docs: status <x>` · `git: <branch>` · `github: PR #<n> <state>`, suffixed
  ` · snapshot@<iso>` when the facts came from the snapshot.
- **D14 — Facts are gathered once per run, in three modes.** `live`: one `git ls-remote --heads origin` + one
  `gh pr list --state all --limit 1000 --json number,headRefName,state,isDraft,url`, then written to
  `.golden-frijoles/board.json` as `{ generated_at, source, branches, prs }`. `snapshot`: read that file (the
  automatic fallback when `live` fails). `docs`: no facts (BUILD-ORDER.md, fixtures). The directory is already
  ignored (`.golden-frijoles/.gitignore` is `*`). Facts age; docs never do, so an offline client still sees a docs
  edit immediately.
- **D15 — One extractor.** `skills/template/scripts/roadmap-extract.mjs` is the one; it gains folder-derived area
  names, `status_date`, `build_order_num` and the D21 fields. `scripts/roadmap-extract.mjs` becomes byte-identical
  (its parity allowlist entry is deleted); this repo's `roadmap-to-notion.mjs` imports `buildRows` from it and keeps
  only the Notion push.
- **D16 — The push route skips an unchanged write.** Before calling `push_report_artifact` it reads the latest
  `roadmap` artifact; when the canonical JSON of `{ items, board }` is identical it answers
  `200 { ok, unchanged: true, version }` and writes nothing. No migration, no `ROADMAP_SCHEMA_VERSION` bump, and no
  per-run volatile field in the payload (the envelope's `generatedAt` is outside the comparison). The trade, stated:
  an unchanged board keeps the age of its last *change*, which is still a true statement.
- **D17 — The kickoff builder moves to `skills/template/scripts/lib/epic-kickoff.mjs`** (the pure builder, its
  parsers and the template text as a constant) and is vendored into the plugin's groom skill by the existing
  `render-hook-vendor.mjs` (a second entry, same `--check`). `emit-epic-kickoff.mjs` and `emit-kickoff.mjs` import
  the vendored copy, so the card's kickoff and the CLI's are one function.
- **D18 — The workflow.** `roadmap-push.yml` runs the roadmap push on `push` to `main`, `create`, `delete`,
  `pull_request` (`opened, reopened, ready_for_review, converted_to_draft, closed`) and `workflow_dispatch`;
  `create`/`delete`/`pull_request` only for `(feat|fix|chore|spike|bug|docs)/` refs (dependabot and `claude/` cost
  nothing). `deployment_status` keeps only the Pod Report job. Every run checks out the **default branch head** (the
  docs SSOT is `main`; a feature branch's docs never reach the Hub) and skips `npm ci` (the scripts are zero-dep).
  `pull-requests: read`. **One** concurrency group, not per ref: every run pushes the whole board, so the newest must
  win and a queued run is superseded (`cancel-in-progress: false`). A fork PR has no secret → the existing clean skip.
- **D19 — The Hub never computes a stage.** Each row arrives with `stage`; `lib/hub-board.ts` (pure TS) groups and
  counts. The six words are a TS constant there, pinned to `STAGES` in `scripts/lib/stage.mjs` by a parity unit test
  — app code has never imported `scripts/` at runtime, and this is not the place to start (the
  `ROADMAP_SCHEMA_VERSION` precedent).
- **D20 — Who builds.** The architect builds all four sprints in place: the only session in this checkout, one
  builder, no parallel fan-out, so no worktree. The routing table's mid tier is unused this run and S4.2 (tenancy)
  was never delegable. Every PR: `review-route.mjs --builder claude` + the fresh `pr-reviewer` (risk high).
- **D21 — The payload, additively.** New optional row fields under `.passthrough()`: `stage`, `stage_source`,
  `goal` (first paragraph of the epic's `## Why`, or the seed's `## Problem`; ≤ 600 chars), `sprints[]`
  (`n, title, done, total`; epics), `links` (`readme | seed | sprints[] | retro`, repo-relative), `pr`
  (`number, url, state, draft` or null), `kickoff` (Ready to build only: the epic kickoff, or `Build: <slug>` for a
  queued seed), `shipped_at` (the `status_date` once Shipped). New optional envelope field `board`:
  `{ wip?: { Building?, QA? }, repo?: <https blob base> }`. No version bump.
- **D22 — Two config keys, registered.** `board.wip` (`{ Building, QA }`, default `null` = no advice) and
  `board.hubUrl` (the project's Hub base, default `null` = no link). This repo sets both. *(Was `hub.url`; `hub` is
  not a config section and a new one is a schema change for one string — amended in S1.)*
- **D23 — The approved surfaces are corrected only where the live system forces it,** then registered: routes per
  C1/C8, the `tabs` line dropped (this repo's `tabs` kind is `.ds-tabs--panel`, a panel tab bar; the hub's tabs are
  the frame's nav, outside the measured `<main>`, so keeping the line would demand a second tab bar), and
  `hub-workspace-board-unbuilt` dropped (C9). Approval lines in `APPROVED.md` are the product owner's.

### Out of v1, added at the lock
Share links reaching the board (C10) · a workspace slug (C8) · pruning old artifact versions (D16 stops the growth;
retention would be a new category of production mutation).

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
external passes. **As run (D20):** the architect builds all four sprints in place; reviews are routed with
`--builder claude`, plus the fresh `pr-reviewer` on every PR.

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
