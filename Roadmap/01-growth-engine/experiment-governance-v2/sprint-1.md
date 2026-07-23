# Experiment governance v2 — Sprint 1: Registry, lifecycle and assignment contract

**Status:** ✅ shipped in PR [#19](https://github.com/danybgoode/golden-beans/pull/19)

## Stories

### Story 1.1 — Versioned experiment registry and plan

**As an** experiment owner, **I want** a versioned plan containing hypothesis, eligibility, assignment and
metrics, **so that** the test is auditable before anyone is exposed.

**Acceptance:** owner can create a draft with one semantic control, positive variant weights, stable assignment
entity, primary/guardrail event metrics, bounded segment fields, planned window and minimum sample guidance;
malformed, duplicate and high-cardinality definitions fail; foreign/member mutation is denied; every response
names project and definition version; `EXPERIMENT_GOVERNANCE_ENABLED` exists disabled and gates the new seams.

**Risk:** high — additive database schema and authenticated management; Daniel merges.

### Story 1.2 — Local SDK compatibility and assignment context

**As a** client developer, **I want** governance compatible with local SDK bucketing, **so that** experiment
trust does not add a network dependency to runtime assignment.

**Acceptance:** existing `bucket()`/`trackExposure()` calls still work; optional definition version and assignment
entity context round-trip through the event-router envelope; deterministic fixtures match declared variant keys/
weights; registry outage or gate OFF never changes the locally selected variant; exposure ingest is never blocked
by a stale/missing registry.

**Risk:** high — shared SDK/wire contract; Daniel merges.

### Story 1.3 — Immutable experiment lifecycle

**As an** experiment owner, **I want** lifecycle rules enforced, **so that** results remain tied to the plan that
produced them.

**Acceptance:** lifecycle is draft→running→stopped→decided or invalid; one running version per key; running locks
assignment/metric/window semantics; restart/change creates a new version; stop freezes the analysis window;
transitions are idempotent and audited by actor/time; observed out-of-lifecycle exposures remain stored and are
diagnosed later rather than rejected.

**Risk:** high — database state machine and owner authorization; Daniel merges.

**Implementation note:** `decided` is reserved as a terminal database state in Sprint 1, but the generic
lifecycle RPC cannot enter it. Sprint 3's atomic decision-record RPC will be the only application path from
stopped to decided, so a status flip can never outrun its immutable human rationale and metric snapshot.

## Sprint QA

- **pure specs:** registry schema, weights/control/segment caps, lifecycle transitions, concurrency/idempotency
  and deterministic SDK parity.
- **api specs:** owner/member/foreign mutations, flag OFF/ON, version immutability, audit and registry-outage/
  ingest compatibility.
- **browser smoke owed:** yes, to Daniel — authenticated experiment draft/start/stop using a disposable project.
- **deterministic gate:** typecheck + build + Playwright API green; migration verified locally and production.

**Shipped evidence:** clean migration reset; governance/SDK suite 11/11 green including concurrent version
allocation, owner/member/foreign authorization, immutable/idempotent lifecycle, append-only audit and
function-level anonymous denial; SDK and web typechecks green; production build green. Migration
`20260728100000_experiment_registry.sql` is applied in production. Main deployment `0d118387…` preserved the
legacy public experiment read and `/llms.txt` while the born-OFF governance page returned 404.

## Sprint 1 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. With `EXPERIMENT_GOVERNANCE_ENABLED` OFF, run the existing SDK bucketing/exposure/comparison smoke.
   → v1 behavior remains available and unchanged.
2. Redeploy with the gate ON, sign in as a disposable project owner and open
   https://golden-beans-gamma.vercel.app/app/experiments.
   → “Create experiment” appears for that project.
3. Create a two-variant draft with control, hypothesis, metrics, allocation, window and sample guidance.
   → Version 1 validates and remains draft until explicitly started.
4. Start it, then try to alter a variant or metric.
   → The mutation is refused; creating version 2 is offered instead.
5. Disable the registry/database wrapper and run the SDK assignment again.
   → The same subject receives the same local variant and exposure ingest still succeeds.

If any step fails, note the step number + URL/response — that's the bug report.
