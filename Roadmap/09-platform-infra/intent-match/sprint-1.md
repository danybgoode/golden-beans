---
epic: intent-match
sprint: 1
title: "The scorer"
risk: low
phase: In review
stories_total: 3
stories:
  - id: S1.1
    title: "`intent-match.mjs`: the score"
    as_a: "the product owner"
    i_want: "a script that reads a seed and prints coverage in, coverage out, clarity and teach-back, a total and a band"
    so_that: "I see how well a pitch matches my ask before I approve it"
    risk: low
    status: done
  - id: S1.2
    title: "Gap routing"
    as_a: "the product owner"
    i_want: "each gap (an uncovered claim, an unclear criterion) routed to one artifact"
    so_that: "I know what to make next to close it"
    risk: low
    status: done
  - id: S1.3
    title: "Measured wording"
    as_a: "a maintainer"
    i_want: "the question wording measured on labelled examples"
    so_that: "the score isn't a guess with a decimal point"
    risk: low
    status: done
---
# Intent match (wave 1, advisory) — a score for how well the plan captured the ask, routed follow-ups, and a rule for visuals — Sprint 1: The scorer

**Status:** 🟦 In review

## Stories

### Story 1.1 — `intent-match.mjs`: the score
**As** the product owner, **I want** a script that reads a seed and prints coverage in, coverage out, clarity and teach-back, a total and a band, **so that** I see how well a pitch matches my ask before I approve it.
**Acceptance:** Each signal is one statistic over Jev Noul/Score answers (D2). The total is labelled "uncalibrated" and names the signals present. With no `TYPESAFE_API_KEY` or `egress` not true it prints "could not look" and no number. It prints the question count before asking. A pitch over Jev's state budget is "could not look", never truncated silently. Ships in the kit closure.
**Risk:** low

### Story 1.2 — Gap routing
**As** the product owner, **I want** each gap (an uncovered claim, an unclear criterion) routed to one artifact, **so that** I know what to make next to close it.
**Acceptance:** Jev Choice over: copy deck, wireframe, flow, data sample, state machine, sequence, container diagram, spike, think chain ("answer by hand" until `think-skills` ships). The vocabulary matches the visuals rule (S2.2). *(Cut line: first to go.)*
**Risk:** low

### Story 1.3 — Measured wording
**As** a maintainer, **I want** the question wording measured on labelled examples, **so that** the score isn't a guess with a decimal point.
**Acceptance:** A labelled fixture set (pitches from both repos, with known gaps) in the same shape as `jev-eval.fixtures.json`; recorded once with `jev-eval --live`; the chosen wording's decided/right counts are written into the script's comments, as `REVIEW_QUESTIONS` does. The question sets live in one exported object (id → question, when true, when false) so `compiled-prompts` S1 can move them to `lib/jev-questions/` unchanged.
**Risk:** low

## As built (2026-09-29)

- **1.1** `skills/template/scripts/intent-match.mjs` (+ 25 specs, a replay client, no network), byte-identical in
  `scripts/`. Pure core — `parseSeed`, `buildRequest`, `scoreAnswers`, `totalOf`, `band`, `formatReport`,
  `writeIntoSeed` — and an injected shell. Could not look (exit 2, no number) on: no key, egress `null`/`false` (the
  key is not even read), a state over budget, Jev unreachable, a malformed answer, a seed with no claims. The count is
  printed before the first ask. In the kit through groom's `requires_scripts` (`gf-kit --list` shows `intent-match`).
- **1.2** Gaps (a claim with P < 0.5, a criterion with clarity < 0.5) get one Jev Choice each over D14's words; a
  route that cannot be asked prints "route: could not look" and leaves the score alone. Criteria with coverage-out
  < 0.5 are listed as untraced, not routed.
- **1.3** `jev-eval.fixtures.json` → `intent`: 37 labelled items over five pitches (three golden-frijoles seeds, two
  anonymised from a consuming project, C7), recorded with `jev-eval --live --rail intent`. **37/37 right, 32 decided**;
  the per-question counts and the one wording change are in `INTENT_QUESTIONS`' comment.

**Deviations, named:**
- `lib/jev.mjs` `readApiKey`: a variable set but **empty** now means "no key". The S1 smoke found it: step 2
  (`TYPESAFE_API_KEY=`) still scored, because the empty value fell through to `.env.local`. Fixed in the shared loader
  (one rule for every Jev caller) with a spec, and noted in the CHANGELOG.
- The fixture set's first recording keyed three `cli` items to the wrong criteria (an inserted acceptance line
  shifted the positions); caught reading the misses, re-keyed and re-recorded before any wording was judged.
- This epic's own seed had no verbatim ask (groomed before the template kept one). It now carries a **proxy** ask
  (`intent_ask: proxy`, D8): the groomed user stories moved into `## The ask, as given`, split into seven claims by the
  builder. It scored **89** (build band) with no gaps; teach-back absent (never recorded).
- `.prettierignore` gains the two root copies: the template's copy is formatted under the template's config, and a
  byte-identical root copy cannot satisfy both (the `config.mjs` precedent).

## Sprint QA
- `node --test` with a replay client (no key, no egress); one `--live` record of the fixtures.
- Browser smoke owed: none.
- **deterministic gate:** root `npm run typecheck` + `npm run build` + Playwright `api`, and the skills checks (`skills-ci` on the split), green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

Run from a checkout of https://github.com/danybgoode/golden-frijoles with `TYPESAFE_API_KEY` in `.env.local`
(this repo's `jev.config.json` has `egress: true`).

1. `node scripts/intent-match.mjs Roadmap/00-ideas/seeds/intent-match.md`
   → "asking Jev 19 question(s)" first, then coverage in / coverage out / clarity / teach-back ("not recorded") /
   agreement "pending", a total marked "uncalibrated" naming its signals, and a band. *Ran 2026-09-29: 88–89, build,
   no gaps — the ±1 is run-to-run variance in Jev's answers.*
2. `TYPESAFE_API_KEY= node scripts/intent-match.mjs Roadmap/00-ideas/seeds/intent-match.md`
   → `intent match: could not look (no TYPESAFE_API_KEY) — no score.`, exit 2. *Ran 2026-09-29 after the fix above.*
3. For a pitch with gaps, score the spec's own fixture seed: copy the `SEED` text from
   `scripts/intent-match.test.mjs` into a file and run the scorer on it
   → two gaps, each with a route ("→ sequence", "→ spike" on 2026-09-29), and one untraced criterion.
4. `node scripts/jev-eval.mjs --rail intent`
   → `intent: 37 labelled · jev 100.0% · decided 32/37, 32 right · no deterministic rule`, offline, no key needed.

If any step fails, note the step number + what you saw — that's the bug report.
