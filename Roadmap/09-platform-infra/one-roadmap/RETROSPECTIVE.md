# One Roadmap — the plugin's epics, seeds, bets and learnings move here — Retrospective

_Closed: <date>_

## What shipped
<!-- The capability now live, by sprint, with commit/PR refs. -->

## What went well

## What we learned
<!-- Promote the durable, generalizable items to Roadmap/LEARNINGS.md (one-liner + why + date). Dedupe. -->

## Gaps / follow-ups
<!-- Smoke gaps owed to the product owner, deferred slices, known limitations. -->
Recorded during the build (2026-09-28). The epic isn't closed yet, so the rest of this retro is written at close.

- **Board epic links resolve one folder too high.** `build-order.mjs` renders `../../<macro>/…` from
  `Roadmap/00-ideas/`: 30 links were broken on `main` before the move, and 37 are now. This predates the move and is
  a shared generator, so it's seeded as [`board-link-depth`](../../00-ideas/seeds/board-link-depth.md).
- **Duplicate `build_order` values 7 and 16** (pod-report / ai-adoption-maturity-lens seed; landing-redesign-v2 /
  scenarios-pm-operable) are older history and were left alone. The next renumber should fix them.
- **`golden-flags-by-default` has `stories_total: 0` / `stories: []`** despite six shipped stories. It was copied
  faithfully from dobby-foundation, and the backfill debt is for `doc-hygiene`.
- **`experiments-for-humans` fails `doc-format --check`**: no `phase:`, and its four sprint files have no frontmatter.
  The same drift is on `main`, and this repo's CI doesn't run the check. That's close-out debt from that epic.
- **`verify-module` (plugin seed, 54) overlaps `verify-spike` (37).** Both moved as they were. This is for the next
  portfolio pass.
- **`golden-beans-gfp-s2` was kept.** Its branch is merged (#162), and the only untracked item is `node_modules`, so
  it's safe to remove when the product owner says so.
