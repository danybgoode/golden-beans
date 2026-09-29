---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: compiled-prompts
title: "Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 2
stories_total: 6   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 51  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/compiled-prompts.md`](../../00-ideas/seeds/compiled-prompts.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
The Jev guards get better only when someone edits a JS string and re-runs a hand-built harness, and CI can't even tell when a question's wording changed. This wave makes every Jev question a data file with its measurement beside it, makes a recording remember the wording it was made with, commits the ReAnchor harness as `optimize/` (Python, dev-only), and adds the loop the ReAnchor spike said matters most: testing new wordings on held-out data. Its first run targets `flag-state-claim`, where 19 of the 22 prose errors sit. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/compiled-prompts.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). Kit scripts, a JSON file per rail, and a dev-only `optimize/` workspace at the repo root that never ships. `jev.config.json` stays the one thresholds file; the `.md` prompt files stay the prompt artifacts. Every change under `skills/` is a plugin release.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — No `compiled/` directory.** `jev.config.json` is the thresholds artifact and the `.md` prompt files are the prompt artifacts; this wave adds no second source for either.
- **D2 — Questions are data:** `scripts/lib/jev-questions/<rail>.json`, each entry `{ id, question, whenTrue, whenFalse, measured: { model, date, n, decided, right } }`. The guards load them; the move is byte-identical (same ids, same text).
- **D3 — A recording answers for its wording.** Each fixture recording stores a hash per question; offline replay fails on a mismatch, as it already does on a model mismatch. Existing recordings are stamped once, without asking Jev, in the same PR as the move.
- **D4 — `optimize/` is dev-only (E5).** Pinned `dspy[typesafe]==3.4.x`; outside the kit closure, the plugin and the skills mirror; CI runs no Python.
- **D5 — DSPy only where documented.** ReAnchor refits thresholds; wordings are proposed by hand (strongest tier) and measured. No GEPA or MIPROv2 in this wave.
- **D6 — A wording wins only held-out:** the spike's 5 seeded folds, strictly better than the current wording, never on train; a one-fixture win is a tie. Adoption is its own PR with the product owner's OK.
- **D7 — The same shape for every question set.** If `semantic-lint` or `intent-match` has shipped by the lock, their sets move to (or match) D2's shape in S1.

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`loadJevConfig`, `parseJevConfig`, `askJev`), `lib/review-guard.mjs` (`REVIEW_QUESTIONS`), `lib/prose-guard.mjs` (the four family questions).
- `jev-eval.mjs` (`replayAsk`, `recordingAsk`, `evaluate`, the model-mismatch check) + `jev-eval.fixtures.json` (240 labelled, recorded).
- `jev-report.mjs` (the label loop: `--json`, `--append-labels`).
- The ReAnchor spike's method, parity check and numbers (`00-ideas/seeds/jev-reanchor-thresholds.md`).
- `build-kit.mjs` (`requires_scripts` closure carries non-`.mjs` files), `check-plugin-leaks.mjs`, `kit-tarball.test.mjs`, `check-template-drift.mjs`.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Jev questions as data | low |
| 1 | 1.2 A recording remembers its wording | low |
| 1 | 1.3 `optimize/`, reproducing the spike | low |
| 1 | 1.4 The leak guard | low |
| 2 | 2.1 The wording harness | low |
| 2 | 2.2 First run: `flag-state-claim` *(cut 1st)* | low |

## Routing
1.2, 2.1 and 2.2 on the strongest tier (recording integrity and wording are judgement). 1.1, 1.3 and 1.4 go to builders against the locked contract. Review per the router.

## Kill switch (Stage 6b)
Not required (`risk: low`): dev tooling. The byte-identical move keeps every live verdict unchanged, the rails keep their `off | shadow | jev` switch, and an adopted wording is its own reviewed PR. Rollback is pinning the previous plugin version.

## Deploy order
Stacked branches `feat/compiled-prompts` → `-s2`, merged in order, one plugin release per sprint. S2's live run happens after S1's release; an adopted wording is a separate PR after the report.

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
