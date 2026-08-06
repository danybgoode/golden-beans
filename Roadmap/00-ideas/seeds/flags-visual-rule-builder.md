---
title: "Flags — a visual rule builder, rollout viz, and a version diff instead of a JSON dump"
slug: flags-visual-rule-builder
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

# Seed — Flags, from a JSON textarea to a rule builder

**Raw. Not shaped.** Deep-groom when it reaches the front of the queue.

**Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.4, §3.2, §6.3, §7 (P1).

## The idea in one paragraph

Creating a flag in `flag-manager.tsx` (483 lines) means hand-typing a raw JSON definition —
targeting rules, variants and all — into a `<textarea>`. Reading a flag's history means expanding
`<details><summary>Inspect immutable JSON</summary>` per version. GrowthBook, a direct competitor by
our own framing, ships a visual targeting builder as table stakes.

## What it would buy

- An **attribute → operator → value** rule builder producing the same JSON the backend already
  validates. The JSON stays one click away — it stops being the *only* affordance.
- A **rollout visualization** (ring or bar, live percentage/segment per environment) replacing the
  "active (snapshot N)" text line.
- A **version diff in plain language**, not a version dump.
- GrowthBook's **"preview as a specific user"** debug pattern — "what does user X see right now, and
  why."

## Keep

The immutable-version model. It is a real strength competitors don't all have; this seed changes how
it is *authored and read*, never that it is immutable.

## Known constraints

- Gates in play: `FLAG_SERVING_ENABLED`, `FLAG_DEFINITION_SYNC_ENABLED` (born OFF).
- Existing specs: `flag-serving.spec.ts`, `flag-serving-dark.spec.ts`, `flag-catalog-sync.spec.ts`,
  `flag-sync-keys.authed.spec.ts`.
- Audit §3.2 also notes the flag → experiment transition should be **one visible action**, since the
  backend already models a flag as the thing an experiment governs. Worth shaping into this seed
  rather than leaving it to the Experiments surface.
