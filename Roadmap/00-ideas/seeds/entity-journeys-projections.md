---
title: "Entity journeys — configurable lifecycle projections beyond fixed TARS"
slug: entity-journeys-projections
status: scaffolded
area: "01"
type: feature
priority: "#2b"
risk: high
epic: "01-growth-engine/entity-journeys-projections"
build_order: "#2b"
updated: 2026-07-21
---

# Scope — Entity journeys — configurable lifecycle projections beyond fixed TARS

## Outcome & signal

As a product team, I want to define an ordered lifecycle for any event subject and ask Golden Beans for its
current stage, stage history, time in stage and cohort movement, so that a product can operate a merchant,
account, project, subscriber or seller journey without hard-coding that domain into the engine.

Daniel can test the result with one disposable Miyagi merchant. The same stable merchant subject emits the
13 agreed activation events in deliberately shuffled order. Golden Beans must return the correct current stage,
first-entered timestamp and complete ordered history; replaying the same events must not change the answer. The
cohort view must show that merchant once, with truthful stage aging and retention, and no merchant PII.

## Classification and Stage-2.5 bucket

**Feature / Builder. Genuinely new analytical primitive on shipped telemetry.** TARS already computes a fixed
three-state funnel over one feature and the A/B query joins events by subject identity. Neither can accept a
tenant-defined ordered lifecycle, version its definitions, project one subject's history or compare stage aging
across cohorts. This is not a CRM/task system and does not replace the existing TARS view.

## Recommended architecture decision

Use a **versioned journey-definition registry plus deterministic query-time projection over canonical events**
for v1. Keep the pure evaluator import-free, with a DB wrapper following `tars.ts` / `tars-query.ts`. Do not add
materialized subject/history tables or a second projection queue yet: the first proof is 25 founding merchants,
query-time evaluation repairs naturally when events arrive late or out of order, and every result can be rebuilt
from source facts. Record query latency and event volume; introduce incremental materialization only when a named
tripwire is observed (p95 journey query >2s or a project/journey scan exceeds 1M relevant events).

## Scope

**In v1:**
- A per-project, versioned journey registry: stable key, entity type, description, ordered stages, cohort-entry
  rule, optional retention stage/window and one active definition version at a time.
- A deliberately bounded predicate contract: event name plus optional exact matches on allow-listed scalar
  subject/event tags. No arbitrary JavaScript, SQL, regex or customer-authored transforms.
- Monotonic ordered evaluation: current stage is the highest satisfied stage; first satisfaction records the
  entered-at time; a later lower-stage event cannot regress the journey; event ordering is `occurred_at` then
  canonical event id for deterministic ties.
- Query-time subject projection: current stage, entered-at, age, first-reached history, missing next stage and
  the definition version used.
- Aggregate journey reads: stage counts/conversion, median/p90 age, drop-off, cohort entry and configured
  retention outcome, all with source freshness and definition version.
- Owner-authenticated definition management, member-authenticated UI reads, API-key reads and read-only MCP
  parity through the existing connector token/flag gates.
- One Miyagi dogfood definition for the 13-stage founding-merchant lifecycle using opaque merchant subject ids.

**Out of v1:**
- CRM contacts, notes, tasks, owners, reminders, outbound messaging or Medusa commerce state.
- Branching/cyclic journeys, stage regression, arbitrary formulas, SQL/JavaScript predicates or a visual
  workflow builder.
- Materialized per-subject projection/history tables, background projector infrastructure or a second event
  queue before the scale tripwire fires.
- Public customer-journey routes. Any later demo route must reuse `assertPublicAllowedSlug()` and remain
  demo-only.
- Mutating a source event, claiming exactly-once external delivery or inferring consent from lifecycle events.

## What already exists (reuse, don't rebuild)

| Existing capability | Reuse decision |
|---|---|
| `events` + `POST /api/v1/track` | Keep one canonical tenant-scoped event stream; never add journey events directly. |
| `event-destination-router` subject contract | Hard dependency for `entity_type`, opaque subject id, `occurred_at`, correlation and idempotency. |
| `apps/web/lib/tars.ts` | Reuse the import-free pure evaluator pattern and distinct-subject semantics. |
| `apps/web/lib/tars-query.ts` | Reuse the server-only query wrapper and API/UI shared resolver shape. |
| `feature_registry` + `/api/v1/features/sync` | Reuse project-scoped registry/versioning conventions; do not overload a feature into a journey. |
| `apps/web/lib/auth.ts` | API-key identity remains the only project source on API reads/writes. |
| `project_members` + `membership.ts`/`roles.ts` | Owners manage definitions; members read only their projects. |
| MCP connector token + `CONNECTOR_ENABLED` | Add read tools only after both existing connector gates pass. |
| Current `/app/funnel` surface | Reuse tables, empty/error/degraded states and navigation language. |
| Golden Beans event router delivery history | Report source/event freshness; do not make journey reads depend on an external destination's health. |

## UX heuristics & rails check

- **CI guards:** TypeScript/build + one API spec per testable story; add pure evaluator fixtures for late,
  duplicate, out-of-order and same-timestamp events, plus project-isolation and realistic non-zero fixtures.
- **Trust rail:** distinguish `zero subjects`, `no qualifying events`, `stale source`, `definition changed` and
  `query failed`; an honest-looking zero must never hide a broken write/read contract.
- **Security rail:** owner-only definition mutation, member/project-scoped reads, bounded subject ids and no PII
  in definition examples, MCP output or URLs.
- **Design debt:** there is no macro-section README or dedicated Golden Beans UX audit. Reuse the current `/app`
  shell and accessibility/empty-state patterns; do not broaden this epic into a dashboard redesign.

## Kill-switch / runtime gate (risk: high — Stage 6b)

Recommend `JOURNEY_PROJECTIONS_ENABLED` as an **enablement** environment gate in `lib/flags.ts`, default
**OFF** and created disabled in preview/production. It gates the new journey definition/read/UI/MCP seams while
existing ingest, TARS, A/B and destinations remain unchanged. Definition migrations are additive and use
expand/contract; they cannot be rolled back by the flag. Because Vercel snapshots environment variables at
build time, changing the gate requires a new Git-tracked deployment before live behavior can change.

## Delivery slices and acceptance criteria

### Sprint 1 — Definition contract and deterministic subject projection

1. **As a tenant owner, I want** a versioned ordered journey definition, **so that** lifecycle meaning is
   explicit and auditable. **Acceptance:** owner can create a draft, validate bounded predicates, activate one
   version and create a new version for later edits; members/foreign projects cannot mutate it; duplicate stage
   keys and unsafe/high-cardinality predicate fields fail closed. **Risk:** HIGH — additive DB migration and
   authenticated management. **QA:** registry schema/state-machine pure specs + owner/member/foreign API specs;
   authenticated management smoke owed to Daniel.
2. **As a product operator, I want** one subject projected deterministically, **so that** I can explain its
   current stage and history from source events. **Acceptance:** ordered, late, duplicate and out-of-order
   fixtures produce the same current stage/history; lower-stage events do not regress; same-time ties use event
   id; response names definition version and freshness. **Risk:** LOW — read-only pure/query logic. **QA:**
   import-free evaluator table + API fixture with an intentionally untagged irrelevant event.

### Sprint 2 — Cohort, aging and trustworthy operating reads

1. **As an activation lead, I want** stage conversion, aging and drop-off for a cohort, **so that** I can see
   where the lifecycle stalls. **Acceptance:** stage counts, conversion, median/p90 age, missing-next-stage and
   configured retention agree with drill-through subject ids; cohort/window/timezone are explicit; no qualifying
   data, stale data and query failure render differently. **Risk:** LOW. **QA:** fixture-driven aggregate/API
   specs including zero vs broken and late-event repair.
2. **As an authorized teammate or agent, I want** the same journey reads in UI, API and MCP, **so that** weekly
   operations do not depend on scraping a page. **Acceptance:** `/app/journeys/<project>/<journey>` and read-only
   MCP tools share one resolver/version; MCP retains connector flag + revocable-token gates; foreign-project and
   public reads fail; output is paginated and PII-free. **Risk:** HIGH — auth/connector boundary. **QA:** parity,
   connector-off/revoked-token and two-project isolation specs; browser/MCP smoke owed to Daniel.

### Sprint 3 — Miyagi founding-merchant proof and scale decision

1. **As Miyagi's activation team, I want** its 13 stages represented as a Golden Beans journey, **so that** the
   scorecard consumes reusable lifecycle analytics while Miyagi keeps merchant work records. **Acceptance:** one
   opaque merchant fixture reaches permission, preview, claim, payments, three-products, share, inquiry, sale and
   30-day-retained stages from the event-router contract; replay/out-of-order delivery is stable; no name, phone,
   email, notes or Medusa state enters Golden Beans. **Risk:** HIGH — cross-repo contract and real tenant smoke.
   **QA:** identical contract fixtures in Golden Beans/Miyagi; production disposable-merchant smoke owed to Daniel.
2. **As a platform owner, I want** evidence for or against materialization, **so that** we add projection
   infrastructure only when query-time computation stops serving real use. **Acceptance:** production-safe
   query timing/event-count telemetry is visible per journey without subject data; the p95/1M-event tripwires are
   documented; the epic closes with keep-query-time or a separately groomed materialization seed. **Risk:** LOW.
   **QA:** bounded telemetry/redaction spec + production query smoke.

## Deploy order and dependencies

`event-destination-router` Sprint 1 must first ship the stable subject/entity/occurred-at/idempotency contract.
Land the additive registry migration and OFF gate, then Sprint 1 evaluator, Sprint 2 reads and Sprint 3 Miyagi
proof. Apply Supabase migrations separately from Vercel deployment. Create/change the env gate, then trigger a
Git-tracked deployment before checking behavior. Enable only after one two-project isolation sweep and the
disposable merchant fixture are green.

## Open risks / research

- **Architecture panel offered, not run:** query-time projection versus materialized projection tables is an
  expensive-to-reverse choice. Recommendation is query-time v1 with measured tripwires; Daniel may request the
  advisory cross-family panel before approving this scope.
- The event router is scaffolded, not shipped. This epic can be approved/scaffolded, but implementation cannot
  begin until its stable subject contract lands; do not temporarily overload legacy `userId` and create a second
  identity contract.
- Journey definition edits recompute history under a new version. UI/API must never silently compare cohorts
  calculated under different versions.
- Exact-match tag predicates need a short allow-list and cardinality cap to prevent PII/high-cardinality
  dimensions from becoming an accidental customer-data store.
