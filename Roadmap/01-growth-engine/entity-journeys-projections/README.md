---
status: shipped
slug: entity-journeys-projections
---

# Epic: Entity journeys — configurable lifecycle projections beyond fixed TARS

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/entity-journeys-projections.md`](../../00-ideas/seeds/entity-journeys-projections.md)

## Why

Product teams need to describe more than a fixed three-step funnel. This epic lets a tenant define an ordered
lifecycle for any event subject and ask Golden Beans for its current stage, history, aging, conversion and
retention without turning the engine into a CRM or hard-coding Miyagi's merchant model.

## Platform-primitives note

Canonical events remain the only source facts. A versioned journey definition and import-free evaluator produce
the read model at query time, following the shipped TARS architecture. There is no second event stream,
background projector or materialized subject/history store in v1; those require measured scale evidence.

## Decisions locked at scope approval

1. **Query-time v1:** recompute from canonical events so late/out-of-order facts repair naturally.
2. **Bounded definitions:** event names plus exact matches on allow-listed scalar fields—no SQL or code.
3. **Ordered and monotonic:** highest satisfied stage wins; lower-stage events never regress the subject.
4. **Version-explicit:** every subject/cohort result names the journey-definition version used.
5. **Golden Beans is analytical:** contacts, consent, tasks and commerce stay in Miyagi/Medusa.
6. **Scale must be earned:** materialization is separately groomed only after p95 >2s or >1M relevant events.

## Definition contract locked in Story 1.1

- A definition contains **1–20 ordered stages**. Every stage key and the definition's entity type use
  unique, letter-initial `lower_snake_case` values up to 64 characters.
- A stage matches one event name plus **0–5 exact tag predicates**. Predicate fields are limited to
  `source`, `channel`, `campaign`, `plan`, and `region`; values are string/number/boolean scalars, with
  strings capped at 64 characters and numbers restricted to **safe integers** with absolute value at
  most **10^15** for exact JSON/JavaScript/Postgres round-trips. No metadata fields, subject ids, SQL,
  regex, code, or transforms.
- Cohort entry is optional; when present it is always **stage 1**. Retention is optional and exactly
  `{stageKey, anchorStageKey, withinDays}`: both keys must exist, the anchor precedes or equals the target,
  and the window is an integer from 1–365 days.
- The stable journey key owns immutable numbered definition rows. Creating another version is the edit path;
  activation only moves forward to a newer draft, and one registry pointer makes exactly one version active.
- Definition creation and activation are owner/session operations. Version allocation, state change and the
  actor/time audit row commit in the same database transaction; members read only and nonmembers see no surface.

## What already exists (reuse, don't rebuild)

| Capability | Existing seam | Reuse |
|---|---|---|
| Canonical telemetry | `events` + `POST /api/v1/track` | Read one tenant-scoped stream; never direct-write journey facts |
| Stable entity identity | `event-destination-router` actor/subject contract | Depend on entity type, opaque subject id, occurred-at and event id |
| Pure funnel evaluation | `apps/web/lib/tars.ts` | Reuse zero-runtime-import evaluator shape |
| Shared query wrapper | `apps/web/lib/tars-query.ts` | Reuse one resolver across API/UI/MCP |
| Registry conventions | features + `/api/v1/features/sync` | Reuse validation/upsert/version patterns, not the feature table itself |
| API tenancy | `apps/web/lib/auth.ts` | Resolve project only from the API key |
| User authorization | `project_members`, `membership.ts`, `roles.ts` | Owners manage definitions; members read their project |
| Agent reads | MCP token + `CONNECTOR_ENABLED` | Extend only after both existing gates pass |
| App presentation | `/app/funnel` | Reuse accessible tables, filters and explicit empty/error states |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | ✅ 1.1 Versioned journey-definition registry | high |
| 1 | ✅ 1.2 Deterministic subject projection | low |
| 2 | ✅ 2.1 Cohort conversion, aging and drop-off | low |
| 2 | ✅ 2.2 UI, API and MCP read parity | high |
| 3 | ✅ 3.1 Miyagi 13-stage founding-merchant proof | high |
| 3 | ✅ 3.2 Query-time scale decision from measured evidence | low |

## Kill-switch

`JOURNEY_PROJECTIONS_ENABLED` is an **enablement** environment gate in `lib/flags.ts`, born **OFF** in
preview and production. It gates the new definition/read/UI/MCP seams while ingest, TARS, A/B and destinations
continue unchanged. Additive migrations remain after rollback. Because Vercel snapshots environment variables
at build time, every gate change requires a new Git-tracked deployment before behavior can change. CI boots a
dedicated built server with the flag OFF and pins page + pre-auth API 404s before booting the normal ON test server.

## Deploy order

Wait for event-destination-router Sprint 1's subject/occurred-at/idempotency contract. Then land the additive
journey registry migration and OFF gate, Sprint 1 evaluator, Sprint 2 operating reads, and Sprint 3 Miyagi proof.
Apply Supabase migrations separately from the Vercel deployment. Enable only after a two-project isolation sweep
and disposable merchant fixture pass in production.

## Definition of Done (epic)

- [x] All sprints merged to `main` + smoke-tested (authenticated Miyagi↔Golden Beans browser comparison stated as owed)
- [x] Each sprint walkthrough contains real deployed URLs and disposable subject data
- [x] Late, duplicate, out-of-order and same-time fixtures produce deterministic projections
- [x] UI/API/MCP use one resolver and pass two-project isolation + connector gate tests
- [x] Miyagi's 13-stage proof carries no merchant PII and does not copy CRM/commerce state
- [x] Query timing/event-count telemetry supports keep-query-time or a separately groomed materialization seed
- [x] `JOURNEY_PROJECTIONS_ENABLED` exists born OFF; gate flip includes a new deployment and live verification
- [x] This README marked shipped; sprint headings carry commit refs
- [x] `RETROSPECTIVE.md`, product poster and durable learnings updated
- [x] Feature branch deleted and `node scripts/build-order.mjs` run

## Production closeout

Shipped in PRs [#17](https://github.com/danybgoode/golden-beans/pull/17),
[#18](https://github.com/danybgoode/golden-beans/pull/18), and
[#20](https://github.com/danybgoode/golden-beans/pull/20). The gate-on production deployment is
`cd62a98cdc65628a360bf36948b946d6660f4504`.

The live self-tenant proof reached all 13 `merchant_activation` v1 stages through normal ingest and returned
the same one-subject retained cohort through Bearer API and MCP. Query-time remains the selected architecture:
production p95 was 118.87 ms for subject projection and 119.32 ms after the MCP cohort sample, with 13 relevant
events versus the >2,000 ms / >1,000,000-event tripwires. The disposable API and connector credentials used for
the proof are revoked.
