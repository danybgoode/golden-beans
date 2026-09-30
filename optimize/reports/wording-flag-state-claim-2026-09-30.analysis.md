# Wording run, `flag-state-claim`, 2026-09-30: analysis

Commentary on [`wording-flag-state-claim-2026-09-30.md`](wording-flag-state-claim-2026-09-30.md). That report is
regenerated from the cache on every run, so this lives beside it. **Live cost of the run:** 795 questions in
735 requests to `jev-1.13.0`, sent once with the product owner's OK. The current wording was never asked; its
answers are the stamped recordings. Every later run is served from the cache.

**Decision (product owner, 2026-09-30): not adopted.** The result is recorded in the seed's `## Wording result`.

**One more confound (fresh review of #208):** each candidate was asked ONE family per request, while the current
wording's recorded answers came from requests batched with the other three families. `parseCandidates` refuses a
copy of the current wording, so no same-shape control ran. The losses of 8 to 13 are too large for this confound
to explain, but it isn't isolated.

## The win is mostly leakage

The run followed D6 mechanically, and `examples-extended` passes it: +5 held out, and worse on no fold. **But the
held-out folds can't protect this candidate.** Its new TRUE and FALSE examples were written *after* reading the 19
errors on all 163 drafts, and several are lifted almost word for word from the missed sentences. Comparing it with
the current wording draft by draft:

| | Drafts | Contain a phrase the candidate borrowed |
|---|---|---|
| **Fixed** (wrong → right) | 10: retro-42, 51, 60, 62, 64, 68, 83, 99, 140, 141 | **9 of 10** ("100% traffic", "redeemable", "default-ON", "Shipped:", "minted the live coupon", "loads across every…") |
| **Broken** (right → wrong) | 5: retro-16, 23, 36, 116, rx-shipped-to-prod | 4 of 5 |

What the breaks show about the labels: **"shipped" alone is not a release claim, but "shipped *to prod*" and
"flag … ON *in prod*" are.** "**Shipped:** 2026-06-23" is labelled clean, while "Shipped to prod 2026-06-06" and
"Flag `…` ON in prod from day one" are labelled flag-state claims. The candidate's blanket "a shipped/status line is
FALSE" example contradicts that. So the real signal is the *production* qualifier, not the vocabulary.

**Verdict: a win on paper, not evidence of a better question.** Every other wording that reframes the question
without borrowed examples (runtime, needs-production-proof, short contrastive, reader belief) **loses by 8 to 13**.
That supports the spike's other hypothesis for this family: the fix is evidence and labels rather than wording.
Adopting `examples-extended` would probably score better on these 163 drafts and no better on new ones.

**To make it a real test:** label drafts the wordings never saw (the disagreements `jev-report --json` finds in
`.jev/decisions.jsonl` and the `<!-- jev: -->` markers), then score `current` against a new candidate written
without reading them. A candidate that encodes the "to prod / in prod" rule, not borrowed phrases, is the one
worth writing.
