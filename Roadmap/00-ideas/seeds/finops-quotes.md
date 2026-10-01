---
title: "FinOps quotes: an appetite becomes a calibrated token/$ range, then quote vs actual per epic"
slug: finops-quotes
status: scaffolded
area: "09"
type: feature
priority: "audit-wave-D"
appetite: M
underwritten_by: null
risk: low
epic: "09-platform-infra/finops"
build_order: 42
consolidated_into: finops-actuals   # deep-groomed together 2026-10-01; one epic
updated: 2026-10-01
---

# Seed: FinOps quotes: an appetite becomes a calibrated token/$ range, then quote vs actual per epic

> **Consolidated 2026-10-01 into [`finops-actuals`](finops-actuals.md).** Product owner's call at grooming ("2 epics"):
> quotes and actuals are one loop — quote at groom → measure while building → stamp at close → calibrate the next
> quote — so they ship as ONE epic. Everything this seed asked for is a claim in that pitch: groom attaches a quote at
> Stage 1.5 (Sprint 2), quote vs actual per epic (Sprints 1–2, and live in the build view band), cost per shipped
> story (`/app/finops`, Sprint 3). **Budgets:** alert-only in v1 (the band turns red past the quote) — the open
> question below is answered "alert-only is honest for v1; stop is not enforceable for agents we don't host".
> This file stays as the funnel record (seeds never move); the epic README's `status:` is authoritative once scaffolded.

**Portfolio-pass seed** (not yet deep-groomed). Seed 11 of the unification audit, [§8](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **feature**, appetite **M** (from the audit, to confirm at grooming). Audit wave **D**.
**Depends on:** Seed 9.

## Problem

Grooming sets an appetite (S/M/L) in sessions, with only an *implied* token band. Once actuals exist (Seed 9), each appetite can carry a range calibrated from your own past epics, and every epic can show quote vs actual. That's the landing's "value-linked unit economics".

## Sketch (from the audit; grooming will cut or reshape it)

- groom attaches a quote range at Stage 1.5, from past actuals.
- Quote vs actual per epic; cost per shipped story / per experiment decision / per North Star point.
- Budgets that alert → rate-limit → stop, as workspace data.

## Open questions for the deep groom

- Is "stop" enforceable for agents we don't host, or is alert-only honest for v1?
