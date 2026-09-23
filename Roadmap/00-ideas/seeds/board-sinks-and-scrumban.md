---
title: "Board sinks + scrumban on the Hub: one roadmap projection, many destinations"
slug: board-sinks-and-scrumban
status: raw
area: "02"
type: feature
priority: "audit-wave-C"
appetite: M
underwritten_by: null
risk: low
epic: null
build_order: 33
updated: 2026-09-23
---

# Seed: Board sinks + scrumban on the Hub: one roadmap projection, many destinations

**Portfolio-pass seed** (not yet deep-groomed). Seed 8 of the unification audit, [§6](../audits/golden-frijoles-unification-2026-09-23.md).
Home repo: **golden-beans**. Class **feature**, appetite **M** (from the audit, to confirm at grooming). Audit wave **C**.
**Depends on:** Seed 1 (the kit carries `roadmap-extract`).

## Problem

Audit decision D4: the default board is the Claude mod locally + the Roadmap Hub hosted, with Notion/SmallDocs as optional sinks. Today the Hub has no board/WIP view, and `roadmap-extract.mjs` feeds each destination in its own ad hoc way.

## Sketch (from the audit; grooming will cut or reshape it)

- A `sink` interface over `roadmap-extract.mjs`: `terminal` (default), `hub` (via `/api/v1/roadmap`), `notion` (the existing one-way push), `smalldocs`.
- A scrumban view on the Hub: columns as explicit policies (from the DoD), WIP limits from config, pull not push.
- WIP limits + column policies live in frontmatter/config, with no new service.

## Open questions for the deep groom

- GitHub Projects as a sink in v1 or later?
- Where WIP limits are configured: per project or per workspace?
