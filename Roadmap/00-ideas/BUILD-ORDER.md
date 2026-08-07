<!-- GENERATED FILE — do not edit by hand.
     Regenerate:  node scripts/build-order.mjs
     Status SSOT: each epic README's frontmatter `status:` field (set at epic close). Funnel
     ordering: seed frontmatter (priority). Both projected via scripts/roadmap-to-notion.mjs --extract. -->

# Build order — generated status board

> **Generated 2026-08-07 — do not hand-edit.** Epic status SSOT = the epic `README.md` frontmatter
> `status:` field (set at epic close). To change what this shows, edit that field (or a seed for the
> funnel), then run `node scripts/build-order.mjs`. This board and the Notion "Marketplace Roadmap"
> DB are both *derived views* — never hand-edit the board.

## 🏗️ Building now (0)

_None._

## 📋 Ready to build (scaffolded, not started) (2)

- [CMS-neutral experiment integration + Payload go/no-go](../../01-growth-engine/cms-integration-spike/README.md) — 01 Growth Engine · 0/6 stories · risk: Low · #6
- [App shell and agent rail — make the signed-in product show the agent it sells](../../02-commercial/app-shell-and-agent-rail/README.md) — 02 Commercial · 10/10 stories · risk: High · #1

## ✅ Shipped (11)

- [Entity journeys — configurable lifecycle projections beyond fixed TARS](../../01-growth-engine/entity-journeys-projections/README.md) — 01 Growth Engine · 6/6 stories · risk: High · #2b
- [Event destination router — reliable fan-out to CRM and downstream tools](../../01-growth-engine/event-destination-router/README.md) — 01 Growth Engine · 7/7 stories · risk: High · #2a
- [Experiment governance v2 — registry, metrics, guardrails and decision record](../../01-growth-engine/experiment-governance-v2/README.md) — 01 Growth Engine · 9/9 stories · risk: High · #2c
- [Flag control plane + Miyagi migration + resilience/SecOps](../../01-growth-engine/flag-serving-and-prd-g/README.md) — 01 Growth Engine · 20/20 stories · risk: High · #5
- [Growth Engine v1 — telemetry ingest, SDK, TARS funnel, North Star, A/B bucketing — ✅ shipped](../../01-growth-engine/growth-engine-v1/README.md) — 01 Growth Engine · 13/13 stories · risk: Low
- [Signals loop — error/friction signals → structured tasks → the customer's own agent](../../01-growth-engine/signals-loop/README.md) — 01 Growth Engine · 11/11 stories · risk: High · #4
- [Commercial shell — Golden Beans landing, waitlist, connector install page](../../02-commercial/commercial-shell/README.md) — 02 Commercial · 10/10 stories · risk: High · #1
- [Design system lift — the limitless golden-bean brand](../../02-commercial/design-system-lift/README.md) — 02 Commercial · 7/7 stories
- [Multi-tenant activation — auth hardening, self-serve tenants, pod trials](../../02-commercial/multi-tenant-activation/README.md) — 02 Commercial · 9/9 stories · risk: High · #2
- [Pod Report + Roadmap Hub — benchmarks/ROI + live roadmap-vs-end-state views](../../02-commercial/pod-report/README.md) — 02 Commercial · 10/10 stories · risk: High · #3
- [Notification rails — Telegram and Slack in lockstep](../../09-platform-infra/notification-rails/README.md) — 09 Platform Infra · 3/3 stories

## ⬜ Funnel — seeds not yet scaffolded (5)

- [Analytics visualization layer — charts for funnel, North Star, impact and experiment lift](seeds/analytics-visualization-layer.md) — Raw · Feature
- [Component-kit adoption sweep — bring the remaining /app routes onto the design system](seeds/app-component-kit-adoption.md) — Raw · Chore
- [Flags — a visual rule builder, rollout viz, and a version diff instead of a JSON dump](seeds/flags-visual-rule-builder.md) — Raw · Feature
- [Git & Releases — a PM-legible picture of what the agent shipped, with no git operations](seeds/git-and-releases-legibility.md) — Raw · Feature
- [Scenarios made PM-operable — define, launch, and kill a chaos/secops scenario from the UI](seeds/scenarios-pm-operable.md) — Raw · Feature

## ⚠️ Status drift — README frontmatter vs sprint/retro-derived (2)

These epics’ authoritative README-frontmatter `status:` disagrees with what the sprint/retro
derivation infers. The board trusts the **frontmatter**; a mismatch usually means a close-out
forgot to set `status:` (or the README is stale). Reconcile the README, then this advisory clears.

| Epic | frontmatter (used) | sprint/retro-derived |
|---|---|---|
| Signals loop — error/friction signals → structured tasks → the customer's own agent | Shipped | In progress |
| App shell and agent rail — make the signed-in product show the agent it sells | Scaffolded | Shipped |

---
_Epics: 13 · seeds in funnel: 5 · status drift: 2. Regenerate with `node scripts/build-order.mjs`._
