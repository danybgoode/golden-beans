---
title: "E3 — Pod Report: velocity/DORA/cost-per-point benchmarks + outcome layer"
slug: pod-report
status: raw
area: "02"
type: feature
priority: "#3"
risk: low
epic: null
build_order: "#3"
updated: 2026-07-14
---

# Seed — E3 Pod Report (benchmarks & ROI)

The cost-center→revenue-engine sales artifact: velocity, throughput, cycle/lead time, DORA,
cost-per-shipped-point — human baseline vs agent-augmented pod — layered with outcome metrics the
engine produces (TARS adoption, North-Star movement, revenue per feature). **Dogfood dataset:
medusa-bonsai (104 epics, 97 shipped, dated frontmatter + git history) — computed, not claimed.**

**Decisions folded in at the 2026-07-14 groom session (Daniel):**
- **ReportHub stays in medusa-bonsai** (`reporthub-as-notion`, groomed there, build #5). E3
  *reuses* its projection rail (`roadmap-to-notion.mjs --extract`, `reports-data.json` generator,
  `pmo-report.mjs` metrics) and serves miyagisanchez as client #1 — pattern lift, not absorption.
- **Named decision gate for this epic's groom:** does report-rendering become an engine primitive
  (tenant-facing artifacts), or does the engine stay data-out and let surfaces like the SmallDocs
  hub render? (License/fork posture of SmallDocs weighs against coupling the commercial product
  to it.)
- E1↔E3 swap trigger stands (SCOPE.md): if a pods sales conversation needs the report before the
  landing, resequence. Landing section 5 lights up here. Depends: S2–S3 (shipped) + E1 section.
