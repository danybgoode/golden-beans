---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: think-skills
title: "Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 3
stories_total: 7   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 53  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/think-skills.md`](../../00-ideas/seeds/think-skills.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
The three pre-planning coaches exist only in the product owner's claude.ai account, end in a document written in chat, don't hand off to each other, and groom never sees what they produce; the North Star one also mis-triggers because its description is Risk Validation's. This epic ships them in the plugin, has each write a file in `Roadmap/00-strategy/` and offer the next, makes groom add one line per pitch ("Moves: <input metric> · Tests: <dimension>"), and adds `gf north-star set` so the workshop's metric reaches the engine without retyping. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/think-skills.md).

## Platform-first note
The engine already models a North Star and its inputs (`north_star` + `leading_inputs`, written by `POST /api/v1/north-star/sync`, read by `GET /api/v1/north-star`), so S3 is a client command over the existing route: no table, no route, no schema change (rule #1 holds). S1 and S2 are skill text, templates and a groom stage. Skill changes are a plugin release; S3 is a CLI release (`@golden-frijoles/cli`).

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — Port, don't rewrite.** The claude.ai account copies are the only source; the coaching text moves as is, with a `summary:`, a corrected `description` for `north-star`, and file-writing endings.
- **D2 — Names:** `pmf-narrative`, `north-star`, `risk-validation`, so they don't collide with the account copies until those are removed.
- **D3 — Output contracts** in `Roadmap/00-strategy/<name>.md`: frontmatter `kind`, `status: draft | agreed`, `updated`, plus fixed headings from each skill's target structure. `north-star.md` adds a JSON block shaped like `northStarSyncSchema`.
- **D4 — The chain:** each ends by offering the next; `risk-validation` reads `pmf-narrative.md` when it exists.
- **D5 — Groom reads strategy only when it exists**, and writes one pitch line; no file means no line and no nag.
- **D6 — `gf north-star set <file>` is a thin shell** (the `flags-write.ts` rule): dry run by default against `GET /api/v1/north-star`; `--yes` posts the block to the sync route once; server-side validation, `issues` rendered on a 400; exit code from the body.
- **D7 — Public artefacts stay separate.** `/northstar-self-serve.md` isn't rendered from the skill; the skills cite sources by name and URL, never a `references/` path (local-only since `public-monorepo` S4.1).

## What already exists (reuse, don't rebuild)
- The three account skills (`pmf-narrative-facilitator`, `northstar-workshop`, `deliberate-risk-validation`) and `references/northstar-workshop-skill.md`.
- `POST /api/v1/north-star/sync`, `GET /api/v1/north-star`, `apps/web/lib/north-star-schema.ts`.
- `packages/cli/src/commands/flags-write.ts` (thin-shell write, exit codes), `packages/cli/src/api.ts`, `cli-write.test.ts`.
- `render-skill-adverts.mjs`, `check-skill-scripts.mjs`, the groom skill (Stage 0, `templates/scope-seed.md`), `roadmap-extract.mjs`, `build-order.mjs`, `doc-format.mjs`.
- `intent-match`'s gap-routing vocabulary (the "think chain" route).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Port the three coaches into the plugin | low |
| 1 | 1.2 Each writes its file | low |
| 1 | 1.3 The chain | low |
| 2 | 2.1 Groom reads `00-strategy/` | low |
| 2 | 2.2 The Roadmap tools ignore `00-strategy/` | low |
| 2 | 2.3 `intent-match`'s think-chain route names the skills *(cut 1st)* | low |
| 3 | 3.1 `gf north-star set` | high |

## Routing
1.1–1.3 and 3.1 on the strongest tier (skill text ships to strangers; 3.1 writes to a tenant's engine). S2 goes to builders against the locked contract. Review per the router; S3 is HIGH, so the fresh `pr-reviewer` pass is mandatory there and Daniel merges it.

## Kill switch (Stage 6b)
**Carve-out:** no new runtime seam. `gf north-star set` is a client command over an existing route already auth-gated by the project key, and dry run is its default; rollback is the previous CLI version (`npm i -g @golden-frijoles/cli@0.2.1`). A flag would gate nothing the route doesn't already gate.

## Deploy order
Stacked branches `feat/think-skills` → `-s2` → `-s3`, merged in order. S1 and S2 are plugin releases; S3 is a CLI release. Owed to Daniel after S1 ships: remove the three account copies in claude.ai settings.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — carve-out recorded at grooming (no new runtime seam). **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
