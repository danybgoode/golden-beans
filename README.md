# golden-beans

**Golden Beans — Unified Growth Engine.** A standalone product (flags + A/B + telemetry routing +
North Star/TARS dashboards), maintained on its own — not a fork of any other project.

Spawned from the [`dobby-foundation`](https://github.com/danybgoode/dobby-foundation) project
template (`dobby-foundation` Sprint 1, Story 1.4) — it consumes the same `ways-of-work` plugin every
`~/dobby/` sibling project does (see `.claude/settings.json`), so groom/skills/CI conventions land
here from one versioned place, not a copy-paste fork.

## Status

Foundation only, right now. The Growth Engine's own build (S1 — events flow end-to-end, S2 — TARS
funnel, S3 — North Star engine, S4 — A/B v1) has not started yet — see the scope doc that governs it:
`golden-beans-growth-engine.md` in the `miyagi-product-management` repo
(`Roadmap/00-ideas/2. readyforscope/`), Decisions 1–8 + the Panel adjudication. That doc's S0
workstream (this repo's own spawn) is what shipped so far.

## Start here

- `AGENTS.md` — the per-project rules slot (fill in as the engine's architecture solidifies).
- `Roadmap/WAYS-OF-WORKING.md` — the cadence, gitflow, Definition of Done, QA gate.
- `Roadmap/LEARNINGS.md` — the transferable subset carried over from the template; will grow with
  this project's own retros.
- `Roadmap/00-ideas/` — the idea funnel; empty until the Growth Engine epics scaffold here.

Every `TEMPLATE FILL-IN` marker left over from the spawn should get filled in as this project's real
shape emerges — `grep -rl "TEMPLATE FILL-IN" .` to find them.
