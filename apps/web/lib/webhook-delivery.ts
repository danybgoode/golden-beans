import { lookup } from 'node:dns/promises'
import { lookup as lookupCb } from 'node:dns'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { Readable } from 'node:stream'
import { signWebhookPayload } from './webhook-signature'
import { isPrivateOrLoopbackHost, isLocalTestTarget, localhostWebhooksAllowed } from './webhook-url'
import type { DeliverableDestination } from './destinations'

/** Cap on the send-time DNS pre-check so a stalled resolver can't overrun the caller's deadline
 *  (cross-review, Codex round 3). A lookup that exceeds this fails CLOSED as retryable. */
const RESOLVE_TIMEOUT_MS = 3_000

// ── the CONNECTION-PINNED default sender ────────────────────────────────────────────────────────
// The airtight SSRF fix (cross-review, Codex round 5): resolveTargetHost's pre-check is defence in
// depth and what the specs exercise (injected resolver), but it resolves and then `fetch` resolves
// AGAIN — a rebinding attacker could flip the record between the two. This sender uses node:http(s)
// with a custom `lookup` that validates the address AT CONNECT TIME and pins the socket to exactly
// that IP, so there is no second resolution to rebind. It is the DEFAULT send path (production);
// tests inject `fetchImpl` and never touch it. Reachable via "Send test" too, so it closes that
// surface even while automatic delivery is dark.
//
// The lookup REFUSES a private/loopback resolved address (unless the localhost dev/CI opt-in allows
// it), so the socket never connects inward.
const guardedLookup = ((hostname: string, options: unknown, callback: (err: Error | null, address?: unknown, family?: number) => void) => {
  // Cast: node's LookupFunction overloads (all:true → array, else string) are awkward to type; we
  // pass `options` straight through and only inspect the resolved address(es).
  ;(lookupCb as unknown as (h: string, o: unknown, cb: (e: Error | null, a: unknown, f?: number) => void) => void)(
    hostname,
    options,
    (err, address, family) => {
      if (err) return callback(err, address, family)
      // The dev/CI localhost opt-in: a localhost hostname is allowed to resolve to loopback (matches
      // the create-time + Layer-1 carve-outs). Off in production, so this never loosens prod.
      const loopbackOk = localhostWebhooksAllowed() && (hostname === 'localhost' || hostname === '127.0.0.1')
      const list = Array.isArray(address)
        ? (address as Array<{ address: string }>).map((a) => a.address)
        : [address as string]
      for (const ip of list) {
        if (!loopbackOk && isPrivateOrLoopbackHost(ip)) {
          return callback(new Error('blocked: target resolves to a private or loopback address'))
        }
      }
      callback(null, address, family)
    },
  )
}) as unknown as Parameters<typeof httpsRequest>[1]['lookup']

function abortError(): Error {
  const e = new Error('aborted')
  e.name = 'AbortError'
  return e
}

// A minimal fetch-shaped sender over node:http(s) with the pinning lookup. deliverWebhook only reads
// `.status` and `.body` (a web stream), so that is all we surface. Never follows redirects (a 3xx is
// returned as-is → classified non-2xx), which also means a redirect can't pivot around the pin.
const pinnedFetch = ((url: string, init: RequestInit): Promise<Response> =>
  new Promise<Response>((resolve, reject) => {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return reject(new Error('invalid target URL'))
    }
    const requestFn = u.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requestFn(
      u,
      { method: init.method ?? 'POST', headers: init.headers as Record<string, string>, lookup: guardedLookup },
      (res) => {
        try {
          const status = res.statusCode ?? 0
          // 204/205/304 forbid a body — `new Response(stream, { status })` THROWS for them
          // (cross-review, Codex round 6). Drain the socket and use a null body. The try/catch turns
          // ANY construction error into a rejected promise (→ retryable) rather than an uncaught
          // throw that would strand the claimed row.
          if (status === 204 || status === 205 || status === 304) {
            res.resume() // drain & free the socket
            resolve(new Response(null, { status }))
          } else {
            const webBody = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>
            resolve(new Response(webBody, { status }))
          }
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
    )
    req.on('error', reject)
    const signal = init.signal as AbortSignal | undefined
    if (signal) {
      if (signal.aborted) {
        req.destroy()
        return reject(abortError())
      }
      signal.addEventListener('abort', () => {
        req.destroy()
        reject(abortError())
      })
    }
    if (typeof init.body === 'string') req.write(init.body)
    req.end()
  })) as unknown as typeof fetch

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
   * Resolves a hostname to its IP addresses — the Layer-1 SSRF pre-check's input. Injected in unit
   * tests to stay hermetic; defaults to a real DNS lookup. See resolveTargetHost below for its
   * fail-CLOSED semantics (a resolution error is reported retryable, never proceeds).
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
  // DEFAULT to the connection-pinned sender (production) — NOT global fetch, whose separate DNS
  // resolution a rebinding attacker could exploit. Tests inject fetchImpl.
  const fetchImpl = options.fetchImpl ?? pinnedFetch
  const timeoutMs = options.timeoutMs ?? DELIVERY_TIMEOUT_MS

  // ── SSRF at SEND TIME — TWO LAYERS ────────────────────────────────────────────────────────────
  // Layer 1 (here): a fast, SPEC-TESTABLE pre-check (injected resolver). assertDeliverableUrl blocks
  // literal private targets at create time; this catches a public HOSTNAME that RESOLVES to a private
  // IP. FAIL-CLOSED (cross-review, Codex round 4): a resolution error/timeout does NOT proceed — it
  // returns RETRYABLE so a transient DNS blip retries rather than dead-letters, never leaking a
  // request out.
  // Layer 2 (the default pinnedFetch sender): validates the resolved address AT CONNECT and pins the
  // socket to it, so there is no second resolution for a rebinding attacker to flip (cross-review,
  // Codex round 5). Layer 1 is defence-in-depth + what the deterministic gate exercises; Layer 2 is
  // the airtight backstop on the real network path (and closes the "Send test" surface too).
  const guard = await resolveTargetHost(destination.targetUrl, options.resolveHost ?? defaultResolveHost)
  if (!guard.ok) {
    return { disposition: guard.disposition, status: null, latencyMs: 0, error: guard.error }
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
      // Drain/cancel the success body — we don't read it, and a receiver that sends 200 headers then
      // an endless body would otherwise retain the socket until worker resources exhaust
      // (cross-review, Codex round 6).
      await response.body?.cancel().catch(() => {})
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
type GuardResult =
  | { ok: true }
  | { ok: false; disposition: 'permanent' | 'retryable'; error: string }

async function resolveTargetHost(
  targetUrl: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<GuardResult> {
  // The localhost test-receiver carve-out (dev/CI only, env-gated — lib/webhook-url.ts): its address
  // IS loopback, which the check below would block, but this is the one target deliberately allowed
  // to be loopback. Same exception the create-time guard grants, kept consistent end-to-end.
  if (isLocalTestTarget(targetUrl)) return { ok: true }

  let hostname: string
  try {
    hostname = new URL(targetUrl).hostname
  } catch {
    return { ok: false, disposition: 'permanent', error: 'invalid target URL' }
  }
  let addresses: string[]
  try {
    // Bound the lookup so a stalled resolver can't overrun the caller's deadline.
    addresses = await withTimeout(resolveHost(hostname), RESOLVE_TIMEOUT_MS)
  } catch {
    // A resolution error/timeout is TRANSIENT — do NOT proceed to fetch (fail-closed), but report
    // RETRYABLE so a DNS blip retries rather than permanently dead-letters (cross-review, Codex 4).
    return { ok: false, disposition: 'retryable', error: 'target DNS resolution failed' }
  }
  for (const address of addresses) {
    if (isPrivateOrLoopbackHost(address)) {
      // A private-resolving target is structurally unsafe — PERMANENT, never retry.
      return { ok: false, disposition: 'permanent', error: 'blocked: target resolves to a private or loopback address' }
    }
  }
  return { ok: true }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('resolve timeout')), ms)
  })
  // clearTimeout in finally so a resolved lookup doesn't leave a dangling 3s timer holding the
  // event loop open (which would stall test-process exit).
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
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
