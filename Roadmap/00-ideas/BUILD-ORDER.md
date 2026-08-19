<!-- GENERATED FILE — do not edit by hand.
     Regenerate:  node scripts/build-order.mjs
     Status SSOT: each epic README's frontmatter `status:` field (set at epic close). Funnel
     ordering: seed frontmatter (priority). Both projected via scripts/roadmap-to-notion.mjs --extract. -->

# Build order — generated status board

> **Generated 2026-08-19 — do not hand-edit.** Epic status SSOT = the epic `README.md` frontmatter
> `status:` field (set at epic close). To change what this shows, edit that field (or a seed for the
> funnel), then run `node scripts/build-order.mjs`. This board and the Notion "Marketplace Roadmap"
> DB are both *derived views* — never hand-edit the board.

## 🏗️ Building now (2)

- [Scenarios made PM-operable — define, launch, and kill a scenario from the UI](../../01-growth-engine/scenarios-pm-operable/README.md) — 01 Growth Engine · 10/10 stories · risk: High · wave-2026-08-08
- [Maker ops — the landing repositions from a growth engine to an operating context](../../02-commercial/landing-maker-ops/README.md) — 02 Commercial · 16/21 stories · risk: Low · wave-2026-08-19

## 📋 Ready to build (scaffolded, not started) (1)

- [CMS-neutral experiment integration + Payload go/no-go](../../01-growth-engine/cms-integration-spike/README.md) — 01 Growth Engine · 0/6 stories · risk: Low

## ✅ Shipped (17)

- [Entity journeys — configurable lifecycle projections beyond fixed TARS](../../01-growth-engine/entity-journeys-projections/README.md) — 01 Growth Engine · 6/6 stories · risk: High
- [Event destination router — reliable fan-out to CRM and downstream tools](../../01-growth-engine/event-destination-router/README.md) — 01 Growth Engine · 7/7 stories · risk: High
- [Experiment governance v2 — registry, metrics, guardrails and decision record](../../01-growth-engine/experiment-governance-v2/README.md) — 01 Growth Engine · 9/9 stories · risk: High
- [Flag control plane + Miyagi migration + resilience/SecOps](../../01-growth-engine/flag-serving-and-prd-g/README.md) — 01 Growth Engine · 20/20 stories · risk: High
- [Flags — a visual rule builder, rollout viz, and a plain-language version diff](../../01-growth-engine/flags-visual-rule-builder/README.md) — 01 Growth Engine · 10/10 stories · risk: High · wave-2026-08-08
- [Growth Engine v1 — telemetry ingest, SDK, TARS funnel, North Star, A/B bucketing — ✅ shipped](../../01-growth-engine/growth-engine-v1/README.md) — 01 Growth Engine · 13/13 stories · risk: Low
- [Signals loop — error/friction signals → structured tasks → the customer's own agent](../../01-growth-engine/signals-loop/README.md) — 01 Growth Engine · 11/11 stories · risk: High
- [App shell and agent rail — make the signed-in product show the agent it sells](../../02-commercial/app-shell-and-agent-rail/README.md) — 02 Commercial · 10/10 stories · risk: High · wave-2026-08-06
- [Commercial shell — Golden Beans landing, waitlist, connector install page](../../02-commercial/commercial-shell/README.md) — 02 Commercial · 10/10 stories · risk: High
- [Component-kit adoption sweep — bring the remaining /app routes onto the design system](../../02-commercial/app-component-kit-adoption/README.md) — 02 Commercial · 12/12 stories · risk: Low · wave-2026-08-08
- [Design system lift — the limitless golden-bean brand](../../02-commercial/design-system-lift/README.md) — 02 Commercial · 7/7 stories
- [Golden Frijoles — the rebrand, the material pass, and the controls that were broken](../../02-commercial/landing-frijoles-rebrand/README.md) — 02 Commercial · 16/16 stories
- [Golden Frijoles rebrand close-out](../../02-commercial/frijoles-rebrand-closeout/README.md) — 02 Commercial · 5/5 stories · risk: Low
- [Landing redesign v2 — the agent harness for product managers](../../02-commercial/landing-redesign-v2/README.md) — 02 Commercial · 11/11 stories
- [Multi-tenant activation — auth hardening, self-serve tenants, pod trials](../../02-commercial/multi-tenant-activation/README.md) — 02 Commercial · 9/9 stories · risk: High
- [Pod Report + Roadmap Hub — benchmarks/ROI + live roadmap-vs-end-state views](../../02-commercial/pod-report/README.md) — 02 Commercial · 10/10 stories · risk: High
- [Notification rails — Telegram and Slack in lockstep](../../09-platform-infra/notification-rails/README.md) — 09 Platform Infra · 3/3 stories

## ⬜ Funnel — seeds not yet scaffolded (3)

- [Analytics visualization — the charting-dependency decision (spike), then the layer](seeds/analytics-visualization-layer.md) — Ready · Spike · appetite S · wave-2026-08-08
- [Board renders priority where it should render build_order](seeds/build-order-render-fix.md) — Queued · Chore · appetite S · wave-2026-08-08
- [Git & Releases — a PM-legible picture of what the agent shipped (discovery spike)](seeds/git-and-releases-legibility.md) — Ready · Spike · appetite S

## ⚠️ Status drift — README frontmatter vs sprint/retro-derived (2)

These epics’ authoritative README-frontmatter `status:` disagrees with what the sprint/retro
derivation infers. The board trusts the **frontmatter**; a mismatch usually means a close-out
forgot to set `status:` (or the README is stale). Reconcile the README, then this advisory clears.

| Epic | frontmatter (used) | sprint/retro-derived |
|---|---|---|
| Scenarios made PM-operable — define, launch, and kill a scenario from the UI | In progress | Shipped |
| Signals loop — error/friction signals → structured tasks → the customer's own agent | Shipped | In progress |

---
_Epics: 20 · seeds in funnel: 3 · status drift: 2. Regenerate with `node scripts/build-order.mjs`._
