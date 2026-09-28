---
title: "{{TITLE}}"
slug: {{SLUG}}
status: ready
area: "{{AREA}}"
type: {{TYPE}}
priority: null
appetite: {{APPETITE}}
underwritten_by: null
risk: {{RISK}}
epic: null
build_order: null
updated: {{DATE}}
---

# Pitch — {{TITLE}}

## Problem
<!-- The specific pain/story motivating this — narrowed at Stage 1, never a grab-bag. -->

## Appetite
<!-- S | M | L and what that buys (WAYS-OF-WORKING → Betting & appetite). This is the budget the
     problem is WORTH, fixed before the solution — not an estimate. The solution below must fit
     it; if it can't, reshape or cut, don't grow the appetite. -->

## Outcome & signal
<!-- What's true after this ships that isn't now? How will the product owner test it? -->

## Stage-2.5 bucket
<!-- already-possible | light-enhancement | genuinely-new — and why. -->

## Bill of materials (What / Why)
<!-- The solution's parts — as few words per cell as possible, rough on purpose. The product owner
     edits the Why column; a Why neither of you can defend is a part you cut. Lean on parts that
     already work (that's how tissue turns into bone) — reuse 3 primitives before adding 10. -->

| What | Why |
|---|---|
|  |  |

## Scope
**In v1:**
**Out of v1 (no-gos):**
<!-- No-gos are deliberate exclusions, stated so the appetite holds — what we are NOT doing. -->

## Rabbit holes
<!-- Patch holes in advance: the tricky design decisions made HERE, the technical unknowns vetted,
     the "this could eat the whole appetite" traps named so a builder doesn't fall in. -->

## What already exists (reuse, don't rebuild)
<!-- Concrete files / routes / primitives (the platform-first reframe — Stage 4: read the backend
     model/route first; this list is what repeatedly re-scopes epics smaller). -->

## UX heuristics & rails check
<!-- Keep this a checklist, not an essay. -->
- **CI guards covering this surface:** <name the project's guards, or "none — say so">
- **Audits-lens findings that apply:** <cite the project's `00-ideas/audits/` findings, or "none found">
- **Design-language debt (if any):** <e.g. raw hex, missing shared component, inconsistent spacing>

## Kill-switch / runtime gate (risk:high only — Stage 6b)
<!-- Delete this block if risk:low. Default: NO flag unless the product owner asks for one. If one is
     asked for, record the decision per the groom skill's references/kill-switch.md — the ONE home of the
     flag/polarity/seam/activation/placement rule (never restate it here) — OR a one-line carve-out
     reason. The mechanism is Golden Frijoles; `node scripts/preflight.mjs` says whether this project can
     create one at all. -->

## Acceptance criteria
<!-- Plain-language checks per story. -->

## Open risks / research
<!-- Cite present-day facts where the ask leans on anything recent/changing. -->
