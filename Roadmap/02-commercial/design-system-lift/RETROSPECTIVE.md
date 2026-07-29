# Retrospective — Design system lift

**Shipped:** 2026-07-28 · **Golden Beans PRs:** [#51](https://github.com/danybgoode/golden-beans/pull/51)
and [#53](https://github.com/danybgoode/golden-beans/pull/53)

## What shipped

The approved gold-ingot bean identity, dark-roast/kraft/foil material system, shared UI rails,
navigation loader, responsive browser coverage, and automated drift guard now span the public,
auth, install, and signed-in product surfaces.

## What went well

- The corrective handoff follow-up made the supplied references canonical and converted visual
  decisions into reusable components, tokens, and CI-backed rules.
- The review caught a framework-level regression where shared streaming UI could mask a guarded
  route's required 404 status, preserving the product contract as well as the visual system.

## Durable learning

The streaming-boundary rule and the design-drift guard's source-of-truth discipline are already
promoted to `Roadmap/LEARNINGS.md`; no duplicate entry is needed.
