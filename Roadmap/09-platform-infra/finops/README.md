---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: finops
title: "FinOps: quote vs actual per epic — measured from your own sessions, shown live in the build view, sent to the engine"
area: 09-platform-infra
risk: high
type: feature
appetite: L
quote_low_usd: null    # this epic is the one that INVENTS quotes, so it carries none — the first quoted epic is the next one groomed
quote_high_usd: null
sprints_total: 3
stories_total: 13   # the sum of every sprint's stories_total — keep it in step when a story is added
intent_match: null   # could not look at grooming (Jev unreachable, 2026-10-01) — copied from the seed by scaffold-epic (intent-match); the reader at the lock may update it
build_order: 40      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: FinOps — quote vs actual per epic, measured from your own sessions, live in the build view, sent to the engine

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/finops-actuals.md`](../../00-ideas/seeds/finops-actuals.md)
> (consolidates [`finops-quotes`](../../00-ideas/seeds/finops-quotes.md) — one loop, one epic; product owner's call, 2026-10-01)
> **Appetite:** L — two waves, re-bet at the boundary: **wave 1 = Sprints 1–2** (the local loop), **wave 2 = Sprint 3** (the engine). · **Bet:** not yet placed (`underwritten_by: null`).
> **Groomed together with** [`portfolio-view`](../../02-commercial/portfolio-view/README.md) — it reads this epic's `quote_*` / `actual_*` off the roadmap push (Sprint 3, story 3.2). **Build order:** this epic first (40), portfolio after (41).

## Why
The product owner builds epic after epic with agents and can't answer "what did that one cost, and was it what we
expected?". Appetite (S/M/L) is set at grooming with only an implied cost and never learns. This epic gives every epic
a **quote** at grooming, shows **real spend against it live in the build view band** while it is built, **stamps the
actual** at close, and **calibrates the next quote** from that history — with no step typed by hand. Then it sends the
same numbers to the engine, so `/app/finops`, the Roadmap Hub and the portfolio view can show them, and the landing's
FinOps surface stops being `unbuilt`.

## Platform-first note
**The data already exists; the audit's sketch built a pipeline we don't need.** Claude Code writes every session to
`~/.claude/projects/<encoded-cwd>/<session>.jsonl`, and each assistant entry carries `sessionId`, `gitBranch`, `cwd`,
`model`, `message.usage` (input · output · cache-read · cache-write, with the 5m/1h split) and `attributionSkill`
(verified live on Claude Code 2.1.287 during grooming). The epic is the branch: `feat/<slug>[-sN]` → `<slug>` through
`build-state.mjs`'s own `parseBranch()` / `branchCandidates()`. So **no OTel receiver, no session-start hook and no new
auth scope**. On the engine side AGENTS rule #1 holds by construction: per-session usage rides the existing
`POST /api/v1/track` as a reserved event (the `$error` pattern in `lib/signal-events.ts`), and per-epic quote/actual
ride the existing `POST /api/v1/roadmap/push` as two more nullish fields.

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — Source of actuals: local Claude Code transcripts**, scanned across every `~/.claude/projects/*` folder
  (worktrees and subagents live in other folders), kept only when `cwd` resolves to this repo or one of its worktrees
  (`git worktree list`), attributed by `gitBranch` with `branchCandidates()`. Never a second branch parser.
- **D2 — Count once.** Entries are deduped by `message.id` (fallback `requestId`); a streamed response written as
  several entries counts once.
- **D3 — Headline unit: ≈ API $** (list-price equivalent), tokens as detail — the product owner's pick. Prices live in
  one dated table that cites its source (`model-prices`); a stamped actual keeps the $ it was stamped with.
- **D4 — Unknown is not zero** (the session-budget rule). Unknown model → tokens counted, `$ unknown`. Fewer than 3
  shipped epics at an appetite → the wide default quote band, labelled with `n`. Missing transcript field → that entry is
  skipped and counted in a `skipped` total the JSON reports.
- **D5 — The band only reads.** `build-state.mjs` reads the index's summary file; it never scans transcripts. The index
  is refreshed off the hot path (the mod, on `session.measure`, timeout-bound) and by any CLI run.
- **D6 — Frontmatter is the record.** `quote_low_usd`, `quote_high_usd`, `quote_basis`, `actual_usd`, `actual_mtok`,
  `actual_basis` on the epic README, declared once in `roadmap-contract.mjs`. Flat keys (the line-based frontmatter
  reader matches `^(\w+):`, verified by `build-visualization-claude-mods` D1).
- **D7 — Quote = p25–p75 of shipped actuals at the same appetite** (`quote.mjs`), recomputed every groom. The wide
  default band, until n ≥ 3, is a constant in the same file.
- **D8 — Alert-only.** Past `quote_high_usd` the row goes `bad` and says by how much. No rate-limit, no stop — we don't
  host the agents (answers `finops-quotes`' open question).
- **D9 — Metrics only, ever.** The index and every event carry counts, ids, model, skill and branch — never message
  content. A spec asserts the key set.
- **D10 — The engine push is opt-in per project** (`finops.push`, a kit setting via `GF-NEEDS-SETTING`; unset = off).
  Idempotent per (session, epic): a re-push replaces, never adds.
- **D11 — Planning sessions are `unattributed`**, not guessed: they run on `main`. Reported as their own line.
- **D12 — Claude Code only in v1.** Codex/Agy/Vibe/Devin passes are "not measured", named in the band's JSON and on
  `/app/finops`.

### Open for the lock (decide against live code; record as D13+)
- **Push credential:** the project ingest key `/track` already authenticates, or a CLI-PAT route that writes through
  the same ingest core. Rule #1 holds either way; pick the one a plugin-only user can set up in one step.
- **Subagent transcript layout** on the current Claude Code (sidechain entries inline, or `subagents/` files).
- **Price table source:** read the official pricing page (it could not be fetched during grooming; third-party reports
  give Opus 5.5 at $4 / $20 per MTok in/out) and date the table.

## What already exists (reuse, don't rebuild)
- Transcripts: `~/.claude/projects/*/*.jsonl` (fields above).
- `scripts/build-state.mjs` (+ `skills/template/scripts/` twin, `check-script-parity`): `parseBranch`, `branchCandidates`,
  `findEpic`, `renderLines`; vendored into the mod by `skills/scripts/render-hook-vendor.mjs`.
- The band: `skills/plugins/golden-frijoles/hooks/{index.tsx,build-view.mjs}` — `bandRowsFrom`, `LABEL_GLYPHS`,
  `toneOf`, `progressOf`; `session.measure` handler; `.golden-frijoles/` + `LOG_GITIGNORE` (`groom/session-budget.mjs`).
- Contract: `scripts/lib/roadmap-contract.mjs`, `doc-format.mjs`, `roadmap-extract.mjs`, `epic-dod.mjs`, `build-order.mjs`.
- Groom: `scaffold-epic.mjs`, `templates/{epic-README,RETROSPECTIVE,scope-seed}.md`, `SKILL.md` Stage 1.5.
- Kit: `config set` / `GF-NEEDS-SETTING`, `lib/config-registry.mjs`; release rail `check-release.mjs` (plugin + kit bump).
- Engine: `app/api/v1/track/route.ts`, `lib/track-schema.ts`, idempotency fingerprint, quota; `lib/signal-events.ts`
  (reserved names); `app/api/v1/roadmap/push/route.ts`, `lib/roadmap-artifact-schema.ts`, `push_report_artifact`;
  `lib/report-artifacts.ts`; `lib/membership.ts` (single-project console reads); `lib/maker-ops.ts:190` (FinOps `unbuilt`).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `epic-actuals.mjs` — transcripts → usage by epic, deduped, worktree-aware | low |
| 1 | 1.2 The incremental usage index and the dated price table (≈ API $) | low |
| 1 | 1.3 The `Spend` row in the build view band | low |
| 1 | 1.4 Backfill: actuals for recently shipped epics from local history | low |
| 2 | 2.1 `quote_*` / `actual_*` in the frontmatter contract | low |
| 2 | 2.2 `quote.mjs` — the calibrated range | low |
| 2 | 2.3 Groom writes the quote (Stage 1.5 + `scaffold-epic --quote`) | low |
| 2 | 2.4 The band shows quote vs actual, all four states | low |
| 2 | 2.5 Close stamps the actual; `epic-dod` and the retro carry it | low |
| 3 | 3.1 `$agent_usage` on the existing `/track` — opt-in, idempotent, metrics only | high |
| 3 | 3.2 The roadmap push carries quote and actual | high |
| 3 | 3.3 `/app/finops` — per project, per epic, per skill, per model | high |
| 3 | 3.4 The landing's FinOps surface flips from `unbuilt` | low |

## Routing
- **Sprint 1 and 2 (wave 1):** one orchestrator on the strongest model owns the shared seams first — `roadmap-contract.mjs`
  (2.1) is pulled **forward to the start of Sprint 1** by the architect because 1.3/1.4/2.x all import it. Then 1.1+1.2
  (one builder, the reader is the uphill work → strongest), 1.3 (mid), 1.4 (mid), 2.2/2.3 (mid), 2.4/2.5 (mid).
- **Sprint 3 (wave 2, re-bet):** 3.1–3.3 touch the ingest route, the push route and a console read — **strongest, never
  delegated** (WAYS-OF-WORKING routing table). 3.4 mid. Security lens is triggered (risk high).
- **Review:** `node scripts/review-route.mjs --builder <who> <PR#>` per PR; the fresh `pr-reviewer` on every PR.
- **Releases:** Sprints 1 and 2 each change the plugin (hooks, groom, kit closure) → one plugin + kit bump per PR with
  its `CHANGELOG.md` section (`check-release.mjs`).

## Kill switch (Stage 6b)
**No flag — carve-out recorded at grooming (product owner approved, 2026-10-01).** The only path that sends anything off
the machine is 3.1's push, and it is **opt-in per project** (D10, unset = off). The band row and the quote are local and
advisory. The engine adds a reserved event name on an existing route and a read-only page. Rollback = `git revert` and
pin the previous plugin version.

## Deploy order
1. **Sprint 1 → Sprint 2**, stacked (`feat/finops` → `feat/finops-s2`): plugin + kit releases, no runtime deploy. The
   band reaches a user when they update the plugin.
2. **Wave boundary: re-bet Sprint 3.** If wave 1 exhausted the appetite, Sprint 3 returns to shaping.
3. **Sprint 3** (`feat/finops-s3`): engine first (3.2 schema is additive + nullish, so older pushers keep working; 3.1's
   reserved name + payload scrub), then the kit's push (consumer degrades: no setting → no send), then `/app/finops`,
   then 3.4's landing flip **last** — the public page never claims what the console can't show. No migration is planned;
   if the lock finds one is needed, it is applied before merge (DoD).

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written — **including this epic's own actual**, stamped by the tool it built
- [ ] Product poster (`Roadmap/README.md`) updated; landing FinOps backfill done (3.4)
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — no flag planned at grooming (carve-out above).
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
