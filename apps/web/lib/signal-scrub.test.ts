// signals-loop · Story 1.0 — the redaction layer, tested directly.
//
// ── Why this file is written the way it is ───────────────────────────────────────────────────
// Roadmap/LEARNINGS.md, multi-tenant-activation S1: four HTTP-level specs asserting an auth
// callback never redirects off-origin all passed — and passed IDENTICALLY against a deliberately
// re-broken build, because the guard sat behind a precondition the harness could not satisfy, so
// no request ever reached the branch. The specs looked correct and CI was green.
//
// Redaction has exactly that shape. An end-to-end spec can only exercise the payloads it thinks to
// send, and the leak that matters is the payload nobody thought of. So every rule below is asserted
// against the pure function, one class of secret at a time, and each assertion states the secret it
// is defending against rather than the regex that happens to implement it.
//
// The other rule from that entry: "the spec passes" and "the spec CAN fail" are different facts.
// Each assertion here was mutation-checked — see the sprint doc's QA note.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scrubText,
  scrubValue,
  scrubErrorPayload,
  isSensitiveKey,
  REDACTED,
  REDACTED_EMAIL,
  REDACTED_IP,
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  MAX_STRING_CHARS,
  MAX_SAMPLE_KEYS,
} from './signal-scrub.ts'

// ── The engine's own credentials ─────────────────────────────────────────────────────────────
// First, because an error message quoting one of OUR keys is the leak we'd be least able to
// explain. Both prefixes are real formats from lib/api-keys.ts and lib/connector-tokens.ts.

test('an ingest key quoted in an error message does not survive', () => {
  const out = scrubText('Request failed with Authorization gb_key_AbCdEf0123456789xyzAB')
  assert.ok(!out.includes('gb_key_AbCdEf0123456789xyzAB'), out)
  assert.ok(out.includes(REDACTED))
})

test('a connector token quoted in an error message does not survive', () => {
  const out = scrubText('bad token gb_connector_QrStUv0123456789abcdEFGH')
  assert.ok(!out.includes('gb_connector_QrStUv0123456789abcdEFGH'), out)
})

// ── Third-party credential shapes ────────────────────────────────────────────────────────────

test('a JWT is redacted whole, not just its longest segment', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r'
  const out = scrubText(`token expired: ${jwt}`)
  assert.ok(!out.includes('eyJhbGciOiJIUzI1NiJ9'), out)
  assert.ok(!out.includes('dBjftJeZ4CVPmB92K27uhbUJU1p1r'), out)
})

test('common vendor key prefixes are redacted', () => {
  for (const secret of [
    'sk_live_51H8xKLMNOPqrstuvwx',
    'sk-proj-abcdefghijklmnopqrstuv',
    'whsec_abcdefghijklmnopqrstuvwx',
    'ghp_abcdefghijklmnopqrstuvwxyz0123',
    'xoxb-1234567890-abcdefghijkl',
    'AKIAIOSFODNN7EXAMPLE',
  ]) {
    const out = scrubText(`config error near ${secret}`)
    assert.ok(!out.includes(secret), `leaked: ${secret} -> ${out}`)
  }
})

test('a bearer header keeps its scheme and loses its value', () => {
  const out = scrubText('Authorization: Bearer abcdef1234567890ABCDEF')
  assert.ok(!out.includes('abcdef1234567890ABCDEF'), out)
  // The scheme survives, because "an auth header was involved" is the diagnostic point.
  assert.match(out, /Bearer/i)
})

test('a key=value secret keeps the key name and loses the value', () => {
  const out = scrubText('connect(password=hunter2trustno1, host=db.internal)')
  assert.ok(!out.includes('hunter2trustno1'), out)
  assert.match(out, /password=/)
  // The non-secret neighbour is untouched — an over-eager scrub that ate `host` would make every
  // stored error useless, which is its own kind of failure.
  assert.match(out, /host=db\.internal/)
})

test('a connection string loses its userinfo but keeps its host', () => {
  const out = scrubText('postgres://admin:s3cr3tp4ss@db.example.com:5432/app failed')
  assert.ok(!out.includes('s3cr3tp4ss'), out)
  assert.ok(out.includes('db.example.com'), out)
})

// ── Personal data ────────────────────────────────────────────────────────────────────────────

test('an email address becomes its own placeholder', () => {
  const out = scrubText('no account for daniel@example.com')
  assert.ok(!out.includes('daniel@example.com'), out)
  assert.ok(out.includes(REDACTED_EMAIL), out)
})

test('a card-shaped digit run is redacted, spaced or hyphenated', () => {
  for (const card of ['4111111111111111', '4111 1111 1111 1111', '4111-1111-1111-1111']) {
    const out = scrubText(`declined ${card}`)
    assert.ok(!out.includes('1111 1111') && !out.includes('4111111111111111'), `leaked: ${out}`)
  }
})

test('an IPv4 address becomes its own placeholder', () => {
  const out = scrubText('ECONNREFUSED 10.1.2.3:5432')
  assert.ok(!out.includes('10.1.2.3'), out)
  assert.ok(out.includes(REDACTED_IP), out)
})

// ── The generic catch-all: the credential nobody has invented yet ─────────────────────────────

test('a URL keeps its path and loses its query string', () => {
  const out = scrubText('GET https://api.example.com/v1/orders?session=abc123&token=xyz 500')
  assert.ok(!out.includes('abc123'), out)
  assert.ok(!out.includes('xyz'), out)
  // The path survives: "which endpoint" is almost always the point of the error.
  assert.ok(out.includes('https://api.example.com/v1/orders'), out)
})

test('a long unbroken hex or base64url run is redacted even with no recognisable prefix', () => {
  const hex = 'a3f5c9d1e7b28406a3f5c9d1e7b28406'
  const b64 = 'Zm9vYmFyYmF6cXV4Y29ycmdlZ3JhdWx0Z2FycGx5'
  assert.ok(!scrubText(`id ${hex}`).includes(hex))
  assert.ok(!scrubText(`blob ${b64}`).includes(b64))
})

test('an ordinary short identifier is NOT redacted', () => {
  // The counter-test for the rule above. A scrub that eats every identifier produces stored errors
  // nobody can act on, which fails the product just as surely as a leak fails the trust.
  const out = scrubText('feature setup_guide not found for order_8821')
  assert.ok(out.includes('setup_guide'), out)
  assert.ok(out.includes('order_8821'), out)
})

// ── Order and bounds ─────────────────────────────────────────────────────────────────────────

test('redaction happens BEFORE truncation, so a cap never slices a secret in half', () => {
  // The secret sits past the cap. If truncation ran first the tail would simply be dropped — which
  // looks safe — but the same arrangement with the secret STRADDLING the cap would store its first
  // half. Asserting the ordering property directly is what pins it.
  const secret = 'gb_key_ZZZZZZZZZZZZZZZZZZZZZZZZ'
  const padded = 'x'.repeat(40) + secret + 'y'.repeat(40)
  const out = scrubText(padded, 60)
  assert.ok(!out.includes('gb_key_'), out)
  assert.ok(out.length <= 60, `cap exceeded: ${out.length}`)
})

// A helper, not decoration. `'z'.repeat(500)` is itself a 500-character unbroken base64url run, so
// the generic catch-all rule redacts the WHOLE thing to `[redacted]` and every length assertion
// then passes at 10 characters — for entirely the wrong reason. That is the LEARNINGS "realistic
// input" failure in miniature: a cap test whose input never reaches the cap. These strings are
// word-shaped so the truncation branch is the one actually under test.
function longProse(chars: number): string {
  return 'the quick brown fox jumps over the lazy dog '.repeat(Math.ceil(chars / 43)).slice(0, chars)
}

test('the truncation marker fits INSIDE the budget', () => {
  // A cap its own ellipsis can push past is not a cap — and this one feeds a column with a
  // char_length CHECK, so an off-by-one here is a rejected INSERT in production.
  const out = scrubText(longProse(500), 100)
  assert.equal(out.length, 100)
  assert.ok(out.endsWith('…'))
})

test('scrubText defaults to MAX_STRING_CHARS', () => {
  const out = scrubText(longProse(MAX_STRING_CHARS * 2))
  assert.equal(out.length, MAX_STRING_CHARS)
  assert.ok(out.endsWith('…'))
})

// ── Structured values ────────────────────────────────────────────────────────────────────────

test('a sensitive key loses its value whatever the value looks like', () => {
  const out = scrubValue({ password: 'short', apiKey: 'plain', note: 'keep me' }) as Record<string, unknown>
  assert.equal(out.password, REDACTED)
  assert.equal(out.apiKey, REDACTED)
  assert.equal(out.note, 'keep me')
})

test('sensitive key matching survives spelling: apiKey, api_key, X-API-KEY, stripeApiKey', () => {
  // A deny-list of exact names would have to enumerate spellings, and the one it missed would be
  // the one that leaked. This pins the normalize-and-substring behaviour that avoids that.
  for (const key of ['apiKey', 'api_key', 'API-KEY', 'X-Api-Key', 'stripeApiKey', 'Authorization', 'set-cookie']) {
    assert.equal(isSensitiveKey(key), true, `not treated as sensitive: ${key}`)
  }
  // The counter-list, widened after a cross-review finding (Agy, 2026-07-26): a bare `auth` entry
  // matched `author`/`authorId`, and a bare `pin` matched `ping`/`spin`. Those are ordinary
  // telemetry fields, and silently redacting them corrupts a tenant's own data — a scrub that eats
  // real fields fails the product as surely as one that misses a secret, and does it invisibly.
  for (const key of [
    'name', 'featureId', 'orderTotal', 'userId',
    'author', 'authorId', 'author_name', 'ping', 'spin', 'shipping', 'campaign',
  ]) {
    assert.equal(isSensitiveKey(key), false, `wrongly treated as sensitive: ${key}`)
  }
})

test('a URL fragment keeps its # marker rather than becoming a query string', () => {
  const out = scrubText('failed at https://example.com/docs#section-4')
  assert.ok(out.includes('https://example.com/docs#'), out)
  assert.ok(!out.includes('/docs?'), out)
})

test('a secret in a nested value is redacted at depth', () => {
  const out = scrubValue({ req: { headers: { authorization: 'Bearer abcdef1234567890ABCDEF' } } }) as {
    req: { headers: { authorization: unknown } }
  }
  assert.equal(out.req.headers.authorization, REDACTED)
})

test('recursion is bounded and does not throw on a deep structure', () => {
  let deep: Record<string, unknown> = { leaf: 'gb_key_AAAAAAAAAAAAAAAAAAAAAAAA' }
  for (let i = 0; i < 40; i += 1) deep = { nest: deep }
  const out = scrubValue(deep)
  assert.ok(!JSON.stringify(out).includes('gb_key_AAAAAAAAAAAAAAAAAAAAAAAA'))
})

test('a cyclic object does not hang or throw', () => {
  // Depth-bounding is what makes this safe; there is no seen-set. Worth pinning, because a runtime
  // error object with a circular `cause` chain is an ordinary shape, not an exotic one.
  const a: Record<string, unknown> = { name: 'a' }
  a.self = a
  assert.doesNotThrow(() => scrubValue(a))
})

test('breadth is bounded', () => {
  const wide: Record<string, unknown> = {}
  for (let i = 0; i < MAX_SAMPLE_KEYS * 3; i += 1) wide[`k${i}`] = i
  const out = scrubValue(wide) as Record<string, unknown>
  assert.ok(Object.keys(out).length <= MAX_SAMPLE_KEYS)
})

test('a key can itself carry a secret, and is scrubbed too', () => {
  const out = scrubValue({ 'session-gb_key_QQQQQQQQQQQQQQQQQQQQQQQQ': 1 }) as Record<string, unknown>
  assert.ok(!Object.keys(out).some((k) => k.includes('gb_key_QQQQ')), JSON.stringify(out))
})

test('non-JSON values become null rather than being serialized helpfully', () => {
  // A serializer that tried to be helpful with a class instance is how an object's private fields
  // end up in a log line.
  const out = scrubValue({ fn: () => 1, sym: Symbol('s'), nan: NaN }) as Record<string, unknown>
  assert.equal(out.fn, null)
  assert.equal(out.sym, null)
  assert.equal(out.nan, null)
})

test('a long unquoted number is redacted', () => {
  const out = scrubValue({ card: 4111111111111111 }) as Record<string, unknown>
  assert.equal(out.card, REDACTED)
  const kept = scrubValue({ count: 42 }) as Record<string, unknown>
  assert.equal(kept.count, 42)
})

// ── The closed payload shape ─────────────────────────────────────────────────────────────────

test('scrubErrorPayload returns a CLOSED shape — caller fields do not ride along', () => {
  // The envelope is deliberately open (track-schema.ts), but what lands in a signal's sample is
  // only these four fields. An open passthrough would mean the set of things that can leak grows
  // every time a customer adds a field, and no review would ever see it.
  const out = scrubErrorPayload({
    name: 'TypeError',
    message: 'boom',
    stack: 'at run (/app/x.ts:1:2)',
    context: { ok: 1 },
    // @ts-expect-error — deliberately passing a field the type does not declare.
    secretSideChannel: 'gb_key_WWWWWWWWWWWWWWWWWWWWWWWW',
  })
  assert.deepEqual(Object.keys(out).sort(), ['context', 'message', 'name', 'stack'])
  assert.ok(!JSON.stringify(out).includes('gb_key_WWWW'))
})

test('scrubErrorPayload scrubs and bounds the error NAME too', () => {
  // `new Error(token)` rethrown by a wrapper that promotes the message to a name is not a
  // hypothetical, and an unbounded name would blow the title column's CHECK.
  const out = scrubErrorPayload({ name: 'gb_key_EEEEEEEEEEEEEEEEEEEEEEEE', message: '' })
  assert.ok(!out.name.includes('gb_key_'))
  assert.ok(out.name.length <= 64)
})

test('scrubErrorPayload enforces the message and stack caps', () => {
  // Word-shaped inputs, for the reason longProse() exists: a repeated single character is itself a
  // redactable run, and asserting `<= cap` against `[redacted]` proves nothing about the cap.
  const out = scrubErrorPayload({ message: longProse(5000), stack: longProse(20000) })
  assert.equal(out.message.length, MAX_MESSAGE_CHARS)
  assert.equal((out.stack ?? '').length, MAX_STACK_CHARS)
})

test('scrubErrorPayload defaults a missing or non-string name to Error', () => {
  assert.equal(scrubErrorPayload({}).name, 'Error')
  assert.equal(scrubErrorPayload({ name: 42 }).name, 'Error')
  assert.equal(scrubErrorPayload({ name: '   ' }).name, 'Error')
})

test('scrubErrorPayload rejects a non-object context rather than coercing it', () => {
  assert.deepEqual(scrubErrorPayload({ context: 'nope' }).context, {})
  assert.deepEqual(scrubErrorPayload({ context: ['a'] }).context, {})
  assert.deepEqual(scrubErrorPayload({ context: null }).context, {})
})
