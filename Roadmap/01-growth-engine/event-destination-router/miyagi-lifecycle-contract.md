# Miyagi merchant-lifecycle projection — the delivery contract

> **Epic:** `01-growth-engine/event-destination-router` · **Story:** 3.1
> **Status:** Golden Beans side specified + deliverable. The Miyagi consumer/producer work lives on the
> separate `feat/founding-merchant-activation-ops-s3` branch and still ships through its own PR.

This is the contract the Miyagi projection implements against. It is written from the Golden Beans
side because Golden Beans is the *producer*: it says exactly what bytes Miyagi will receive, how to
verify them, and what Miyagi must guarantee in return. Nothing here requires a Golden Beans code
change — the generic signed-webhook destination (Sprint 2) already delivers it. What is missing is
Miyagi's endpoint and its projection table.

## Transport

Golden Beans delivers over the Sprint 2 signed-webhook destination:

- `POST` to a Miyagi-owned https endpoint, configured as a destination on the Golden Beans project.
- Header `X-GB-Signature: t=<unix_seconds>,v1=<hex_hmac_sha256>` over `` `${timestamp}.${rawBody}` ``.
- Correlation headers `X-GB-Delivery-Id` and `X-GB-Event-Id`.
- **Delivery is at least once.** Retries are bounded: 6 attempts total, with **minimum eligibility
  delays** of 30s, 1m, 2m, 4m, 8m (doubling, capped at 1h). These are floors, not a schedule — the
  dispatcher runs on a 5-minute cron, so each actual retry lands at the next tick after the delay
  elapses. Expect `delay + up to ~5 minutes`. A permanent 4xx dead-letters immediately (no retries).
  An operator can replay a settled delivery.

Miyagi **must** copy the reference verifier from `apps/web/lib/webhook-signature.ts`
(`verifyWebhookSignature`) rather than reimplementing it, and **must** reject a timestamp outside its
tolerance window (300s) — that window is the only thing bounding replay of a byte-perfect capture.

## Envelope

Fixed key order (the bytes are what the signature covers — do not re-serialize before verifying):

```json
{
  "id": "<uuid — the canonical Golden Beans EVENT id>",
  "type": "<event name>",
  "occurredAt": "<ISO-8601>",
  "data": {
    "userId": "…",
    "subject": { "type": "merchant", "id": "<merchant id>" },
    "actor":   { "type": "user", "id": "…" },
    "correlationId": "…",
    "metadata": { "plan": "pro" }
  }
}
```

`id` is the **stable logical event id**. It does not change across retries *or* replays. It is the
only correct dedupe key.

## The lifecycle fixtures

These are the events the Sprint 3 acceptance names. Each carries `subject.type = "merchant"` and
`subject.id = <the Miyagi merchant id>` — that subject pair is the whole reason Sprint 1's versioned
actor/subject context exists, and it is what lets Miyagi route an event to a merchant record without
parsing free-form metadata.

| `type` | Means | Miyagi projection effect |
|---|---|---|
| `merchant.scouted` | Relationship entered the activation population | set scouted milestone |
| `merchant.qualified` | Merchant passed the documented fit check | set qualified milestone |
| `merchant.permission_granted` | Merchant granted permission | mark permission, stamp first-seen |
| `merchant.preview_in_preparation` | Private preview work started | set preparation milestone |
| `merchant.preview_delivered` | Merchant received the private preview | set delivery milestone |
| `merchant.activation_scheduled` | Activation session was scheduled | set scheduled milestone |
| `merchant.claimed` | Merchant claimed their shop | set claimed milestone |
| `merchant.payments_ready` | A shipped payment rail is connected and ready | set payment-readiness milestone |
| `merchant.three_products_live` | Third public product went live | set catalog milestone |
| `merchant.shared_externally` | Merchant used the shipped external-share action | set share milestone |
| `merchant.first_inquiry` | First buyer conversation exists | set inquiry milestone |
| `merchant.first_sale` | First order was captured and remains valid | set first-sale milestone |
| `merchant.retained_30d` | A captured order exists at least 30 days after first sale | set retention milestone |
| `merchant.preview_approved` | Merchant approved their storefront preview | set preview-approved signal; not a separate 13-stage journey stage |

The canonical plain-JSON fixture exists byte-for-byte in both repositories:

- Golden Beans: `apps/web/e2e/_fixtures/merchant-lifecycle.fixtures.json`
- Miyagi: `e2e/_fixtures/merchant-lifecycle.fixtures.json`

Both suites pin SHA-256
`b53f300bdd967bfe21dadbc7543655ccf36f95d27e643625fbb68df5739f3671`. Golden Beans'
`merchant_activation` definition consumes the 13 `merchant.<stage>` events above and deliberately excludes the
additional `merchant.preview_approved` signal.

## What Miyagi must guarantee

1. **Idempotency by `id`.** Store the delivered event id; a repeat must be a no-op. Because delivery
   is at-least-once and replay is an operator tool, Miyagi *will* see duplicates. A milestone must
   remain one logical milestone no matter how many times its event arrives — the Sprint 3 smoke step
   3 checks exactly this.
2. **Verify before acting.** Unverified body → `401`, and do not process. A `401` is a permanent
   4xx in Golden Beans' classification, so it dead-letters rather than retrying forever — which is
   correct: a signature that fails will keep failing.
3. **Answer fast, project asynchronously if needed.** Golden Beans times out at 10s. Return `2xx` on
   accept; do the work behind it if it is slow.
4. **`5xx` for a transient Miyagi outage.** That is retryable and Golden Beans will back off and
   return. Do **not** return `2xx` to "avoid retries" — that silently drops the event.
5. **Medusa remains commerce truth.** These events carry lifecycle *facts*, not shop/product/order
   state. Miyagi must not treat `first_sale` as an order record; it is a milestone flag.
6. **No PII in metadata.** Golden Beans forwards tenant metadata *values* verbatim and does not
   inspect them — so the producing call sites must keep customer PII out of these events.

**Envelope shaping, precisely** (so the consumer codes against what is actually sent): null/absent
fields are OMITTED rather than sent as `null`, and an EMPTY `metadata`/`tags` object is omitted
entirely. Non-empty values are passed through unchanged. `actor`/`subject` appear only when at least
one of their type/id is present. Treat every `data` field as optional.

## Degradation

Either side may be unavailable without losing events:

- **Miyagi down** → deliveries fail, back off, retry; the canonical Golden Beans event is untouched.
- **Golden Beans delivery off** (`DESTINATION_DELIVERY_ENABLED=false`) → events still persist and the
  outbox still fills; nothing is lost, nothing moves. Turning it on drains the backlog.
- **Miyagi deployed before Golden Beans turns delivery on** → Miyagi's endpoint simply receives
  nothing. This is the intended merge order (epic README, Deploy order): the Miyagi consumer merges
  first or degrades safely.

## Still owed (not done in this session)

- [ ] The Miyagi PR: endpoint + signature verification + projection table + idempotency store
- [ ] Miyagi DB migration for the projection
- [x] The identical lifecycle fixtures running in **both** repos' suites (Sprint 3 QA)
- [ ] The disposable-merchant end-to-end smoke (Sprint 3 walkthrough) — Daniel merges both PRs
