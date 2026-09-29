---
epic: intent-match
sprint: 2
title: "Planning captures intent"
risk: low
phase: Shaping
stories_total: 3
stories:
  - id: S2.1
    title: "The seed template keeps the ask"
    as_a: "the product owner"
    i_want: "my ask kept word for word in every pitch, with numbered claims I can edit and my teach-back answer"
    so_that: "the score compares against what I said, not a rewrite"
    risk: low
    status: planned
  - id: S2.2
    title: "Groom Stage 3.5 and Stage 4.6"
    as_a: "the product owner"
    i_want: "groom to score each pitch and draw what its shape calls for"
    so_that: "I see the gaps and the system before I approve"
    risk: low
    status: planned
  - id: S2.3
    title: "An optional reader at the lock"
    as_a: "the product owner"
    i_want: "an opt-in second-family read of the pitch at the lock that never gets in the way"
    so_that: "I can get another view when it's worth it, without stalls"
    risk: low
    status: planned
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 2: Planning captures intent

**Status:** ⬜ not started

## Stories

### Story 2.1 — The seed template keeps the ask
**As** the product owner, **I want** my ask kept word for word in every pitch, with numbered claims I can edit and my teach-back answer, **so that** the score compares against what I said, not a rewrite.
**Acceptance:** `templates/scope-seed.md` gains "The ask, as given", "Claims", "Teach-back" and `## Visuals`. `scaffold-epic` tests pass; the doc-format contract accepts the new sections and the `intent_match:` key.
**Risk:** low

### Story 2.2 — Groom Stage 3.5 and Stage 4.6
**As** the product owner, **I want** groom to score each pitch and draw what its shape calls for, **so that** I see the gaps and the system before I approve.
**Acceptance:** Stage 3.5 runs `intent-match.mjs` and writes `intent_match: <n>` + a `## Intent match` section. Stage 4.6 draws a system context (actors, systems, data flow) for every M/L bet, plus the triggered types (wireframe, flow, data sample, state machine, sequence, container diagram) in Mermaid. Advisory: nothing blocks the scope-doc gate.
**Risk:** low

### Story 2.3 — An optional reader at the lock
**As** the product owner, **I want** an opt-in second-family read of the pitch at the lock that never gets in the way, **so that** I can get another view when it's worth it, without stalls.
**Acceptance:** `intentReader` defaults to `off`. When on, the kickoff's lock step asks the first of codex, agy, vibe that answers, once, with a hard timeout. Any failure (missing CLI, quota, timeout, empty or unstructured reply) prints one "reader skipped: <why>" line and the lock continues. Never Claude. Agreement is written to the epic README when present. A spec covers each skip path.
**Risk:** low

## Sprint QA
- Template, scaffold and kickoff tests; a groom dry run on a real seed.
- Owed to Daniel: read one scored pitch and say whether its gaps and its diagram are right.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. Groom a new medium-sized idea in Cowork.
   → the pitch has your words verbatim, a system diagram, and an Intent match section with a score marked "uncalibrated".
2. Open that seed on https://github.com/danybgoode/golden-frijoles (after the plan is pushed)
   → the Mermaid diagram renders as a picture.
3. With `intentReader` off, run the epic kickoff's lock step.
   → no reader runs and nothing waits.

If any step fails, note the step number + what you saw — that's the bug report.
