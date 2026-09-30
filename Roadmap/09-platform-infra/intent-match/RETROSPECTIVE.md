# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Retrospective

_Closed: 2026-09-30_
_Intent: yes | mostly | no_
<!-- Owed to the product owner: replace the line above with ONE word — did we build what you meant? This epic is
     scored (intent_match in its README), so `epic-dod` stays red on `intent-answered` until it is answered. -->

## What shipped

| Sprint | What | Ref |
|---|---|---|
| 1 — the scorer | `intent-match.mjs`: coverage in and out, clarity, teach-back, an uncalibrated total and band, a routed artifact per gap; "could not look" with no number; the wording measured on 37 labelled items (37 right, 32 decided) | danybgoode/golden-frijoles#196 · kit 0.10.0 |
| 2 — planning captures intent | the seed keeps the ask verbatim with claims and teach-back; groom Stage 3.5 and 4.6 (visuals from the shape of the ask); `intent-reader.mjs` — off by default, never Claude, one skip line on any failure | danybgoode/golden-frijoles#197 · kit 0.11.0 |
| 3 — learning from what shipped | `_Intent:` in the retro and `epic-dod`'s `intent-answered`; `intent-outcomes.mjs` across repos; 23 past epics backfilled (17 here, 6 in medusa-bonsai) | the S3 PR · danybgoode/miyagi-product-management#198 · kit 0.12.0 |

## What went well

- **The lock paid for itself.** Seven corrections (C1–C7) came from the live code before any code was written: the
  config loader has no `intentReader` shape, the scorer can't be a Jev rail, the ten-state taxonomy lives in a
  gitignored file, the cross-agent runners have no timeout, and a pitch holding its own ask would score itself.
- **Measuring the wording first.** The first coverage-out question was right on every labelled item but confident on
  only half. One rewording ("a detail of how the plan delivers it") took it from 4 to 6 of 8 decided.
- **The smoke found what the specs could not.** `TYPESAFE_API_KEY=` still scored, because the shared loader fell
  through to `.env.local`. Fixed at the source, for every Jev caller.
- **Dogfooding end to end.** This epic's own seed scored 89. The reader then ran live on it (codex, about 10 s,
  agreement 0.70–0.75). Its first question is S3's open item: who answers the backfill labels, and by when.

## What we learned

- **Change what a guard counts and its limit in the same commit.** The groom SKILL.md budget counted the
  `requires_scripts` list, which the closure checker forces to grow. Excluding the list was right. Keeping the limit
  at 220 while the measure dropped by 10 handed out 10 lines of room, and the next sprint used exactly those ten. The
  fresh reviewer caught it; the limit is now 210 under the new count.
- **Model output written into a document must be inert, and so must the fix.** A reader reply fenced inside our
  section carried its own `## ` headings; a re-run stacked a stale copy in the README while the walkthrough claimed
  "replaced, not stacked". Indenting the reply fixed that, and then the scanner's `\s*` fence rule made an odd
  indented fence swallow every later section. The fence rule is now CommonMark's (0–3 spaces). The secret guard runs
  before the reply leaves the process.
- **An unanchored ignore rule hides new files silently.** `references/`, meant for one local-only folder, hid a new
  skill reference in both the split repo and the monorepo. `git check-ignore -v <new file>` is the check.
- **Proxy asks are thin in older seeds.** Only 12 of 63 medusa-bonsai seeds carry a recoverable ask; the rest open
  with status blocks. Calibration will lean on golden-frijoles and on new, verbatim asks.
- **Regenerate the board with every sprint's docs.** Twice the pre-push hook refused a push because a plan or tick
  commit had not regenerated `BUILD-ORDER.md`.
- **Review with the external families gone.** Codex capped mid-epic (until 2026-10-19), agy ran out of quota on every
  model and vibe had no key. The fresh reviewer carried context independence and a security read, finding real
  defects in every round; the missing layer was said on each PR, and the `cross-review/*` statuses were set to DARK
  rather than left pending.

## Gaps / follow-ups

- **Owed to Daniel:** the one-word `_Intent:` answer for the 23 backfilled epics and this one (about fifteen
  minutes; `intent-outcomes` counts them toward 20); groom one real idea in Cowork to see the new seed and Stage
  3.5/4.6 end to end; read this epic's scored pitch and its reader reply.
- The agreement question and the route choice are unmeasured: there are no labelled reader replies or route labels.
- S2 and S3 had no second model family in review. Put the next reviews through a family when one returns (forward
  reviews only, no backtest).
- "Stories added" is unknown for epics whose README predates `stories_total`.
- The "disproved" correction counts every mention of the word, including a README describing the metric; treat it
  as noisy until it reads a structured marker.
