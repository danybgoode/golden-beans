# Experiment governance v2 — Retrospective

_Shipped & LIVE in production: 2026-07-23 (PRs #19/#22/#23; migration applied, flag flipped ON, live decision
round-trip verified). One operational follow-up remains: the live Miyagi dogfood decision — see Gaps._

## What shipped

The epic turns Golden Beans' bucketing/exposure/lift primitives into an experiment operating system: a
versioned registry + plan, an immutable lifecycle, governed trust analysis (primary/guardrail metrics, SRM and
exposure-integrity diagnostics, sample guidance, bounded segments), and an accountable human decision record —
all behind the born-OFF `EXPERIMENT_GOVERNANCE_ENABLED` gate, with legacy SDK bucketing/exposure/v1 comparison
untouched.

- **Sprint 1 (PR #19):** versioned registry & plan (1.1), local-SDK compatibility & assignment context (1.2),
  immutable lifecycle (1.3). `decided` reserved as a terminal state reachable only by S3's decision RPC.
- **Sprint 2 (PR #22):** primary/guardrail analysis over canonical untagged events (2.1), SRM + exposure-integrity
  diagnostics (2.2), minimum-sample guidance & bounded segments (2.3). Snapshot contract + clock-skew fixes.
- **Sprint 3 (PR #23 — code complete, reviewed, CI-green):**
  - **3.1** append-only immutable decision/correction ledger (`20260801100000_experiment_decision_records.sql`);
    owner-only `record_experiment_decision` RPC — auth before any existence leak, registry→version lock order,
    idempotency-keyed, atomic `stopped→decided`; table append-only to `service_role` (REVOKEs + immutability /
    no-truncate triggers + assertion). Commits `db69d5b`, `a3b65a3`.
  - **3.2** one resolver (`getExperimentAnalysisByProjectId`) carries decision history so UI, Bearer
    `compare?version` and MCP `get_experiment_analysis` serve byte-identical output (spec asserts MCP == API).
    Commit `e642b99`.
  - **3.3** PII-free Tiendas Fundadoras fixtures proving local assignment, untagged conversions, clean-vs-skewed
    SRM, and no subject-id leakage. Commit `12d5d1b`.

## What went well

- **Durable state made a cut-off session recoverable.** The prior agent's Sprint 3 was fully written but entirely
  uncommitted in a worktree; the plan/sprint docs + committed S1/S2 made it cheap to re-derive exactly what was
  done and finish it. The code was high quality and needed no rework beyond the one bug below.
- **Layered review caught what green tests didn't.** typecheck + build + a 307-passing api gate + a dark-state
  pass were all green, yet a fresh cold reviewer still found a real data-integrity defect that no spec exercised.
  Agy + Devin then reviewed the fixed branch clean.

## What we learned

- **A resource cap only guarantees readability if the write path measures the same bytes the read path bounds.**
  The decision write cap first shipped counting only `analysis_snapshot` bytes while the read bound sums
  `rationale + analysis + integrity` per row — so a long/multi-byte-rationale history (within the supported 100
  records) could be *accepted on write yet permanently unreadable* on read (`resource_limit`), bricking the whole
  governed view because the ledger is append-only. Aligning the *number* (8→4 MiB) was not enough; aligning the
  *measurement* was. Promoted to `Roadmap/LEARNINGS.md`.
- **The mutation check is what gives a resource-bound spec teeth.** The original payload spec used tiny rationales,
  so it passed against the buggy analysis-only cap. The fix's teeth spec fills a maxed-rationale history to the
  cap then round-trips it through the exact read mapper, and was verified to *fail* against the reintroduced bug.
- **Recovering a cut-off session: re-run the whole gate from scratch, and don't trust the ambient shell env.**
  Two of the initial local failures were environment, not code — a stale server still holding :3000 (so a fresh
  server silently `EADDRINUSE`'d and the old key served) and an inherited *production* `SUPABASE_DB_URL` from the
  shell profile that the test-cleanup guard correctly refused. Kill stale servers explicitly and pin local creds
  before believing a red run.

## Gaps / follow-ups

**Done on 2026-07-23 (rollout):** merged #23 · migration applied to prod Supabase · `EXPERIMENT_GOVERNANCE_ENABLED`
flipped false→true and activated by a redeploy · live decision round-trip verified (create→stop→decide→read via
API+MCP→correct) · README/poster/build-order finalized · feature branch deleted.

**Remaining operational follow-up (one):**

1. **Story 3.3 live Miyagi dogfood** — drive Tiendas Fundadoras exposure through *Miyagi's own* feature flag and
   record the production human decision (cross-repo; browser smoke). Golden Beans never reads or changes Miyagi's
   flag. This is a dogfood on top of the now-live, verified governance capability — not a code gap. Needs the
   Miyagi repo/flag access details before it can be scheduled.
