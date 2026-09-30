---
status: in-progress  # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Building      # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: compiled-prompts
title: "Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured"
area: 09-platform-infra
risk: low
type: feature
sprints_total: 2
stories_total: 6   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 51  # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Compiled prompts, wave 1 — Jev questions become data, optimize/ is committed, and wording gets measured

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/compiled-prompts.md`](../../00-ideas/seeds/compiled-prompts.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in the Why section, not here). -->

## Why
The Jev guards get better only when someone edits a JS string and re-runs a hand-built harness, and CI can't even tell when a question's wording changed. This wave makes every Jev question a data file with its measurement beside it, makes a recording remember the wording it was made with, commits the ReAnchor harness as `optimize/` (Python, dev-only), and adds the loop the ReAnchor spike said matters most: testing new wordings on held-out data. Its first run targets `flag-state-claim`, where 19 of the 22 prose errors sit. The pitch, measurements and diagram are in the [seed](../../00-ideas/seeds/compiled-prompts.md).

## Platform-first note
No engine data, route or table (rule #1 n/a). Kit scripts, a JSON file per rail, and a dev-only `optimize/` workspace at the repo root that never ships. `jev.config.json` stays the one thresholds file; the `.md` prompt files stay the prompt artifacts. Every change under `skills/` is a plugin release.

## Architecture lock (2026-09-30, verified against `main` @ f91f1be and the live fixtures)

Each decision says where its contract lives; builders cite it, never restate it. Corrections against the
grooming text are marked **CORRECTED**; they are the lock doing its job, not drift.

- **D1 — No `compiled/` directory.** ✅ Verified: `jev.config.json` is the one thresholds file (`parseJevConfig`
  refuses unknown keys) and the `.md` prompts are the prompt artifacts. Nothing in this wave writes a second copy.
- **D2 — Questions are data, in Jev's own shape.** **CORRECTED.** The grooming shape `{ question, whenTrue,
  whenFalse }` cannot hold what exists: `review.severity` is a `choice` with four criteria and intent's `clarity`
  is a `score` with four levels. It would also need a translation layer between the file and what `askJev` sends.
  So each entry is **the question as Jev receives it** plus the two new fields:
  `{ id, type, instructions, criteria, measured }`, with `criteria` as `{true,false}` (noul), `{label: text}`
  (choice) or `[level…]` (score). Prose entries also carry `code` (the finding code), and their `id` is the family
  key (`fix`, `beneficiary`, `live`, `commitment`), because the recordings key answers as `s<i>_<key>`. The
  files are `scripts/lib/jev-questions/{review,prose,intent}.json` as `{ "$comment", "questions": [...] }`, read
  by one loader `scripts/lib/jev-questions.mjs` (`loadQuestions(set)`, which validates and refuses unknown keys,
  and `questionHash(q)`). The guards keep exporting `REVIEW_QUESTIONS`, `PROSE_FAMILIES` and
  `INTENT_QUESTIONS` with deep-equal values, built from the JSON. Evidence gates (`skip`) are logic and stay
  in JS. `measured` is `{ model, date, n, decided, right, how }`, with `how` giving the one-sentence counting
  rule, computed from the offline replay of today's recordings. It is `null` with an `unmeasured` reason only
  where no labels exist: `review.severity`, `intent.agreement` and `intent.route`.
- **D3 — A recording answers for its wording, by generalising what semantic-lint already built.** **CORRECTED
  (reuse):** `jev-eval.mjs` already has a per-set `stale(fx)` / `recordExtra(fx)` hook and a lint
  `questionHash`, so no second mechanism is written. Each recording for review, prose and intent gets
  `recorded.questionHashes: { <questionId>: hash }` over the ids it holds answers for. For prose, that is the
  families with any `s*_<key>` answer. The hash is `textHash(JSON.stringify({ type, instructions, criteria }))`.
  A recording with answers but no stamp is stale ("unstamped"). The failure reads `<set>/<fixture>: recorded
  against another wording of <questionId> — run --live`. `--live` writes the stamps. Lint keeps its own hash,
  which also covers `source`. **The recordings are stamped from the pre-move JS constants in the first commit,
  and the move lands after.** The stamp is the proof that the move was byte-identical: a changed character goes
  red.
- **D4 — `optimize/` is dev-only (E5).** ✅ Verified: repo-root `optimize/` sits outside `skills/`, so it is
  outside the subtree mirror, the kit closure (`requires_scripts`) and the plugin. `dspy[typesafe]==3.4.0`
  installs and imports on this Mac's Python 3.14.7 (checked 2026-09-30). `requirements.lock` is the `pip freeze`
  of that venv. `optimize/.venv/` and `optimize/.cache/` are gitignored. CI runs no Python: the parity check's
  Node half is `optimize/*.test.mjs`, added to `npm run test:unit`'s glob.
- **D5 — DSPy only where documented.** ✅ ReAnchor refits thresholds. Wordings are written by hand and
  measured. No GEPA or MIPROv2.
- **D6 — A wording wins only held-out, on the spike's folds.** **SHARPENED.** The folds are DSPy's own
  `reanchor.calibrate._folds(n)` (`random.Random(0)` shuffle, `order[i::5]`), which is the only place "the
  spike's folds" is defined. `refit.py` writes them to `optimize/folds.json` keyed by fixture id per rail, so
  the Node harness never re-implements Python's RNG. `wording.mjs` refuses to run if the fixture ids have
  changed. Scoring uses the real `judgeProse` at the **configured** `claim` threshold (a per-family threshold
  is a schema change and out of scope). The unit is the whole-draft exact code set, the spike's 141, reported
  per fold, with family-level accuracy alongside. Because nothing is fitted at the fixed threshold, the guard
  against training on the test set is that **candidates are committed before the run**. A candidate **wins only
  if** its held-out total is at least the current wording's total plus 2, and it is worse on no more than one
  fold. A one-fixture win is recorded as a tie. A per-fold refit threshold column is reported for information
  and never decides. Adoption is its own PR with the product owner's OK.
- **D7 — One shape for every question set.** Both consumers shipped (intent-match #196–#198, semantic-lint
  #200), so both are resolved in S1:
  **intent moves** to `jev-questions/intent.json`, as its own D13 comment planned.
  **lint matches but does not move.** Its question is project data in `golden-frijoles.config.json →
  lint.rules[]` (semantic-lint D8, fresh review of #200), and moving it into the kit would ship this repo's
  rule to every consumer. It already has `{ instructions, criteria: { true, false } }` and its own hash guard.
  Its free-text `$measured` stays; this is a named deviation.
- **D8 — The root ↔ template guard is `check-script-parity.mjs`.** **CORRECTED:** `check-template-drift.mjs`
  checks for unfilled placeholders in five docs and has nothing to do with scripts. Parity compares only paths
  present in **both** trees, so every new file under `scripts/` lands in both, byte-identical.
- **D9 — The question files are declared by hand in the kit closure.** The closure walker follows `import`
  edges only (`check-skill-scripts.mjs` says so), and the loader uses `readFileSync`. Every SKILL.md that
  declares a guard or `intent-match.mjs` also declares the loader and its JSON: `golden-frijoles`,
  `pmo-report`, `weekly-recap`, `groom`, `prose-draft`, `standup-post`. `kit-tarball.test.mjs` asserts they
  are packed.
- **D10 — Live cost, measured.** **CORRECTED:** a wording run asks **159 questions across 147 drafts per
  candidate**, not "a few thousand" (the recordings hold 159 `s*_live` answers). Five candidates plus the
  current wording come to about 950 questions, all under the existing `jev.egress: true`.
- **D11 — Releases.** S1 changes the kit closure, so it releases plugin/kit **0.15.0** (`RELEASING.md`). S2
  touches `optimize/` and `Roadmap/` only, so it has **no plugin release**. An adopted wording would be its
  own PR and release.
- **D12 — The branch starts clean.** The `feat/compiled-prompts` push carried an unrelated local commit
  (`f358af5`: 147k lines of Apalache output, plus a nested `.github/workflows` under `Roadmap/`). It is
  reverted on the branch rather than force-pushed away, and is kept at local `backup/verify-spike-artifacts`.

**Deviations named:** D2 shape, D3 reuse, D7 lint-matches-not-moves, D8 guard name, D10 cost, and D11 has no
S2 release.

## What already exists (reuse, don't rebuild)
- `skills/template/scripts/lib/jev.mjs` (`loadJevConfig`, `parseJevConfig`, `askJev`), `lib/review-guard.mjs` (`REVIEW_QUESTIONS`), `lib/prose-guard.mjs` (the four family questions).
- `jev-eval.mjs` (`replayAsk`, `recordingAsk`, `evaluate`, the model-mismatch check) + `jev-eval.fixtures.json` (240 labelled, recorded).
- `jev-report.mjs` (the label loop: `--json`, `--append-labels`).
- The ReAnchor spike's method, parity check and numbers (`00-ideas/seeds/jev-reanchor-thresholds.md`).
- `build-kit.mjs` (`requires_scripts` closure carries non-`.mjs` files), `check-plugin-leaks.mjs`, `kit-tarball.test.mjs`, `check-script-parity.mjs` (D8; the grooming text named `check-template-drift`, which guards placeholders).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Jev questions as data | low |
| 1 | 1.2 A recording remembers its wording | low |
| 1 | 1.3 `optimize/`, reproducing the spike | low |
| 1 | 1.4 The leak guard | low |
| 2 | 2.1 The wording harness | low |
| 2 | 2.2 First run: `flag-state-claim` *(cut 1st)* | low |

## Routing
Grooming routed 1.2, 2.1 and 2.2 to the strongest tier and 1.1, 1.3 and 1.4 to builders against the locked
contract. **As run (2026-09-30):** one session in the checkout, so every story is built in place by the
orchestrator (claude, strongest tier). No story is delegated: the S1 stories share `jev-eval.mjs` and the guards,
so a fan-out would only buy merge conflicts. Review uses `review-route.mjs --builder claude`, so the external
passes go to the non-claude families.

## Kill switch (Stage 6b)
Not required (`risk: low`): dev tooling. The byte-identical move keeps every live verdict unchanged, the rails keep their `off | shadow | jev` switch, and an adopted wording is its own reviewed PR. Rollback is pinning the previous plugin version.

## Deploy order
Stacked branches `feat/compiled-prompts` → `-s2`, merged in order, one plugin release per sprint. S2's live run happens after S1's release; an adopted wording is a separate PR after the report.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — `risk: low`, none planned at grooming. **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
