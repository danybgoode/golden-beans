---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
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

# Epic: Session budget — one deep ask per approval gate, plus a measured line

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Chore · **Scope seed:** [`00-ideas/seeds/session-budget.md`](../../00-ideas/seeds/session-budget.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
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
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — `risk: low`, none planned at grooming. **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
