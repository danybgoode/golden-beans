---
title: "PMO metrics sheet - {{window.label}}"
styles:
  fontFamily: "Inter"
  baseFontSize: 15
  lineHeight: 1.6
---

# PMO metrics sheet - {{window.label}}

```cells
Metric,Value,Benchmark,Direction,Differential
Deploys per week,{{deploys.perWeek}},{{benchmarks.deploysPerWeek}},higher is better,=B2-C2
PR cycle median hours,{{cycle.medianHours}},{{benchmarks.prCycleMedianHours}},lower is better,=B3-C3
Epic lead median days,{{epics.medianDays}},{{benchmarks.epicLeadMedianDays}},lower is better,=B4-C4
Change-failure proxy %,{{quality.changeFailureRatePercent}},{{benchmarks.changeFailureRatePercent}},lower is better,=B5-C5
Stories shipped,{{throughput.shippedStories}},0,internal signal,=B6-C6
Epics shipped,{{throughput.shippedEpics}},0,internal signal,=B7-C7
LEARNINGS promotions,{{docOps.learningsPromotions}},0,internal signal,=B8-C8
Retro coverage %,{{docOps.retroPercent}},0,internal signal,=B9-C9
```

Notes:

- The formulas export to a spreadsheet as live formulas.
- Benchmark source: {{benchmarks.sourceLine}}.
- {{benchmarks.framing}}
