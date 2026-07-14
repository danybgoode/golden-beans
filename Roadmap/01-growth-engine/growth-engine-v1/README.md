---
status: in-progress   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: growth-engine-v1
---

# Epic: Growth Engine v1 — telemetry ingest, SDK, TARS funnel, North Star, A/B bucketing

> **Area:** 01-growth-engine · **Risk:** low · **Archetype:** Builder ·
> **Scope seed:** [`00-ideas/seeds/growth-engine-v1.md`](../../00-ideas/seeds/growth-engine-v1.md)
> (mirror-pointer — the canonical, panel-adjudicated scope doc lives in the sibling repo:
> `~/dobby/medusa-bonsai/Roadmap/00-ideas/2. readyforscope/golden-beans-growth-engine.md`, since it
> was groomed before golden-beans existed).
> Sequel to `dobby-foundation`'s S0 (medusa-bonsai `09-platform-infra/dobby-foundation`), which
> spawned this repo from the template.

## Why

Golden Beans is a standalone **Unified Growth Engine** — telemetry routing, TARS funnels
(Targeted/Adopted/Retained), a North Star metric, and A/B bucketing — proven by dogfooding it against
a real Miyagi feature. v1 is **telemetry-first**: this engine does NOT serve flags (Miyagi keeps
`platform_flags` + `isEnabled()`; flag-serving is a later epic, only once the engine is proven).
Epic acceptance = a real Miyagi feature instrumented end-to-end, with a real TARS funnel rendered
from live traffic.

## Medusa-first note

N/A for the engine itself — golden-beans is a standalone, non-commerce product; Medusa/Clerk/UCP
rules don't apply to it directly. The one place commerce data matters (S3's North Star revenue
inputs for Miyagi) explicitly **reads Medusa-owned order/payment surfaces** rather than replicating
them — the engine stores attribution telemetry + derived reports only.

## What already exists (reuse, don't rebuild)

| Capability | Where | Reuse for |
|---|---|---|
| Flag definitions + `isEnabled()` seam + `/admin/flags` | medusa-bonsai `platform_flags` (Supabase) + `lib/flags.ts` | S1.3's kill-switch home (`growth.telemetry_enabled`); S2's registry seed source (read-only, via client push) |
| Setup-guide GTM `dataLayer` events + three-doors onboarding funnel | medusa-bonsai `seller-portal-setup-guide` / `seller-portal-onboarding-three-doors` | S1.3 instrumentation candidate (`onboarding.three_doors_enabled`) + the GTM-events-first check |
| Append-only per-event financial ledger (snapshot at event time) | medusa-bonsai `profit-analyzer` epic | Pattern prior for S3 North-Star revenue inputs |
| Tokenized MCP connector URL pattern | medusa-bonsai `seller-agent-connect-mcp-url` epic | Reference for later E1 (commercial shell) — not needed for S1–S4 |
| Playwright `api` harness + CI gates | this repo (spawned from the `dobby-foundation` template) | Every testable story in S1–S4 gets one `api` spec |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `POST /v1/track` — malformed → 4xx, valid → persisted row, tenant-scoped from day one | LOW |
| 1 | 1.2 TS SDK (`track`, `trackAdoption`) — ≤5-line integration, extensible payload envelope | LOW |
| 1 | 1.3 One real Miyagi feature instrumented behind `growth.telemetry_enabled` (default OFF) | LOW — shared surface (Miyagi frontend), separate branch + PR in medusa-bonsai, announce |
| 2 | 2.1 Feature registry seeded by client-pushed live `platform_flags` rows | LOW |
| 2 | 2.2 TARS aggregation (Targeted / Adopted / Retained) | LOW |
| 2 | 2.3 Funnel page for the S1.3 feature | LOW |
| 3 | 3.1 North Star metric + leading-inputs data model | LOW |
| 3 | 3.2 Feature → input linkage | LOW |
| 3 | 3.3 Per-feature input-impact report (revenue inputs read Medusa, never replicated) | LOW |
| 4 | 4.1 Deterministic client-side hash bucketing in the SDK (no resolve endpoint) | LOW |
| 4 | 4.2 Exposure events | LOW |
| 4 | 4.3 Side-by-side variant comparison (basic lift only) | LOW |

## Deploy order

S1 → S2 → S3 → S4, linear — each sprint needs the prior sprint's data (S2 needs S1's event stream +
Miyagi's live flag rows; S3 needs S2's funnel to link inputs; S4 needs S1's SDK to add bucketing).
golden-beans deploys to its own Vercel project + its own Supabase project. **Provisioned 2026-07-14**
(Daniel's green light): Supabase project `golden-beans` (ref `slweidgffcfndnskcskc`) + Vercel project
`golden-beans` (production: https://golden-beans-gamma.vercel.app), both live. Story 1.3 deploys to
Miyagi (medusa-bonsai) on its own branch/PR, additive and gated OFF by default — zero blast radius
until the flag is flipped; `GROWTH_ENGINE_URL`/`GROWTH_ENGINE_API_KEY` are already set on Miyagi's
Vercel production env, ready for the moment PR #253 merges.

## Definition of Done (epic)

- [ ] All sprints (S1–S4) merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs); S1.3's flag-flip + live-event smoke
      and S2's funnel-renders-real-data smoke are **owed to Daniel by name**
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated — 01 · Growth Engine row flipped to ✅
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch:** `growth.telemetry_enabled` exists in Miyagi's `platform_flags`, **enablement
      polarity, created OFF/disabled** — verified, not a new gate
- [ ] Feature branch(es) deleted; this README's frontmatter `status: shipped`
