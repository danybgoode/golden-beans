---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shaping       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: distribute-what-we-use
title: "Distribute what we use — one review rail, Jev and notify setup, schedulers, build view"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 4
stories_total: 11  # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 47      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Distribute what we use — one review rail, Jev and notify setup, schedulers, build view

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/distribute-what-we-use.md`](../../00-ideas/seeds/distribute-what-we-use.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
A stranger who installs the Golden Frijoles plugin today gets a kickoff whose review step points at a script they
don't have, a Jev guard that is always off and never asks, a one-line Telegram guide, no routines and a silent build
view. This epic makes those rails work in their repo the way they work in ours (E3, E4). It also collapses the review
rail's three copies into one, so a reviewer fix is one PR, not three. The pitch, the measurements and the research are
in the [seed](../../00-ideas/seeds/distribute-what-we-use.md); it absorbs
[`review-rail-one-implementation`](../../00-ideas/seeds/review-rail-one-implementation.md) as Sprint 1.

## Platform-first note
No engine data, route or table changes (rule #1 n/a). Everything here is kit, template and plugin code, so every
change under `skills/` is a plugin release (check-release) and ships as a pinned kit version. Stage-2.5 bucket:
**mostly light enhancement** — every rail already runs in this repo; only the routine bootstrap is new.

## Decisions carried from grooming (the architecture lock verifies each against live code)
- **D1 — The review rail is a superset, not a pick.** `scripts/cross-review.mjs` (698 lines) vs the template's (506),
  `lib/cross-agent-cli.mjs` 1,324 vs 695; the prompt and `review-config.json` differ. Ours has context, pairing and
  transient-agy; the template's has the wave-2 `readSection` loader. The lock byte-compares all three copies
  (including medusa-bonsai's) and builds the superset export by export. **Both consumers' OLD tests run against it**
  (`git show origin/main:<test>` into a temp file); every failure is read, not deleted as superseded.
- **D2 — One doctor: `cross-agent-doctor.mjs`** (medusa-bonsai's, covers codex + agy) moves into the template.
  `agy-doctor.mjs` becomes a delegating alias. No file may name a doctor that doesn't exist
  (today: `skills/template/scripts/lib/cross-agent-cli.mjs:348`).
- **D3 — Copy-back in the same wave.** This repo's `scripts/` gets the same bytes; medusa-bonsai gets a PR. If
  medusa-bonsai is unreachable, S1 ships the two in-repo copies and names the medusa PR as owed.
- **D4 — The kit closure is the manifest.** The rail and `build-state.mjs` enter through a skill's
  `requires_scripts` (`skills/scripts/build-kit.mjs`, `check-skill-scripts.mjs`), not a hand list.
- **D5 — Automatic behaviour never runs repo-supplied code.** When a project has no `scripts/build-state.mjs`, the
  build-view hook runs the **kit's** copy by absolute path; it never looks up a same-named file a stranger's repo owns.
- **D6 — Parity, not deletion.** The 81 scripts byte-identical between `scripts/` and `skills/template/scripts/`
  stay (public-monorepo D5). A guard keeps them identical or listed with a reason.
- **D7 — Jev asks before it sends.** Fix `effectiveMode()` (`skills/template/scripts/lib/jev.mjs:186`) so an
  unanswered egress asks even when a rail defaults to `off`. Nothing leaves the machine before `egress: true`.
- **D8 — No CLI change.** `gf doctor` reads the kit registry (golden-frijoles-plugin S5.3), so new rows are free; a
  CLI release is a hand publish (D14).

## What already exists (reuse, don't rebuild)
- `skills/scripts/build-kit.mjs` + `check-skill-scripts.mjs` (the closure), `render-skill-adverts.mjs`,
  `check-release.mjs`, `kit-tarball.test.mjs`, the isolated-home install recipe (golden-frijoles-plugin S5).
- Byte-identical already: `cross-panel.mjs`, `review-route.mjs`, `lib/review-guard.mjs`, `cross-panel.prompt.md`,
  `build-state.mjs`.
- The kit registry + `needSetting` (D11/D12); `gf doctor` module lines (`packages/cli/src/modules.ts`).
- `scripts/agy-doctor.mjs` (this repo) and medusa-bonsai's `cross-agent-doctor.mjs` + tests.
- `skills/template/scripts/lib/{telegram-format,reporting-config}.mjs`, `skills/template/reporting.config.example.json`,
  `scripts/slack-notify.mjs` + `lib/slack-text.mjs` (tested).
- `skills/template/scripts/routines/` (seven prompts + runbook) + `routines.test.mjs`; `check-template-drift.mjs`'s
  placeholder grammar; `skills/template/.github/workflows/jev-expiry.yml` (an existing cron).
- `jev-eval.mjs` + its fixtures; `skills/plugins/golden-frijoles/hooks/build-view.mjs` + its test.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Superset review rail in the template, old tests from both consumers green | high |
| 1 | 1.2 One doctor, and every fix instruction names it | high |
| 1 | 1.3 Copy-back: this repo byte-equal, medusa-bonsai PR | high |
| 2 | 2.1 The review rail in the kit closure, kickoff review step proven in an isolated home | high |
| 2 | 2.2 `build-state.mjs` in the kit; the hook runs the kit copy when the project has none | high |
| 2 | 2.3 Byte-parity guard over the shared scripts *(cut 2nd)* | low |
| 3 | 3.1 Bug: unanswered egress asks with no `jev.config.json` | high |
| 3 | 3.2 Jev setup route | low |
| 3 | 3.3 Notify setup route, example config in the kit, Slack sender promoted *(Slack half cut 3rd)* | low |
| 4 | 4.1 Routine prompts as kit assets + a `/schedule`-ready bootstrap | low |
| 4 | 4.2 GitHub Actions cron templates for model-free parts *(cut 1st)* | low |

**Cut line** (if the appetite runs short): 4.2, then 2.3, then the Slack half of 3.3.

## Routing
S1 and 3.1 stay on the strongest tier (the review rail is shared infra; egress is privacy). 2.x, 3.2, 3.3 and 4.x go
to builders against the locked contract. Review per the router; CI and review paths trigger the security lens.
S1's own PR is reviewed through the new rail.

## Kill switch (Stage 6b)
**Carve-out, no flag.** No engine runtime seam changes. Every change ships as a pinned kit version, so rollback is
pinning the previous one. Every new rail stays off until its setup question is answered, and review is advisory.

## Deploy order
Stacked branches `feat/distribute-what-we-use` → `-s2` → `-s3` → `-s4`, merged in order. One plugin release per
sprint; wait for the tarball URL to return 200 before any consumer pins it. The medusa-bonsai PR merges after S1's
release exists.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — carve-out recorded at grooming (pinned kit versions). **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
