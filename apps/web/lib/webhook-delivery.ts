import { guardedHttpPost, guardedHttpPostForTest } from './guarded-http'
import { signWebhookPayload } from './webhook-signature'
import type { DeliverableDestination } from './destinations'

// event-destination-router · Sprint 2 — the ACTUAL signed outbound POST. Shared by Story 2.1's
// owner-initiated "send test" and Story 2.2's background dispatcher, so the bytes a receiver sees and
// verifies are produced by ONE code path — a test-send that signed differently from a real delivery
// would validate a receiver against a scheme production never uses.
//
// Deliberately NOT `import 'server-only'` and NOT importing the Supabase client: it holds no secret
// of its own (the secret arrives in the injected `destination`) and does no DB work. That keeps it
// unit-testable directly against a stub receiver — the LEARNINGS.md rule about guards behind
// preconditions: a spec can call deliverWebhook() with a fake fetch and observe every disposition
// branch, which an HTTP-level spec through the dispatcher could not reach deterministically.

/** How long we wait for a receiver before abandoning the attempt. A webhook that hangs must not tie
 *  up a delivery worker — a slow sink is a failed attempt, retried later, not a stuck one. */
export const DELIVERY_TIMEOUT_MS = 10_000

// The disposition a retry engine (Story 2.2) acts on. This module decides it from the HTTP outcome —
// interpreting the RESPONSE is the send path's job; the backoff SCHEDULE and attempt cap are the
// retry policy's (lib/retry-policy.ts). The split matters: whether a 500 is retryable is a fact
// about HTTP; how long to wait before retry N is a tuning decision.
//   delivered  — 2xx. Done.
//   retryable  — 5xx, 408, 429, a network error, or a timeout. The receiver might succeed later.
//   permanent  — any other 4xx. The receiver rejected the request itself (bad path, auth, unknown
//                event); retrying the identical request cannot change the answer, so Story 2.2 marks
//                these `dead` immediately rather than burning the whole backoff schedule on them.
export type DeliveryDisposition = 'delivered' | 'retryable' | 'permanent'

export type DeliveryResult = {
  disposition: DeliveryDisposition
  /** HTTP status if we got a response; null on a network error / timeout. */
  status: number | null
  /** Milliseconds from request start to response (or failure). For the attempt record. */
  latencyMs: number
  /** Sanitized, bounded reason for a non-2xx — never contains the signing secret or full body. */
  error: string | null
}

export type DeliverOptions = {
  /** Injected for tests; defaults to the connection-PINNED sender (never global fetch — see
   *  guarded-http.ts for why the pin is what closes DNS rebinding). */
  fetchImpl?: typeof fetch
  /** Injected so a spec asserts an exact signature against a fixed clock. */
  timestampSeconds?: number
  timeoutMs?: number
  /** Correlation headers the receiver can log / dedupe on. */
  deliveryId?: string
  eventId?: string
  /**
   * Resolves a hostname to its IP addresses — the Layer-1 SSRF pre-check's input. Injected in unit
   * tests to stay hermetic; defaults to a real DNS lookup. See guarded-http.ts for its
   * fail-CLOSED semantics (a resolution error is reported retryable, never proceeds).
   */
  resolveHost?: (hostname: string) => Promise<string[]>
}

/**
 * Signs `body` for `destination` and POSTs it. NEVER THROWS — every failure (network, timeout,
 * abort, non-2xx) comes back as a DeliveryResult, because both callers run in contexts (a background
 * dispatcher, a server action) where an unhandled rejection is either invisible or a 500 to an owner
 * who only asked to test a webhook.
 *
 * `body` is the exact string that is BOTH signed and sent — the signature binds these bytes, so the
 * caller must not re-serialize between signing and sending. That is why this takes a string, not an
 * object: JSON.stringify is not canonical, and signing one serialization while sending another would
 * fail every receiver's verification.
 */
export async function deliverWebhook(
  destination: DeliverableDestination,
  body: string,
  options: DeliverOptions = {}
): Promise<DeliveryResult> {
  const timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS

  const signature = signWebhookPayload(destination.signingSecret, body, options.timestampSeconds)
  const request = {
    targetUrl: destination.targetUrl,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'GoldenBeans-Webhooks/1',
      'X-GB-Signature': signature,
      ...(options.deliveryId ? { 'X-GB-Delivery-Id': options.deliveryId } : {}),
      ...(options.eventId ? { 'X-GB-Event-Id': options.eventId } : {}),
    },
    body,
    timeoutMs,
  }
  // Runtime callers cannot replace the pinned sender. The separate test-only path preserves the
  // existing hermetic delivery/dispatcher specs without making fetch injection part of the new
  // reusable transport's production API.
  const response =
    options.fetchImpl !== undefined || options.resolveHost !== undefined
      ? await guardedHttpPostForTest(request, {
          fetchImpl: options.fetchImpl,
          resolveHost: options.resolveHost,
        })
      : await guardedHttpPost(request)

  if (response.outcome === 'failure') {
    return {
      disposition: response.retryable ? 'retryable' : 'permanent',
      status: null,
      latencyMs: response.latencyMs,
      error: response.error,
    }
  }

  if (response.status >= 200 && response.status < 300) {
    return {
      disposition: 'delivered',
      status: response.status,
      latencyMs: response.latencyMs,
      error: null,
    }
  }
  return {
    disposition: isRetryableStatus(response.status) ? 'retryable' : 'permanent',
    status: response.status,
    latencyMs: response.latencyMs,
    error: `HTTP ${response.status}`,
  }
}

// 5xx are transient by definition. 408 (Request Timeout) and 429 (Too Many Requests) are the two
// 4xx that explicitly mean "try again" — every other 4xx is the receiver rejecting THIS request, so
// retrying the identical bytes is pointless and just delays the dead-letter.
function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true
  return status === 408 || status === 429
}
