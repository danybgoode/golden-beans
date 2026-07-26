// signals-loop · Story 1.0 — the redaction seam for everything an error payload carries.
//
// ── Why this module is the highest-risk thing in the epic ────────────────────────────────────
// Every other surface in this engine ingests values a caller CHOSE to send: an event name, a
// feature key, a user id. Error capture is the first surface that ingests values a caller never
// looked at — a runtime exception's message and stack, assembled by someone else's code, at 3am,
// out of whatever happened to be in scope. That is exactly where a bearer token, a connection
// string, a customer's email or a card number ends up. The epic's own scope doc names this: "a leak
// here is a trust-killer for a multi-tenant engine."
//
// ── Zero imports, on purpose ─────────────────────────────────────────────────────────────────
// Roadmap/LEARNINGS.md, twice over: a pure helper that shares a file with a framework-only import
// can't be unit-tested at all, and — the multi-tenant-activation S1 lesson — a guard sitting behind
// an auth/state precondition is structurally unreachable from an HTTP spec, so the spec passes
// identically against a re-broken build. Every branch below is reachable directly from a test.
//
// ── The trust model, stated once ─────────────────────────────────────────────────────────────
// The SDK calls this before sending, and the INGEST ROUTE calls it again before storing. The second
// call is the authoritative one and the first is a courtesy: the server cannot distinguish a
// payload scrubbed by our SDK from one posted by curl, so it must never assume the work was done.
// Both call THIS function — not two implementations that agree today (the `escapeToFit` lesson:
// a ported copy's first test proved it wrong in exactly the way the original predicted).

/** Redaction placeholders. Distinct per class so a reader can tell WHAT was removed. */
export const REDACTED = '[redacted]'
export const REDACTED_EMAIL = '[email]'
export const REDACTED_IP = '[ip]'

/** Caps. Applied AFTER redaction, never before — see `scrubText`. */
export const MAX_MESSAGE_CHARS = 512
export const MAX_STACK_CHARS = 4096
export const MAX_SAMPLE_KEYS = 32
export const MAX_SAMPLE_DEPTH = 4
export const MAX_STRING_CHARS = 256

/**
 * Object keys whose VALUE is redacted wholesale, regardless of what it looks like.
 *
 * Matching is on a normalized key (lowercased, `-`/`_`/spaces removed) and is a SUBSTRING test, so
 * `apiKey`, `api_key`, `API-KEY`, `x-api-key` and `stripeApiKey` all match the single entry `apikey`.
 * A deny-list of exact names would have to enumerate spellings, and the one it missed would be the
 * one that leaked.
 *
 * ── The cost of substring matching, and where the line is ───────────────────────────────────
 * Cross-review (Agy, 2026-07-26) caught the other edge of that trade: a bare `auth` entry also
 * matches `author`, `authorId` and `author_name`, and a bare `pin` matches `ping` and `spin`. Those
 * are ordinary telemetry fields, and silently replacing their values with `[redacted]` corrupts a
 * tenant's own data — a scrub that eats real fields fails the product just as surely as one that
 * misses a secret, and it does so invisibly.
 *
 * So the broad entries are the ones whose substrings are themselves secret-ish (`token`, `secret`,
 * `password`, `apikey`), and the ambiguous stems are spelled out instead (`authorization`,
 * `authtoken`, `pincode`). Anything this list misses is still caught by the VALUE-shape rules
 * below, which is the layer designed for the fields nobody thought to name.
 */
const SENSITIVE_KEY_PARTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'authorization',
  'authtoken',
  'authkey',
  'authsecret',
  'credential',
  'cookie',
  'session',
  'privatekey',
  'signature',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'pincode',
] as const

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s]/g, '')
}

/** True when a key's NAME alone is reason enough to drop its value. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key)
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

// ── Value-shape rules ────────────────────────────────────────────────────────────────────────
// Ordered deliberately: the most specific, highest-confidence shapes run FIRST, so a JWT is
// reported as a JWT rather than being half-eaten by the generic long-base64url rule underneath it.
// Each entry is applied globally to the string.
const VALUE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // This engine's own credentials. First, because they are the ones we can be certain about, and
  // because an error message quoting one of ours is the leak we'd be most embarrassed by.
  { pattern: /\bgb_(?:key|connector)_[A-Za-z0-9_-]{16,}/g, replacement: REDACTED },

  // JWTs — three base64url segments. Matches before the generic base64url rule so the whole token
  // goes, not just its longest segment.
  { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, replacement: REDACTED },

  // Common third-party key prefixes (Stripe, OpenAI, GitHub, Slack, AWS, Supabase).
  {
    pattern:
      /\b(?:sk|pk|rk|whsec|sb)[-_](?:live|test|proj|secret|publishable)?[-_]?[A-Za-z0-9]{12,}\b/gi,
    replacement: REDACTED,
  },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, replacement: REDACTED },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replacement: REDACTED },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: REDACTED },

  // `Authorization: Bearer …`, and `password=…` / `token=…` in a querystring or log line. The key
  // NAME is kept and only the value dropped, so the reader still learns which field was involved.
  { pattern: /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: '$1 ' + REDACTED },
  {
    pattern: /\b(password|passwd|secret|token|api[-_]?key|auth|credential)\s*[=:]\s*("[^"]*"|'[^']*'|[^\s,;&)}\]]+)/gi,
    replacement: '$1=' + REDACTED,
  },

  // Connection strings — the whole userinfo section, which is where the password lives.
  { pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, replacement: '$1' + REDACTED + '@' },

  // Email addresses. Before the URL rule, so an address inside a mailto: still goes.
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: REDACTED_EMAIL },

  // A URL's QUERY STRING and fragment — origin and path are diagnostically valuable, query
  // parameters are where session ids and one-time tokens ride.
  { pattern: /(\bhttps?:\/\/[^\s"'<>]*?)([?#])[^\s"'<>]*/gi, replacement: '$1$2' + REDACTED },

  // Payment-card-shaped digit runs (13–19 digits, optionally space/hyphen grouped).
  { pattern: /\b(?:\d[ -]?){13,19}\b/g, replacement: REDACTED },

  // IPv4. Kept as its own placeholder because "an IP was here" is often the diagnostic point.
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: REDACTED_IP },

  // The generic catch-all, LAST: a long unbroken hex or base64url run. This is what catches the
  // credential formats nobody has invented yet. 32 is the floor because a shorter bound starts
  // eating legitimate identifiers (a 20-char slug, a short hash prefix in a stack frame).
  { pattern: /\b[0-9a-f]{32,}\b/gi, replacement: REDACTED },
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replacement: REDACTED },
]

/**
 * Redacts a free-text string, then truncates it.
 *
 * ORDER IS LOAD-BEARING and is the reason this is one function rather than two composable ones.
 * Truncating first would slice a secret in half and store the surviving half; redaction has to see
 * the whole string. (The input is already bounded upstream by the ingest payload cap, so "redact
 * first" cannot be turned into an unbounded-work attack.)
 */
export function scrubText(input: string, maxChars: number = MAX_STRING_CHARS): string {
  let out = input
  for (const { pattern, replacement } of VALUE_RULES) {
    out = out.replace(pattern, replacement)
  }
  if (out.length > maxChars) {
    // The ellipsis is inside the budget, so the returned string never exceeds maxChars — a cap that
    // its own marker can push past is not a cap.
    out = out.slice(0, Math.max(0, maxChars - 1)) + '…'
  }
  return out
}

/**
 * Recursively redacts an arbitrary structure: sensitive KEYS lose their value entirely, every
 * string is run through `scrubText`, and breadth/depth are bounded.
 *
 * Anything that is not a JSON primitive, array or plain object becomes `null`. That includes
 * functions, symbols and class instances — a serializer that tried to be helpful with those is how
 * an object's private fields end up in a log line.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SAMPLE_DEPTH) return null
  if (value === null || value === undefined) return null

  const t = typeof value
  if (t === 'string') return scrubText(value as string)
  // Numbers are passed through EXCEPT when they are long enough to be an account or card number
  // that happened to be typed without quotes.
  if (t === 'number') {
    if (!Number.isFinite(value as number)) return null
    const digits = Math.abs(value as number).toFixed(0)
    return digits.length >= 13 ? REDACTED : value
  }
  if (t === 'boolean') return value

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SAMPLE_KEYS).map((item) => scrubValue(item, depth + 1))
  }

  if (t === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    let kept = 0
    for (const key of Object.keys(source)) {
      if (kept >= MAX_SAMPLE_KEYS) break
      kept += 1
      // The key itself is scrubbed too: a caller can put a token in a key as easily as in a value,
      // and an object keyed by session id is a real shape.
      const safeKey = scrubText(key, 64)
      out[safeKey] = isSensitiveKey(key) ? REDACTED : scrubValue(source[key], depth + 1)
    }
    return out
  }

  return null
}

export type ScrubbedError = {
  name: string
  message: string
  stack: string | null
  context: Record<string, unknown>
}

/**
 * The one shape an `$error` signal is allowed to store.
 *
 * Note that this returns a CLOSED structure rather than "the caller's object, scrubbed". A tenant
 * can send whatever they like in `tags`/`metadata` — the envelope is deliberately open — but what
 * lands in a signal's sample is only these four fields. An open passthrough would mean the set of
 * things that could leak grows every time a customer adds a field, and no review would ever see it.
 */
export function scrubErrorPayload(input: {
  name?: unknown
  message?: unknown
  stack?: unknown
  context?: unknown
}): ScrubbedError {
  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'Error'
  const message = typeof input.message === 'string' ? input.message : ''
  const stack = typeof input.stack === 'string' ? input.stack : null
  const context =
    input.context !== null && typeof input.context === 'object' && !Array.isArray(input.context)
      ? (scrubValue(input.context, 0) as Record<string, unknown>)
      : {}

  return {
    // The error's CLASS name is bounded hard and scrubbed like anything else — `new Error(token)`
    // rethrown by a wrapper that uses the message as a name is not a hypothetical.
    name: scrubText(name, 64),
    message: scrubText(message, MAX_MESSAGE_CHARS),
    stack: stack === null ? null : scrubText(stack, MAX_STACK_CHARS),
    context,
  }
}
