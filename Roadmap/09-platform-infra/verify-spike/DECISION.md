# Decision — verify-spike (2026-09-29)

**Question:** what does formal verification cost and find on Golden Frijoles' own code, and what is
worth productizing in `verify-module`?

**Answer in one paragraph.** It is cheap, and it found real things. One builder session produced a
Quint model of the delivery outbox and a Lean model of the flag evaluator. The outbox model found
**three findings the code's 24+ cross-review rounds had not**. One became a guard test (PR #194), one
became a bug seed with a model-checked fix, and one is an accepted residual. The Lean proofs hold, and
the differential test ties the model to the shipped code with 0 disagreements in 6,000 cases. The
spike's most important lesson is about _which tier earns its keep_. **Model checking earned it
outright. Proofs earned it only when paired with a differential test**, because without one the
proofs verified a model that disagreed with the code on 8% of inputs, and every proof still passed.
**Productize: Quint simulation per PR, Apalache nightly, Lean + differential test for pure
functions, and Jev routing by verify depth, in shadow.**

Reproduce every number: [`REPRODUCE.md`](REPRODUCE.md).

---

## 1. Spec language → **Quint for protocols, Lean 4 (core, no Mathlib) for pure functions**

- **Quint: keep.** It installs from npm in 5 s and reads like TypeScript, so the 300-line outbox model
  maps line-for-line onto the SQL functions it mirrors (`quint/outbox.qnt`, with every abstraction
  listed as A1–A7 at the top). One tool gives both a fast random simulator (`quint run`) and an
  exhaustive bounded checker (`quint verify`, which drives Apalache on the Java already here). Its one
  sharp edge cost 2 minutes: `x' = a or b` parses as `(x' = a) or b`, and the typechecker caught it.
- **Lean 4, core only: keep, for pure functions.** Four theorems, 0 `sorry`, only the three standard
  axioms, and 0.9 s to compile. Not using Mathlib is what keeps it fast. Nothing here needed it.
- **TLA+: not evaluated.** Quint compiles to the same checkers (TLC and Apalache), so the spike had
  nothing to learn from a second syntax for the same semantics. A bake-off would only answer a
  preference question.
- **Veil: not evaluated.** Its promise is one language for both tiers. With Quint and Lean each
  taking minutes to set up and running in seconds, a unified language solves a problem this spike
  did not have.

## 2. Tiers worth productizing

| Tier                                                                 | Verdict                                                      | Evidence                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Model check, simulation** (`quint run`, 10k random traces)         | **Yes, per PR**, on the outbox paths                         | ~5 s per invariant. Found F1 in **1 s** and, without the timing assumption, the F3 double send in 4 s. **Missed F2 and the exhaustion witness:** random walks rarely reach 11–12 deep, specific traces                                                                         |
| **Model check, exhaustive to a depth** (`quint verify` / Apalache)   | **Yes, nightly or on demand**, never per PR                  | Found **F2** at 12 steps (107 s) and the exhaustion witness at 11 steps (58 s). Proofs of absence to 10 steps cost 2–6 min per invariant (table in § Evidence). Too slow to gate a PR, but it found the one finding simulation could not                                          |
| **Proofs** (Lean)                                                    | **Yes, but only with a differential test**                   | Proved agreement, the call-site gap, one line per rule, and at most one match (§ Evidence). **Proofs alone are dangerous here:** with Lean's own whitespace rule in place of JS's `trim()`, every proof still passed while the model disagreed with the code on 165 of 2,000 cases |
| **Differential test** (Lean model vs shipped TS, real FNV as oracle) | **Yes, per PR**, on the evaluator                            | 6,000 cases, 0 disagreements, 65 ms. **Mutation-checked:** it caught the whitespace mutant immediately. This is the tier that ties the model to the code                                                                                                                       |
| **Trace validation** (replay `event_delivery_attempts`)              | **Not evaluated**                                            | It was the stretch goal. The appetite went to modelling and checking the F2 fix and to the mutation checks, which were worth more                                                                                                                                              |
| **Jev triage**                                                       | **Yes for one question**: route by _verify depth_, in shadow | 5/9 exact, 9/9 within one level, never under-called (details in [`jev-triage.md`](jev-triage.md)). Drop _obligation difficulty_, which does not discriminate. Keep _touches spec_ as a ranked signal until it has a measured threshold. 9 calls, 2 s                           |

## 3. Cost

**CI minutes** (estimated from local timings on macOS arm64; ubuntu runners are typically slower, so
roughly ×1.5):

| Job                                               | When                         | Tool setup                            | Run              | ≈ CI minutes per run              |
| ------------------------------------------------- | ---------------------------- | ------------------------------------- | ---------------- | --------------------------------- |
| Quint simulation, 7 invariants × 2 timing modes   | per PR touching outbox paths | npm 5 s + Java                        | ~75 s            | **~2–3**                          |
| Lean build + axioms + differential test (3 seeds) | per PR touching `flags.ts`   | elan + toolchain ~30–60 s (cacheable) | ~6 s             | **~1–2**                          |
| Apalache exhaustive table (`check.sh` full)       | nightly                      | Apalache jar (cacheable)              | ~62 min for the full table (the 14-step fixed run alone is 25 min) | **~65, nightly only** |
| Jev triage (4 questions per PR)                   | per PR, shadow               | none                                  | ~0.3 s per PR    | ~0 (API tokens: ~6k input per PR) |

The Actions quota is a standing constraint (team memory, 2026-07), so the per-PR jobs must be
**path-filtered**. Only a PR touching the specified files pays for them: 9 merged PRs between
2026-07-15 and 2026-09-29, about 3–4 a month, heaviest while an epic is building the protocol.

**Builder effort.** The whole spike fit in **one builder session** (appetite S): the outbox model,
four findings with traces, the F2 fix modelled and re-checked, the evaluator model, four proofs, the
differential test, two mutation checks, the Jev triage and this document. Specs are cheap for a
frontier model to write. The effort is in **checking them against the code**, which is exactly where
this session found its own mistakes: a merge-commit diff that sent Jev no code, a JSON key-order
false alarm, and zsh not word-splitting a loop.

## 4. Findings

| #      | Where                                                     | What                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Disposition                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F1** | `delete_destination` + `claim_deliveries`                 | A row `in_flight` when its destination is deleted, whose worker then dies, stays `in_flight` forever. Delete does not drain `in_flight`, and claim never touches a non-deliverable destination. Found by simulation in 1 s (`quint/traces/stranded-timed.itf.json`)                                                                                                                                                                                           | **Accepted residual.** Nothing is lost (the destination is gone) and nothing user-visible reads it (`delivery_health` filters `deleted_at IS NULL`). A fix would change the live delivery SQL (`risk: high`) for no observable benefit                                                                                                                                                           |
| **F2** | `claim_deliveries` stale reclaim                          | A worker that sends and then fails to settle has its row reclaimed after 5 min **without charging `attempt_count`** and without an attempt-log row. If the settle keeps failing, the event is re-sent every 5 min with no bound, and the operating view shows 0 attempts. Found exhaustively at 12 steps (`quint/traces/sends-unbounded-timed.itf.json`). A receiver cannot trigger it (the error text is fixed), so it is **low-likelihood and high-impact** | **Bug seed** [`delivery-stale-reclaim-uncounted`](../../00-ideas/seeds/delivery-stale-reclaim-uncounted.md), fix policy clause 3. The **fix is already model-checked**: charging the presumed-lost attempt on stale reclaim removes the violation to 14 steps with no regression (`outbox_timed_fixed`). It changes the live claim path (`risk: high`), which is more than this spike's appetite |
| **F3** | route `maxDuration` / `TICK_BUDGET_MS` / `STALE_CLAIM_MS` | "Nothing is sent after a row is finished" holds **only** because 240 s < 300 s ≤ 300 s, and nothing enforced it. Without that order the model double-sends, including after `delivered` (`quint/traces/send-after-terminal-untimed.itf.json`)                                                                                                                                                                                                                 | **Fixed in the spike:** PR [#194](https://github.com/danybgoode/golden-frijoles/pull/194), a guard test. It pins the order, plus (from its fresh review) the enumeration's own stale window and the absence of a `vercel.json` override. Each assertion is mutation-checked                                                                                                                                                                                                                                                  |
| **F4** | retry policy                                              | A sink down longer than the retry budget dead-letters. With `MAX_ATTEMPTS = 6` that is ~15.5 min of backoff (30 s + 1 m + 2 m + 4 m + 8 m), after which only an operator replay recovers the event. Exhaustion witness at 11 steps                                                                                                                                                                                                                            | **By design, now stated.** "No loss while a sink is down" is true for about 15 minutes, and after that recovery takes a manual replay. That is a documentation fact for anyone promising delivery guarantees, not a defect                                                                                                                                                                       |
| **F5** | `evaluateFlag` vs `explainFlagEvaluation`                 | Proved: a type-correct call always agrees with its explanation (variant, reason, rule). A **type-incorrect call** (wrong `expectedType`, or a `defaultValue` of the wrong type) always gets `DEFAULT` while the preview explains a variant. The preview cannot know the caller's types                                                                                                                                                                        | **By construction, now proved.** It becomes a user-visible mismatch only if an app reads a flag with the wrong typed getter, and that is the app's bug. `verify-module` could surface the flag's `valueType` next to the preview                                                                                                                                                                 |
| **F6** | the Lean model itself                                     | Lean's `String.trim` / `Char.isWhitespace` is narrower than JS `trim()` (no U+00A0, U+FEFF, U+2003, …). A model written the obvious way disagreed with the shipped code on 8% of generated cases while every theorem still held                                                                                                                                                                                                                               | **Modelling lesson, recorded here.** The model defines `jsWhitespace` explicitly. This finding is why proofs ship only with a differential test                                                                                                                                                                                                                                                  |

**F7: found by #194's fresh review, outside the model, and needs the product owner.** The delivery
cron may not be registered in production. The only `crons` entry (`/api/internal/dispatch-deliveries`,
every 5 min) is in `apps/web/vercel.json`. The Vercel project's Root Directory is `.` (`vercel project
inspect golden-beans`), so the platform reads the repo-root `vercel.json`, which has no `crons`, and
`vercel crons ls` (beta) reports **no cron jobs**. If that is right, scheduled delivery is not running
and queued deliveries are accumulating. It is **not fixed here**: registering the cron would start
sending a possible backlog to real endpoints, and that is a production decision. **Confirm in the
Vercel dashboard (Settings → Cron Jobs) and in the route's invocation logs.**


## Evidence

### S1.1 — outbox model check (`quint/check.sh`, 2026-09-29, macOS arm64)

**Simulation** (`quint run`: 10,000 random traces of ≤ 25 steps, seed `0x1`, ~5 s each):

| Invariant | Timed (production timing) | Untimed (timing assumption dropped) |
|---|---|---|
| `noVanish`, `noOrphan`, `attemptsBounded` | ok | ok |
| `sendsBounded` | ok (the trace is too deep for random walks; see below) | ok |
| `noSendAfterTerminal` | ok | **violation**: double send, including after `delivered` (F3) |
| `noStrandedInFlight` | **violation** in 1 s (F1) | **violation** |
| `noDeadByExhaustion` (witness) | ok (too deep for random walks) | ok |

**Exhaustive to a depth** (`quint verify` / Apalache):

| Module | Invariant | Depth | Result | Time |
|---|---|---|---|---|
| shipped, timed | `noVanish` | 10 | ok | 209 s |
| shipped, timed | `noOrphan` | 10 | ok | 257 s |
| shipped, timed | `attemptsBounded` | 10 | ok | 133 s |
| shipped, timed | `noSendAfterTerminal` | 10 | ok | 201 s |
| shipped, timed | `noDeadByExhaustion` (witness) | 11 | **violation**, as expected (F4) | 55 s |
| shipped, timed | `sendsBounded` | 12 | **violation** (F2) | 132 s |
| **F2 fix**, timed | `sendsBounded` | **14** | ok | 1,529 s |
| F2 fix, timed | `noVanish` / `noOrphan` / `attemptsBounded` / `noSendAfterTerminal` | 10 | ok / ok / ok / ok | 298 / 334 / 353 / 235 s |

"ok at depth N" means no violation exists in **any** execution of up to N steps of this model (2
events, 2 destinations, 2 workers, retry budget 3). It is a bounded result, not a proof for all
depths.

### S1.2 — flag evaluator (`lean/`, Lean 4.34.1, core only)

| Theorem | Statement (informal) |
|---|---|
| `agreement` | For every parsed definition, validated context and hash, and a type-correct call: the explanation's variant, reason and matched rule equal the verdict's |
| `callSite_gap` | For a type-incorrect call, the verdict is always `DEFAULT` with no variant, while the explanation always names a variant and never says `DEFAULT` |
| `explain_covers_every_rule` | The explanation has exactly one entry per rule |
| `at_most_one_matched` | At most one rule is reported `matched` |

`lake env lean Axioms.lean`: each theorem uses only `propext`, `Classical.choice` and `Quot.sound`,
with no `sorryAx`. Model and proofs compile in 0.9 s.
Differential test: seeds 1, 2 and 3, 2,000 cases each, **0 disagreements**. The Lean model takes ~65 ms
per 2,000 cases. The mutant model (Lean whitespace instead of JS) gives **165 disagreements** on seed 1.

## What `verify-module` should be (the input it was waiting for)

1. **Path-filtered per-PR jobs**: Quint simulation on outbox paths, and Lean build + differential test on
   `flags.ts`. Each costs a couple of CI minutes and runs about once a month.
2. **A nightly exhaustive job** running `quint/check.sh` in full. A new violation opens a seed with the
   trace attached.
3. **Jev as the router, in shadow first**: ask _verify depth_ on every PR and log it next to the
   builder's call, as the review rail did, until a threshold is measured on ≥ 30 labelled PRs.
4. **One rule for every proof tier: no proof ships without a differential test against the real
   code.** F6 is the reason.
5. **Out of scope until asked:** trace validation, TLA+, Veil, and any landing claim (audit D7 still
   holds; nothing here is shipped product).
