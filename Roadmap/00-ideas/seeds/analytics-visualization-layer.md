---
title: "Analytics visualization — the charting-dependency decision (spike), then the layer"
slug: analytics-visualization-layer
status: ready
area: "01"
type: spike
priority: "wave-2026-08-08"
appetite: S
underwritten_by: "Roadmap/bets/wave-2026-08-08.md"
risk: low
epic: null
build_order: 14
updated: 2026-08-08
---

# Spike brief — make the namesake framework look like one

> **Class:** Spike · **Lane:** shaped bet (investigation) · **Appetite:** S
> **Source:** `Roadmap/00-ideas/audits/app-ux-audit-2026-08-01.md` §2.3, §6.5, §6.7, §7 (P1).
> **Reclassified from `feature` to `spike` on 2026-08-08.** The raw seed said it itself: *"a short
> spike may be the honest first move rather than a build bet."* Taking its own advice. **This spike
> ends in a written decision, not code.**

## The question this spike answers

> **Do we add a charting dependency to `apps/web`, and if so which — or do we hand-roll an SVG set
> against the token system?**

That is the whole spike. Everything else about the visualization layer is downstream of it, and
committing to a library by accident — inside a feature epic, under delivery pressure — is how a
runtime dependency gets chosen for reasons nobody wrote down.

## Why it is worth a session now

There is **zero data visualization anywhere in an analytics product.** Verified 2026-08-08: no
`recharts`, `d3`, `chart.js`, `visx` or `plot` in `apps/web/package.json`; the only UI runtime
dependency is `lucide-react`. TARS — the product's namesake — renders as a `<dl>` with three
numbers. `/impact` renders a North Star time series as a two-column table: a line chart's data with
no line.

And the decision is now **blocking**: `scenarios-pm-operable` (#16) needs a control-vs-treatment
comparison for PRD-G E3. If the charting call has not been made when that epic starts, it either
stalls or hand-rolls one — and a chart hand-rolled under deadline inside a feature epic becomes the
de-facto standard without ever having been decided. **This spike exists to get in front of #16.**

## Appetite

**S — one session.** Fixed scope: read the constraints, build one throwaway comparison of the
shortlisted options against a real `/impact` series, write the decision. If it is still open at the
end of the session, that is itself the finding — record what is unresolved and what would resolve it.

## Scope boundary against what already shipped

`app-shell-and-agent-rail` delivered **funnel bars only**, via `components/ui/FunnelBars.tsx` — a
thin wrapper over the `.funnel` / `.bar` CSS already imported into the signed-in app by
`globals.css`, and explicitly **no runtime dependency**. This spike is about everything past that:
sparklines, line charts, control-vs-treatment comparison bars, rollout rings.

`FunnelBars` is also the **existence proof for the hand-rolled option** — it shipped, it passes the
drift guard, and it cost no dependency. The spike's job is to say whether that approach scales to a
line chart with axes, or whether it stops being cheap at exactly that point.

## Constraints that bear on the decision (verified 2026-08-08)

- **`check:design-drift` forbids raw hex in `apps/web/app`, `components/ui` and
  `components/product`.** A chart library that emits its own colour defaults fights the token
  system. **This is the sharpest constraint** — evaluate every candidate by how it takes colour
  from CSS custom properties, not by its feature list.
- **The inline-style ban is landing-only**, so dynamic dimensions in `/app` are permitted. A
  hand-rolled SVG set is more viable here than it would be on the landing page.
- **`lucide-react` is the only UI runtime dependency.** Adding a second is a real change to the
  app's dependency posture, not a routine install.
- **`tokens.css` is imported first by `globals.css`, and the drift guard asserts that import.**
  Whatever is chosen reads its palette from there.
- Bundle size on a signed-in app matters less than on the landing, but it is not free.

## What the spike must produce

A **written decision** in this file (replacing this section), covering:

1. **The call** — a named library at a pinned version, or "hand-rolled SVG set," with the reasoning.
2. **The colour story** — exactly how the choice takes its palette from `tokens.css` without raw hex
   reaching a guarded directory. Demonstrated, not asserted.
3. **A worked example** — one real chart built against a real `/impact` North Star series, so the
   decision rests on something that rendered rather than on a feature comparison table.
4. **The chart inventory it has to serve** — line/sparkline (North Star, impact), grouped
   comparison bars (control vs treatment, experiment lift), a proportion/ring (flag rollout,
   breaker trip rates). A choice that serves three of four is a fine answer *if it says so*.
5. **What it does NOT decide** — the build epic that follows, its appetite, and its slicing.
6. **Accessibility posture** — whether the choice can produce a chart with a text alternative, since
   every one of these numbers is currently readable as a table and a chart must not lose that.

## Candidates the audit names (not a shortlist — the spike sets the shortlist)

Observable Plot · visx · a hand-rolled SVG set matching the token system. The audit's guidance is
*lightweight over heavy*, and the drift guard is the reason.

## Cross-agent planning panel — offered (Stage 4 trigger)

This is an expensive-to-reverse dependency call on shared surface, which is exactly the trigger for
a different-family second read. **Offer, do not auto-run:**

```
node scripts/cross-panel.mjs Roadmap/00-ideas/seeds/analytics-visualization-layer.md --lens both --agent codex
```

Advisory and print-only — it never gates and never writes the doc. Run again with
`--agent antigravity` for family diversity if the first read is thin.

## Out of scope for the spike

- **No charts shipped to production.** A throwaway branch that renders one comparison is the
  deliverable's evidence; it is not merged as a feature.
- **No epic slicing.** Slicing happens after the decision, at the next betting table.
- **No revisiting `FunnelBars`.** It shipped and it works. If the decision replaces it later, that
  is the build epic's problem, not the spike's.

## Follow-on (not underwritten)

Once the decision lands, the visualization *layer* is a separate shaped bet: sparklines on TARS, a
line chart on `/impact`, comparison bars for experiment lift and scenario impact, rollout rings for
flags. Expect **M**. It is deliberately not sequenced here — the decision may change its shape.

## Open risks

- **Risk: the spike answers "hand-roll" and that answer is wrong at scale.** Mitigate by making the
  worked example the *hardest* chart in the inventory (a line chart with axes and a comparison
  series), not the easiest.
- **Risk: it slips past #16.** If it does, #16 degrades to today's impact table with a stated gap —
  that fallback is written into #16's acceptance criteria on purpose, so the dependency is soft.
