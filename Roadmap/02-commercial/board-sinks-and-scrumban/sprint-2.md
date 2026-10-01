---
epic: board-sinks-and-scrumban
sprint: 2
title: "The board on the Hub"
risk: low
phase: Shaping
stories_total: 4
stories:
  - id: S2.1
    title: "The board is computed, not drawn"
    as_a: "the Hub"
    i_want: "a pure `lib/hub-board.ts` that turns the latest roadmap artifact into six columns (Ready to build by `build_order`, Shipped = last 30 days), WIP counts, filters and the answer line (\"2 in QA and 1 building. Next to pull: …\")"
    so_that: "the page renders and the spec asserts the same arithmetic"
    risk: low
    status: planned
  - id: S2.2
    title: "A Board tab on the Hub"
    as_a: "the product owner"
    i_want: "`/hub/<slug>/board` in the hub frame (fourth hub tab, not a console section) rendering the approved `hub-board` and `hub-board-empty` states"
    so_that: "I see every initiative and its stage at a glance"
    risk: low
    status: planned
  - id: S2.3
    title: "A card opens to everything I need to act"
    as_a: "the product owner"
    i_want: "clicking a card to open a drawer (`?card=<slug>`) with the goal, stage, area, build order, type, risk, appetite, bet badge, sprint progress, links to the docs, the kickoff prompt (Ready to build) and the commands for its stage"
    so_that: "I can copy the kickoff or the next command without opening the repo"
    risk: low
    status: planned
  - id: S2.4
    title: "Filter by type and risk"
    as_a: "the product owner"
    i_want: "type chips (feature · spike · bug · chore) and a high-risk toggle, carried in the URL"
    so_that: "I can share a filtered board"
    risk: low
    status: planned
---
# One stage, every client: a six-stage board on the Hub, the CLI mod and every sink — Sprint 2: The board on the Hub

**Status:** ⬜ not started

## Build contract (locked by the architect before the builder started — README § Architecture lock)
- D7, D8, D19 (the Hub groups, never computes), D21 (the row fields it reads). `HubTab` gains `board`, ordered
  Roadmap · Board · Horizon · Report; DD2 holds (a fourth *hub* tab, not a console section).
- D23: `hub-board`, `hub-board-card`, `hub-board-empty` registered as `surfaces/*.surface`; the route-manifest row
  cites `hub-board`; approval lines are the product owner's.
- C1/C2: the self-tenant is `golden-beans-demo` and its board is public; gating is asserted on a non-demo slug.
- C10: share links do not reach the board in v1.
- Commands: `lib/stage-commands.ts`, one map keyed by stage, the `SESSION-KICKOFFS.md` verbs.

## Stories

### Story 2.1 — The board is computed, not drawn
**As** the Hub, **I want** a pure `lib/hub-board.ts` that turns the latest roadmap artifact into six columns (Ready to build by `build_order`, Shipped = last 30 days), WIP counts, filters and the answer line ("2 in QA and 1 building. Next to pull: …"), **so that** the page renders and the spec asserts the same arithmetic.
**Acceptance:** Unit spec over a fixture artifact: column membership, order, WIP over/under, answer-line words, filter results.
**Risk:** low

### Story 2.2 — A Board tab on the Hub
**As** the product owner, **I want** `/hub/<slug>/board` in the hub frame (fourth hub tab, not a console section) rendering the approved `hub-board` and `hub-board-empty` states, **so that** I see every initiative and its stage at a glance.
**Acceptance:** Membership-gated like the other hub pages (`requireDashboardAccess`); a share link scoped to the project also opens it; the page matches the approved surface blocks (state contract registered; design-drift guard green); column words exactly To groom · Grooming · Ready to build · Building · QA · Shipped.
**Risk:** low

### Story 2.3 — A card opens to everything I need to act
**As** the product owner, **I want** clicking a card to open a drawer (`?card=<slug>`) with the goal, stage, area, build order, type, risk, appetite, bet badge, sprint progress, links to the docs, the kickoff prompt (Ready to build) and the commands for its stage, **so that** I can copy the kickoff or the next command without opening the repo.
**Acceptance:** Commands come from one map in `lib/stage-commands.ts` keyed by stage, using the `SESSION-KICKOFFS.md` verbs (Groom, Build epic, Resume, Wrap S<N>, Review PR #<N>, Close epic, emit-epic-kickoff). Each copy button copies the exact text (browser spec); the drawer matches the approved `hub-board-card` state.
**Risk:** low

### Story 2.4 — Filter by type and risk
**As** the product owner, **I want** type chips (feature · spike · bug · chore) and a high-risk toggle, carried in the URL, **so that** I can share a filtered board.
**Acceptance:** Api spec: `?type=spike` returns only spikes; filters survive reload; cards are initiatives only (stories live in the drawer).
**Risk:** low

## Sprint QA
- **api spec(s):** S2.1 `lib/hub-board.test.ts`; S2.2/S2.4 `e2e/hub.spec.ts` (board route, gating, filters); S2.3 `stage-commands` unit spec + a browser spec for copy.
- **browser smoke owed:** yes, to Daniel: the board and drawer against the approved picture.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge (and `skills-ci` for anything under `skills/`).

## Sprint 2 — Smoke walkthrough (do these in order)
Env: production · https://goldenfrijoles.com   (or the preview URL while testing pre-merge)

1. Go to https://goldenfrijoles.com/hub/golden-beans-demo/board (the demo project — public by design, C2).
   → Six columns: To groom · Grooming · Ready to build · Building · QA · Shipped, and an answer line naming the next pull.
2. Click the first card in Ready to build.
   → A drawer opens with its goal, sprints, docs and a "Copy kickoff prompt" button.
3. Click "Copy kickoff prompt" and paste it into a text editor.
   → The same text `emit-epic-kickoff --epic <slug>` prints.
4. Click the Spike chip.
   → Only spikes remain; the URL now carries `?type=spike`.
5. In a private window, open https://goldenfrijoles.com/hub/golden-beans/board (a project that is NOT the demo).
   → You are sent to sign in. (The demo's board stays public — C2.)

If any step fails, note the step number + what you saw — that's the bug report.
