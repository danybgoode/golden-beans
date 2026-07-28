# Experiment governance v2 — Retrospective

_Shipped & LIVE in production: 2026-07-23 (PRs #19/#22/#23; migration applied, flag flipped ON, flag flip
verified live; the authenticated production decision round-trip validated on the UI by Daniel). One deferred
follow-up: the live Miyagi dogfood decision — see Gaps._

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
flipped false→true and activated by a redeploy (`ea55ec0`) · **flag flip verified live** (governed `?version`
route now 401/needs-auth instead of the OFF-state 404) · README/poster/build-order finalized · feature branch
deleted · **production decision round-trip validated on the UI by Daniel** (create → stop → record decision →
read back → append correction). The ledger's functional correctness is also covered by the 307-spec CI/local gate.

**Done on 2026-07-28 — Story 3.3 live Miyagi dogfood. The epic owes nothing.**

Miyagi wired the campaign up in `miyagisanchezcommerce` #316/#317 (local deterministic assignment ported from the
SDK, HttpOnly `fnd_sid` visitor subject minted in middleware, exposure + subject context on every campaign event,
definition version 3). Exposure was driven solely by Miyagi's own flags; Golden Beans never read or changed one,
and never served an assignment.

The run proved both halves against real production traffic: a **clean** 12/12 fixture was `decisionReady: true`
with SRM clear (χ²=0) and measured control 25.0% vs treatment 58.3% (+133.3%, `favorable`) at metric
addressability coverage 1.0 — conversions joined by opaque subject id with **no experiment tag**; a
**deliberately skewed** 12/30 fixture flipped it to `blockers: ["srm_detected"]` (χ²=7.71, p=0.0055 < α=0.01)
while keeping every metric visible. An intermediate 12/24 skew correctly did *not* flag (p=0.046 > the
predeclared α=0.01). Close-out decision recorded as **`invalid`** on definition v3, `stopped→decided` atomic,
snapshot frozen, no product flag touched. The temporary analysis key was revoked and verified 401.

**What the dogfood actually bought us** — three defects that each would have produced a silent, plausible zero:
metrics join by `context.subject` (Miyagi sent none); the conversion lived in a different id space from the
exposure; and the v1 registry plan declared an eligibility tag the emitter never sends. The first two were caught
by reading the analysis contract before shipping; the third was caught **by the governance layer itself**, in
production, naming the cause and the count instead of reporting zero. That is the whole thesis of this epic
demonstrated on its first real customer surface.
