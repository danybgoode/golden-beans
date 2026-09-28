---
status: shipped      # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: one-roadmap
title: "One Roadmap — the plugin's epics, seeds, bets and learnings move here"
area: 09-platform-infra
risk: low
type: chore
sprints_total: 1
stories_total: 4   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 43    # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# ✅ Epic: One Roadmap — the plugin's epics, seeds, bets and learnings move here

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Chore · **Scope seed:** [`00-ideas/seeds/one-roadmap.md`](../../00-ideas/seeds/one-roadmap.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why, not here).
     Optional: if this epic was ALSO tagged with an archetype at grooming (see spike-role-archetypes.md),
     append " · **Archetype:** <Prototyper|Builder|Sweeper|Grower|Maintainer>" after Class. Omit entirely
     for the Builder default — untagged is fine.
     Scope-seed link: always points at seeds/ — lifecycle lives in the seed's `status:` frontmatter, not
     in a folder path (see 00-ideas/README.md). If this epic was scaffolded from a doc that has no seeds/
     entry, link that doc instead and migrate it to seeds/ when convenient — don't fabricate a seeds/ file
     that doesn't exist. -->

## Why
Golden Frijoles is one product, so it should have one planning home. After this epic, one generated board shows the whole funnel: the engine, the plugin, the kit and the template. A seed lands here, whichever repo it will ship from.

## Platform-first note
No new primitive. `scripts/build-order.mjs` and `roadmap-extract.mjs` already project any epic under `Roadmap/<NN-macro>/`, so moving the docs is the whole change. Approved as decision E1 in the [single-product audit](../../00-ideas/audits/single-product-and-grooming-2026-09-28.md).

## What already exists (reuse, don't rebuild)
- `scripts/build-order.mjs` + `scripts/roadmap-extract.mjs`: the board, regenerated rather than hand-edited.
- `scripts/doc-format.mjs`: the frontmatter contract. The moved docs already carry it, because the backfill ran in both repos on 2026-09-19.
- The same generator bytes in dobby-foundation (its CI `cmp`s them against the template), so its emptied board regenerates the same way.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | S1.1 Move the plugin Roadmap here · S1.2 Renumber build_order as ship history · S1.3 LEARNINGS + poster + board · S1.4 dobby-foundation pointer + worktree prune | low |

## Deploy order
Docs only, with nothing deployed. The golden-beans PR merges first. The dobby-foundation pointer PR opens after that, so the pointer never points at nothing.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [x] ~~n/a~~ — no flag (low-risk docs chore) · **Kill-switch (only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [x] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
