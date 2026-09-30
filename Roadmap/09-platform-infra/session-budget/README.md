---
status: shipped       # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: session-budget
title: "Session budget — one deep ask per approval gate, plus a measured line"
area: 09-platform-infra
risk: low
type: chore
sprints_total: 1
stories_total: 3   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 50      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Session budget — one deep ask per approval gate, plus a measured line ✅

> **Shipped 2026-09-30**: S1 in #202 (`c778bb1`), plugin + kit 0.14.0. Live walkthrough steps 2–4 are owed to Daniel (sprint-1.md).

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Chore · **Scope seed:** [`00-ideas/seeds/session-budget.md`](../../00-ideas/seeds/session-budget.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in the Why section, not here). -->

## Why
Groom's "one deep ask per run" and LEARNINGS' "fresh session per sprint" were set for earlier models; the binding
constraint now is the product owner's decision bandwidth, and nothing measures it. This epic rewrites the rule as "one
deep ask per approval gate" (E7) and adds a line that says keep going, checkpoint or hand off, from figures the engine
already measures. The pitch, measurements and state machine are in the [seed](../../00-ideas/seeds/session-budget.md).

## Platform-first note
No engine data or route. Groom skill text, the WAYS-OF-WORKING source, LEARNINGS and the build-view mod only. Every
change under `skills/` is a plugin release.

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — The rule is "one deep ask per approval gate; keep going while the budget line says so"**, worded once and
  used in all four places (groom `SKILL.md` lines 51, 220 and Stage 9; `references/backlog-cadence.md`;
  `Roadmap/fill-ins.yml` → rendered WAYS-OF-WORKING; `LEARNINGS.md:1486`).
- **D2 — Figures come from the mod API**: `session.measure` → `$.session.usage()` (`context.percent`, 5-hour and 7-day
  windows). No OpenTelemetry, nothing sent anywhere (`finops-actuals` owns telemetry).
- **D3 — One pure `sessionVerdict()`** with provisional thresholds in one table: checkpoint at context ≥ 60% or 3+
  questions waiting; hand off at context ≥ 80% or 5-hour limit ≥ 90%.
- **D4 — Unknown is not zero.** A null figure is left out of the line and the verdict.
- **D5 — Advise, never act.** No auto-compact, clear or handoff.
- **D6 — Cowork prints the line at each groom approval gate** from what it can count, with "context: not measured here".
- **D7 — Figures go to a local gitignored log** (`.golden-frijoles/session-budget.jsonl`); the session journal stays
  intent-only (`session-journal.mjs` D2) and records only the verdict acted on.

## Architecture lock (verified against live code, `main` @ 476cdd1, 2026-09-30)

The branch was 14 commits behind `main` when the run started; `main` was merged first, and the lock is
against the merged tree. Two things `main` had changed since grooming: the build view is no longer a
`$.ui.status` row but a **band above the prompt** (#199, `hooks/index.tsx`), and the plugin is at **0.13.0**.

- **D1 — The rule, verbatim:** "**One deep ask per approval gate; keep going while the budget line says
  so.**" An *approval gate* is any point where groom stops for the product owner's sign-off (the scope-doc
  gate, Stage 7.1). **Correction to the seed — nine files, not four:** the old rule ("one *deep* ask per
  run" and "fresh session per sprint") also lives in the shared `WAYS-OF-WORKING.template.md` (three
  copies: `Roadmap/`, `skills/Roadmap/`, `skills/template/Roadmap/`, each re-rendered) and in the
  template's `LEARNINGS.md`. All of them change; `grep -rn "one \*deep\* ask per run\|fresh session per
  sprint" skills Roadmap` (seeds and this epic excepted) must find nothing.
- **D2 — Figures come from the `session.measure` event's own payload** (`context.percent`,
  `rateLimits[].{kind,percentUsed}` for `five_hour` / `seven_day`) — the same figures `$.session.usage()`
  answers, pushed, so the mod never polls. **Correction:** the sprint's "reads `$.session.usage()`" is
  replaced by the event payload; calling the op again inside its own event is a redundant read.
- **D3 — One pure `sessionVerdict()`** in `skills/groom/session-budget.mjs` (no Node imports, so both the
  mod and the Cowork CLI import the same file); thresholds live in its one `THRESHOLDS` table:
  checkpoint at context ≥ 60 or questions waiting ≥ 3; hand off at context ≥ 80 or 5-hour ≥ 90. Hand off
  wins over checkpoint.
- **D4 — Unknown is not zero.** A null/absent figure is left out of the line *and* the verdict.
- **D5 — Advise, never act.** Nothing calls `$.session.compact()`, `/clear` or ends a session.
- **D6 — Cowork:** `node "$GROOM/session-line.mjs" --asks-open N --questions-waiting N --gates-passed N`
  prints the line with "context: not measured here", using D3's function. Groom runs it at each approval
  gate; on hand off, groom emits `backlog-cadence.md`'s next-session prompt.
- **D7 — The log:** `.golden-frijoles/session-budget.jsonl` at the repo root (the mod: one row per verdict
  change; the CLI: one row per gate). It is gitignored by a `.golden-frijoles/.gitignore` of `*` that the
  writer creates, so every consuming project is covered without editing its root `.gitignore`. The
  journal stays intent-only: groom journals only the verdict acted on, with `scripts/session-note.mjs`
  where the project has it.
- **D8 — Where the line draws: `$.ui.status`**, one row under the prompt, free since #199 moved the build
  view to the band. Format: `Session 48% · 5h 23% · 7d 9% → keep going` (+ `· 1 question waiting` when
  non-zero). **Correction — "asks open" is not observable by the mod**, so in Claude Code it is left out
  (D4), not guessed. "Questions waiting" is the count of in-flight `AskUserQuestion` calls, seen by a
  `tool.call` hook; the engine shows at most one at a time, so the 3+ threshold bites in Cowork, not here.
- **D9 — One release:** plugin + kit 0.13.0 → **0.14.0**, one `CHANGELOG.md` section.
- **D10 — WITHDRAWN (2026-09-30, after close-out):** this claimed `scripts/session-resume.mjs` and
  `session-note.mjs` were missing at the repo root. They were not: both arrived with #189 and are byte-identical
  to the template (`check-script-parity`). The claim came from a `find` run on the branch *before* `main` (14
  commits ahead) was merged in, and it was never re-checked after the merge.

### Build contract — Sprint 1 (locked by the architect before the builder started)
- `skills/plugins/golden-frijoles/skills/groom/session-budget.mjs` — pure: `THRESHOLDS`, `sessionVerdict({
  contextPct, fiveHourPct, questionsWaiting })` → `{ verdict: 'keep going'|'checkpoint'|'hand off',
  reasons[] }`, `figuresFromMeasure(e)`, `sessionLine(figures, verdict)`, `coworkLine(counts, verdict)`,
  `budgetRow(...)`. `session-budget.test.mjs` covers every threshold edge (59/60, 79/80, 89/90, 2/3) and
  null figures.
- `session-line.mjs` (same dir) — the Cowork CLI; appends its row per D7.
- `hooks/index.tsx` — adds `session.measure` → status + log on change, and `tool.call` on
  `AskUserQuestion` → the waiting count. The build view band is untouched.
- Rewording per D1; `render-ways-of-working --check` green for all three rendered copies.
- Routing: one builder (Claude, this session) for all three stories; review through `review-route.mjs
  --builder claude`.

## What already exists (reuse, don't rebuild)
- `skills/plugins/golden-frijoles/hooks/index.ts` + `build-view.mjs` + `build-view.test.mjs` (the build view mod).
- The mod API's `$.session.usage()` and `session.measure` event; the status line JSON's `context_window` and
  `rate_limits` ([docs](https://code.claude.com/docs/en/statusline)).
- The groom skill and `references/backlog-cadence.md` (the next-session prompt template).
- `render-ways-of-working.mjs` + `Roadmap/fill-ins.yml`; `session-journal.mjs` / `session-note.mjs`.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The rewording in all four places | low |
| 1 | 1.2 `sessionVerdict()`, the session line in the build-view mod, the local snapshot log | low |
| 1 | 1.3 Groom prints the line at each approval gate in Cowork | low |

## Routing
One builder session. 1.1 and 1.3 are skill text, reviewed by the architect for wording; 1.2 goes to a builder against
the contract above. Review per the router.

## Kill switch (Stage 6b)
Not required (`risk: low`): the line advises and never acts. Rollback is pinning the previous plugin version.

## Deploy order
One branch, one PR, one plugin release; the mod reloads on the new version.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — `risk: low`, none planned at grooming. **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [x] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
