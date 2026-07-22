# Event destination router — Sprint 2: Destinations and reliable delivery

**Status:** 🟨 built + local gate green (222 api specs) — cross-review, prod migration and Daniel's merge still owed

## What shipped in this sprint

**Story 2.1 — destination lifecycle + signed webhook**
- `lib/webhook-signature.ts` — Stripe-shaped `t=<unix>,v1=<hex>` HMAC-SHA256 over `${timestamp}.${body}`,
  constant-time compare, plus an exported reference verifier a receiver copies verbatim.
- `lib/destinations.ts` (server-only) — create / list / rotate / enable-disable. Secret minted here,
  returned **once**; no read path selects `signing_secret` (only the internal send path does).
- `lib/webhook-url.ts` (zero-import) — the SSRF guard: https-only (http only for localhost/127.0.0.1
  test receivers), private/loopback/link-local literal IPs refused (incl. 169.254.169.254 metadata).
- `lib/webhook-delivery.ts` — the one signed POST both test-send and the dispatcher use, with
  disposition classification (`delivered` / `retryable` / `permanent`), timeout, `redirect: 'manual'`.
- `lib/delivery-payload.ts` — the fixed-key-order envelope (deterministic bytes, because they're signed).
- `/app/destinations/[projectSlug]` — owner-only create/test/enable/rotate/disable UI + server actions.
- Migration `20260723100000_destination_lifecycle.sql` — `target_url` / `signing_secret` / `secret_set_at`
  with CHECKs (https shape, secret length, secret↔timestamp paired).

**Story 2.2 — retry, terminal failure, history, replay**
- Migration `20260724100000_delivery_retry.sql` — `claim_deliveries()` RPC using `FOR UPDATE SKIP LOCKED`
  (the successor Story 1.2's dispatcher named), folding in **stale-`in_flight` reclaim** and
  **destination eligibility** (only enabled + deliverable rows are ever claimed).
- `lib/retry-policy.ts` (pure) — 6 attempts, 30s base, doubling, 1h cap, deterministic.
- `lib/delivery-dispatch.ts` — rewritten: claim → sign+POST → settle to `delivered` / `failed`
  (backoff scheduled) / `dead` (permanent 4xx immediately, or budget spent). Still gate-first, still
  project-scoped, still never throws, still injected-client + injected-fetch testable.
- `lib/deliveries.ts` — delivery history + operator `replayDelivery()` (re-queues the SAME row, so the
  envelope id stays the canonical event id → receivers dedupe) + `projectsWithDueWork()`.
- `app/api/internal/dispatch-deliveries` + `vercel.json` cron (*/5) — the production trigger, fail-closed
  on `CRON_SECRET`, no-op while `DESTINATION_DELIVERY_ENABLED` is OFF.
- Delivery history + Replay in the destinations UI.

**Deliberate decision worth reviewing:** "Send test" is *not* gated by `DESTINATION_DELIVERY_ENABLED`.
That flag stops the automatic fan-out of the tenant's real stream; test-send is the owner-initiated
diagnostic that makes the epic's rollout order possible (prove the receiver *before* enabling delivery).
It is owner-only, rate-limited (10/10min/project), SSRF-guarded, and sends a synthetic `test:true` body.

## Still owed before this sprint can be called shipped

- [x] Cross-agent judgment-layer review (`scripts/cross-review.mjs`, both `codex` + `antigravity`) —
      run to convergence over 9 rounds; all blocking findings fixed. SSRF is closed end-to-end
      (literal-IP classifier rejecting every non-global address + fail-closed DNS pre-check +
      connection-**pinned** sender that re-checks the resolved address and pins the socket, so DNS
      rebinding has no second resolution to flip). Explicitly triaged, not fixed: the secret-rotation
      rejection window (dead-lettered events are replay-recoverable; a dual-secret grace window is a
      noted follow-up) and the dispatcher's per-row event re-read (N+1, a scale follow-up).
- [ ] **All three** migrations pushed to **prod** Supabase (migration-first, before merge):
      `20260723100000_destination_lifecycle` + `20260724100000_delivery_retry` +
      `20260725100000_delivery_health`. All three are required — `/app/destinations` calls
      `delivery_health()` unconditionally, so merging with only the first two would 500 the page
      (cross-review, Codex round 9).
- [ ] `CRON_SECRET` set in Vercel prod (the cron fails closed without it)
- [ ] Browser smoke owed to Daniel (authenticated create → test → enable → rotate → replay)
- [ ] Daniel merges

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
