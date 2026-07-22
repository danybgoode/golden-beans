import { createHmac, timingSafeEqual } from 'node:crypto'

// event-destination-router · Sprint 2, Story 2.1 — the HMAC signature a receiver verifies to trust
// that a delivery came from Golden Beans and was not tampered with in flight.
//
// Zero-import beyond node:crypto so the scheme is unit-testable directly — and so a RECEIVER can copy
// verifyWebhookSignature() verbatim as reference code (the whole point of a documented scheme is that
// the other side can reproduce it). The shape is Stripe's, because it is well-understood and its two
// deliberate properties matter here:
//   1. The signed payload is `${timestamp}.${body}`, NOT the body alone — so a captured request can't
//      be REPLAYED indefinitely. The receiver rejects a timestamp outside its tolerance window, which
//      bounds the replay window to that tolerance even for a byte-perfect capture.
//   2. Comparison is CONSTANT-TIME (timingSafeEqual) — a byte-by-byte early-exit compare leaks, via
//      timing, how many leading bytes of a forged signature were correct, which is enough to forge one
//      given enough attempts.

/** How stale a timestamp a receiver should still accept, in seconds. Guidance for the receiver — we
 *  stamp `now`; the receiver enforces the window. Exported so the reference verifier and the docs
 *  agree on one number. */
export const SIGNATURE_TOLERANCE_SECONDS = 300

const SCHEME_VERSION = 'v1'

/**
 * Builds the `X-GB-Signature` header value for a delivery: `t=<unix_seconds>,v1=<hex_hmac>`.
 *
 * `timestampSeconds` is injected (defaults to now) so a spec can assert an exact expected signature
 * against a fixed clock — the value is otherwise unpredictable and untestable.
 */
export function signWebhookPayload(
  secret: string,
  body: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const signature = computeSignature(secret, timestampSeconds, body)
  return `t=${timestampSeconds},${SCHEME_VERSION}=${signature}`
}

function computeSignature(secret: string, timestampSeconds: number, body: string): string {
  // The signed material is timestamp.body — binding the signature to WHEN it was made, so a replay
  // can be time-boxed by the receiver.
  return createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex')
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'malformed_header' | 'bad_signature' | 'stale_timestamp' }

/**
 * Reference verifier — what a receiver runs on an inbound delivery. Kept here (and exercised by the
 * spec) so "the scheme" is executable, not just prose a receiver has to reimplement from a comment.
 *
 * `nowSeconds` is injected for the same testability reason as signing. `toleranceSeconds` defaults to
 * SIGNATURE_TOLERANCE_SECONDS; a receiver may widen it, never to Infinity — an unbounded tolerance
 * defeats property (1) entirely.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): VerifyResult {
  const parsed = parseSignatureHeader(header)
  if (!parsed) return { ok: false, reason: 'malformed_header' }

  // TIMESTAMP FIRST, but the check that ultimately decides is still the signature — an attacker can
  // freely set `t` in the header, so the timestamp gate alone proves nothing; it exists to bound
  // replay of an OTHERWISE-VALID (correctly-signed) capture. A forged signature fails below
  // regardless of `t`.
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'stale_timestamp' }
  }

  const expected = computeSignature(secret, parsed.timestamp, body)
  if (!constantTimeHexEqual(expected, parsed.signature)) {
    return { ok: false, reason: 'bad_signature' }
  }
  return { ok: true }
}

function parseSignatureHeader(header: string): { timestamp: number; signature: string } | null {
  if (typeof header !== 'string') return null
  let timestamp: number | null = null
  let signature: string | null = null
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const k = part.slice(0, eq).trim()
    const v = part.slice(eq + 1).trim()
    if (k === 't') {
      // Strictly an integer of unix seconds — `Number('12x')` is NaN, `parseInt` would accept it.
      if (!/^\d{1,15}$/.test(v)) return null
      timestamp = Number(v)
    } else if (k === SCHEME_VERSION) {
      if (!/^[0-9a-f]{64}$/.test(v)) return null // sha256 hex, exactly
      signature = v
    }
  }
  if (timestamp === null || signature === null) return null
  return { timestamp, signature }
}

// Both are 64-char sha256 hex here, so lengths match and timingSafeEqual is safe to call directly;
// the length pre-check guards the general case (timingSafeEqual THROWS on a length mismatch, which
// would itself be an observable signal).
function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}
