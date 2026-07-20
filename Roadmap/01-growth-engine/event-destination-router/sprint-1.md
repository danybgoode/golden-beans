# Event destination router — Sprint 1: Contract and durable queue

**Status:** ⬜ not started

## Stories

### Story 1.1 — Versioned actor and subject context

**As a** client developer, **I want** optional actor, subject, correlation, occurred-at and idempotency context
on `track()`, **so that** one stream can describe a merchant, shop, promoter, campaign or experiment without
overloading `userId`.

**Acceptance:** existing SDK payloads still ingest unchanged; a new merchant event round-trips its versioned
context; malformed ids/timestamps are rejected; project identity still comes only from the credential.

**Risk:** high — shared SDK/wire contract + additive DB migration; Daniel merges.

### Story 1.2 — Transactional outbox and dark delivery gate

**As an** operator, **I want** eligible delivery work committed with the canonical event, **so that** later
delivery is recoverable and a vendor outage never changes ingest success.

**Acceptance:** one accepted event produces one canonical row and idempotent outbox work atomically; repeated
idempotency key does not duplicate the logical event; forced sink outage still returns successful ingest;
`DESTINATION_DELIVERY_ENABLED` born OFF prevents dispatch but not persistence.

**Risk:** high — DB migration, shared ingest and runtime gate; Daniel merges.

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
