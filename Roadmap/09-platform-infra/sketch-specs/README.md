---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: sketch-specs
title: "Sketch specs — a surface spec renders the grey wireframe and becomes the state contract"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 2
stories_total: 6   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 52  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Sketch specs — a surface spec renders the grey wireframe and becomes the state contract

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/sketch-specs.md`](../../00-ideas/seeds/sketch-specs.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
Today a screen is approved as hand-made prototype HTML, and CI's state contract is extracted from it afterwards, so what the product owner approves and what the build is checked against are two artifacts. This epic lets a screen be written once as a `surface` block (state, route, the blocks in order with the words that matter), rendered as a grey wireframe for approval, and used directly as the route's state contract. The flow, state, sequence, architecture, data and copy formats the portfolio seed proposed are dropped: `intent-match`'s Mermaid diagrams and tables already are those specs. The pitch, the split with `intent-match` and the diagram are in the [seed](../../00-ideas/seeds/sketch-specs.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). S1 is kit tooling (a parser and a zero-dependency renderer); S2 changes this repo's design-system contract generator (`apps/web/design-system/state-contract.mjs`), which is a CI gate's input, not runtime code. Every change under `skills/` is a plugin release.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — A surface block is a signature written first:** state id, route, then one line per block (kind, the words that matter, and only `action`, `count` and `columns` as facts). No values, row counts or pixels. The same data a `STATE-CONTRACT.json` entry holds.
- **D2 — A line grammar, not YAML** (the kit is zero-dependency); fenced as ` ```surface ` in a seed. The lock fixes the exact grammar.
- **D3 — A generic vocabulary of about twelve kinds** in the kit, and a project `surface.map.json` mapping each onto its own kinds (this repo: onto the 47 in `state-contract-core.mjs`'s `BLOCK_KINDS`). The lock lists which of the 47 are reachable.
- **D4 — The renderer is deliberately grey** and never imports the design system.
- **D5 — One source per state id.** Prototype or spec, never both; a duplicate id fails `state-contract.mjs`. The 33 prototype states are not migrated.
- **D6 — Approval is a hash.** An approved surface is copied to `apps/web/design-system/surfaces/<state>.surface` and gets an `APPROVED.md` line with its SHA-256; `--check` fails on a mismatch (Rail 2, as for the prototype).
- **D7 — `intent-match` writes the blocks.** Its visuals rule (amended 2026-09-29) already writes screens as `surface` blocks with ten-state names; this epic renders and contracts them, and adds no format for flows, states, sequences, containers, data or copy.

## What already exists (reuse, don't rebuild)
- `apps/web/design-system/state-contract.mjs` (generator, `--check`) + `state-contract-core.mjs` (`BLOCK_KINDS`, `extractSignature`), `STATE-CONTRACT.json` (33 states).
- `APPROVED.md` (hash-as-approval), `approved-states.mjs`, `e2e/console-visual.authed.spec.ts` (built route vs contract, unchanged).
- `references/ux-guidelines.md` (the ten-state taxonomy) and `system.css`.
- `intent-match`'s visuals rule and seed template (the blocks' author), `build-kit`'s `requires_scripts` closure.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 The `surface` grammar and parser | low |
| 1 | 1.2 Generic vocabulary and project mapping | low |
| 1 | 1.3 The grey renderer | low |
| 2 | 2.1 Approved surfaces feed the state contract | low |
| 2 | 2.2 Parity on three approved states | low |
| 2 | 2.3 First state built from a spec *(cut 1st)* | low |

## Routing
1.1 and 2.1 on the strongest tier (the grammar and the contract seam). The rest go to builders against the locked contract. Review per the router.

## Kill switch (Stage 6b)
Not required (`risk: low`): planning tooling and a CI gate's input; no runtime seam. Rollback is reverting the generator change (S2) or pinning the previous plugin version (S1).

## Deploy order
Stacked branches `feat/sketch-specs` → `-s2`, merged in order. S1 is a plugin release; S2 is this repo only. Builds after `intent-match` S2 (its visuals rule writes the blocks).

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
