---
title: "Scenarios freeze: archive the epic, correct the landing's SecOps claim, deprecate the SDK scenario API"
slug: scenarios-freeze
status: raw
area: "01"
type: chore
priority: "audit-wave-A"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 30
updated: 2026-09-23
---

# Seed: Scenarios freeze: archive the epic, correct the landing's SecOps claim, deprecate the SDK scenario API

**Portfolio-pass seed** (not yet deep-groomed). Seed 3 of the unification audit, [§11.3](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **chore**, appetite **S** (from the audit, to confirm at grooming). Audit wave **A**.
**Depends on:** none.

## Problem

Scenarios and drills are moving to Mutiny (audit decision D6). Meanwhile, `scenarios-pm-operable` is "in progress" in its frontmatter and "shipped" by derivation (BUILD-ORDER drift), the landing's SecOps surface still lists security scenarios and resilience drills, and `@golden-frijoles/sdk` exports the scenario API.

## Sketch (from the audit; grooming will cut or reshape it)

- Set `scenarios-pm-operable` to `archived` with the reason "transferred to Mutiny", clearing the drift.
- Keep `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED` and `SCENARIO_AUTHORING_ENABLED` OFF (verify, don't assume).
- `lib/maker-ops.ts`: SecOps → `unbuilt` pointing at Mutiny, or drop to three surfaces; `gatedDrillNote` / `DrillGateReadings` go with it.
- A deprecation notice on the SDK scenario exports (no removal; removal is a semver-major, later).
- **Circuit breakers stay** and aren't touched.

## Open questions for the deep groom

- SecOps tab: keep it as "Mutiny, coming" or remove it?
