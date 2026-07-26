// signals-loop · Story 1.1 — the pure half of error capture.
//
// ── What this file can and cannot cover, stated up front ─────────────────────────────────────
// `createGrowthEngineClient` lives in index.ts, which this runner cannot load: Node's native TS
// loader needs `.ts` extensions on relative imports, and the source tsconfigs deliberately forbid
// them (.github/workflows/ci.yml explains why). So the client's WIRE behaviour — that a captured
// error reaches POST /api/v1/track as a `$error` event with the right tags and header — is covered
// end to end by apps/web/e2e/signals-capture.spec.ts against a real server, which is the stronger
// check anyway.
//
// What lives here is the logic that has branches an HTTP test cannot reach cheaply: every shape a
// `catch` block can hand you, and the sample-rate clamp. Those are exactly the branches where a
// reporter breaks in production, because the payloads that reach them are already abnormal.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeError, normalizeSampleRate, ERROR_EVENT } from './capture.ts'

test('the reserved event name matches what the engine groups on', () => {
  // Pinned as a literal, not re-derived: this string is a contract shared with
  // apps/web/lib/signal-events.ts, and a rename on one side that the other didn't hear about would
  // silently stop every captured error from ever being grouped.
  assert.equal(ERROR_EVENT, '$error')
})

// ── normalizeError: every shape a catch block can receive ────────────────────────────────────

test('a real Error yields its name, message and stack', () => {
  const err = new TypeError('boom')
  const out = normalizeError(err)
  assert.equal(out.name, 'TypeError')
  assert.equal(out.message, 'boom')
  assert.equal(typeof out.stack, 'string')
  assert.ok((out.stack ?? '').length > 0)
})

test('an Error with an empty message keeps a usable name and an empty message', () => {
  const out = normalizeError(new Error(''))
  assert.equal(out.name, 'Error')
  assert.equal(out.message, '')
})

test('a thrown STRING becomes the message, not the name', () => {
  // `throw 'something failed'` is common in older code and in minified third-party bundles.
  const out = normalizeError('something failed')
  assert.equal(out.name, 'Error')
  assert.equal(out.message, 'something failed')
  assert.equal(out.stack, null)
})

test('a thrown number, null, undefined and a boolean never throw and always produce a message', () => {
  // The whole point of the `unknown` type on a catch binding. Each of these has broken a reporter
  // somewhere; none of them should break this one.
  for (const thrown of [404, null, undefined, false, 0, NaN]) {
    const out = normalizeError(thrown)
    assert.equal(typeof out.name, 'string')
    assert.equal(typeof out.message, 'string')
    assert.ok(out.name.length > 0, `empty name for ${String(thrown)}`)
  }
  assert.equal(normalizeError(null).message, 'null')
  assert.equal(normalizeError(undefined).message, 'undefined')
  assert.equal(normalizeError(404).message, '404')
})

test('a plain object with a message field is treated like an error', () => {
  const out = normalizeError({ name: 'ApiError', message: 'upstream 502', stack: 'at x (y.ts:1:1)' })
  assert.equal(out.name, 'ApiError')
  assert.equal(out.message, 'upstream 502')
  assert.equal(out.stack, 'at x (y.ts:1:1)')
})

test('an object with NO message is serialized rather than dropped', () => {
  const out = normalizeError({ code: 'E_NOPE', detail: 'nothing useful' })
  assert.equal(out.name, 'Error')
  assert.ok(out.message.includes('E_NOPE'), out.message)
})

test('a CIRCULAR object does not throw — the reporter must survive its own input', () => {
  // A DOM node or a framework error carrying a back-reference to its own context is an ordinary
  // thrown value, and JSON.stringify throws on it. A capture path that dies here converts one bug
  // into an unhandled exception inside the error handler, which is strictly worse than the original.
  const circular: Record<string, unknown> = { code: 'E_CIRC' }
  circular.self = circular
  assert.doesNotThrow(() => normalizeError(circular))
  assert.equal(typeof normalizeError(circular).message, 'string')
})

test('non-string name/message/stack fields are ignored rather than coerced blindly', () => {
  // `{ name: 42 }` must not become the string "42" as an error CLASS — the fingerprint groups on
  // name, so a numeric field leaking in would split one problem into a signal per value.
  const out = normalizeError({ name: 42, message: 99, stack: {} })
  assert.equal(out.name, 'Error')
  assert.equal(out.stack, null)
  assert.equal(typeof out.message, 'string')
})

test('normalizeError does NOT truncate — bounding is the scrubbing caller job', () => {
  // Ordering matters and is asserted here as a property: truncating before redaction can slice a
  // secret in half and store the surviving portion, so this layer must hand the whole string on.
  const long = 'the quick brown fox jumps over the lazy dog '.repeat(200)
  assert.equal(normalizeError(new Error(long)).message.length, long.length)
})

// ── normalizeSampleRate ──────────────────────────────────────────────────────────────────────

test('an absent or malformed sample rate defaults to 1, never to 0', () => {
  // The safe direction. A capture SDK that quietly stops sending looks exactly like an application
  // with no errors, so a bad config must over-report rather than go silent.
  for (const bad of [undefined, NaN, Infinity, -Infinity]) {
    assert.equal(normalizeSampleRate(bad as number | undefined), 1, `wrong default for ${String(bad)}`)
  }
})

test('an out-of-range sample rate is clamped into 0..1', () => {
  assert.equal(normalizeSampleRate(99), 1)
  assert.equal(normalizeSampleRate(-5), 0)
  assert.equal(normalizeSampleRate(0), 0)
  assert.equal(normalizeSampleRate(1), 1)
  assert.equal(normalizeSampleRate(0.25), 0.25)
})
