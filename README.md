# golden-beans

**Golden Beans — Unified Growth Engine.** A standalone product (flags + A/B + telemetry routing +
North Star/TARS dashboards), maintained on its own — not a fork of any other project.

Spawned from the [`dobby-foundation`](https://github.com/danybgoode/dobby-foundation) project
template (`dobby-foundation` Sprint 1, Story 1.4) — it consumes the same `ways-of-work` plugin every
`~/dobby/` sibling project does (see `.claude/settings.json`), so groom/skills/CI conventions land
here from one versioned place, not a copy-paste fork.

## Status

**Live in production** at `https://golden-beans-gamma.vercel.app`. Two epics shipped:
- **Growth Engine v1** (2026-07-16) — telemetry ingest + SDK, a TARS funnel, a North Star metric with
  real Medusa revenue inputs, and A/B bucketing. Dogfooded against Miyagi's setup-guide funnel.
- **Commercial shell** (2026-07-20) — public landing + waitlist, a read-only MCP connector + `/install`
  page (enabled in prod), self-dogfood instrumentation, and SEO/OG + an `llms.txt` agent manifest.

See `Roadmap/README.md` (the product poster) for the at-a-glance feature map and what's next.

## Start here

- `AGENTS.md` — the project's architecture + the non-negotiable rules. **Read it before building.**
- `Roadmap/README.md` — the product poster (all features, by domain, with status).
- `Roadmap/WAYS-OF-WORKING.md` — the cadence, gitflow, Definition of Done, QA/cross-review gate.
- `Roadmap/LEARNINGS.md` — the cross-cutting retro digest; read at every session start.
- `Roadmap/00-ideas/` — the idea funnel (seeds, audits, the generated `BUILD-ORDER.md`).

**Template-drift guard:** the spawn left `TEMPLATE FILL-IN` markers in load-bearing docs; they must
stay filled. `npm run check:template-drift` (or `node scripts/check-template-drift.mjs`) fails if any
load-bearing doc still contains an *unfilled placeholder*. It matches the placeholder syntax (the
phrase in angle brackets, or immediately followed by a colon) — which is what every real unfilled
marker uses — so a plain prose mention of the phrase, like this sentence, is deliberately allowed.
