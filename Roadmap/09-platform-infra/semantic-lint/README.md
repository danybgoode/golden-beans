---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: semantic-lint
title: "Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow)"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 1
stories_total: 3   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 49      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow)

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/semantic-lint.md`](../../00-ideas/seeds/semantic-lint.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
The rules that cost most have no check. AGENTS rule 1 (no parallel telemetry pipeline) depends on a reviewer noticing
a paraphrase: a usage table under another name, an analytics route, a vendor SDK call. This epic adds a rail where
deterministic selectors pick candidate lines and Jev judges only those, raise-only, and proves it on rule 1 in shadow for
two weeks. The pitch, measurements and flow are in the [seed](../../00-ideas/seeds/semantic-lint.md).

## Platform-first note
Reinforces rule #1; touches no engine data or route. Kit script, config and the advisory pre-push hook only. Every change
under `skills/` is a plugin release.

## Decisions carried from grooming (the lock verifies each against live code)
- **D1 — Jev judges what deterministic selectors pick.** Globs + added-line patterns + an allowlist select candidates;
  no candidate, no Jev call. One Noul per candidate per rule (one statistic, fittable later).
- **D2 — Raise-only, and "could not look" is never a pass.** No key, egress off, timeout or oversized hunk prints
  "not checked" and logs it.
- **D3 — One committed switch.** `lib/jev.mjs` `RAILS` gains `lint`; `jev.rails.lint` holds `mode`, per-rule
  `threshold` and `shadowExpires`, so `scripts-guard.yml`'s expiry step covers it unchanged.
- **D4 — Rules are data** in a `lint` section of `golden-frijoles.config.json` (`rules[]`: id, globs, patterns,
  allowlist, question, severity), plus one config-registry row so `gf doctor` shows it (no CLI change).
- **D5 — Local only in v1.** The advisory pre-push hook runs it on changed files; no workflow has `TYPESAFE_API_KEY`,
  and adding it is a production-secret decision left for promotion.
- **D6 — Only candidate hunks leave the machine**, under the existing `jev.egress` answer.

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`askJev`, `effectiveMode`, `logDecision`, `parseJevConfig`, `RAILS`).
- `skills/template/scripts/lib/config.mjs` + `skills/scripts/lib/config-registry.mjs`.
- `jev-eval.mjs` + `jev-eval.fixtures.json` (and its offline replay in `scripts-guard.yml`), `jev-report.mjs`.
- `.githooks/pre-push` (already advisory; also in `skills/template/.githooks/`).
- Rule 1's live shape: writes to `events`/`features` only in `apps/web/app/api/v1/{track,features/sync}/route.ts`;
  tests (`apps/web/e2e/**`) and `scripts/seed-*` write directly by design.
- The `jev-semantic-guards` shadow → report → promote playbook (`shadow-report-2026-09-23.md`).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `semantic-lint.mjs`, the `lint` config section, `RAILS` gains `lint` | low |
| 1 | 1.2 Rule 1 as data, 10–20 labelled diffs, wording measured | low |
| 1 | 1.3 The pre-push hook runs it on changed files, in shadow for two weeks | low |

## Routing
1.2 (question wording) on the strongest tier; 1.1 and 1.3 to a builder against the locked contract. Review per the
router.

## Kill switch (Stage 6b)
Not required (`risk: low`). The rail is `off | shadow | jev` in one committed file; shadow is advisory by construction.

## Deploy order
One branch, one PR, one plugin release. `shadowExpires` is set two weeks after merge; the promote/tune/drop decision is
owed to Daniel on that date.

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
