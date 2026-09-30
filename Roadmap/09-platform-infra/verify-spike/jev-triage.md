# Jev triage, in shadow — verify-spike S1.3

**What was asked:** Jev (`jev-1.13.0`, via `scripts/lib/jev.mjs`, with `egress: true` in `jev.config.json`)
answered the four triage questions for every merged PR on `main` that touched the outbox or the flag
evaluator: 9 PRs. It received the two specs' one-paragraph summaries, the PR title, and the PR's diff
on those paths only, diffed against the first parent (60 KB cap; one diff was truncated). **Nothing
gated on the answers.** Raw answers: [`jev-triage/answers.json`](jev-triage/answers.json). Re-run:
`node Roadmap/09-platform-infra/verify-spike/jev-triage/run.mjs`.

**Cost:** 9 calls, 2 s total wall clock, ~57k input tokens and ~2k output tokens.

The builder's own answer is on the right of each column pair (B). It was written by reading each
diff, and it is the reference Jev is measured against.

| PR             | What it changed on the specified paths                      | touches spec (Jev p / B) | counterexample class (Jev / B)    | obligation (Jev / B)       | verify depth (Jev / B)  |
| -------------- | ----------------------------------------------------------- | ------------------------ | --------------------------------- | -------------------------- | ----------------------- |
| `7f81540` #167 | adds `rulePriority` to the verdict                          | 0.45 / yes               | explain-verdict / explain-verdict | update spec / new property | **standard / standard** |
| `20cecfb` #137 | read-side select of `destination_id` in `deliveries.ts`     | 0.20 / no                | none / none                       | none / none                | light / off             |
| `0a0beb0` #96  | a one-line rename in `flags.ts`                             | 0.08 / no                | none / none                       | none / none                | **off / off**           |
| `b473d13` #90  | splits the matcher, adds `explainFlagEvaluation`            | 0.56 / yes               | explain-verdict / explain-verdict | update spec / new property | standard / deep         |
| `c258a18` #58  | webhook transport moved to `guarded-http` (DNS pinning)     | 0.21 / no                | stuck row / none                      | update spec / rerun        | standard / light        |
| `bc1abba` #39  | introduces `evaluateFlag`                                   | 0.48 / yes               | explain-verdict / explain-verdict | update spec / new property | **deep / deep**         |
| `9977c5a`      | comment-only edit to a migration                            | 0.18 / no                | none / none                       | none / none                | light / off             |
| `015eae4` #16  | claim, settle, retry, replay, health, fan-out serialization | 0.79 / yes               | **stuck row** / duplicate send    | update spec / new property | **deep / deep**         |
| `ce65993` #15  | creates the outbox and the dispatcher                       | 0.58 / yes               | stuck row / stuck row             | update spec / new property | **deep / deep**         |

**Two runs, same answers where it matters.** The table is from the second run (2026-09-29), after the
dispatch route (`maxDuration`, `TICK_BUDGET_MS`) was added to the paths. That changed what Jev saw of
`015eae4`, whose diff is cut at 60 KB. The PR set was unchanged. **`verify_depth` was identical on
all 9 PRs across both runs.** `touches_spec` moved by at most 0.09, and one counterexample class
changed (`c258a18`: other → stuck row).

## Verdict — usable for ONE of the four questions

- **Verify depth is usable as a router.** It matched exactly on 5 of 9 PRs, was one level off on the
  other 4, and was never two levels off. It never rated a protocol-changing PR below `standard`. Three
  of the four misses over-called, which is the safe direction for a router. One under-called: `b473d13`
  (#90) got `standard` where the builder said `deep`. That one should be watched in shadow.
- **`touches_spec` ranks correctly but is not calibrated.** Every spec-changing PR scored 0.45–0.79
  and every other PR scored 0.08–0.21, so a threshold near 0.35 separates this sample perfectly. No
  PR came near the review rail's 0.85 bar, though, so it cannot gate at the existing thresholds. Nine
  PRs are too few to set a threshold. The next step is to label more PRs, as the review rail did
  (74/76 on its fixtures).
- **The counterexample class is plausible but not decision-relevant.** Jev named `stuck row` for
  `015eae4`, the PR whose code the model found F1 (a stranded `in_flight` row) in. It missed the
  duplicate-send class of F2 in the same PR. Nothing downstream would act on this answer.
- **The obligation question does not discriminate.** Jev answered `update_spec` for every spec-changing PR
  and never `new_property`, even for the PRs that created the specified behaviour. **Drop it.**

**What `verify-module` should take from this:** a Jev router asking _verify depth_ (plus
_touches spec_ as a ranked signal, run in shadow until it has a measured threshold) is worth
building. The other two questions are not.
