---
title: "Verify spike: TLA+/Quint on the event outbox and Lean on the flag evaluator, dogfooded on Golden Frijoles"
slug: verify-spike
status: raw
area: "09"
type: spike
priority: "audit-wave-B"
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: 31
updated: 2026-09-23
---

# Seed: Verify spike: TLA+/Quint on the event outbox and Lean on the flag evaluator, dogfooded on Golden Frijoles

**Portfolio-pass seed** (not yet deep-groomed). Seed 6 of the unification audit, [§10](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **spike**, appetite **S** (from the audit, to confirm at grooming). Audit wave **B**.
**Depends on:** none.

## Problem

The brief wants a TLA+ → Lean verification layer coordinated by Jev. The audit found Jev can't generate (typed decisions only), so the pipeline is recast as frontier model writes, checkers check, Jev triages. Nobody has yet measured what this costs or finds on a real codebase. This spike does that on GF's own code before anything is promised (D7).

## Sketch (from the audit; grooming will cut or reshape it)

- Specify the event-destination-router outbox (at-least-once, no loss while a sink is down, bounded replay) in TLA+ **and** Quint; model-check it bounded in CI; replay `event_delivery_attempts` rows as trace validation.
- Model `evaluateFlag` / `matchesRule` in Lean 4; prove determinism + the explanation/verdict agreement; differential-test the Lean model against the TS evaluator.
- Evaluate Veil as a one-language alternative.
- Run the four Jev triage questions (diff touches spec? counterexample class? obligation difficulty? verify depth?) in shadow, logged.
- **Output: a written decision**: which spec language, which tiers are worth productizing, what they cost in CI minutes and effort, and what they found.

## Open questions for the deep groom

- Time box: one builder session or two?
- Does a found bug get fixed inside the spike or seeded separately?
