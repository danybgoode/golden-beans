---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Building      # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
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
- **D10 — The engine push is opt-in per project** (`spend.telemetry` — see D21; unset = off).
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

## Architecture lock (2026-10-02, verified against live code and this Mac's 241 transcripts)
D1–D12 above stand, **as amended here**. Each line says what the live system showed. Builders cite these, never a paraphrase.

### Corrections — scope the live system disproved
- **C1 — D2's "count once" is necessary but not the rule.** Of 40,536 assistant entries, 19,574 repeat a `message.id`
  with identical usage (one entry per content block), and **1,160 repeat it with *larger* `output_tokens`** (the
  streamed final write). "Keep the first" undercounts output. → **D13.**
- **C2 — resumed sessions copy history and re-stamp it.** 813 message ids appear in more than one file; in 286 of them
  the copy carries a *different* `gitBranch` and `sessionId` (same `uuid`, same `timestamp`). Attributing by the copy
  would move a `main` turn onto a feature branch. → **D13.**
- **C3 — subagents are separate files**, `<project-dir>/<session>/subagents/agent-*.jsonl` (94 here), `isSidechain:
  true`, the parent's `sessionId`. No sidechain entry is inline in a main file (0 observed). → **D14.** (closes the
  "subagent layout" open question)
- **C4 — `attributionSkill` is rare**: 642 of 40,536 entries (top: `plugin-authoring`, `golden-frijoles:groom`).
  Most rows will say `(no skill)`; that is the truth, not a bug. Entries also carry `attributionAgent` /
  `attributionPlugin`; v1 reports skill only (D9 key set).
- **C5 — the frontmatter subset has no floats** (`roadmap-contract.mjs`: "Booleans and floats are not in the subset");
  `38.42` parses as the *string* `"38.42"`. D6's "numbers or null" needs the parser to read decimals. The corpus has
  **zero** bare decimal frontmatter values today (grep), so adding them changes no existing reading. → **D17.**
- **C6 — shipped epics carry their appetite on the SEED, not the README**: 1 of 44 shipped READMEs has `appetite:`;
  35 seeds with `epic:` carry one. And the extractor reads `seed.appetite` only. → **D20.**
- **C7 — `/track` idempotency never *replaces*** (3.1's "a re-push replaces"). Same key + same payload → 200 dedup;
  same key + a different payload → **409**. Events are append-only by design. → **D22.**
- **C8 — `finops.push` would be a second key for a setting that already exists**: `spend.telemetry` (module
  `Spend`, `off|on`, default `off`, "Export cost telemetry?") is in `lib/config-registry.mjs`. → **D21.**
- **C9 — the transcripts carry `usage.speed`** (`standard` / `fast`) and `usage.inference_geo`; fast mode is billed
  at 2× on Opus 5.5 and Opus 5. A table without it would under-price fast turns. → **D18.**
- **C10 — the build view caches** (`shouldRefresh`: branch@sha, or 15 s `MAX_AGE_MS`), so a Spend row that changes
  every turn shows up within 15 s, not instantly. Accepted; no cache change.
- **C11 — the band's "tok" in the approved mockup is illustrative** (its sample row's kinds do not sum to the band's
  number). The **text shape** of the four lines is the contract; `M tok` is the sum of all four kinds (D9 detail).
- **C12 — console pages are `/app/<feature>/[projectSlug]`** (`requireProjectMembership`), not a bare `/app/finops`.
  The page is `/app/finops/[projectSlug]`; the empty state names `spend.telemetry`, not `finops.push`. → **D25.**
- **C13 — the landing's FinOps copy over-claims for v1**: "Alert, rate-limit or stop" (D8 is alert-only),
  "across providers" (D12: Claude Code only), "retry" (not in the transcript). 3.4 rewrites it to what ships.

- **C14 — `gitBranch` is the branch of the session's OWN checkout**, not of where the work happened (found on the
  real backfill, 2026-10-02). `intent-match` was built from a session whose checkout sat on `feat/semantic-lint`
  (session `780e1ca7`, 2,955 mentions of intent-match, every turn stamped `feat/semantic-lint`), so its spend is
  inside semantic-lint's total and intent-match has none. Not fixable without guessing (D16 forbids it). Both carry
  **`actual_usd: null` with the reason in `actual_basis`** (a backfill never overwrites a written actual); the rule it teaches is in `epic-actuals.mjs`' header: build on the epic's branch, or in a worktree on it.
- **C15 — D15 amended: a moved checkout.** Half of this repo's history (24,145 entries) was recorded under the old
  path `~/dobby/golden-beans`; Claude Code moved the transcripts into `-Users-cosmo-dobby-golden-frijoles/` on the
  2026-09-29 folder move but kept each entry's old `cwd`. A transcript in the folder Claude Code keeps for this repo
  (or a worktree) now counts whatever `cwd` it recorded; everywhere else the cwd rule applies.
- **C16 — a backfilled total can be a partial one.** An epic scaffolded before the oldest surviving transcript, or
  measured only on `docs/` close-out branches, was partly built in sessions this Mac no longer has (or never had).
  `--backfill` reports those as **partial — not stamped** so they never teach the first quotes a number that is too
  low. Real run: 10 stamped, 2 partial (`mockups-as-built`, `experiments-for-humans`), 31 unmeasurable (shipped before
  the oldest transcript, 2026-09-09 — Claude Code's 30-day cleanup removed the Sep-1 sessions *today*), plus
  semantic-lint held back per C14. Sprint 1.4's expected list is amended accordingly.

### Decisions D13+
- **D13 — Dedupe and attribution, one rule.** Key = `message.id` (fallback `requestId`; 0 entries lack an id here).
  Per key, token counts are the entry with the **largest `output_tokens`** (the final streamed write). The **first
  indexed occurrence owns the attribution** (sessionId, branch, cwd, skill, model); later occurrences may only raise
  the counts. A full scan orders files by birth time (`stat.birthtimeMs`, else `mtimeMs`), so the original session is
  indexed before its resumed copy; an incremental run sees the original first by construction. `<synthetic>`
  (always zero usage, 123 entries) is ignored and counted in `skipped.synthetic`.
- **D14 — Scan set:** every `~/.claude/projects/*/*.jsonl` plus `*/<session>/subagents/*.jsonl`
  (`CLAUDE_CONFIG_DIR` honoured). A subagent's turns belong to its parent's session.
- **D15 — "This repo"**: an entry counts when its `cwd` (realpath when it exists, else literal) is the repo root, under
  it, or under any `git worktree list` path. Removed agent worktrees under `<root>/.claude/worktrees/` stay covered by
  the prefix. **Amended by C15**: a transcript in the folder Claude Code keeps for this repo counts whatever cwd it recorded.
- **D16 — Branch → epic** is `build-state.mjs`'s own `resolveTarget()` (exported for this, unchanged): longest
  `branchCandidates()` reading that names an epic dir, or a seed carrying `epic:`. Anything else — `main`, `HEAD`, a
  branch naming no epic (`fix/notion-kickoff-2000`) — is `unattributed`, reported by branch (D11). No second parser.
- **D17 — Decimals join the frontmatter subset**: `/^-?\d+\.\d+$/` → Number, in `parseScalar` (one change, both
  twins, the vendored copies regenerated). `formatScalar(number)` already writes `String(n)`. The six D6 fields are
  validated in `roadmap-contract.mjs` (`FINOPS_FIELDS`, the one list): optional; `*_usd`/`*_mtok` a number ≥ 0 or
  null; `*_basis` a string or null. Writers round `$` to 2 places and `mtok` to 1.
- **D18 — `lib/model-prices.mjs`**: one table, `PRICES_AS_OF = '2026-10-02'`, `PRICES_SOURCE =
  'https://platform.claude.com/docs/en/about-claude/pricing'`, per model `{ input, cache_write_5m, cache_write_1h,
  cache_read, output }` USD/MTok, as read that day (Opus 5.5 4/5/8/0.20/20 · Opus 5 5/6.25/10/0.50/25 · Sonnet 5.5
  and Sonnet 5 2/2.5/4/0.20/10 · Haiku 4.5 1/1.25/2/0.10/5 · Fable 5.1 10/12.5/20/0.25/50 + the rest of the table).
  Ids normalise by dropping a `-YYYYMMDD` suffix. `speed: "fast"` multiplies by 2 where the page lists fast pricing
  (Opus 5.5, Opus 5, Opus 4.8), else that turn's `$` is unknown. `inference_geo: "us"` × 1.1. Cache writes use the
  `cache_creation.ephemeral_5m/1h` split; a total with no split is priced as 5m (cheaper, said in `basis`). An unknown
  model counts tokens and makes the epic's `$` **a lower bound**: `usd_known: false`, shown as `≥$n`, never a zero.
- **D19 — The index lives at the MAIN checkout's `.golden-frijoles/`** (`dirname` of `git rev-parse
  --git-common-dir`, inline in both readers: `lib/git-common-dir.mjs` is project-only, not in the kit), so every worktree's band reads one summary. `usage-index.json`
  holds per-file `{ size, mtimeMs, offset }` + one compact record per message id (D13 needs the ids across files:
  ~20k records ≈ 2–3 MB here; a full scan of 390 MB took 1.1 s in Node). `usage-summary.json` is the band's only
  input. The existing `.golden-frijoles/.gitignore` (`*`) covers both.
- **D20 — An epic's appetite** = README `appetite:` if set, else its seed's — the extractor's own rule, which 2.1
  fixes to read the README first. `quote.mjs` reads epics through `roadmap-extract` `buildRows({ dates: false })`.
- **D21 — The opt-in is `spend.telemetry: on`** (existing registry row; `needSetting` prints `GF-NEEDS-SETTING` once;
  unset = `off` = nothing sent). D10's `finops.push` is retired before it existed.
- **D22 — "Replace" is read-side.** Each push is a cumulative snapshot per (session, epic) with
  `context.idempotency_key = agent_usage:<session_id>:<epic>:<last_at>`. An unchanged snapshot re-pushes as a 200
  dedup; a grown one is a new event; every reader takes the **latest `last_at` per (session, epic)**. Ingest stays
  append-only; no new route, table or migration (rule #1). Pushes run only when a session's totals changed.
- **D23 — Push credential (closes the open question): the project ingest key**, read exactly as `roadmap-push.mjs`
  does (`apiKeyFrom`: `SELF_PROJECT_API_KEY`, else `GROWTH_ENGINE_API_KEY`; `GROWTH_ENGINE_URL`). It is the one a
  plugin user already set for the Hub push, so it is zero extra steps. The project comes from the hashed key server-side;
  no body field names a project, so a foreign write is unrepresentable (api spec pins it anyway).
- **D24 — When things run.** The mod's `session.measure` runs the **vendored** `epic-actuals.mjs --refresh` (never
  the repo's — distribute-what-we-use D5), timeout 10 s, at most once per 60 s; with `spend.telemetry: on` that run
  also pushes changed sessions (5 s budget, at most every 10 min). Failures log (`claude --debug`) and keep the last
  row. `turn.start` (the hot path) never scans or pushes.
- **D25 — `/app/finops/[projectSlug]`** through `requireProjectMembership` (one project, server-side; non-member →
  404). Epics from `getLatestArtifact(projectId,'roadmap')`; skills/models from that project's `$agent_usage` events
  (D22 latest-wins). The three approved surfaces (seed → Visuals) are the contract, including "Export CSV".
- **D26 — Landing (3.4)**: FinOps `availability: { kind: 'shipped' }` — the opt-in is a client setting, not a
  server gate `GATE_NOTES` can describe, and Daniel's no-flag rule (2026-08-31) stands. Copy rewritten per C13.
- **D27 — Who builds.** The architect builds **in place** (the only session in this checkout, clean tree, one builder
  at a time): every Sprint 1–2 story crosses the two shared seams (`roadmap-contract`, `build-state`) and Sprint 3 is
  never delegated. Reviews follow the routing below.

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
