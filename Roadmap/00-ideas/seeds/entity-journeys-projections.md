---
title: "Entity journeys — configurable lifecycle projections beyond fixed TARS"
slug: entity-journeys-projections
status: raw
area: "01"
type: feature
priority: "#2b"
risk: high
epic: null
build_order: "#2b"
updated: 2026-07-20
---

# Seed — Entity journeys and lifecycle projections

Extend the shipped three-state TARS view into a reusable, ordered lifecycle primitive for entities such as
merchant, account, project, subscriber, campaign, or seller. A tenant defines stages as event predicates;
Golden Beans projects each subject's current stage, entered-at time, stage history, time-in-stage, conversion,
drop-off, and cohort retention from the canonical event stream. Miyagi's 13-stage founding-merchant pipeline
is the dogfood case, not a hard-coded schema.

Depends on `event-destination-router`'s stable subject/entity contract. Reuse `feature_registry`, TARS query
patterns, and experiment exposure joins; do not build a CRM, task manager, or merchant-specific workflow in
Golden Beans. Groom when #2a's event/identity contract is approved. Architecture fork: incremental projection
tables versus query-time computation; the cross-panel offer applies at groom.
