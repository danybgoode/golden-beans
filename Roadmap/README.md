# <TEMPLATE FILL-IN: Project Name> — Product Roadmap & Feature Poster

> **Mission:** <TEMPLATE FILL-IN: one or two sentences — what this product does and for whom.>

This folder is the **product source of truth**. It speaks in plain product language for product,
design, and business — **no engineering or tech specs here** (those live in `tasks/` and team memory).

---

## How this roadmap is organized

```
Roadmap/
├── README.md                ← you are here · the product poster (all features)
├── WAYS-OF-WORKING.md       ← how we plan, build, ship (scrum cadence) + tooling
├── LEARNINGS.md             ← the cross-cutting retro digest, read at every session start
├── SESSION-KICKOFFS.md      ← thin-pointer prompt cheat sheet for starting a session
├── 00-ideas/                ← the idea funnel (seeds, audits, the generated BUILD-ORDER.md)
└── <Macro-section>/         ← a product domain (a journey, not a component)
    ├── README.md            ← what this area is, for whom, current features
    └── <Epic>/              ← a meaningful body of work
        ├── README.md        ← the epic's product overview
        ├── sprint-N.md      ← the sprint's user stories (As a… I want… so that…)
        └── RETROSPECTIVE.md ← what we learned
```

**Levels:** `Roadmap → Macro-section → Epic → Sprint → User Story`. Each user story is a small,
independently shippable slice of value.

---

## The macro-sections (product domains)

<!-- TEMPLATE FILL-IN: list your project's product domains here, one per macro-section folder
     (e.g. `01-onboarding-and-auth`, `02-core-workflow`, ...). Number them so BUILD-ORDER.md and
     epic paths sort predictably. One macro-section should be reserved for platform/infra work
     that isn't user-facing product — see the convention below. -->

| # | Macro-section | Covers |
|---|---|---|
| 01 | Growth Engine | Telemetry ingest, SDK, TARS funnel (Targeted/Adopted/Retained), North Star metric, A/B bucketing — the core engine. |
| 09 | Platform & Infra | Engineering/observability work that isn't a user-facing product domain — deploy pipeline, dev tooling, cross-cutting process (this convention — reserving `09` for platform/infra — is a deliberate carry-over from the origin project; keep the number stable so tooling that reads it doesn't need per-project config). |

---

## Feature map

<!-- TEMPLATE FILL-IN: one `### <NN> · <Macro-section name>` heading per row above, each listing
     shipped/in-progress features with a status marker. Convention: ✅ means enforced in code, not
     merely intended — partial/aspirational is 🚧. Don't let this page lag a shipped epic; updating
     it is part of the epic Definition of Done (see WAYS-OF-WORKING.md). -->

### 01 · Growth Engine
- 🚧 [Growth Engine v1](01-growth-engine/growth-engine-v1/README.md) (telemetry ingest · SDK · TARS
  funnel · North Star · A/B bucketing) — scaffolded, not yet built.

---

## Recent highlights

<!-- TEMPLATE FILL-IN: newest-first log of shipped epics, one bullet each, dated. Added at every
     epic close (WAYS-OF-WORKING.md's epic Definition of Done). Example shape:
- **2026-01-01** — `<epic-slug>` shipped: <one-line what changed and why it matters>.
-->

## License

<TEMPLATE FILL-IN: if this repo is private/internal, say so; otherwise state the license.>
