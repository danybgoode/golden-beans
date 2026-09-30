---
epic: intent-match
sprint: 2
title: "Planning captures intent"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S2.1
    title: "The seed template keeps the ask"
    as_a: "the product owner"
    i_want: "my ask kept word for word in every pitch, with numbered claims I can edit and my teach-back answer"
    so_that: "the score compares against what I said, not a rewrite"
    risk: low
    status: done
  - id: S2.2
    title: "Groom Stage 3.5 and Stage 4.6"
    as_a: "the product owner"
    i_want: "groom to score each pitch and draw what its shape calls for"
    so_that: "I see the gaps and the system before I approve"
    risk: low
    status: done
  - id: S2.3
    title: "An optional reader at the lock"
    as_a: "the product owner"
    i_want: "an opt-in second-family read of the pitch at the lock that never gets in the way"
    so_that: "I can get another view when it's worth it, without stalls"
    risk: low
    status: done
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 2: Planning captures intent

**Status:** 🟦 In review

## Stories

### Story 2.1 — The seed template keeps the ask
**As** the product owner, **I want** my ask kept word for word in every pitch, with numbered claims I can edit and my teach-back answer, **so that** the score compares against what I said, not a rewrite.
**Acceptance:** `templates/scope-seed.md` gains "The ask, as given", "Claims", "Teach-back" and `## Visuals` (with a `surface` block example for a screen). `scaffold-epic` tests pass; the doc-format contract accepts the new sections and the `intent_match:` key.
**Risk:** low

### Story 2.2 — Groom Stage 3.5 and Stage 4.6
**As** the product owner, **I want** groom to score each pitch and draw what its shape calls for, **so that** I see the gaps and the system before I approve.
**Acceptance:** Stage 3.5 runs `intent-match.mjs` and writes `intent_match: <n>` + a `## Intent match` section. Stage 4.6 draws a system context (actors, systems, data flow) for every M/L bet, plus the triggered types in Mermaid (flow, state machine, sequence, container diagram), a data sample as a table, and a screen as a `surface` block (state, route, ordered blocks by kind with the words that matter; `sketch-specs` format) with its states named from the ten-state taxonomy. Advisory: nothing blocks the scope-doc gate.
**Risk:** low

### Story 2.3 — An optional reader at the lock
**As** the product owner, **I want** an opt-in second-family read of the pitch at the lock that never gets in the way, **so that** I can get another view when it's worth it, without stalls.
**Acceptance:** `intentReader` defaults to `off`. When on, the kickoff's lock step asks the first of codex, agy, vibe that answers, once, with a hard timeout. Any failure (missing CLI, quota, timeout, empty or unstructured reply) prints one "reader skipped: <why>" line and the lock continues. Never Claude. Agreement is written to the epic README when present. A spec covers each skip path.
**Risk:** low

## As built (2026-09-30)

- **2.1** `templates/scope-seed.md`: *The ask, as given* → *Claims* → *Teach-back*, `intent_ask:`/`intent_match:`, and
  `## Visuals` (a Mermaid system context and a `surface` block). A spec parses the template itself: its placeholder
  teach-back reads as unanswered, and the Visuals stay in the pitch without leaking into the criteria.
  `scaffold-epic` copies the seed's score into the README (7 cases specced, a mutation observed failing);
  `epic-README.md` carries `intent_match:`.
- **2.2** groom `SKILL.md`: Stage 1 keeps the ask, claims and teach-back; **Stage 3.5** runs the scorer
  (advisory); **Stage 4.6** the visuals table, the ten state names inline (C3) and D14's words. The Definition of
  Ready names both, as advisory.
- **2.3** `intent-reader.mjs` (+15 specs: off, never-Claude, pickFamily, each skip path — timeout, non-zero exit,
  empty, unstructured, cannot start, Jev not askable, Jev could not look/malformed, no seed/epic — usage, the happy
  path, agy/vibe argv and size limit). Six mutations each killed a spec. `lib/cross-agent-cli.mjs` exports
  `agyArgs`/`vibeArgs` (C4); `intent.reader` is a registry row in a new `intent` section (C1). The kickoff's step 1
  names the command.

**The prose ceiling (from S1 round 3):** groom `SKILL.md` must fit **210** hand-written prose lines (the
`requires_scripts` list no longer counts, and the limit dropped 220 → 210 with it). S2's stages are pointers; the table,
the formats and the ten states live in `references/intent-and-visuals.md`. To make room without loosening anything,
Stage 7 now points at the template's frontmatter instead of hand-copying a key list (the copy was already stale: it
lacked the two new keys) and Stage 8 no longer restates what the generated kickoff says. `skills/.gitignore`'s
unanchored `references/` rule silently hid the new file; it now ignores only the root folder (it hid nothing else).

**Deviations, named:** the agreement question joined `INTENT_QUESTIONS` (D13's one object) and is not measured —
there is no labelled set of reader replies yet. `writeIntoSeed`'s frontmatter and section writers were extracted
(`setFrontmatterKey`, `upsertIntentSection`) so the reader reuses them.

## Sprint QA
- Template, scaffold and kickoff tests; a groom dry run on a real seed.
- Owed to Daniel: read one scored pitch and say whether its gaps and its diagram are right.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

1. **Owed to Daniel (Cowork):** groom a new medium-sized idea.
   → the seed has your words verbatim under *The ask, as given*, numbered claims, your teach-back answer, a system
   diagram under `## Visuals`, and an `## Intent match` section with a score marked "uncalibrated".
2. Open https://github.com/danybgoode/golden-frijoles/blob/main/Roadmap/00-ideas/seeds/intent-match.md (after this
   merges) → the Mermaid system diagram renders as a picture, and `## Intent match` shows 89.
3. In a checkout, `node scripts/intent-reader.mjs --epic intent-match`
   → one line, `intent reader: off (intent.reader: "off") — no reader asked…`, instantly. *Ran 2026-09-30.*
4. Turn it on for one run: `echo '{ "intent": { "reader": "on" } }' > golden-frijoles.config.json`, run step 3's
   command again, then `rm golden-frijoles.config.json`
   → `intent reader: codex read the pitch — agreement 0.7x; total 8x (seed 89), written to …/README.md`, and the
   epic README's `## Intent match` shows the agreement, the reader's reply and the new total. *Ran 2026-09-30: codex in
   ~10 s, agreement 0.75 then 0.70 on a re-run (the section is replaced, not stacked).*
5. Same, with `--timeout 0.5` → `reader skipped: codex: timed out after 1s`, exit 0. *Ran 2026-09-30.*
6. **Owed to Daniel:** read this epic's scored pitch and its reader reply, and say whether the gaps (none) and the
   diagram are right. The reader's first question — who answers the 20–30 backfill labels, and by when — is S3's.

If any step fails, note the step number + what you saw — that's the bug report.
