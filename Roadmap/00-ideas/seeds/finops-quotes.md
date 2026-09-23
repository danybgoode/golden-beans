---
title: "FinOps quotes: an appetite becomes a calibrated token/$ range, then quote vs actual per epic"
slug: finops-quotes
status: raw
area: "01"
type: feature
priority: "audit-wave-D"
appetite: M
underwritten_by: null
risk: low
epic: null
build_order: 36
updated: 2026-09-23
---

# Seed: FinOps quotes: an appetite becomes a calibrated token/$ range, then quote vs actual per epic

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
