---
title: "FinOps actuals: agent token and cost usage lands in the engine, attributed to skill and epic"
slug: finops-actuals
status: raw
area: "01"
type: feature
priority: "audit-wave-C"
appetite: L
underwritten_by: null
risk: high
epic: null
build_order: 34
updated: 2026-09-23
---

# Seed: FinOps actuals: agent token and cost usage lands in the engine, attributed to skill and epic

**Portfolio-pass seed** (not yet deep-groomed). Seed 9 of the unification audit, [§8](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **feature**, appetite **L** (from the audit, to confirm at grooming). Audit wave **C**.
**Depends on:** Seed 7 for budgets (actuals can start per project).

## Problem

The landing's FinOps surface is `unbuilt`. Claude Code already exports `claude_code.token.usage` and `claude_code.cost.usage` over OpenTelemetry with `skill.name`, `plugin.name`, `agent.name`, `model` and `session.id` attributes. Nothing receives it.

## Sketch (from the audit; grooming will cut or reshape it)

- An OTLP metrics receiver that normalizes into the existing ingest core (**rule #1: no second pipeline**).
- Epic attribution: a session-start hook records `session.id → branch`, and `feat/<epic-slug>` gives the epic.
- Setup writes the OTel env block (metrics only, never prompt logs).
- Per-epic / per-skill cost views; `maker-ops.ts` FinOps flips to `gated` only when a real gate exists.

## Open questions for the deep groom

- Other agents (Codex etc.) in v1 or later?
- Where the receiver authenticates: ingest key or a new scope?
