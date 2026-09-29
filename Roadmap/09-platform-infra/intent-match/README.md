---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: intent-match
title: "Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 3
stories_total: 9   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 48      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/intent-match.md`](../../00-ideas/seeds/intent-match.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
Nothing measures whether a groomed pitch captures what the product owner meant, so gaps surface as "that's not what I
meant" after the build. This epic keeps the ask verbatim, scores each pitch against it with Jev (advisory, labelled
uncalibrated), names the artifact that closes each gap, makes a system diagram the default for every shaped bet, and
asks at every epic close whether we built what was meant, seeded with past epics from golden-frijoles and
medusa-bonsai. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/intent-match.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). Kit scripts, groom skill text and templates only; every change under
`skills/` is a plugin release, and medusa-bonsai picks it up by pinning the new plugin version.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — Advisory only (E6).** The score can add a step; it never blocks a scaffold or removes approval.
- **D2 — One statistic per Noul/Score** (the ReAnchor spike's lesson), so every signal can be fitted later.
- **D3 — The score at the gate is coverage (in + out), clarity and teach-back.** Total = 100 × equal-weight mean of
  the signals present, labelled "uncalibrated"; bands 80 / 60 are placeholders.
- **D4 — The reader is optional and never Claude** (product owner, 2026-09-29). `intentReader: off` by default; when on,
  one pass from the first of codex, agy, vibe that answers, a hard timeout, and any failure is a one-line skip. It never
  blocks or stalls the lock.
- **D5 — The ask is stored verbatim** in the seed, with numbered claims (split by the groom agent, editable) and the
  teach-back answer.
- **D6 — Visuals are drawn from the shape of the ask** (groom Stage 4.6): a system context for every M/L bet, plus the
  triggered diagram types, in Mermaid; a screen is a `surface` block (the `sketch-specs` format), its states named from
  the ten-state taxonomy. *(Amended 2026-09-29 at the `sketch-specs` groom; no story added.)*
- **D7 — The close label is a retrospective line** (`_Intent: yes | mostly | no_`), required by `epic-dod` only for
  epics whose seed carries a score.
- **D8 — Backfilled pitches are flagged `ask: proxy`**; no agreement is backfilled.

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`askJev`, `effectiveMode`, `logDecision`), `lib/review-guard.mjs`'s
  `noul`/`choice` question pattern, `jev-eval.mjs` + `jev-eval.fixtures.json`.
- `lib/cross-agent-cli.mjs` (`runCodex`, `runAntigravity`, `runVibe`), `review-route.mjs`'s family order,
  `cross-panel.mjs`'s single-pass shape.
- The groom skill (`skills/plugins/golden-frijoles/skills/groom/`): `SKILL.md`, `templates/scope-seed.md`,
  `templates/RETROSPECTIVE.md`, `emit-epic-kickoff.mjs` + `templates/epic-kickoff.md`.
- `skills/scripts/epic-dod.mjs` (`isRealClosedDate`), `skills/scripts/lib/roadmap-contract.mjs`, `build-kit`'s closure.
- The history: 34 shipped epics here, about 120 in medusa-bonsai (same Roadmap layout).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `intent-match.mjs`: question sets, one statistic each, total + bands, "could not look" without Jev | low |
| 1 | 1.2 Gap routing (Jev Choice) *(cut 1st)* | low |
| 1 | 1.3 Labelled fixtures and measured wording (`jev-eval --live`) | low |
| 2 | 2.1 Seed template: the ask as given, numbered claims, teach-back, `## Visuals` | low |
| 2 | 2.2 Groom Stage 3.5 (score) and Stage 4.6 (visuals rule) | low |
| 2 | 2.3 An optional reader at the lock, off by default, skipped on any failure | low |
| 3 | 3.1 `_Intent:` in the retro template + an `epic-dod` item for scored epics | low |
| 3 | 3.2 `intent-outcomes.mjs` across repos: the join, derived corrections, "n of 20" | low |
| 3 | 3.3 Backfill: golden-frijoles and medusa-bonsai samples scored and answered *(medusa half cut 2nd)* | low |

## Routing
1.1, 1.3 and 2.2 on the strongest tier (question wording and the groom stages are judgement). The rest go to builders
against the locked contract. Review per the router.

## Kill switch (Stage 6b)
Not required (`risk: low`): planning tooling, advisory by construction, no runtime seam. Rollback is pinning the
previous plugin version.

## Deploy order
Stacked branches `feat/intent-match` → `-s2` → `-s3`, merged in order, one plugin release per sprint. The backfill
(3.3) runs after S3's release is installed in both repos.

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
