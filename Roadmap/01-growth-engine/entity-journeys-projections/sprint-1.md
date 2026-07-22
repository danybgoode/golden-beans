# Entity journeys — Sprint 1: Definition contract and deterministic subject projection

**Status:** ✅ complete on the Sprint 1 feature branch; review/merge and the production smoke remain

## Stories

### ✅ Story 1.1 — Versioned journey-definition registry

**As a** tenant owner, **I want** a versioned ordered journey definition, **so that** lifecycle meaning is
explicit and auditable before anyone relies on it.

**Acceptance:** an owner can create a draft, validate bounded predicates, activate one version and create a new
version for later edits; only one version is active; duplicate stage keys and unsafe/high-cardinality predicate
fields fail closed; members and foreign-project identities cannot mutate definitions; every change records
actor/time; `JOURNEY_PROJECTIONS_ENABLED` exists disabled and OFF hides the new seams.

**Risk:** high — additive database migration and authenticated project management; Daniel merges.

**Locked contract / implementation status:** 1–20 uniquely keyed `lower_snake_case` stages; each stage
matches an event name plus at most five exact scalar TAG predicates from `source`, `channel`, `campaign`,
`plan`, and `region` (string values ≤64; numbers are safe integers with absolute value ≤10^15).
Optional cohort entry must name stage 1. Optional retention is
`{stageKey, anchorStageKey, withinDays}`, with an existing anchor at/before the target and a 1–365-day
integer window. Definitions are immutable numbered rows; edits create the next version, and activation moves
one per-project registry pointer. Owner session identity supplies the audit actor; members see the registry
read-only; nonmembers/foreign identities fail closed. The enablement flag is born OFF and returns 404 before
auth/validation. Local migration reset, pure/DB/API specs, mutation checks, typecheck and build are green;
remote migration application and authenticated browser smoke remain deployment/review work.

### ✅ Story 1.2 — Deterministic subject projection

**As a** product operator, **I want** one subject projected from source events, **so that** I can explain its
current stage, first-entered time and complete ordered history.

**Acceptance:** an import-free evaluator handles ordered, late, duplicate, out-of-order and same-time fixtures;
highest satisfied stage wins; lower-stage events do not regress; same-time ties use canonical event id;
irrelevant events are ignored; response names definition version and source freshness.

**Risk:** low — read-only pure/query logic over existing telemetry.

**Implementation status:** pure query-time evaluation reads only canonical, project-scoped subject facts;
it orders by `occurred_at ?? created_at`, then canonical event id, and records only actual first
satisfaction timestamps. The version is required on API reads, history is definition-stage order, and
freshness reports the latest effective fact time separately from latest receipt time. The canonical
API is `GET /api/v1/journeys/<key>/subject?subjectId=<opaque-id>&version=<positive-integer>`; no
legacy `/subjects/<id>` alias exists. Pure truth-table and API isolation specs, mutation checks,
typecheck and build are green locally; production smoke remains deployment/review work.

## Sprint QA

- **pure specs:** registry schema/state machine plus evaluator table for ordered/late/duplicate/out-of-order/
  same-time/irrelevant events and no-regression behavior.
- **api specs:** owner/member/foreign definition mutations; API-key project scoping; flag OFF/ON; subject read
  with realistic stable identity and definition version.
- **browser smoke owed:** yes, to Daniel — authenticated definition creation/activation for a disposable project.
- **deterministic gate:** typecheck + build + Playwright API green; a dedicated built-server OFF pass pins
  journey page/API 404s before the normal ON suite; migration verified locally and in production.

## Sprint 1 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. With `JOURNEY_PROJECTIONS_ENABLED` OFF, open the disposable project's journey-management URL,
   call the subject endpoint without authorization, then open `/llms.txt`.
   → Both new journey seams return 404 (the API does so before auth, never 401) while the existing
   agent manifest returns 200.
2. Redeploy with the gate ON, sign in as the disposable project owner and open
   `https://golden-beans-gamma.vercel.app/app/journeys/<project-slug>`.
   → “Create journey” appears for that project.
3. Create `merchant_activation` with three ordered smoke stages, then activate version 1.
   → The definition displays one active version and immutable activation history.
4. Send the three subject events out of order, with one duplicate, then request
   `https://golden-beans-gamma.vercel.app/api/v1/journeys/merchant_activation/subject?subjectId=merchant-smoke-journey-001&version=1`
   using the disposable API key.
   → One subject returns the correct current stage, first-entered timestamps and version 1.
5. Try to mutate the definition as a member and through another project's identity.
   → Both are denied and no definition changes.

If any step fails, note the step number + URL/response — that's the bug report.
