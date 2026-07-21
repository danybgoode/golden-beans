---
status: scaffolded
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
| 1 | 1.1 Versioned journey-definition registry | high |
| 1 | 1.2 Deterministic subject projection | low |
| 2 | 2.1 Cohort conversion, aging and drop-off | low |
| 2 | 2.2 UI, API and MCP read parity | high |
| 3 | 3.1 Miyagi 13-stage founding-merchant proof | high |
| 3 | 3.2 Query-time scale decision from measured evidence | low |

## Kill-switch

`JOURNEY_PROJECTIONS_ENABLED` is an **enablement** environment gate in `lib/flags.ts`, born **OFF** in
preview and production. It gates the new definition/read/UI/MCP seams while ingest, TARS, A/B and destinations
continue unchanged. Additive migrations remain after rollback. Because Vercel snapshots environment variables
at build time, every gate change requires a new Git-tracked deployment before behavior can change.

## Deploy order

Wait for event-destination-router Sprint 1's subject/occurred-at/idempotency contract. Then land the additive
journey registry migration and OFF gate, Sprint 1 evaluator, Sprint 2 operating reads, and Sprint 3 Miyagi proof.
Apply Supabase migrations separately from the Vercel deployment. Enable only after a two-project isolation sweep
and disposable merchant fixture pass in production.

## Definition of Done (epic)

- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each sprint walkthrough contains real deployed URLs and disposable subject data
- [ ] Late, duplicate, out-of-order and same-time fixtures produce deterministic projections
- [ ] UI/API/MCP use one resolver and pass two-project isolation + connector gate tests
- [ ] Miyagi's 13-stage proof carries no merchant PII and does not copy CRM/commerce state
- [ ] Query timing/event-count telemetry supports keep-query-time or a separately groomed materialization seed
- [ ] `JOURNEY_PROJECTIONS_ENABLED` exists born OFF; gate flip includes a new deployment and live verification
- [ ] This README marked shipped; sprint headings carry commit refs
- [ ] `RETROSPECTIVE.md`, product poster and durable learnings updated
- [ ] Feature branch deleted and `node scripts/build-order.mjs` run
