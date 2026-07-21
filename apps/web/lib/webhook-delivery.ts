import { lookup } from 'node:dns/promises'
import { signWebhookPayload } from './webhook-signature'
import { isPrivateOrLoopbackHost, isLocalTestTarget } from './webhook-url'
import type { DeliverableDestination } from './destinations'

/** Cap on the send-time DNS lookup so a stalled resolver can't overrun the caller's deadline
 *  (cross-review, Codex round 3). A lookup that exceeds this is treated as unresolvable → fail-open. */
const RESOLVE_TIMEOUT_MS = 3_000

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

/** Cap the receiver's response body we read for the error record. We never ACT on the body; we keep
 *  a snippet only so an operator can see "why did this 400" without us buffering an unbounded reply. */
const MAX_ERROR_BODY_CHARS = 500

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
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** Injected so a spec asserts an exact signature against a fixed clock. */
  timestampSeconds?: number
  timeoutMs?: number
  /** Correlation headers the receiver can log / dedupe on. */
  deliveryId?: string
  eventId?: string
  /**
   * Resolves a hostname to its IP addresses — the send-time SSRF guard's input. Injected in unit
   * tests to stay hermetic; defaults to a real DNS lookup. See resolveTargetHost below for the
   * fail-open semantics and the documented residual.
   */
  resolveHost?: (hostname: string) => Promise<string[]>
}

// Default resolver: all A/AAAA records for the host.
async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true })
  return records.map((r) => r.address)
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
  options: DeliverOptions = {},
): Promise<DeliveryResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS

  // ── SSRF at SEND TIME ─────────────────────────────────────────────────────────────────────────
  // assertDeliverableUrl (create/rotate) blocks LITERAL private/loopback targets, but a tenant can
  // point a destination at a public HOSTNAME that RESOLVES to a private IP (cross-review, Codex
  // 2026-07-21). Resolve it here and refuse if any address is internal, so the request never leaves
  // for cloud metadata (169.254.169.254) or an internal service.
  //
  // RESIDUAL, stated: this is resolve-then-fetch, so a DNS-rebinding attacker who flips the record
  // between our check and fetch's own resolution (TOCTOU) is not fully closed — the airtight fix
  // pins the socket to the checked IP via a custom connector, deliberately a focused follow-up (see
  // the epic notes). FAIL-OPEN on a resolution error: a host that does not resolve is not an SSRF
  // target (the fetch can't connect either), and failing open keeps the unit suite hermetic.
  const blocked = await resolveTargetHost(destination.targetUrl, options.resolveHost ?? defaultResolveHost)
  if (blocked) {
    return { disposition: 'permanent', status: null, latencyMs: 0, error: blocked }
  }

  const signature = signWebhookPayload(destination.signingSecret, body, options.timestampSeconds)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetchImpl(destination.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'GoldenBeans-Webhooks/1',
        'X-GB-Signature': signature,
        ...(options.deliveryId ? { 'X-GB-Delivery-Id': options.deliveryId } : {}),
        ...(options.eventId ? { 'X-GB-Event-Id': options.eventId } : {}),
      },
      body,
      signal: controller.signal,
      // Never follow a redirect to a webhook — a 3xx to an internal address is an SSRF pivot around
      // the create-time URL check. A receiver that answers 3xx is misconfigured; treat it as such.
      redirect: 'manual',
    })
    const latencyMs = Date.now() - startedAt

    if (response.status >= 200 && response.status < 300) {
      return { disposition: 'delivered', status: response.status, latencyMs, error: null }
    }

    const snippet = await readBoundedBody(response)
    const disposition = isRetryableStatus(response.status) ? 'retryable' : 'permanent'
    return {
      disposition,
      status: response.status,
      latencyMs,
      error: `HTTP ${response.status}${snippet ? `: ${snippet}` : ''}`,
    }
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    // An abort (our timeout) and a network error are both retryable — the receiver may be healthy
    // later. We distinguish the timeout in the message so an operator can tell "too slow" from "no
    // route".
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      disposition: 'retryable',
      status: null,
      latencyMs,
      error: aborted ? `timed out after ${timeoutMs}ms` : sanitizeError(err),
    }
  } finally {
    clearTimeout(timer)
  }
}

// Returns a rejection reason if the target hostname resolves to any private/loopback/link-local
// address; null to proceed. Fail-open on a resolution error or empty result (see the caller's note).
async function resolveTargetHost(
  targetUrl: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<string | null> {
  // The localhost test-receiver carve-out (lib/webhook-url.ts): its address IS loopback, which the
  // check below would otherwise block — but this is the one target deliberately allowed to be
  // loopback (the disposable sink the specs and smoke walkthrough POST to). Same exception the
  // create-time guard grants, kept consistent end-to-end (cross-review, Codex round 3).
  if (isLocalTestTarget(targetUrl)) return null

  let hostname: string
  try {
    hostname = new URL(targetUrl).hostname
  } catch {
    return 'invalid target URL'
  }
  try {
    // Bound the lookup so a stalled resolver can't overrun the caller's deadline; a timeout is
    // treated like any resolution error → fail-open.
    const addresses = await withTimeout(resolveHost(hostname), RESOLVE_TIMEOUT_MS)
    for (const address of addresses) {
      if (isPrivateOrLoopbackHost(address)) {
        return 'blocked: target resolves to a private or loopback address'
      }
    }
  } catch {
    // Unresolvable host (or a lookup timeout) → not an SSRF target; let the fetch fail on its own.
  }
  return null
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => setTimeout(() => reject(new Error('resolve timeout')), ms)),
  ])
}

// 5xx are transient by definition. 408 (Request Timeout) and 429 (Too Many Requests) are the two
// 4xx that explicitly mean "try again" — every other 4xx is the receiver rejecting THIS request, so
// retrying the identical bytes is pointless and just delays the dead-letter.
function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true
  return status === 408 || status === 429
}

// Read at most MAX_ERROR_BODY_CHARS worth of bytes from the response, STREAMING — never
// `response.text()`, which buffers the entire body into memory first (cross-review, Codex
// 2026-07-21): a hostile receiver could answer a rejected delivery with a multi-gigabyte body and
// make the dispatcher OOM. We pull one chunk at a time, stop as soon as we have enough for the error
// snippet, and cancel the rest so the connection is released.
async function readBoundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let out = ''
  try {
    while (out.length < MAX_ERROR_BODY_CHARS) {
      const { done, value } = await reader.read()
      if (done) break
      out += decoder.decode(value, { stream: true })
    }
    // Flush any bytes the streaming decoder is holding for a trailing multi-byte sequence — without
    // this final flush a snippet ending mid-character is corrupted (cross-review, Antigravity
    // 2026-07-21).
    out += decoder.decode()
  } catch {
    // A read error mid-body just truncates the snippet — the disposition is already decided.
  } finally {
    // Discard whatever is left; we only ever wanted a snippet for the operator's error record.
    await reader.cancel().catch(() => {})
  }
  return out.slice(0, MAX_ERROR_BODY_CHARS).replace(/\s+/g, ' ').trim()
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.slice(0, MAX_ERROR_BODY_CHARS)
}
