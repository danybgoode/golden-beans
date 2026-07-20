---
title: "Event destination router — reliable fan-out to CRM and downstream tools"
slug: event-destination-router
status: scaffolded
area: "01"
type: feature
priority: "#2a"
risk: high
epic: "01-growth-engine/event-destination-router"
build_order: "#2a"
updated: 2026-07-20
---

# Scope — Event destination router — reliable fan-out to CRM and downstream tools

## Outcome & signal

As a product team, I want every validated Golden Beans event persisted once and delivered asynchronously
to configured destinations, so that analytics, CRM, lifecycle operations, and future agency clients can
share one event stream without coupling product requests to any vendor.

Daniel can test the result by configuring a disposable signed-webhook destination, sending one event
through the existing SDK, observing one persisted event and one successful delivery, forcing a destination
failure, then seeing bounded retries, a visible failed delivery, and a successful manual replay. The first
real proof is Miyagi's merchant-activation stream projected into its CRM view; an Attio free workspace is an
optional operator-facing mirror, never the source of truth.

## Stage-2.5 bucket

**Genuinely new delivery primitive on an already-shipped ingest.** Golden Beans already owns tenant-scoped
event ingest, the TypeScript SDK, extensible `tags`/`metadata`, TARS, North Star inputs, and A/B exposures.
It does **not** yet route events: `/api/v1/track` inserts into `events` and returns. The original v1 scope
explicitly deferred Pub/Sub/vendor fan-out until a real second sink existed. Miyagi's activation CRM is that
second sink, so the deferred trigger has fired.

## Scope

**In v1:**
- An additive versioned event contract with stable event id, occurred-at time, actor, subject/entity, and
  correlation/idempotency context; existing callers remain valid.
- A per-project destination registry with event-name filters, enabled/disabled state, signing configuration,
  and a provider-neutral adapter contract.
- Transactional outbox/delivery-attempt records created with the canonical event so a destination outage
  never blocks or loses ingest.
- Signed HTTP webhook delivery with bounded exponential retries, terminal failure/dead-letter state,
  delivery history, secret rotation, and manual replay.
- A low-volume Miyagi proof: merchant lifecycle events reach a Miyagi-owned projection endpoint without
  duplicating Medusa commerce truth.
- An optional Attio adapter/projection proof after the provider-neutral webhook seam is green. Provider
  failure degrades independently; Golden Beans events and Miyagi operations continue.
- Tenant isolation, payload scrubbing/caps, rate limits, delivery observability, and deterministic API specs.

**Out of v1:**
- Kafka/Pub/Sub infrastructure, arbitrary customer-authored transforms, a visual ETL builder, bidirectional
  CRM sync, bulk historical warehouse export, and a claim of exactly-once delivery to external systems.
- Moving merchant workflow or commerce state into Golden Beans.
- Making Attio, HubSpot, or any other vendor the canonical store.
- High-volume destination SLAs before real traffic reaches the existing scale tripwires.

## What already exists (reuse, don't rebuild)

| Capability | Existing seam | Reuse |
|---|---|---|
| Tenant-scoped ingest | `apps/web/app/api/v1/track/route.ts` + `apps/web/lib/auth.ts` | Validate and persist the canonical event once |
| Open event envelope | `apps/web/lib/track-schema.ts` | Add identity/version fields compatibly; keep `tags`/`metadata` open |
| SDK | `packages/sdk/src/index.ts` | Add optional subject/correlation context without breaking `track()` |
| Event store | `apps/web/supabase/migrations/20260713220000_track_events.sql` | Keep `events` canonical; add outbox/delivery tables rather than a parallel ingest |
| Tenant/key lifecycle | `02-commercial/multi-tenant-activation` | Reuse project membership and `api_keys`; do not invent destination tenancy |
| DB-backed bounded writes | `apps/web/lib/rate-limit.ts` | Pattern for serverless-safe counters and guarded public writes |
| Existing analytics | TARS, North Star, experiments | All continue reading the canonical stream regardless of destination health |

## UX heuristics & rails check

- **CI guards covering this surface:** TypeScript/build gate plus one API spec per route; add an invariant
  that destination delivery is never awaited by `/track` and cross-project destination access is refused.
- **Audits-lens findings that apply:** no Golden Beans UX audit exists yet; reuse the current `/app` table,
  empty/error-state, and token-management patterns from the commercial and activation epics.
- **Design-language debt:** `AGENTS.md`, the poster, deployment rail, and locale policy still contain template
  markers. This epic must not broaden into that cleanup, but its routes and runbook must use verified current
  architecture rather than template placeholders.

## Kill-switch / runtime gate (risk: high — Stage 6b)

Recommend `DESTINATION_DELIVERY_ENABLED` as an **enablement** gate, default **OFF**, checked only by the
dispatcher/worker seam; ingest and outbox persistence stay on so disabling delivery never loses events.
Create it disabled in preview and production, smoke one disposable destination, then flip deliberately.
Per-destination disable/revocation is the fine-grained kill. Additive migrations use expand/contract and
cannot themselves sit behind a runtime gate.

## Acceptance criteria

### Sprint 1 — Contract and durable queue
- **As a client developer, I want** optional actor/subject/correlation fields in the SDK, **so that** product
  events can describe a merchant, shop, promoter, or experiment without overloading `userId`.
  **Acceptance:** old SDK payloads still ingest; a new merchant event round-trips all context; malformed
  identity data is rejected. **Risk:** HIGH (DB migration/shared contract). **QA:** schema + ingest API spec,
  including an observed-red compatibility case.
- **As an operator, I want** an outbox row committed with each eligible event, **so that** later delivery is
  recoverable. **Acceptance:** a forced destination outage still returns successful ingest, preserves one
  event/outbox record, and never duplicates it on an idempotent retry. **Risk:** HIGH. **QA:** DB/API spec and
  a local failure-injection smoke.

### Sprint 2 — Destinations and reliable delivery
- **As a tenant owner, I want** to create, disable, rotate, and test a signed webhook destination with event
  filters, **so that** only intended events leave my project. **Acceptance:** foreign-project access fails;
  disabled destination receives nothing; signature verifies; secrets are never returned after creation.
  **Risk:** HIGH (credentials/auth boundary). **QA:** API isolation, signature, and redaction specs.
- **As an operator, I want** retries, delivery history, terminal failure and replay, **so that** I can recover
  without resending source events. **Acceptance:** retry schedule is bounded, terminal failure is visible,
  replay creates one new attempt and a successful destination receives one logical event id. **Risk:** HIGH.
  **QA:** pure retry-policy spec plus API smoke against a disposable receiver.

### Sprint 3 — CRM proof and operating view
- **As Miyagi's activation team, I want** merchant lifecycle events projected into a Miyagi-owned CRM
  endpoint, **so that** product behavior updates the relationship pipeline without manual reconciliation.
  **Acceptance:** permission, preview approval, claim, three-products-live, first-sale and 30-day-retained
  events update the correct merchant projection; replay is idempotent; Medusa remains commerce truth.
  **Risk:** HIGH (cross-repo contract + DB migration in Miyagi). **QA:** contract fixtures in both repos and a
  real cross-repo smoke with disposable merchant data.
- **As a three-person pilot team, I want** an optional Attio mirror, **so that** I can use a polished CRM UI
  while Miyagi remains canonical. **Acceptance:** contact/company/deal projection is idempotent; provider
  outage surfaces in delivery history but does not block field work; deleting the adapter leaves canonical
  data intact. **Risk:** HIGH (external credential). **QA:** mocked adapter spec; real free-workspace smoke
  owed to Daniel because it requires his credential.

## Open risks / research

- **Architecture fork — panel offer required before scaffold:** transactional outbox tables + a bounded
  serverless dispatcher versus introducing Pub/Sub now; provider-neutral webhooks versus a first-party Attio
  adapter; identity fields on `events` versus a related entity table. The advisory cross-panel is available
  before Daniel locks the scope; it is not a gate and has not been run.
- Free CRM tiers are operating surfaces, not durable architecture. Verified 2026-07-20: Attio Free supports
  up to 3 seats, 3 objects and API access on all plans; HubSpot Free supports up to 2 users and 1,000 contacts;
  Twenty is free when self-hosted but adds operational burden. Sources:
  [Attio pricing](https://attio.com/pricing), [Attio API availability](https://attio.com/help/reference/workspace-settings-billing/attio-plans-and-features),
  [HubSpot free CRM](https://www.hubspot.com/products/crm), [Twenty pricing](https://docs.twenty.com/user-guide/billing/capabilities/pricing-plans).
- Delivery is **at least once**. Consumer idempotency by stable event id is mandatory; do not claim exactly
  once across an external network.
- The first dispatcher should stay inside the existing Vercel/Supabase rail until measured traffic reaches
  the already-recorded move-to-Cloud-Run tripwire.
