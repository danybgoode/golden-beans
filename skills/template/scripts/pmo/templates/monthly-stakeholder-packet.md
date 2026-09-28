---
title: "PMO monthly - {{window.label}}"
styles:
  fontFamily: "Inter"
  baseFontSize: 15
  lineHeight: 1.65
  h1: { fontSize: 2.0, fontWeight: 700 }
  h2: { fontSize: 1.25, fontWeight: 600 }
---

# PMO monthly - {{window.label}}

## Executive summary

This packet reports operational performance in PMO terms: flow, DORA, quality and documentation discipline.
The external comparison is a differential, not a controlled experiment.

## Indicators

| Indicator | Value |
|---|---:|
| Stories shipped | {{throughput.shippedStories}} |
| Epics shipped | {{throughput.shippedEpics}} |
| Deploys per week | {{deploys.perWeek}} |
| Median PR cycle | {{cycle.medianHours}}h |
| Median epic lead time | {{epics.medianDays}} days |
| Change-failure proxy | {{quality.changeFailureRatePercent}}% |
| LEARNINGS promotions | {{docOps.learningsPromotions}} |
| Retro coverage | {{docOps.retroCovered}}/{{docOps.retroTotal}} |

## External benchmarks

| Comparable signal | PMO | Benchmark | Reading |
|---|---:|---:|---|
| Deploys per week | {{deploys.perWeek}} | {{benchmarks.deploysPerWeek}} | Higher is better |
| Median PR cycle | {{cycle.medianHours}}h | {{benchmarks.prCycleMedianHours}}h | Lower is better |
| Median epic lead | {{epics.medianDays}} days | {{benchmarks.epicLeadMedianDays}} days | Lower is better |
| Change-failure proxy | {{quality.changeFailureRatePercent}}% | {{benchmarks.changeFailureRatePercent}}% | Lower is better |

Source: {{benchmarks.sourceLine}}. {{benchmarks.framing}}

## Visual evidence

```chart
{"type":"bar","title":"PMO monthly","labels":["Stories","Epics","Deploys","Doc ops"],"values":[{{throughput.shippedStories}},{{throughput.shippedEpics}},{{deploys.total}},{{docOps.learningsPromotions}}],"color":"#2563eb"}
```

## Reading

- Throughput is inferred from real history, not story points.
- Deploy frequency equals merges to `main`, as WAYS-OF-WORKING defines it.
- The change-fail proxy counts reverts/hotfixes.
- Doc-ops measures the breadth of Roadmap, LEARNINGS and retrospective activity.
