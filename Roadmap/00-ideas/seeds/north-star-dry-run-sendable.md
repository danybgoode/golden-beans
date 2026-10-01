---
title: "gf north-star set --json: say whether --yes would be accepted"
slug: north-star-dry-run-sendable
status: raw
area: "09"
type: feature
priority: unranked
appetite: S
underwritten_by: null
risk: low
epic: null
build_order: null
updated: 2026-10-01
---

# Seed: gf north-star set --json says whether --yes would be accepted

Found by `think-skills` (#216, fresh pr-reviewer round 2).

## Problem

The human dry run of `gf north-star set` ends with a verdict: either "Run again with --yes", or why `--yes` would be
refused (unfilled `<…>` placeholders, or an input whose value source would change). The `--json` dry run carries no
such field. An agent has to rebuild the verdict from `inputs[].change` (`refused: …`) and `unfilled`, which is the
"parse the prose" problem the CLI's `--json` contract exists to avoid.

## Sketch

- Add `sendable: boolean` and `blockers: string[]` to the dry-run JSON, computed by the same `nextStep` logic in
  `packages/cli/src/commands/north-star.ts`, so there is one source for both outputs.
- Re-record the goldens if `--help` changes, and add a test per blocker kind. A CLI release, which is a patch bump.

## Acceptance (draft)

- `gf north-star set <file> --json` on an unfilled template prints `"sendable": false` with a `placeholders` blocker.
  With a value-source change it prints `"sendable": false` with that input's key. On a clean file, `"sendable": true`.
