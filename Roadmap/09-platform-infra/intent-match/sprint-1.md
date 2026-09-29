---
epic: intent-match
sprint: 1
title: "The scorer"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S1.1
    title: "`intent-match.mjs`: the score"
    as_a: "the product owner"
    i_want: "a script that reads a seed and prints coverage in, coverage out, clarity and teach-back, a total and a band"
    so_that: "I see how well a pitch matches my ask before I approve it"
    risk: low
    status: planned
  - id: S1.2
    title: "Gap routing"
    as_a: "the product owner"
    i_want: "each gap (an uncovered claim, an unclear criterion) routed to one artifact"
    so_that: "I know what to make next to close it"
    risk: low
    status: planned
  - id: S1.3
    title: "Measured wording"
    as_a: "a maintainer"
    i_want: "the question wording measured on labelled examples"
    so_that: "the score isn't a guess with a decimal point"
    risk: low
    status: planned
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 1: The scorer

**Status:** ⬜ not started

## Stories

### Story 1.1 — `intent-match.mjs`: the score
**As** the product owner, **I want** a script that reads a seed and prints coverage in, coverage out, clarity and teach-back, a total and a band, **so that** I see how well a pitch matches my ask before I approve it.
**Acceptance:** Each signal is one statistic over Jev Noul/Score answers (D2). The total is labelled "uncalibrated" and names the signals present. With no `TYPESAFE_API_KEY` or `egress` not true it prints "could not look" and no number. It prints the question count before asking. A pitch over Jev's state budget is "could not look", never truncated silently. Ships in the kit closure.
**Risk:** low

### Story 1.2 — Gap routing
**As** the product owner, **I want** each gap (an uncovered claim, an unclear criterion) routed to one artifact, **so that** I know what to make next to close it.
**Acceptance:** Jev Choice over: copy deck, wireframe, flow, data sample, state machine, sequence, container diagram, spike, think chain ("answer by hand" until `think-skills` ships). The vocabulary matches the visuals rule (S2.2). *(Cut line: first to go.)*
**Risk:** low

### Story 1.3 — Measured wording
**As** a maintainer, **I want** the question wording measured on labelled examples, **so that** the score isn't a guess with a decimal point.
**Acceptance:** A labelled fixture set (pitches from both repos, with known gaps) in the same shape as `jev-eval.fixtures.json`; recorded once with `jev-eval --live`; the chosen wording's decided/right counts are written into the script's comments, as `REVIEW_QUESTIONS` does.
**Risk:** low

## Sprint QA
- `node --test` with a replay client (no key, no egress); one `--live` record of the fixtures.
- Browser smoke owed: none.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. In a checkout, run `node scripts/intent-match.mjs Roadmap/00-ideas/seeds/intent-match.md`
   → it prints four components, a total marked "uncalibrated", a band, and a route for each gap.
2. Run it again with `TYPESAFE_API_KEY=` (empty)
   → it prints "could not look" and no number.

If any step fails, note the step number + what you saw — that's the bug report.
