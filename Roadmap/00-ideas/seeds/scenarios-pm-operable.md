---
title: "Scenarios made PM-operable — define, launch, and kill a chaos/secops scenario from the UI"
slug: scenarios-pm-operable
status: raw
area: "01"
type: feature
priority: null
appetite: null
underwritten_by: null
risk: high
epic: null
build_order: null
updated: 2026-08-05
---

# Seed — Scenarios, from a read-only log to the tool PRD-G describes

**Raw. Not shaped.** Deep-groom when it reaches the front of the queue (WAYS grooming cadence).

**Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.4, §6.4, §7 (P1).

## The idea in one paragraph

`app/app/scenarios/[projectSlug]/page.tsx` is 287 lines rendering **seven stacked HTML tables** —
targets, runs, defensive-simulation results, impact evidence, breaker policies, breaker trips — and
declares itself read-only operating evidence. The audit calls chaos + secops the product's clearest
whitespace (§3.3: neither PostHog nor GrowthBook has it at all), and today it is the least
PM-operable surface in the product: an inspection console for scenarios an agent already ran over
the API. PRD-G Requirement E1 asks for a PM to *define* a scenario and watch the downstream TARS
impact.

## What it would buy

- A **define-a-scenario** flow: name, target, blast radius, fault — reusing the targeting-rule shape
  from Flags so a PM learns the pattern once.
- A **kill switch that is a button**, wired to `lib/breaker-admin-operations.ts` (already built) with
  a destructive-action confirmation that names what stops.
- A **control-vs-treatment chart** for the business-impact evidence (PRD-G E3), instead of a table
  with a "technical delta / claim / blockers" row.

## Known constraints (do not shape these away)

- The "no causal customer claim" and internal/synthetic-cohort caveats stay exactly as strict as
  they are. That honesty is a brand asset (audit §2.6), not friction.
- Three existing gates cover this surface: `RESILIENCE_SCENARIOS_ENABLED`,
  `SECURITY_SIMULATIONS_ENABLED`, `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED`.
- `scenario-dark.spec.ts` and `scenario-dashboard.authed.spec.ts` already exist.

## Sequencing

Assumes `app-shell-and-agent-rail` has landed — the propose/confirm shape and the shell nav are
prerequisites, and the audit routes the scenario-launch flow through them (§6.4).
