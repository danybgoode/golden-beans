// signals-loop · Story 1.1 — the SDK-side scrub.
//
// ── This is a COURTESY, not the boundary ─────────────────────────────────────────────────────
// The authoritative redaction runs at ingest (`apps/web/lib/signal-scrub.ts`), because the server
// cannot tell a payload scrubbed by this SDK from one posted by curl and must therefore never
// assume the work was done. What this copy buys is real but narrower: a secret redacted here never
// crosses the network at all, never lands in a proxy log, and never sits in a retry buffer on the
// client. Defence in depth, with the depth in the right order.
//
// ── Why the rules are DELIBERATELY a subset ──────────────────────────────────────────────────
// The temptation is to share one module between the SDK and the server. It would be wrong here:
// this file ships to a customer's browser bundle, where every rule costs bytes on their critical
// path, and where a catastrophically over-eager regex would degrade THEIR error reports with no way
// for us to hotfix it. So this carries the high-confidence, high-frequency patterns — the ones that
// are unambiguous and cheap — and lets the server, which has no size budget and can be fixed in one
// deploy, be exhaustive.
//
// The consequence to keep in mind: a payload that passes this untouched is NOT a payload that is
// clean. It is one this cheap pass had no opinion about.

const REDACTED = '[redacted]'

const RULES: Array<[RegExp, string]> = [
  // This engine's own credentials, first — the leak we would be least able to explain.
  [/\bgb_(?:key|connector)_[A-Za-z0-9_-]{16,}/g, REDACTED],
  // JWTs.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Authorization headers quoted into a message.
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 ' + REDACTED],
  // `password=…` / `token=…` in a URL or log line; the key name survives, the value does not.
  [
    /\b(password|passwd|secret|token|api[-_]?key)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;&)}\]]+)/gi,
    '$1=' + REDACTED,
  ],
  // Email addresses.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED],
  // A URL's query string — origin and path are the diagnostic value, query params carry sessions.
  [/(\bhttps?:\/\/[^\s"'<>]*?)[?#][^\s"'<>]*/gi, '$1?' + REDACTED],
]

/** Caps applied after redaction — never before, or a truncation slices a secret in half. */
export const SDK_MAX_MESSAGE = 512
export const SDK_MAX_STACK = 4096

export function scrubClientText(input: string, maxChars: number): string {
  let out = input
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement)
  return out.length > maxChars ? out.slice(0, Math.max(0, maxChars - 1)) + '…' : out
}
