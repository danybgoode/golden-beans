# Audit — where Jev (TypeSafe System One) fits the foundation, 2026-09-19

**Scope:** every decision point in `plugins/ways-of-work/` and `template/scripts/` that "picks something",
read against Jev's contract (docs.typesafe.ai: primitives, confidence, API, models). Input to grooming —
no code has been written.

**Jev in one line:** typed questions (Choice / Score / Noul) over one `state`, answered in parallel with
calibrated probabilities. `jev-1.13.0`, 64k context (32k state + longest question), $0.042 per 1M input
tokens, output free, 1,200 req/min. Text only.

---

## 0. The verdict

The thesis holds — the value is *where it goes*, not the model — but this repo needs one refinement.
The foundation already made most of its "if statements" deterministic: the security lens is a glob, the
reviewer routing is a preference list, the smoke-triage merge is a pure predicate. **The gap isn't frontier
models making if-decisions. It's regexes pretending to understand language, and whole LLM sessions spent
answering a triage question.** Those are the two targets.

Two constraints apply to the whole design, and both come from this repo's own doctrine:

1. **Asymmetric authority.** Jev may *add* a block, a review layer or an escalation. It never *removes*
   one and never *grants* an irreversible action on its own. (LEARNINGS: an escaped `ask` is "a silent
   downgrade from a human decides to the classifier decides".)
2. **Three states, never two.** No key, a 429/529, or a timeout means "could not look", and the rail
   falls back to today's deterministic behaviour. Jev is never a required check.

---

## 1. Measured, not argued — the review guard (2 samples, anecdotal)

`lib/review-guard.mjs → assertReviewOutput` decides whether an external reviewer actually reviewed, and a
silent reviewer fails the PR. It does this with regexes for severity headings and "clean" phrases.

| Reviewer reply | Regex guard | Jev `is_real_review` (Noul) |
|---|---|---|
| A real finding in plain prose (exit code 1 vs 2 in prod-smoke), no heading | ❌ **rejects** it | ✅ 0.97 |
| `## Findings` + "(reviewer timed out before completing analysis)" | ✅ **accepts** it | ❌ 0.03 |

The same call also answered `severity → blocking (0.90)` and `diff_risk → 1.29 / 3 (0.71)`. It returned in
**0.48 s** with 583 input tokens, which is about **$0.000025**. At these prices cost doesn't matter. Latency,
vendor dependence and data egress do.

---

## 2. The fit map

| # | Decision point (today) | Today | Jev shape | Fit | Win |
|---|---|---|---|---|---|
| A1 | Is this reviewer output a real review? (`review-guard`) | regex | Noul + Choice severity | **High** | quality — false passes/fails on the merge gate |
| A2 | Prose claims: fix / beneficiary / liveness / commitment (`prose-guard`) | ~15 regex families, per sentence | Noul per sentence, evidence pack as state | **High** | quality + fewer writer retries (each retry is a frontier call) |
| A3 | Does this PR need the security lens? (`review-guard.decideSecurityPass`) | globs + `risk: high` in the body | Noul, **raise-only** | Medium | catches risky diffs outside the globs; can never switch the lens off |
| B1 | Smoke-triage: flake / spec drift / product regression / infra? | a full cloud Routine session diagnoses from scratch | Choice over the report text, before the session | **High** | tokens: a flake doesn't start a session |
| B2 | babysit-pr: is a red CI run flaky or real? | retry heuristics | Choice over the log tail | High | fewer blind retries, a faster human ping |
| B3 | standup / pmo / weekly: is any of this delta worth posting? | the model reads everything | Noul per item, then the frontier model writes only the survivors | Medium | tokens + signal |
| C1 | groom Stage 2 classify (Feature/Bug/Spike/Chore) + Stage 6 risk tier | the frontier model in session | Choice + Score, as a **suggestion** the PO confirms | Medium | consistency more than tokens |
| C2 | Kickoff router: which family/effort builds this story; can it go to an external CLI? | the human + preference list | Choice over *our* roster (from `AGENT_BIN`), Score for effort | Medium–later | the biggest token lever, and the hardest to prove right — needs A/B outcome data first |

### Not a fit (pushback on the brainstorm)

- **Security scanning / vulnerability finding / coverage.** Jev judges text it's given. It can't find a
  vulnerability, since that takes reasoning and generation. The honest version: a real scanner (Semgrep, CodeQL, `npm audit`)
  produces findings, and Jev **triages** them (reachable? true positive? duplicate?) — a Choice per finding.
  That belongs to consuming projects, later.
- **"Which tool next", spam, and chunk relevance.** The foundation doesn't run its own agent loop or retriever;
  Claude Code does. These fit *product* repos (a consumer's RAG or inbox), not this plugin. The plugin can
  ship the client and doctrine, and consumers wire those uses.
- **"Ask everything, output is free."** That's true on price. Every question you keep is still a thing to evaluate and
  maintain, so ask what you'll **log and score**, not everything you can think of.

---

## 3. How it ships in a distributed plugin

- **`template/scripts/lib/jev.mjs`** — a zero-dep `fetch` client (house rule: Node 18+, no npm deps). It returns
  `{ok, answers, usage} | {ok:false, state:'could-not-look', error}`. Exponential backoff on 429/529.
  Declared in `requires_scripts` so `check-skill-scripts` covers it.
- **Pin `jev-1.13.0` in gates, never `jev-latest`.** This is the agy lesson: a moving model behind a gate is a gate
  that changes without a diff. Bump deliberately, after re-running the eval set.
- **Shadow mode first — `decisions.jsonl`.** Each wired rail logs `{rail, question, jev answer,
  confidence, existing decision, final outcome}`. Nothing is promoted until agreement and precision are
  measured on real traffic (LEARNINGS: "a test that has never gone green has not tested anything").
- **Thresholds per rail, in config** (`jev.config.json`, a TEMPLATE FILL-IN): below 0.5, escalate or fall back.
  At 0.85 or above it may *add* a block. Nothing it outputs grants a merge.
- **Egress is opt-in per project.** Diffs, PR bodies and CI logs leave the machine. A consumer with private
  code turns it on explicitly; with no key or with it disabled, everything behaves exactly as it does today.
- **The TypeSafe plugin already teaches question-writing.** Ours ships the wired rails, the doctrine above
  and the decision log. It doesn't ship a second copy of their skill.
- **Hygiene found during this audit:** `.env.local` wasn't gitignored in this repo (fixed: `.env*.local`).
  The template's `.gitignore` already ignores `.env.local`; widen it to `.env*.local` for parity.

---

## 4. Recommended bets

1. **Bet 1 — "Semantic guards", appetite S–M.** `lib/jev.mjs` + decision log + A1 in shadow → A2 in shadow
   → promote A1 when it earns it. There's already a labelled corpus: every cross-review comment across the
   three repos (`gh api`), whose outcome (merged, fixed, ignored) is ground truth. Low blast radius, measurable, and it
   builds the plumbing everything else reuses.
2. **Bet 2 — "Pre-triage before the session", appetite M.** B1 → B2 → B3. This is where the frontier
   tokens actually go: it decides whether a routine session starts at all, and what it starts knowing.
3. **Park — C1/C2 and scanner triage.** Revisit once the decision log proves calibration on bets 1–2.
   C2 especially needs outcome data (did the cheaper route ship a green PR?) before it routes anything.
