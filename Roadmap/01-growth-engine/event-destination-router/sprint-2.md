# Event destination router — Sprint 2: Destinations and reliable delivery

**Status:** ⬜ not started

## Stories

### Story 2.1 — Tenant destination lifecycle and signed webhook

**As a** tenant owner, **I want** to create, test, disable and rotate a filtered signed-webhook destination,
**so that** only intended project events leave Golden Beans and the receiver can verify origin.

**Acceptance:** membership and scope are required; foreign-project access fails; secret is shown once and never
returned again; disabled destination receives nothing; event filters work; receiver verifies timestamped HMAC;
rotation invalidates the old secret without exposing either value.

**Risk:** high — credential/auth boundary and destination migration; Daniel merges.

### Story 2.2 — Retry, terminal failure, history and replay

**As an** operator, **I want** bounded retries, visible delivery history, terminal failure and manual replay,
**so that** I can recover a destination without resending source events.

**Acceptance:** retry policy is deterministic and capped; each attempt records sanitized status/latency/error;
terminal failure is visible; replay creates one new attempt for the same logical event id; successful receivers
can deduplicate at-least-once delivery; rate limits prevent replay abuse.

**Risk:** high — scheduled/shared delivery infrastructure; Daniel merges.

## Sprint QA

- **api specs:** `e2e/destinations.spec.ts` for membership/isolation/filter/signature/rotation/disable;
  `e2e/delivery-replay.spec.ts` for retries, dead-letter and replay idempotency.
- **pure spec:** import-free retry policy tested at first, middle and terminal attempts.
- **browser smoke owed:** yes to Daniel for the authenticated `/app/destinations` create/rotate/replay flow.
- **deterministic gate:** typecheck + build + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. Sign in and open https://golden-beans-gamma.vercel.app/app/destinations.
   → The disposable project shows no destinations and a clear “Add destination” action.
2. Add the disposable signed receiver, select one event name, and click “Send test”.
   → Receiver gets one event and verifies the signature; the page shows a successful attempt.
3. Make the receiver return HTTP 500, send an eligible event, and wait through the bounded retry fixture.
   → Attempt history progresses to terminal failure without changing the source event.
4. Restore the receiver and click “Replay”.
   → One new successful attempt appears for the same logical event id.
5. Disable the destination and send another eligible event.
   → No outbound request occurs; the source event remains stored.

If any step fails, note the step number + visible status — that's the bug report.
