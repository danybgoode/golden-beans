---
title: "The docs name a kickoff-generator path that does not exist in an installed repo"
slug: kickoff-generator-path
status: raw
area: "09"
type: bug
priority: unranked
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-10-02
---

# Seed: the docs name a kickoff-generator path that does not exist

Found by the fresh `pr-reviewer` on #226 (board-sinks-and-scrumban S2).

## Problem

Nine docs tell a builder to run `node skills/groom/emit-epic-kickoff.mjs --epic <slug>` — `Roadmap/SESSION-KICKOFFS.md:47`,
`Roadmap/WAYS-OF-WORKING(.template).md` and their copies under `skills/` and `skills/template/` (nine, `git grep`), plus
this epic's own README and sprint-1. That path exists only relative to the plugin's own
folder. From this repo's root the generator is `skills/plugins/golden-frijoles/skills/groom/emit-epic-kickoff.mjs`; in
an installed project it lives under the plugin cache (the groom skill reaches it through `$GROOM`). Copied as written,
it fails with `MODULE_NOT_FOUND`. The Hub board dropped its "Regenerate the kickoff" command rather than copy it.

## Sketch

- Say it the way the groom skill does (`node "$GROOM/emit-epic-kickoff.mjs" --epic <slug>`, with where `$GROOM` comes
  from), or ship the generator in the kit so `npx -y @golden-frijoles/kit emit-epic-kickoff --epic <slug>` works anywhere.
- Fix the template source and re-render (`render-ways-of-working.mjs`); the template copies are byte-checked.
