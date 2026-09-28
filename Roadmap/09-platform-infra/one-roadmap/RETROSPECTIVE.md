# One Roadmap — the plugin's epics, seeds, bets and learnings move here — Retrospective

_Closed: 2026-09-28_

## What shipped
<!-- The capability now live, by sprint, with commit/PR refs. -->
One board for the whole product. **golden-beans #177** (`3e32454`):
- The plugin repo's 6 epics, 12 seeds, 3 audits and 3 bets moved here.
- `build_order` renumbered 28–54 as ship history.
- 45 LEARNINGS entries and 9 poster lines added.
- The board link-depth bug seeded.

**golden-frijoles/skills #56** (`80d050a`):
- Its `Roadmap/` is now a pointer plus template sources.
- Its WAYS-OF-WORKING says planning lives here.

Three merged worktrees were removed. The same PR carried the `jev-reanchor-thresholds` spike decision (clean negative).

## What went well
- Measuring before pitching changed the plan. The seed's guesses ("most LEARNINGS are duplicates", "CI won't care")
  were both wrong: 45 of 75 entries were new, and four dobby-foundation CI checks read its Roadmap.
- The two-PR order (move first, then the pointer) meant the pointer never pointed at nothing.

## What we learned
<!-- Promote the durable, generalizable items to Roadmap/LEARNINGS.md (one-liner + why + date). Dedupe. -->
- **Dedupe by content, not by the lead.** Matching entries by their bold lead dropped a corollary that one repo had
  added to a shared entry. The fresh reviewer caught it. (Promoted.)
- **A `git stash` / `pop` round trip unstages `git rm` deletions.** The next commit silently left them out. Re-stage
  with `git add -u <path>` and check `git show --stat` before pushing. (Promoted.)
- **Cross-reviewing another repo's PR:** run `cross-review.mjs` from **that** repo's checkout, or it can't read the
  files at head. A deletion-heavy diff needs `--paths` to fit a 256 KB argv cap.

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
- **`golden-frijoles-plugin` shows 14/23 on the board.** Sprints 4 and 5 set `status: done` in frontmatter but never
  ticked their 8 `### Story` headings, and the count reads the ticks. This predates the move (dobby-foundation's
  board showed the same). It belongs to that epic's close-out.
- **Review coverage on skills #56:** codex was capped (until Oct 25) and agy failed its pin (1.2.12 vs 1.2.11:
  `agy-doctor --fix` owed). vibe ran on the 5 modified files; the 54 deletions were verified blob-by-blob by the
  fresh `pr-reviewer`.
