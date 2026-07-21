# Event destination router — Sprint 1: Contract and durable queue

**Status:** 🟦 In review — Story 1.1 ✅ (`3d6950c`), Story 1.2 ✅ (`ea862d1`). Gate green (167 passed); cross-review pending.

## Stories

### Story 1.1 — Versioned actor and subject context

**As a** client developer, **I want** optional actor, subject, correlation, occurred-at and idempotency context
on `track()`, **so that** one stream can describe a merchant, shop, promoter, campaign or experiment without
overloading `userId`.

**Acceptance:** existing SDK payloads still ingest unchanged; a new merchant event round-trips its versioned
context; malformed ids/timestamps are rejected; project identity still comes only from the credential.

**Risk:** high — shared SDK/wire contract + additive DB migration; Daniel merges.

**✅ Implemented `3d6950c` (on-branch; live at merge).** The contract is `context: { version: 1, actor?, subject?, correlationId?, occurredAt?, idempotencyKey? }`, all optional, on `POST /api/v1/track` and `packages/sdk`.

Decisions worth knowing, because the next two epics depend on them:
- **`userId` stayed REQUIRED.** Making it optional would have been a breaking change dressed as an addition — every shipped TARS/A-B read counts DISTINCT `userId`, so a payload omitting it would ingest happily and be invisible to every existing read. Actor/subject *add* dimensions; they don't replace it.
- **`occurred_at` (what the client asserts) is deliberately separate from `created_at` (when we received it).** Past timestamps are unbounded so backfill and offline clients work; future ones are capped at 24h of clock skew, because an unbounded future date would pin itself to the head of a subject's timeline forever.
- **Idempotency is unique per `(project_id, idempotency_key)`, never globally.** A globally-unique key would let one tenant's `order-1` silently collapse another's — the same cross-tenant bind shape `LEARNINGS.md` records from multi-tenant-activation S1. A repeat returns the **original** event id (`200`, `deduplicated: true`) and refunds the quota unit.
- **Entity `type` is a controlled vocabulary** (`lower_snake_case`), rejected rather than normalised — silently lowercasing `Merchant` would make the write succeed and the caller's later query return nothing.
- Validation lives in the zero-import `lib/event-context.ts` so every branch is spec-reachable directly.

Mutation-checked (3 mutations, actual red-spec names recorded in the spec header). One honest gap noted there: no mutation turns the "context cannot smuggle a project" spec red, because tenancy is enforced by the insert using `auth.projectId` — that spec is a regression tripwire, not proof of a guard this diff added.

### Story 1.2 — Transactional outbox and dark delivery gate

**As an** operator, **I want** eligible delivery work committed with the canonical event, **so that** later
delivery is recoverable and a vendor outage never changes ingest success.

**Acceptance:** one accepted event produces one canonical row and idempotent outbox work atomically; repeated
idempotency key does not duplicate the logical event; forced sink outage still returns successful ingest;
`DESTINATION_DELIVERY_ENABLED` born OFF prevents dispatch but not persistence.

**Risk:** high — DB migration, shared ingest and runtime gate; Daniel merges.

**✅ Implemented `ea862d1` (on-branch; live at merge).** Atomicity is a plpgsql `ingest_event()` function (supabase-js has no multi-statement transaction), which writes the canonical event and one outbox row per eligible destination in one transaction — or neither. The route calls it via `.rpc()`; its HTTP contract is byte-identical to before and Story 1.1's specs pass unmodified.

- **`event_destinations`** (minimal — Story 2.1 owns the full lifecycle/HMAC/rotation) and **`event_deliveries`** (the outbox — Story 2.2 owns retry/backoff/replay). Both expand-only, RLS on, no policies.
- **Composite FKs `(id, project_id)`** make a cross-tenant delivery row impossible to *insert*, not merely absent from a query — tenancy as a DB fact, backstopping the app-level `auth.projectId` scope.
- **`DESTINATION_DELIVERY_ENABLED`** (`lib/flags.ts`, born OFF) gates only the dispatcher; ingest + outbox persistence stay active while OFF, so disabling delivery loses no events. The Sprint 1 dispatcher checks the gate *before* any query and, since it sends nothing yet, releases claimed rows back to `pending` rather than stranding them `in_flight` (reclaim is Story 2.2).
- With zero destinations configured — production today — fan-out queues nothing. `queued_count: 0` is the honest dark state, not a bug.

Mutation-checked (A: 4 red, B: 1 red, D: 1 red; results in the spec header), including one honest coverage gap noted there.

**Note for review:** Story 1.2's migration + dispatcher were largely built by a delegated Opus agent that hit the weekly limit mid-task; the route wiring, spec, gate verification and mutation check were completed and verified in-session. Per LEARNINGS, the agent's "verified end-to-end" was re-derived from actual file state (the route was in fact still unwired) rather than trusted.

## Sprint QA

- **api specs:** extend `e2e/track.spec.ts` for legacy/new envelopes, foreign-project isolation and idempotency;
  add `e2e/delivery-outbox.spec.ts` for atomic queueing and flag-off behavior.
- **observed red:** run legacy compatibility and duplicate-idempotency cases against the pre-change route and
  record their expected failure before implementation.
- **browser smoke owed:** no; API/database behavior only. Daniel owns the production API-key smoke because the
  credential is write-only.
- **deterministic gate:** typecheck + build + Playwright `api` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. With a disposable Golden Beans project key, send the smoke kit's legacy payload to
   https://golden-beans-gamma.vercel.app/api/v1/track.
   → HTTP 201 returns one event id; the existing client contract still works.
2. Send the smoke kit's merchant-subject payload with one idempotency key to the same URL twice.
   → Both calls resolve to one logical event and one queued delivery identity.
3. Leave `DESTINATION_DELIVERY_ENABLED` off and inspect the disposable project's delivery fixture.
   → The event/outbox record exists and no outbound request was attempted.

If any step fails, note the step number + response body — that's the bug report.
