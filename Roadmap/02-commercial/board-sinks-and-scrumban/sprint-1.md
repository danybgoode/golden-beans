---
epic: board-sinks-and-scrumban
sprint: 1
title: "One stage resolver"
risk: high
phase: Building
stories_total: 5
stories:
  - id: S1.1
    title: "Stage is one pure function"
    as_a: "every roadmap client"
    i_want: "`lib/stage.mjs` exporting the six stages (To groom · Grooming · Ready to build · Building · QA · Shipped) and a pure `resolveStage(row, gitFacts, prFacts)` that returns `{ stage, source }`"
    so_that: "no two clients can ever compute stage differently"
    risk: low
    status: planned
  - id: S1.2
    title: "The projection carries stage and the card's prose"
    as_a: "a sink"
    i_want: "`roadmap-extract` to emit `stage`, `stage_source`, `goal`, `sprints[]` (title, done, total), `links` (seed, README, sprints, retro), `pr` and, for Ready to build cards, `kickoff` (from `emit-epic-kickoff`), gathering git and GitHub facts once per run; `--offline` reads `.golden-frijoles/board.json` and stamps its age"
    so_that: "every sink gets the same card content from one run"
    risk: low
    status: planned
  - id: S1.3
    title: "The Hub re-renders on the event that moved the card"
    as_a: "the product owner"
    i_want: "`roadmap-push.yml` to run on `push`, `create` and `pull_request` (opened, ready_for_review, converted_to_draft, closed), and the envelope to accept an optional `board` block (WIP limits)"
    so_that: "a card moves within one CI run of the git or GitHub event, with nobody editing a doc"
    risk: high
    status: planned
  - id: S1.4
    title: "Starting a build is the trigger"
    as_a: "a builder session"
    i_want: "the epic kickoff's first instruction to create and push `feat/<slug>` before any other work"
    so_that: "Building is a git fact the moment work starts, not a status someone remembers to write"
    risk: low
    status: planned
  - id: S1.5
    title: "BUILD-ORDER.md speaks the six stages"
    as_a: "anyone reading the repo"
    i_want: "`build-order.mjs` to group by the six stages from the resolver, and doc-format to stop treating `phase:` or the prose `Status:` line as stage"
    so_that: "the terminal sink agrees with the Hub"
    risk: low
    status: planned
---
# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Sprint 1: One stage resolver

**Status:** 🏗 In progress

## Build contract (locked by the architect before the builder started — README § Architecture lock)
- **S1.1** — D13 is the rule, verbatim; D2's placement. `branchCandidates`/`parseBranch` move from `build-state.mjs`
  to `lib/work-branch.mjs` (build-state re-exports them, so its spec and the vendored hook keep working).
  `roadmap-status-buckets.mjs` re-exports `STAGES`. Fixtures: one per stage plus every D13 hard case (stacked
  `-s2` ready + `-s3` no PR, merged-and-kept branch, deleted branch, queued seed, archived epic, shipped epic with a
  stale branch, merged-not-closed, paused between sprints).
- **S1.2** — D14 (three fact modes, the snapshot holds facts), D15 (one extractor), D21 (the fields). One `git
  ls-remote` and one `gh pr list` per run, asserted with stubs. The kickoff comes through D17.
- **S1.3** — D18 (the workflow), C6 + D21 (`board` in the schema AND stored), D16 (skip an unchanged write).
  Schema spec: a v1 payload from before this epic and a new one both pass; `board` round-trips.
- **S1.4** — D17. The template's first step creates and pushes `feat/<slug>`; the per-sprint kickoff pushes
  `feat/<slug>-s<N>`.
- **S1.5** — C3 (committed file is docs-only; `--live` prints) and C4 (doc-format is not touched).
- **Live run, out loud, before S1.5 lands:** the resolver over this repo vs today's BUILD-ORDER.md, every
  difference listed in this file.

## Stories

### Story 1.1 — Stage is one pure function
**As** every roadmap client, **I want** `lib/stage.mjs` exporting the six stages (To groom · Grooming · Ready to build · Building · QA · Shipped) and a pure `resolveStage(row, gitFacts, prFacts)` that returns `{ stage, source }`, **so that** no two clients can ever compute stage differently.
**Acceptance:** Fixture spec with one initiative per stage plus the hard cases: a stacked epic (`-s2` PR ready, `-s3` branch with commits and no PR), an abandoned branch (merged or deleted, so it no longer counts as Building), a fixed-scope `queued` seed (Ready to build), an archived epic (off the board). `roadmap-status-buckets.mjs` re-exports the stages, so the old buckets have one home.
**Risk:** low

### Story 1.2 — The projection carries stage and the card's prose
**As** a sink, **I want** `roadmap-extract` to emit `stage`, `stage_source`, `goal`, `sprints[]` (title, done, total), `links` (seed, README, sprints, retro), `pr` and, for Ready to build cards, `kickoff` (from `emit-epic-kickoff`), gathering git and GitHub facts once per run; `--offline` reads `.golden-frijoles/board.json` and stamps its age, **so that** every sink gets the same card content from one run.
**Acceptance:** `node scripts/roadmap-extract.mjs` JSON contains the new fields; a run with no network falls back to the snapshot and marks `stage_source: snapshot@<iso>`; one `gh pr list --json` call per run (assert in a spec with a stubbed `gh`). The template extractor and this repo's delegating extractor agree (parity spec).
**Risk:** low

### Story 1.3 — The Hub re-renders on the event that moved the card
**As** the product owner, **I want** `roadmap-push.yml` to run on `push`, `create` and `pull_request` (opened, ready_for_review, converted_to_draft, closed), and the envelope to accept an optional `board` block (WIP limits), **so that** a card moves within one CI run of the git or GitHub event, with nobody editing a doc.
**Acceptance:** Workflow has `pull-requests: read`, concurrency per ref, and skips cleanly (exit 0) without the secret (fork PRs). The push route accepts the new fields without a `ROADMAP_SCHEMA_VERSION` bump (schema spec: an old v1 payload and a new one both pass).
**Risk:** high — shared infra (CI) + public push contract

### Story 1.4 — Starting a build is the trigger
**As** a builder session, **I want** the epic kickoff's first instruction to create and push `feat/<slug>` before any other work, **so that** Building is a git fact the moment work starts, not a status someone remembers to write.
**Acceptance:** `emit-epic-kickoff.mjs` output starts with the branch-push step (its test pins it). Per-sprint kickoffs push `feat/<slug>-s<N>`.
**Risk:** low

### Story 1.5 — BUILD-ORDER.md speaks the six stages
**As** anyone reading the repo, **I want** `build-order.mjs` to group by the six stages from the resolver, and doc-format to stop treating `phase:` or the prose `Status:` line as stage, **so that** the terminal sink agrees with the Hub.
**Acceptance:** BUILD-ORDER.md sections are the six stages in order; Ready to build sorted by `build_order`; the status-drift table is replaced by a "stage source" column. `build-order-guard.yml` stays green.
**Risk:** low

## Sprint QA
- **api spec(s):** S1.1 `scripts/lib/stage.test.mjs` (fixtures per stage + hard cases); S1.2 extractor parity + stubbed-`gh` spec; S1.3 `roadmap-artifact-schema.test.ts` old+new payloads; S1.4 `emit-epic-kickoff.test.mjs`; S1.5 `build-order` test.
- **browser smoke owed:** no.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge (and `skills-ci` for anything under `skills/`).

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. In the repo, run `node scripts/roadmap-extract.mjs | head -c 2000`.
   → Each row carries `stage` and `stage_source`; stages use only the six words.
2. Run `node scripts/build-order.mjs` and open `Roadmap/00-ideas/BUILD-ORDER.md`.
   → Six sections in order: To groom · Grooming · Ready to build · Building · QA · Shipped.
3. Generate a kickoff: `node skills/plugins/golden-frijoles/skills/groom/emit-epic-kickoff.mjs --epic cms-integration-spike | head -5`.
   → The first step creates and pushes `feat/cms-integration-spike`.
4. Mark any open epic PR "Ready for review" on GitHub, wait for the `roadmap-push` run to finish, then open https://goldenfrijoles.com/hub/golden-beans-demo.
   → The freshness line shows a push from that event (a minute ago).

If any step fails, note the step number + what you saw — that's the bug report.
