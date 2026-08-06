---
title: "Analytics visualization layer — charts for funnel, North Star, impact and experiment lift"
slug: analytics-visualization-layer
status: raw
area: "01"
type: feature
priority: null
appetite: null
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-08-05
---

# Seed — make the namesake framework look like one

**Raw. Not shaped.** Deep-groom when it reaches the front of the queue.

**Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.3, §6.5, §6.7, §7 (P1).

## The idea in one paragraph

There is **zero data visualization anywhere** in an analytics product. TARS — the product's namesake
— renders as a `<dl>` with three numbers. `/impact` renders a North Star input's time series as a
two-column table: a line chart's data with no line. Experiment lift, rollout percentages and breaker
trip rates are all table rows. No chart library is installed.

## Scope boundary against `app-shell-and-agent-rail`

That bet delivers **funnel bars only**, via a thin wrapper over the `.funnel` / `.bar` CSS that is
already loaded into the signed-in app — and explicitly adds **no runtime dependency**. This seed is
everything past that: sparklines, line charts, control-vs-treatment comparison bars, rollout rings.

## The decision this seed actually has to make first

**Whether to add a charting dependency at all**, and if so which. The audit suggests something
lightweight (Observable Plot, visx, or a hand-rolled SVG set matching the token system) over a heavy
one. Constraints that bear on it:

- `check-design-drift` forbids raw hex in `apps/web/app` — a chart library that emits its own colour
  defaults fights the token system.
- The inline-style ban is landing-only, so dynamic dimensions in `/app` are permitted. A hand-rolled
  SVG set is more viable here than it would be on the landing.
- `lucide-react` is already a dependency; the app currently ships no other UI runtime.

A short spike (`SESSION-KICKOFFS` §3) may be the honest first move rather than a build bet.
