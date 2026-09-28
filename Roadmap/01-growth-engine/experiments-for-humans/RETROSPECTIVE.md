# Experiments for humans — Retrospective

_Closed: 2026-09-25_

## What shipped
A product person now runs an experiment by answering five questions — no JSON — and reads a page that
says what to do next. All four sprints are live in production (goldenfrijoles.com), the builder gate is
ON, and the JSON authoring box is gone.

- **Sprint 1** — danybgoode/golden-beans#167 (`7f81540`): the definition widened to human labels and
  one-of eligibility (migration `20260925100000`, applied + probed before merge); D2 = A, a *served
  binding* — flag versions carry `experiment_key/version/rules` and the SDK stamps exposures from
  them (SDK 0.6.0); the second approved prototype registered as a design source.
- **Sprint 2** — danybgoode/golden-beans#169 (`bf62913`): the event catalog (paged — PostgREST caps at
  1,000 rows) and the planner, the one seam every later story imports: answers → definition + flag
  version + six checks, D4's priority spacing (FNV correlation made adjacent priorities collide).
- **Sprint 3** — danybgoode/golden-beans#170 (`e05d677`): the builder (six steps, zero free text),
  `save_experiment_draft` (append-only answers, idempotent, SECURITY DEFINER, migration
  `20260926100000` applied + probed before merge), and Start — re-planned on the server, running first
  then serving, activation guarded by a revision-first compare-and-set that never rolls back a change.
- **Sprint 4** — danybgoode/golden-beans#172 (`bb25522`): the decision-first page (answer → lift +
  verdict → KPIs → "How sure we are" + "Who saw what"), decide in chips (stop → record → roll out, each
  its own write, 10-second undo), "Change the plan" as version n+1, and the retirement of the JSON
  manager with a guard that fails if a `<textarea>` returns.

## What went well
- **Locking the architecture against live data paid off early.** D4's priority correction (FNV
  correlation) and D7's answers table were found by the lock, before a builder touched them.
- **Every Production-write guard is pinned by a spec that was mutation-checked** — revision-first
  activation, "moved" refusals, the decision-to-variant tie, rollout/undo on the named version, the
  retirement guard. Several reviewers independently confirmed the specs fail when the property breaks.
- **Review converged on real defects, then on nothing.** #170 took five rounds, #172 eight; the last
  round of each was clean from two independent reviewers. Most rounds found a real product defect.

## What we learned
- **A fix to a shared seam is not done until every caller of that seam is fixed.** #172 round 2 made
  the roll-out load the *named* version; undo and retry still loaded the *latest* — found a round later.
- **A fix must be as narrow as the finding's cause, and pinned by the case the over-broad fix fails.**
  Twice in #172 a fix over-corrected (the stopped gate hid every blocker on a short sample; a guardrail
  harmed by one arm was pinned on another) and each cost a round.
- **Content equality is not a safe precondition for overwriting shared state.** Start compared stripped
  definitions ("same base"); rollout and undo change the feature on purpose, so they needed
  "replace exactly version X" — and the server, not the page, must be the one to insist.
- **A delegate that runs out of quota mid-task leaves a plausible, partial tree.** Codex's S4 page
  compiled and looked right, and had dropped a legacy route, the error pages and drafts, and drawn
  owner controls for members. The architect re-derived it rather than finishing it.
- **A gate kept OFF in CI hides everything behind it — including defects that are not the gate's.**
  CI ran the builder dark for the whole epic, so the builder's authed specs skipped there. The first
  builder-ON run found a shell overflow bug that predates the epic and a spec polluting a shared
  tenant. Match CI's gate state to Production's the day Production flips.
- **Reviewers that saw truncated diffs filed false Blocking findings** (agy on 0 whole files; Codex
  without `lib/flags.ts`). Each was answered from the file, not argued from the review.

## Gaps / follow-ups
- **Resolved after close (2026-09-26):**
  - `@golden-frijoles/sdk@0.6.0` **published** by Daniel (npm shows `0.6.0`).
  - Both migrations **recorded**: `supabase db push` re-ran `20260925100000`, which is idempotent (a
    `CREATE OR REPLACE FUNCTION` plus a `REVOKE`), then stopped on the hand-applied `20260926100000`
    ("already exists", rolled back). `supabase migration repair --status applied 20260926100000`
    recorded it without running it. `migration list` now shows both on both sides.
  - The **production walkthroughs** (Sprint 3 step 8 — Start; Sprint 4 step 4 — roll-out) were
    **done by Daniel**.
  - **CI runs the builder ON** (danybgoode/golden-beans#174, `d1bd878`), matching Production. Turning
    it on exposed three things the gate-off CI could not: a real shell bug (the project switcher's
    flex `min-width: auto` defeated its ellipsis and overflowed a 360px screen for any owner of 2+
    projects), a builder spec saving into the shared authed tenant another spec asserts on, and a
    time-seeding race in the results spec. All three are fixed there.
- **Still open:** amendment **A7** (check 5 blocks Start only on a count) is recorded for Daniel to
  confirm. It is reversible in one line, and the shipped behaviour is A7's.
- **Deferred by design:** the cumulative chart (4.1's named first cut); screenshot upload (A4); a
  scheduled start date (A6).
- **Recorded follow-ups** (README, "Found during the build"): unpaged tars/ab reads; the flag-registry
  `.in()` URI overflow at ~200 flags; `IntervalBar` label collision at 360 px; the builder's in-tab
  stale binding; `loadBuilderPage` reading drafts one at a time; #172 round-8 nits (a 3+-arm "C, D and
  E" join, "Guardrails fine for B" while B's guardrail is still unknown, no guardrail warning in the
  decide dialog when shipping a non-lead arm).
