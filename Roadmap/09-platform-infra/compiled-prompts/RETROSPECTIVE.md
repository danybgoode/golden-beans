# Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured — Retrospective

_Closed: 2026-09-30_

## What shipped
- **S1** (#207, `dfdfaa4`, plugin/kit **v0.15.0**):
  - **Jev's questions are data.** They live in `scripts/lib/jev-questions/{review,prose,intent}.json`, in Jev's own
    wire shape, each with a `measured` block. The move provably changed nothing: the stamps were written from the
    old constants before the move, and replay stayed at 310/310.
  - **Every recording stamps the wording it answered.** Change one word and offline `jev-eval` fails, naming the
    question and `run --live`.
  - **`optimize/` is committed and dev-only.** `npm run optimize:refit` reproduces the ReAnchor spike (review kept
    0.85/0.30, prose kept 0.80, held-out 76 and 141), with a 16,264-check parity check against the real Node judges.
  - **A leak guard keeps Python out of the plugin, kit and mirror.**
- **S2** (#208, `4b4368a`, no release):
  - **`optimize/wording.mjs`** measures candidate wordings for one question on the spike's folds. It counts and asks
    before sending, caches answers pinned to the wording, the model and the draft, and applies D6's win rule.
  - **First run, `flag-state-claim`:** 795 questions. `examples-extended` passed D6 (146 vs 141), but the product
    owner declined it because the win is leakage. The result is in the seed's `## Wording result`.

## What went well
- **The lock disproved grooming before any code existed.** Five corrections: the question shape (choice and score
  questions exist), an existing hash guard to reuse, the wrong drift guard named, the live cost (795, not
  "thousands"), and no S2 release. None of them surfaced later as a surprise.
- **Commit order as proof.** Stamping the recordings from the old constants, then moving them, turned "the move is
  byte-identical" from a claim into a test that would go red.
- **The judges stayed in Node.** DSPy only ever saw one number per fixture, derived by asking the real judge. That
  made the parity check possible, and the fresh reviewer extended it to 80k checks at refit's own candidate
  thresholds.

## What we learned
- **A held-out rule is only as good as the author's blindness.** D6 (folds, a margin of 2, at most one worse fold)
  passed a candidate whose examples were copied from the drafts it then fixed: 9 of its 10 fixes. Folds protect
  against *fitting*, not against an author who read every fold. Wording tests need drafts the author has never seen.
- **Per-draft diffs, not totals, show what a wording learned.** The +5 was 10 fixes minus 5 breaks, and the breaks
  exposed the rule the labels actually encode ("shipped **to prod**" is a release claim; "Shipped:" alone isn't).
- **A comment that names a heading is an edit anchor.** The epic template's comment said `## Why`, so the grooming
  edit that fills in the Why section landed inside the comment and hid it in four epics before a reviewer rendered
  one. Fixed at the template, not the instance.
- **A paid-answer cache needs every key the answer depends on.** Four codex rounds on #208 found, one per round, the
  wording, the model, the draft text and a throwing client. Each was cheap to fix and expensive to miss.

## Gaps / follow-ups
- **The wording hash covers the question, not its framing.** The prose `{ sentence, question }` wrapper and intent's
  `{item}` substitution are code outside the hash (fresh review of #207). This is a wave-2 story.
- **No per-skill guard for hand-declared data edges** (`check-skill-scripts` walks imports only).
- **`flag-state-claim`'s next attempt:** label unseen drafts (`jev-report --json` disagreements), write one
  candidate that encodes the "to/in prod" qualifier without reading them, and score it on those drafts alone.
- **Intent `route` and `agreement` have no fixtures,** so a wording edit to either is unguarded (their `unmeasured`
  field says so).
- `backup/verify-spike-artifacts` (local only) holds the unrelated `f358af5` Apalache output that rode the first
  push. Keep or delete it; it's the product owner's commit.
