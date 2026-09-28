---
epic: ways-of-work-lean-pass
sprint: 3
title: The ceremony diet and the derivable DoD
risk: low
phase: Shipped
stories_total: 5
stories:
  - id: S3.1
    title: "WAYS-OF-WORKING.md diet to ≤160 lines"
    as_a: a builder session
    i_want: orientation to cost a fraction of what it costs now
    so_that: the token budget goes to the work
    risk: low
    status: done
  - id: S3.2
    title: "groom/SKILL.md progressive disclosure to ≤220 lines"
    as_a: a groom session
    i_want: the stages up front and the reference material lazily loaded
    so_that: planning costs less and the stages are actually legible
    risk: low
    status: done
  - id: S3.3
    title: "epic-dod.mjs --check — script the derivable five"
    as_a: a closing agent
    i_want: the mechanical half of the epic DoD checked rather than recited
    so_that: the checklist is three lines of judgement instead of nine lines of recitation
    risk: low
    status: done
  - id: S3.4
    title: De-duplicate the escalate triggers
    as_a: a reader of any of these docs
    i_want: "the escalate-don't-guess trigger list in exactly one place"
    so_that: "the four copies can't drift into four different policies"
    risk: low
    status: done
  - id: S3.5
    title: Regenerate both consuming WAYS-OF-WORKING.md from the template
    as_a: the maintainer
    i_want: the consuming copies rendered from the template rather than forked
    so_that: dieting the template actually reaches the projects instead of widening the fork
    risk: high
    status: done
---
# Ways-of-work lean pass — Sprint 3: The ceremony diet and the derivable DoD

**Status:** ✅ shipped — danybgoode/dobby-foundation#17 · danybgoode/golden-beans#146 · danybgoode/miyagi-product-management#179

**Epic:** [Ways-of-work lean pass](README.md) · **Risk: MIXED (LOW + HIGH)** — S3.5 is HIGH (it rewrites two live consuming repos' process docs); the rest is LOW

**Wave 3 of 3.** Mechanical over decisions locked in Sprints 1–2, **except S3.5**, which is uphill and
stays on the stronger model.

**The rule for this whole sprint:** every cut paragraph is either **(a)** moved to `references/`,
**(b)** replaced by a check, or **(c)** explicitly listed in `RETROSPECTIVE.md` as deliberately
dropped. **No silent deletions** — quiet deletion is how "two cross-family passes" became policy
nobody could trace back to a decision.

## Stories

### Story 3.1 — `WAYS-OF-WORKING.md` diet to ≤160 lines
**As a** builder session, **I want** orientation to cost a fraction of what it costs now,
**so that** the token budget goes to the work.
**Acceptance:** ≤160 lines, from 446. *Epic-mode builds* becomes five sentences (lock `D1…Dn`, stack
branches, route models by risk, pre-authorized merges, derive-don't-store). *Betting & appetite*
keeps the table and four rules; the Shape Up philosophy moves to `references/shapeup/`. *Review &
merge* is already rewritten by S2.1. *Conventions* keeps only what cannot be a check — the
path-limited-commit and worktree-per-planner rules become a **pre-commit check**, not a bullet a
builder must remember. Nothing load-bearing is lost: the (a)/(b)/(c) ledger proves it.
**Risk:** low

### Story 3.2 — `groom/SKILL.md` progressive disclosure to ≤220 lines
**As a** groom session, **I want** the stages up front and the reference material lazily loaded,
**so that** planning costs less and the stages are actually legible.
**Acceptance:** ≤220 lines, from 514. Stages stay in `SKILL.md`; the Stage-3 question bank, the
archetype table and the Stage-6b kill-switch taxonomy move to `references/`. This is the ladder's own
Step-3 guidance — *"breaking up `CLAUDE.md` into lazy Skills"* — applied to ourselves. The generator
paths and the GENERATORS-NOT-FOUND stop rule are **untouched**; they are the thing that keeps Stage 7
from being hand-written.
**Risk:** low

### Story 3.3 — `epic-dod.mjs --check` — script the derivable five
**As a** closing agent, **I want** the mechanical half of the epic DoD checked rather than recited,
**so that** the checklist is three lines of judgement instead of nine lines of recitation.
**Acceptance:** `node scripts/epic-dod.mjs --check <epic>` derives sprints-merged, README-✅,
sprint-statuses-ticked, retro-exists and branch-deleted from git + frontmatter + file existence, and
reports correctly on a known-closed epic **and** a known-open one. The three items needing judgement
(poster update, retro content, kill-switch verification) stay as prose. It copies
`check-plugin-leaks.mjs`'s discipline: green on today's known state, red on anything new, and a stale
ledger entry fails too.
**Risk:** low

### Story 3.4 — De-duplicate the escalate triggers
**As a** reader of any of these docs, **I want** the escalate-don't-guess trigger list in exactly one
place, **so that** the four copies can't drift into four different policies.
**Acceptance:** the list (money / auth / migrations / shared infra / plan ambiguity / 2+ failed
attempts) appears **exactly once** across the plugin and template; the other three sites reference it.
Same treatment for the kill-switch polarity rule, which currently appears in `groom` Stage 6b, the
seed template, the epic DoD and medusa's `flags.mjs` header.
**Risk:** low

### Story 3.5 — Regenerate both consuming `WAYS-OF-WORKING.md` from the template
**As the** maintainer, **I want** the consuming copies rendered from the template rather than forked,
**so that** dieting the template actually reaches the projects instead of widening the fork.
**Acceptance:**
- `TEMPLATE FILL-IN` markers become **named slots**; each consuming project commits a
  `roadmap/fill-ins.yml` (deploy rail, tooling table, language policy, flag mechanism, repo list).
- `node scripts/render-ways-of-working.mjs` produces the consuming file, and **re-running it with no
  source change is a byte-for-byte no-op** — the same reproducibility discipline `pack-skills.mjs`
  already has, so regeneration is boring rather than noisy.
- `golden-beans/scripts/check-template-drift.mjs` is extended to fail not only on an *unfilled*
  placeholder but on a rendered file that has **drifted from what the renderer would produce**.
- **Both consuming files are diffed against their rendered form before the switch**, and every
  genuinely project-specific paragraph either becomes a named slot or is listed in the retro as
  deliberately dropped.
**Risk:** high — **this is the single most likely place this epic quietly loses content.** Two mature
repos have been hand-editing these files for months.

## Sprint QA
- **api spec(s):** unit tests for `epic-dod.mjs` (closed epic / open epic / stale-ledger fixtures) and
  for the renderer's **no-op guarantee** (render twice, assert byte-identical).
- **browser smoke owed:** no.
- **deterministic gate:** `node --test 'scripts/*.test.mjs'` + `check-skill-scripts.mjs` still green
  after the doc cuts + `check-template-drift.mjs` green in `golden-beans`.

## Sprint 3 — Smoke walkthrough (do these in order)
Env: local, across `dobby-foundation`, `medusa-bonsai` and `golden-beans`

1. In `dobby-foundation`, run `wc -l template/Roadmap/WAYS-OF-WORKING.md plugins/ways-of-work/skills/groom/SKILL.md`.
   → ≤160 and ≤220 respectively (from 446 and 514).
2. Open `RETROSPECTIVE.md` and find the cut ledger.
   → Every removed paragraph is listed as moved, replaced-by-a-check, or deliberately dropped.
3. Run `grep -rn "2+ failed attempts" plugins/ template/ --exclude=WAYS-OF-WORKING.md | wc -l`.
   → **1** — the template source; its generated render (excluded) carries the same single list.
4. In **medusa-bonsai** (where that epic lives), run `node scripts/epic-dod.mjs --check 09-platform-infra/dobby-foundation` (a known-closed epic).
   → All derivable items pass.
5. Run it against this epic while it's still open.
   → It correctly reports what is outstanding, and does not claim the epic is done.
6. In `golden-beans`, run `node scripts/render-ways-of-working.mjs` twice.
   → The second run changes nothing — `git status` is clean.
7. Hand-edit one line of the rendered `golden-beans/Roadmap/WAYS-OF-WORKING.md` and run `npm run check:template-drift`.
   → It **fails**, naming the drift. *(Then revert.)*
8. Start a fresh builder session in `medusa-bonsai` and let it orient.
   → It reads the regenerated docs, finds its project-specific values (deploy rail, tooling table,
     language policy) correctly filled from `fill-ins.yml`, and nothing reads as a missing placeholder.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 7 is what makes regeneration stick.** Without drift detection, the forks reappear within a month.
