---
title: "PMO weekly - {{window.label}}"
styles:
  fontFamily: "Inter"
  baseFontSize: 15
  lineHeight: 1.6
  slideAspectRatio: "16:9"
  h1: { fontSize: 2.1, fontWeight: 700 }
  h2: { fontSize: 1.35, fontWeight: 600 }
---

# PMO weekly - {{window.label}}

Honest line: this shows an operational differential against external references; it is not a controlled experiment.

~~~slide
@extends cover
#title: PMO weekly
#subtitle: {{window.label}}
#kicker: Operational report
#footer: Generated from git, GitHub REST and the Roadmap
~~~

~~~slide
@extends metric
#title: Delivery flow
#metric: {{throughput.shippedStories}}
#label: stories shipped
#caption: {{throughput.shippedEpics}} epics shipped - {{deploys.perWeek}} deploys/week vs benchmark {{benchmarks.deploysPerWeek}}
~~~

~~~slide
@extends exhibit
#title: Cadence and quality
#chart:
  ```chart
  {"type":"bar","title":"PMO signals","labels":["Stories","Epics","Deploys","Reverts/hotfix"],"values":[{{throughput.shippedStories}},{{throughput.shippedEpics}},{{deploys.total}},{{quality.changeFailProxy}}],"color":"#2563eb"}
  ```
#takeaway:
  Median PR cycle: **{{cycle.medianHours}}h**.

  Median epic lead time: **{{epics.medianDays}} days**.
#source: Internal data, {{window.generatedDate}}.
~~~

~~~slide
@extends title-body
#title: Documentation operations
#body:
  ```chart
  {"type":"bar","title":"Doc-ops","labels":["LEARNINGS","Retros covered"],"values":[{{docOps.learningsPromotions}},{{docOps.retroCovered}}],"color":"#0f766e"}
  ```
#footer: Retro coverage {{docOps.retroCovered}}/{{docOps.retroTotal}}.
~~~

~~~slide
@extends title-body
#title: Executive reading
#body:
- Throughput: **{{throughput.shippedStories}}** stories and **{{throughput.shippedEpics}}** epics shipped.
- Deploy frequency: **{{deploys.perWeek}}** per week; DORA/Four Keys daily benchmark: **{{benchmarks.deploysPerWeek}}** deployment days per week.
- Median PR cycle: **{{cycle.medianHours}}h** vs the one-day reference **{{benchmarks.prCycleMedianHours}}h**.
- Change-failure proxy: **{{quality.changeFailureRatePercent}}%** vs the top-bucket reference **{{benchmarks.changeFailureRatePercent}}%**.
- Doc-ops: **{{docOps.learningsPromotions}}** LEARNINGS promotions.
#footer: {{benchmarks.sourceLine}}. {{benchmarks.framing}}
~~~
