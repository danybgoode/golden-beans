# Experiment governance v2 — Sprint 2: Trust diagnostics, metrics and segments

**Status:** ⬜ not started

## Stories

### Story 2.1 — Primary and guardrail metric analysis

**As an** experiment owner, **I want** primary and guardrail results joined to real product events, **so that**
the report measures behavior rather than a test-only payload shape.

**Acceptance:** first valid exposure assigns subject/variant; normal metric events join by opaque subject id and
need no experiment `feature_id`; declared observation window and distinct-subject semantics apply; semantic
control drives basic lift; guardrails show declared direction/status without auto-stopping; source freshness and
metric join coverage are visible.

**Risk:** low — read-only analytical extension over canonical events.

### Story 2.2 — SRM and exposure-integrity diagnostics

**As an** experiment owner, **I want** data-quality checks evaluated before lift, **so that** broken assignment
or telemetry is not mistaken for a product result.

**Acceptance:** observed allocation is compared with expected weights; unknown/cross-variant/duplicate/out-of-
window/missing-subject exposures and join coverage are reported; blocking failures mark results not decision-ready;
observed/expected counts stay visible; diagnostics never fabricate a root cause or delete the affected data.

**Risk:** low — deterministic diagnostic logic and read-only reporting.

### Story 2.3 — Minimum-sample guidance and bounded segments

**As a** product lead, **I want** declared sample guidance and safe segment cuts, **so that** I can inspect the
planned population without fishing across arbitrary metadata.

**Acceptance:** report says below/met declared minimum per variant without winner language; segments are limited
to the registry allow-list and cardinality cap; each cut reruns SRM/integrity; small cells are suppressed; UI,
API and MCP call one resolver; no contact/high-cardinality values appear.

**Risk:** low — read-only aggregation and privacy controls.

## Sprint QA

- **pure specs:** realistic untagged conversion, exact window boundaries, distinct-subject metrics, semantic
  control/basic lift, guardrail direction, clean/SRM distributions and every integrity defect.
- **api/parity specs:** telemetry-loss/degraded states, segment allow-list/cardinality/small-cell suppression,
  sample threshold boundaries and UI/API/MCP equality.
- **browser smoke owed:** yes, to Daniel — authenticated report with one clean and one deliberately skewed run.
- **deterministic gate:** typecheck + build + API/MCP tests green; non-zero realistic fixture required.

## Sprint 2 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. Send balanced control/treatment exposures and normal conversion events without experiment tags.
   → The report joins conversions by opaque subject id and shows non-zero primary/guardrail results.
2. Add enough treatment exposures to violate the declared allocation.
   → SRM appears with expected/observed counts and the report becomes not decision-ready.
3. Expose one subject to both variants and send one out-of-window exposure.
   → Both integrity defects are named without deleting the rows or inventing causes.
4. Open an allowed segment, then request an undeclared/high-cardinality segment.
   → The allowed cut recomputes diagnostics; the unsafe cut is refused or suppressed.
5. Restore a clean fixture and reach the declared minimum sample.
   → Data quality clears and sample guidance says met, but no automatic winner appears.

If any step fails, note the step number + experiment/version — that's the bug report.
