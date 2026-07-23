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
the resolver calls a service-role-only RPC whose single project/entity/subject-scoped SQL statement
aggregates the complete ordered fact set into one JSONB value. One database snapshot avoids both
PostgREST's row cap and cross-page movement during concurrent ingest. Evaluation then orders the complete
set by `occurred_at ?? created_at`, then canonical event id, and records only actual first satisfaction
timestamps. The version is required on API reads, history is definition-stage order, and freshness
reports the latest effective fact time separately from latest receipt time. The canonical
API is `GET /api/v1/journeys/<key>/subject?subjectId=<opaque-id>&version=<positive-integer>`; no
legacy `/subjects/<id>` alias exists. Pure truth-table and API isolation specs, mutation checks,
typecheck and build are green locally; production smoke remains deployment/review work.

**PR #17 review disposition:** accepted fixes move owner resolution ahead of every create-payload
validation and make unexpected registry timestamps render fail-safe. The suggested predecessor-gated
progression change was rejected: this epic's approved contract explicitly says highest satisfied stage
wins, lower-stage events never regress, and history records each stage's actual first satisfaction in
stage order. Requiring predecessors would fabricate or suppress facts and change the product semantics.

**PR #17 round-two disposition:** accepted the silent PostgREST-cap finding. The projection resolver
now paginates the complete scoped subject fact set; a real DB/API fixture places a qualifying stage and
the newest freshness fact after 1,000 earlier rows, and restoring the single-page query fails that spec.
Also accepted defensive rejected-promise handling for both UI mutations and lower-snake-case route-key
validation after the OFF/auth gates but before the resolver. The two-project collision tripwire remains.

**PR #17 round-three disposition:** accepted structured owner-side validation for non-string action
arguments and defensive runtime handling for malformed event tags. The unauthorized oracle-order proof
still reaches ownership before those checks. Antigravity's suggestion to remove `service_role` RPC grants
was rejected: the Server Actions and subject route use the server-only service-role client to call these
functions, so after `PUBLIC`/`anon`/`authenticated` are revoked, the explicit `service_role` grants are
the intended and necessary execution path; the function-level anonymous denials remain pinned by DB specs.
Codex's concurrent-ingest finding replaced offset pagination with the single-snapshot aggregate RPC;
its missing-tenant-predicate finding added `project_id` to every create/activate version lookup and update.
The UI now hides obsolete drafts, and the root env reference lists the born-OFF journey gate plus redeploy
requirement.

**PR #17 round-four disposition:** accepted all final precision and test-hygiene findings. Journey
timestamps no longer pass through JavaScript's millisecond-only `Date` representation: the evaluator
normalizes exact Postgres `timestamptz` values to canonical UTC, compares whole seconds plus retained
microseconds before the event-id tie break, and returns the exact source precision. An adversarial pure
fixture and a real DB/API fixture pin `.000100` before `.000900` inside one millisecond; restoring
millisecond-only comparison fails the focused proof. Definition description, event and predicate limits
now count Unicode code points like PostgreSQL `char_length`, with 500/501, 128/129 and 64/65 emoji
boundaries while the independent 32 KiB UTF-8 payload cap remains pinned. Database specs require the
CI-exported local `SUPABASE_DB_URL` and clean audit plus project fixtures through a test-only
migration-owner connection; the production `service_role` grants remain unchanged. Finally, the roadmap
extractor now recognizes status-emoji story headings, and regenerating (never hand-editing)
`BUILD-ORDER.md` reports the accurate 2/6 stories.

**PR #17 round-five disposition:** accepted the workspace-dependency and near-limit JSONB findings:
the web test workspace now declares both `pg` and its types, and the owner command mirrors PostgreSQL's
JSONB text byte accounting before the RPC while retaining the raw 32 KiB request envelope. A schema-valid
boundary fixture pins the same rejection in TypeScript and the database. The roadmap parser regression is
already a required `scripts-guard.yml` / pre-commit test (`cli-tests`), so the suggestion that it was outside
CI was closed with the actual gate evidence. Antigravity's external quota was unavailable for this delta;
its preceding clean verdict was supplemented by a fresh Terra review, whose invalid-calendar finding added
explicit leap-year/day/time validation before timestamp normalization.

**PR #17 final Codex disposition:** accepted the lifetime-history and obsolete-version findings. The
single-snapshot subject RPC now streams a measurement over at most 10,001 project/type/subject-scoped
candidates, aggregates only when the complete history is within 10,000 facts and 32 MiB of aggregate
JSON text, and raises a clear program-limit error otherwise; it never returns a partial projection. Database-backed boundary
fixtures pin success at exactly 10,000 and fail-closed behavior at 10,001. The registry snapshot mapper
now consistently removes never-activated versions at or below the active version while retaining the
immutable activation history and newer actionable drafts, matching the management UI claim.

## Sprint QA

- **pure specs:** registry schema/state machine plus evaluator table for ordered/late/duplicate/out-of-order/
  same-time/irrelevant events and no-regression behavior.
- **api specs:** owner/member/foreign definition mutations; API-key project scoping; flag OFF/ON; subject read
  with realistic stable identity and definition version.
- **browser smoke owed:** yes, to Daniel — authenticated definition creation/activation for a disposable project.
- **deterministic gate:** typecheck + build + Playwright API green; a dedicated built-server OFF pass pins
  journey page/API 404s before the normal ON suite; migration verified locally, with production
  application still owed as the release step before merge.

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
