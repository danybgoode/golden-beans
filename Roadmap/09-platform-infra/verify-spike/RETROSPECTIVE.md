# Verify spike: Quint on the outbox, Lean on the flag evaluator — Retrospective

_Closed: 2026-09-29_

## What shipped
- **The decision** ([`DECISION.md`](DECISION.md)): Quint for protocols, Lean 4 (core) for pure functions.
  Productize per-PR simulation, nightly exhaustive checking, Lean only together with a differential
  test, and Jev routing by verify depth in shadow. This is the input `verify-module` was waiting on.
- **The evidence**, all reproducible from [`REPRODUCE.md`](REPRODUCE.md):
  - a 300-line Quint model of the outbox with 7 invariants in 3 variants (timed, untimed, and timed with
    the F2 fix), plus 4 counterexample traces;
  - a Lean model with 4 proved theorems and no `sorry`;
  - a differential test with 0 disagreements in 6,000 cases;
  - a 9-PR Jev triage log.
- **The fixes:**
  - F3 is pinned by a guard test, PR #194 (mutation-checked, reviewed by Codex and a fresh reviewer).
  - F2 is a bug seed whose fix is already model-checked.

## What went well
- **The model found what review hadn't.** The outbox had been through two dozen cross-review rounds.
  The model still found a stranded row in 1 s, and an unbounded, unlogged resend in 107 s of
  exhaustive search.
- **Stating the theorem was itself a finding.** "The explanation agrees with the verdict" is only true
  for a type-correct call. Writing it as a Lean statement forced that caveat into words.
- **Checking the checks paid off.** Mutation-checking the differential test showed the proofs could
  pass on a wrong model (F6). Mutation-checking the timing guard proved it fails on all three ways it
  should.

## What we learned
- **A proof verifies the model, not the code.** Without a differential test, a model using Lean's own
  `trim` disagreed with production on 8% of inputs, and every theorem still held.
- **Random simulation and exhaustive search find different bugs.** Simulation found F1 in a second and
  never found F2. F2 needs a specific 12-step trace, which only the exhaustive checker reached.
- **Grooming against the code reshaped the spike before it started.** Reading `flags.ts` at groom time
  dropped the determinism proof (the property holds trivially) and predicted the call-site gap that the
  proof later confirmed.
- **The session's own errors were all "the check passed for the wrong reason":**
  - `git show` on a merge commit sent Jev an empty diff;
  - a JSON key-order mismatch looked like 4,000 disagreements;
  - zsh's non-splitting `$var` ran nine model checks with no arguments and printed nine blank "results".

  Each looked like a result until it was read.

## Gaps / follow-ups
- **Trace validation was not reached.** It was the stretch goal, and DECISION § 2 records it as not evaluated.
- **F2** is a `risk: high` bug seed, fix sketch included:
  [`delivery-stale-reclaim-uncounted`](../../00-ideas/seeds/delivery-stale-reclaim-uncounted.md).
- **F1** is an accepted residual. It is invisible and loses nothing (DECISION § 4).
