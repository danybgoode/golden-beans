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
- **Reviewers that saw truncated diffs filed false Blocking findings** (agy on 0 whole files; Codex
  without `lib/flags.ts`). Each was answered from the file, not argued from the review.

## Gaps / follow-ups
- **Owed to Daniel:** publish `@golden-frijoles/sdk@0.6.0` (npm 2FA); record migrations
  `20260925100000` and `20260926100000` in `supabase_migrations.schema_migrations` (or `supabase db
  push` from `apps/web`); the production walkthroughs (Sprint 3 step 8 — Start; Sprint 4 step 4 —
  roll-out); confirm amendment A7; add `EXPERIMENT_BUILDER_ENABLED` to `ci.yml` (needs a
  `workflow`-scoped push) so CI runs the builder-on paths the local runs cover.
- **Deferred by design:** the cumulative chart (4.1's named first cut); screenshot upload (A4); a
  scheduled start date (A6).
- **Recorded follow-ups** (README, "Found during the build"): unpaged tars/ab reads; the flag-registry
  `.in()` URI overflow at ~200 flags; `IntervalBar` label collision at 360 px; the builder's in-tab
  stale binding; `loadBuilderPage` reading drafts one at a time; #172 round-8 nits (a 3+-arm "C, D and
  E" join, "Guardrails fine for B" while B's guardrail is still unknown, no guardrail warning in the
  decide dialog when shipping a non-lead arm).
