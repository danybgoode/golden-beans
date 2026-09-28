---
title: "Review rail — one implementation, and a doctor the template actually ships"
slug: review-rail-one-implementation
status: raw
area: "09"
type: chore
priority: unranked
epic: null
build_order: 46
updated: 2026-09-18
---

# Seed — the review rail, one implementation

## Problem

`plugin-audit-and-extraction` made every other shared script rail one set of bytes across the template,
the origin project and golden-beans. It explicitly left the **review rail** out of scope. After that
epic, the review rail is the only rail with three implementations:

- `cross-review.mjs`, `cross-panel.mjs`, `lib/cross-agent-cli.mjs` and their prompts differ in all three
  repos. The byte-compare at close found these, and each consumer's `scripts/README.md` records the fork.
- **The template's own fix instruction points at a script it does not ship.** When the installed `agy`
  moves past the pin (observed 2026-09-18: 1.2.7 installed, 1.2.5 pinned), `runAntigravity` says to run
  `node scripts/agy-doctor.mjs --fix`, and that file does not exist in `template/scripts/`. The origin
  ships `cross-agent-doctor.mjs` (417 lines, with tests), and golden-beans ships its own `agy-doctor.mjs`.
  So in the foundation and in any freshly spawned project, the agy seat stays refused until someone bumps
  the pin by hand.

## Rough shape

Promote one doctor into the template (the origin's covers codex too). Take the superset of the three
`cross-agent-cli.mjs` copies, and run each consumer's OLD tests against it before adopting it (the
lesson from the prose guard). Then copy it back in the same wave, as the audit epic did for every
other rail.
