---
title: "Verify spike: Quint on the event outbox and Lean on the flag evaluator, dogfooded on Golden Frijoles"
slug: verify-spike
status: scaffolded
area: "09"
type: spike
priority: "audit-wave-B"
appetite: S
underwritten_by: null
risk: low
epic: "09-platform-infra/verify-spike"
build_order: 37
updated: 2026-09-29
---

# Pitch: Verify spike — what does formal verification cost and find on our own code?

Seed 6 of the unification audit (§10, now in the private `golden-frijoles/internal`). Home repo: **golden-beans**.
Class **spike** · lane **fixed scope** · appetite **S** (one builder session) · Stage-2.5 bucket **genuinely new**
(nothing in the repo specifies or proves anything today). **Blocks:** `verify-module` (seed 54), which shapes
only after this decision lands.

## Problem

The brief wants a spec → proof verification layer with Jev coordinating. The audit found Jev can't generate
(typed decisions only), so the pipeline is recast: a frontier model writes specs, checkers check them, Jev
triages. Nobody has measured what this costs or finds on a real codebase. This spike does that on GF's own
code before anything is promised (audit D7: no landing claim until `verify-module` ships).

**As the product owner, I want** a measured, written decision on whether and how to productize verification,
**so that** `verify-module` is shaped from evidence rather than a brief.

## Appetite — groomed 2026-09-29

The portfolio sketch (TLA+ **and** Quint, Veil, trace validation, Lean proofs, differential testing, live Jev
shadow) was an M wearing an S label. The product owner chose **cut to S**: one tool per tier, one property
per target, and everything else goes to "not evaluated". The circuit breaker is escalate-don't-guess. When
the session runs out, the decision is written with whatever was measured, and any gaps are named as gaps.

## Bill of materials

| What | Why |
|---|---|
| **Quint spec of the delivery outbox** (`event_deliveries` status machine: `pending → in_flight → delivered \| failed \| dead`; `claim_deliveries`, `settle_delivery`, backoff via `next_attempt_at`) | The only concurrent, at-least-once, crash-sensitive protocol we own, and the place a lost event would be silent. Quint over TLA+ because its TS-like syntax is readable by a frontier model *and* by us, it installs from npm, and it can use TLC/Apalache through the Java we already have |
| **Three invariants, bounded model check** — no loss while a sink is down, no delivery after `dead`, bounded replay (attempts ≤ retry cap) | This is the properties list the router's own migration comments already promise. The check tests whether the code keeps those promises |
| **Lean 4 model of `evaluateFlag` + `explainFlagEvaluation`**, proving **explanation ⇔ verdict agreement** (the explanation's `variantKey`/`reason` equal the verdict's), with the FNV rollout hash as an **uninterpreted function** | Agreement is the property a user relies on when the preview screen explains a flag. **Determinism is NOT proved.** It is nearly free (the function is pure, and duplicate priorities are rejected at `flags.ts:313`), so it has no value as evidence |
| **Differential test**: generated definitions × contexts, Lean model output vs the TS evaluator | This checks that the Lean model is the TS code. Without it the proof is about a different program |
| **Jev triage, retroactive and in shadow**: the four questions (diff touches spec? counterexample class? obligation difficulty? verify depth?) asked of ~10 already-merged PRs that touched these two areas, logged as a table with no gating | This measures whether Jev's typed judgments are usable as the router at no risk. The log becomes `verify-module`'s Jev evidence |
| **Stretch: trace validation** — run the dispatcher against **local Supabase** with a sink forced down and then up, export the `event_delivery_attempts` rows, and replay them as a Quint trace | This checks that the spec describes the real system and not an idealized one. It reads no prod data and needs no credentials |
| **The written decision** (`DECISION.md` in the epic folder) | This is the spike's only deliverable. It covers which spec language, which tiers are worth productizing, the cost in **CI minutes** (measured locally, never by adding a CI job) and in **builder effort**, and what was found |

## Already known going in (the groom found these; the spike confirms or refutes them)

- **Explanation ⇔ verdict agreement is conditional.** `evaluateFlag` (`flags.ts:541`) returns `DEFAULT` on
  `TYPE_MISMATCH`, on a definition/`expectedType` mismatch and on a variant whose value fails its type.
  `explainFlagEvaluation` (`flags.ts:640`) checks none of these. The agreement theorem therefore has to be
  stated *modulo type checks*. Whether that gap matters to the preview screen is part of the finding.
- **The rollout hash** (`flags.ts:40`) is FNV-1a over UTF-16 code units via `Math.imul`. Modelling it
  exactly is a rabbit hole (see below).

## Rabbit holes

- **Modelling FNV/UTF-16/`Math.imul` exactly in Lean.** Keep the hash abstract. If admission-ratio
  properties turn out to matter, put that in the decision as a finding and don't pursue it in this spike.
- **Modelling Postgres `SKIP LOCKED`/isolation semantics faithfully.** Model the claim as atomic, and write
  that choice into the spec as an explicit assumption.
- **Tuning bounds until TLC/Apalache runs forever.** Pick small bounds (2 destinations, 3 events, retry
  cap 3) and record wall-clock time. Cost is one of the answers the spike exists to measure.
- **Fixing a found bug** (see Fix policy). A fix gets its own PR, and a delivery-path fix is `risk: high`.

## No-gos

- **No CI job and no workflow edits.** Adding one is productizing, which is `verify-module`'s job, and the
  Actions quota is a standing constraint. CI minutes are *estimated* from local timings.
- **No prod data reads.** Trace validation uses local Supabase only.
- **No TLA+-vs-Quint bake-off and no Veil.** The decision lists both under "not evaluated", with a
  one-line reason each.
- **No landing or positioning copy** mentioning verification (D7).
- **No live Jev gating.** Jev runs in shadow only.

## Fix policy (product owner, 2026-09-29: fix inside the spike)

A real bug found by the checker or prover is **fixed within this spike's appetite** under three conditions:

1. The fix ships as its **own PR**, separate from the spike's evidence and decision PR. That PR carries the
   counterexample as its regression spec.
2. It is **risk-tiered by what it touches**, not by the spike's `low`. A change to delivery SQL, migrations
   or the dispatcher is `risk: high` and takes the full review route (`node scripts/review-route.mjs`), and
   its migration is applied through the normal separate step. A change to `packages/sdk` flags is at least
   `low`. It is a published package, so it also needs a version bump and a publish that is Daniel's step.
3. If a fix would exhaust the appetite, it becomes a bug seed with the counterexample attached, and the
   decision records it. **A live data-loss bug is reported to the product owner immediately**, whatever
   the appetite.

## Acceptance criteria (product-owner testable)

1. `DECISION.md` exists and answers four questions: **spec language**, **tiers worth productizing (yes/no
   each)**, **cost (CI minutes + builder effort)** and **findings**. Each answer cites the artifact or the
   timing it came from.
2. The Quint spec and the Lean model are committed under the epic folder, alongside a README of the exact
   commands that reproduce each result. The product owner can run one command and see "no violation" (or
   the counterexample).
3. The differential test has run on ≥ 1,000 generated cases, and its result and command are recorded.
4. The Jev triage log is a table with one row per PR and four answers per row, plus a verdict on whether
   the answers were useful.
5. Every "not evaluated" item (TLA+, Veil, trace validation if the stretch was missed) is listed with a
   one-line reason.
6. Any bug found either has a merged fix PR or a bug seed, and the decision links whichever applies.

## Reuse (platform-first)

- Outbox semantics: `apps/web/supabase/migrations/20260722110000_delivery_outbox.sql` (status machine, lines
  ~90–156), `20260724100000_delivery_retry.sql` (`claim_deliveries`, `event_delivery_attempts`,
  `settle_delivery`), `20260726100000_fanout_serialization.sql`; runtime in `apps/web/lib/delivery-dispatch.ts`,
  `deliveries.ts`, `webhook-delivery.ts`.
- Evaluator: `packages/sdk/src/flags.ts` (`evaluateFlag`, `matchesRule`, `explainFlagEvaluation`,
  `rolloutOutcome`); existing cases in `packages/sdk/src/flags.test.ts` seed the differential generator.
- Local stack for traces: the gate recipe (`supabase start` + a fresh server) in team memory.
- Jev: the existing Jev rail (`jev-*` seeds / `jev-expiry.yml`). Egress is already an explicit choice
  (distribute-what-we-use S3).

## Rules check (AGENTS)

No rule is at risk. The spike only reads code and runs local tools. Rule #1: nothing touches telemetry.
Tenancy: trace validation is local-only. Rule #4: no deploy. Any fix PR goes through the normal gitflow.

## Risk

Spike **low**. Any fix PR is tiered by its paths, per the Fix policy above. No flag is needed: nothing
ships to users.

## QA stage & smoke

There's no browser smoke, because nothing renders. The smoke walkthrough is the product owner running the
reproduce commands from acceptance #2 and #3 and seeing the recorded results. A fix PR carries its own QA
stage and smoke, owed as usual.

## Decisions (groomed 2026-09-29)

- Time box: **one builder session** (appetite S).
- A found bug is **fixed inside the spike**, as a separate PR with its own risk tier (Fix policy).
- Trace data comes from **local Supabase**, and trace validation is the stretch goal.
