# Jev shadow report — the evidence behind the flip (2026-09-23)

Generated with `node scripts/jev-report.mjs` over every shadow decision there was. **This is the report the
S5.3 flip is gated on** (epic README D9, "the flip gate").

## Sources
- **Review rail:** the backtest, which replayed all **655** historical cross-review comments from the template
  repo and both consumers through `judgeReviewOutput` in shadow. On top of that come the live shadow runs on
  the consumer S4 PRs and the hidden `<!-- jev: -->` markers harvested from posted comments in all three repos.
- **Prose rail:** the prose backtest. All **186** committed `RETROSPECTIVE.md` files in the three repos were
  run through `judgeProse` in shadow, with the evidence `prose-draft` applies to close-out docs. The standup
  dry-runs from the medusa smoke are included too. There is no live routine prose traffic: every routine is
  disabled (sprint-4.md, smoke item 3).

## Agreement (all shadow traffic, measured at the shipped thresholds)

| rail | decisions | agreement | uncertain | could not look | disagreements |
|---|---|---|---|---|---|
| review | 663 | 99.7% | 0.5% | 0.0% | 2 |
| prose | 187 | 56.1% | — | 0.0% | 82 |

### Review: the 2 disagreements, labelled
| reply | regex | Jev | label | who was right |
|---|---|---|---|---|
| A vibe tool-call transcript that writes a review *plan* ("Plan created. Ready to execute.") | accepted | 0.07, not a review | **not a review** | Jev. The regex fired on a plan step, "3. Correctness check". |
| A builder's "review trail" summary table posted under the review header | rejected | 0.90, a review | **not a review** | the regex. It is not a reviewer's reply. *(It was excluded at first. Review of PR #39 caught that excluding the only false-pass-direction case overstated the gate, so it is now a fixture.)* |

### Prose: what the 82 disagreements are
| regex → Jev | files |
|---|---|
| `[]` → `[flag-state-claim]` | 67 |
| `[flag-state-claim]` → `[]` | 8 |
| `[]` → `[flag-state-claim, invented-commitment]` | 4 |
| other combinations | 3 |

Almost every prose disagreement is Jev finding a **liveness claim the regex's phrase list misses**. Examples:
"all 3 sprints to prod", "Live on prod 2026-07-01", "deployed and verified in production", "serves 100%
traffic", and "sellers can now turn their promos into real codes". By the guard's own definition these are
liveness claims: `prose-draft` passes no `liveFlags` for close-out docs. A sample of 96 of these real
sentences was labelled one by one and added to the eval fixtures as `retro-*` (see below).

## The flip gate: labelled accuracy (`node scripts/jev-eval.mjs`)

| rail | labelled cases | the judge (Jev + fallback) | the regex alone |
|---|---|---|---|
| review | 77: 63 real replies, anonymised, plus 14 failure shapes | **98.7%** | 87.0% |
| prose | 163: 62 spec and incident cases plus 101 real retro sentences | **86.5%** | 71.2% |

| prose family | judge | regex |
|---|---|---|
| unsupported-fix-claim | 99.4% | 98.8% |
| invented-beneficiary | 100.0% | 98.8% |
| flag-state-claim | 88.3% | 76.1% |
| invented-commitment | 98.8% | 97.5% |

**Result: Jev ≥ regex on every rail and on every family.** The gate passes, and both rails flip to `jev`.

### How far to trust these numbers
- **The labels are the builder's, not the product owner's.** D9 planned for the product owner to label the
  disagreements. For this run the product owner asked for promotion in the same session, so the builder
  labelled them, one case at a time, by the guard's written definitions. Every label is in
  `jev-eval.fixtures.json` and can be overruled. To relabel: change it, run `jev-eval --live`, and the gate
  re-measures.
- **The prose threshold (0.8) and the heading rule were chosen on these same fixtures.** The fairest
  held-out-ish figure uses the 62 fixtures that existed *before* the retro sentences were added. At the
  chosen threshold the judge scores **60/62** there and the regex **53/62**. Only the wording was tuned on
  those 62, not the threshold.
- **The prose rail's false-pass direction was examined.** The 8 retro files where the regex flagged liveness
  and Jev did not yielded 5 sentences. 3 are not claims: a conditional, a table header and a template comment,
  so there Jev is right. 2 are real claims Jev missed ("the admin can now edit…", "Shipped to prod
  2026-06-06"), so there the regex is right. All 5 are fixtures now.
- **Labelled checks the builder did not do alone.** The fresh reviewer spot-checked 13 retro labels against
  the definition and found them plausible. It also confirmed the labels are not Jev's answers copied back:
  12 of the 37 true labels are sentences Jev scored below the threshold.

## Thresholds, set from the data (S5.2)
The fixtures were recorded once and swept offline over the same answers. **Review:** every candidate pair made
zero Jev false passes on the labelled set. `real ≥ 0.85` is kept, as the conservative side of the dangerous
direction. `not-real` is widened from 0.15 to 0.3, which took decided-and-right from 75/76 to 76/76.
**Prose**, claim threshold against whole-draft accuracy:

| claim ≥ | 0.5 | 0.6 | 0.7 | 0.75 | **0.8** | 0.85 | 0.9 |
|---|---|---|---|---|---|---|---|
| judge (all 158) | 110 | 112 | 118 | 120 | **122** | 120 | 118 |
| regex (all 158) | 98 | 98 | 98 | 98 | 98 | 98 | 98 |

## Known consequence, stated rather than hidden
`prose-draft` gives close-out docs (retros, posters, sprint-wraps) **no `liveFlags`**. It always did, and the
regex already flagged "is live" in them. Because Jev catches the paraphrases too, a retrospective draft that
says, truthfully, that something is live in production will now be **flagged more often**. The flag is
advisory there (a banner, plus one revision pass), not a gate. The follow-up is to derive `liveFlags` for
close-out drafts from the epic's own `status: shipped`. It is recorded in the retrospective.
