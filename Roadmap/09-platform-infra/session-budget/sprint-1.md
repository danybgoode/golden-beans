---
epic: session-budget
sprint: 1
title: "The rule and the line"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S1.1
    title: "The rule, reworded everywhere"
    as_a: "the product owner"
    i_want: "\"one deep ask per approval gate\" written the same way in every place the old rule lived"
    so_that: "my decisions set the pace, and no file contradicts another"
    risk: low
    status: built
  - id: S1.2
    title: "The session line"
    as_a: "the product owner"
    i_want: "a status line under the build view saying how full the session is and whether to keep going"
    so_that: "I know when to checkpoint or hand off without guessing"
    risk: low
    status: built
  - id: S1.3
    title: "The line at each groom gate in Cowork"
    as_a: "the product owner"
    i_want: "each approval gate in a Cowork planning session to end with the same line"
    so_that: "I see my decision load where planning happens, too"
    risk: low
    status: built
---
# Session budget — one deep ask per approval gate, plus a measured line — Sprint 1: The rule and the line

**Status:** 🟦 In review

## Stories

### Story 1.1 — The rule, reworded everywhere
**As** the product owner, **I want** "one deep ask per approval gate" written the same way in every place the old rule lived, **so that** my decisions set the pace, and no file contradicts another.
**Acceptance:** The new wording (D1) replaces the old in groom `SKILL.md` (both guardrail lines and Stage 9's "own fresh session"), `references/backlog-cadence.md`, `Roadmap/fill-ins.yml`, and `LEARNINGS.md:1486` (sharpened, not appended). `node scripts/render-ways-of-working.mjs --check` passes. `grep -rn "one \*deep\* ask per run" skills Roadmap` finds nothing.
**Risk:** low

### Story 1.2 — The session line
**As** the product owner, **I want** a status line under the build view saying how full the session is and whether to keep going, **so that** I know when to checkpoint or hand off without guessing.
**Acceptance:** `sessionVerdict()` is pure, with thresholds in one table (D3) and tests on every edge and on null figures (D4). The mod listens to `session.measure`, reads `$.session.usage()`, and shows e.g. `Session 48% · 5h 23% · 2 asks open → keep going`. It never compacts or ends anything (D5). Each verdict change appends a row to `.golden-frijoles/session-budget.jsonl`, which is gitignored.
**Risk:** low

### Story 1.3 — The line at each groom gate in Cowork
**As** the product owner, **I want** each approval gate in a Cowork planning session to end with the same line, **so that** I see my decision load where planning happens, too.
**Acceptance:** Groom's gate step prints asks open, questions waiting, gates passed, "context: not measured here", and the verdict from the same thresholds. A hand-off verdict prints `backlog-cadence.md`'s next-session prompt. The verdict acted on is journaled with `session-note.mjs`.
**Risk:** low

## Sprint QA
- `node --test` for `sessionVerdict()` (every threshold edge, null figures) and the mod's pure half; `render-ways-of-working --check`.
- Owed to Daniel: watch the line through one real build session and one groom session.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

1. Open https://github.com/danybgoode/golden-frijoles/blob/main/skills/plugins/golden-frijoles/skills/groom/SKILL.md after the merge.
   → it says "one deep ask per approval gate"; searching the page for "per run" finds nothing about asks.
2. Update the plugin, then open Claude Code (with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, as this repo's `.claude/settings.json` sets) on any `feat/*` branch and send one message.
   → under the build view, a `Session …%` line appears with a verdict.
3. Keep working until the session passes 60% context.
   → the verdict changes to checkpoint.
4. In Cowork, groom any seed to its approval gate.
   → the gate ends with one line: asks open, questions waiting, "context: not measured here", and a verdict.

If any step fails, note the step number + what you saw — that's the bug report.
