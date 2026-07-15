---
title: "Growth Engine v1 — telemetry ingest, SDK, TARS funnel, North Star, A/B bucketing"
slug: growth-engine-v1
status: scaffolded
area: "01"
type: feature
priority: null
risk: low
epic: "01-growth-engine/growth-engine-v1"
build_order: null
updated: 2026-07-13
---

# Growth Engine v1 — scope seed (mirror)

This is a **local mirror-pointer**, not the canonical scope doc. The full Definition-of-Ready
grooming (mirror-back, decisions, panel adjudication, reuse list, v1 boundary, follow-on epics
E1–E6) now lives **locally** (relocated 2026-07-14 from medusa-bonsai, where it was written before
golden-beans existed):

`Roadmap/01-growth-engine/growth-engine-v1/SCOPE.md`

(Daniel approved 2026-07-11, re-groomed with a codex + antigravity panel adjudication.)

## Summary (condensed from the canonical doc)
- **Telemetry-first v1** — the engine does NOT serve flags. Miyagi keeps `platform_flags` +
  `isEnabled()`. Flag-serving is a later epic (E5a), only once the engine is proven.
- **Miyagi is the first consumer** — epic acceptance = a real Miyagi feature instrumented + a real
  TARS funnel rendered from live traffic.
- **Tenant-scoped schema from day one** (`projectId` first-class, per-project credentials); v1 runs
  single-tenant (miyagisanchez), no self-serve signup.
- **Kill-switch:** `growth.telemetry_enabled` in Miyagi's `platform_flags` — **enablement polarity,
  default OFF, created disabled.**
- **S2 registry seeds from LIVE `platform_flags` rows**, pushed by the client (`syncFeatures()`),
  never `lib/flags.ts` code defaults (flag-reality correction: most flags are ON in prod despite
  docs saying "dark").
- **S3 revenue truth lives in Medusa** — the engine stores attribution telemetry + derived reports
  only, never a commerce replica.
- **S4 is experiment assignment, not flag serving** — deterministic client-side hash bucketing, no
  lookup, no resolve endpoint.
- **v1 in:** S1 ingest+SDK+first consumer · S2 TARS funnel · S3 North Star · S4 A/B bucketing.
- **v1 out (named later epics, not creep):** flag-serving gateway, Pub/Sub broker + vendor fanout,
  `triggerSatisfaction()` micro-surveys, p99 < 5ms SLO, Redis cache-aside, statistical-significance
  engine, and E1–E6 (commercial shell, multi-tenant activation, pod report/benchmarks, signals loop,
  flag-serving migration + PRD-G chaos/SecOps, CMS integration spike).
- **New infra:** a second Supabase project + a Vercel project for golden-beans — **needs Daniel's
  green light before provisioning**, per house rule on paid infra.

## Definition of Ready
Already satisfied in the canonical doc. This seed exists so golden-beans' own `00-ideas` funnel has
a local anchor; `epic:` is set immediately since the epic scaffolds in the same commit as this seed.
