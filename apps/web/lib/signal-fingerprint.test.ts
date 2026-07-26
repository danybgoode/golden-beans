// signals-loop · Story 1.0 — pinning the grouping key's core promise.
//
// This file exists to make the epic's central claim checkable without a database: the same bug
// occurring a thousand times must fingerprint identically every time (determinism), two
// occurrences of the same bug that differ only in the parts that VARY (a user id, a uuid, a hex
// pointer, a quoted literal) must collapse to the same fingerprint (grouping), and anything that
// changes the SHAPE of the problem — kind, featureId, the call site — must never collapse
// (discrimination). It also pins the one bug the module's own comment calls out by name: joining
// parts with a delimiter that can't appear in a normalized part, so `{name:'a b', message:'c'}`
// and `{name:'a', message:'b c'}` don't collide by naive concatenation.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeSignalFingerprint,
  normalizeMessage,
  topAppFrame,
  signalTitle,
} from './signal-fingerprint.ts'

const FP = /^[0-9a-f]{32}$/

test('computeSignalFingerprint is deterministic for identical input', () => {
  const input = {
    kind: 'error',
    name: 'TypeError',
    message: 'User 41 not found',
    stack: 'TypeError: x\n    at handler (/app/src/foo.ts:10:5)',
    featureId: 'checkout',
  }
  const a = computeSignalFingerprint(input)
  const b = computeSignalFingerprint({ ...input })
  assert.equal(a, b)
  assert.match(a, FP)
})

test('grouping: messages differing only in an embedded number collapse to the same fingerprint', () => {
  const base = { kind: 'error', name: 'Error', message: '' }
  const a = computeSignalFingerprint({ ...base, message: 'User 41 not found' })
  const b = computeSignalFingerprint({ ...base, message: 'User 9182 not found' })
  assert.equal(a, b)
})

test('grouping: messages differing only in a uuid, a hex pointer, or a quoted literal collapse', () => {
  const base = { kind: 'error', name: 'Error', message: '' }
  const uuidA = computeSignalFingerprint({
    ...base,
    message: 'could not load user 3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  const uuidB = computeSignalFingerprint({
    ...base,
    message: 'could not load user 11111111-2222-3333-4444-555555555555',
  })
  assert.equal(uuidA, uuidB)

  const hexA = computeSignalFingerprint({ ...base, message: 'pointer 0xdeadbeef invalid' })
  const hexB = computeSignalFingerprint({ ...base, message: 'pointer 0xfeedface invalid' })
  assert.equal(hexA, hexB)

  const quotedA = computeSignalFingerprint({
    ...base,
    message: "could not find 'order_8821'",
  })
  const quotedB = computeSignalFingerprint({
    ...base,
    message: "could not find 'order_9999'",
  })
  assert.equal(quotedA, quotedB)
})

test('discrimination: genuinely different messages produce different fingerprints', () => {
  const base = { kind: 'error', name: 'Error', message: '' }
  const a = computeSignalFingerprint({ ...base, message: 'User not found' })
  const b = computeSignalFingerprint({ ...base, message: 'Order not found' })
  assert.notEqual(a, b)
})

test('discrimination: different kind never merges, even with identical name/message/stack', () => {
  const shared = { name: 'Timeout', message: 'request timed out', stack: null, featureId: null }
  const a = computeSignalFingerprint({ kind: 'error', ...shared })
  const b = computeSignalFingerprint({ kind: 'friction', ...shared })
  assert.notEqual(a, b)
})

test('discrimination: different featureId splits an otherwise-identical fingerprint', () => {
  const shared = { kind: 'error', name: 'Error', message: 'boom', stack: null }
  const a = computeSignalFingerprint({ ...shared, featureId: 'checkout' })
  const b = computeSignalFingerprint({ ...shared, featureId: 'onboarding' })
  assert.notEqual(a, b)
})

test('discrimination: different top application frame splits an otherwise-identical fingerprint', () => {
  const shared = { kind: 'error', name: 'Error', message: 'boom', featureId: null }
  const a = computeSignalFingerprint({
    ...shared,
    stack: 'Error: boom\n    at routeA (/app/src/route-a.ts:10:5)',
  })
  const b = computeSignalFingerprint({
    ...shared,
    stack: 'Error: boom\n    at routeB (/app/src/route-b.ts:10:5)',
  })
  assert.notEqual(a, b)
})

test('delimiter safety: {name:"a b", message:"c"} and {name:"a", message:"b c"} do not collide', () => {
  const a = computeSignalFingerprint({ kind: 'error', name: 'a b', message: 'c' })
  const b = computeSignalFingerprint({ kind: 'error', name: 'a', message: 'b c' })
  assert.notEqual(a, b)
})

test('topAppFrame skips node_modules, node:internal, (native), and <anonymous> frames', () => {
  const stack = [
    'Error: boom',
    '    at Object.<anonymous> (/app/node_modules/some-lib/index.js:5:1)',
    '    at internalHandler (node:internal/process/task_queues:95:5)',
    '    at nativeThing (native)',
    '    at Array.forEach (<anonymous>)',
    '    at realHandler (/app/src/handler.ts:42:13)',
  ].join('\n')
  assert.equal(topAppFrame(stack), 'realHandler (handler.ts:42')
})

test('topAppFrame strips the absolute path and the column, but keeps the line number', () => {
  const stack = 'Error: boom\n    at doWork (/very/long/absolute/path/src/worker.ts:123:45)'
  const frame = topAppFrame(stack)
  assert.equal(frame, 'doWork (worker.ts:123')
  assert.ok(!frame!.includes('/very/long'))
  assert.ok(!frame!.includes(':45'))
})

test('topAppFrame returns the FIRST usable application frame, not a later one', () => {
  const stack = [
    'Error: boom',
    '    at first (/app/src/first.ts:1:1)',
    '    at second (/app/src/second.ts:2:2)',
  ].join('\n')
  assert.equal(topAppFrame(stack), 'first (first.ts:1')
})

test('topAppFrame returns null for null, undefined, and empty input', () => {
  assert.equal(topAppFrame(null), null)
  assert.equal(topAppFrame(undefined), null)
  assert.equal(topAppFrame(''), null)
})

test('topAppFrame returns null when the stack has no usable application frame', () => {
  const stack = [
    'Error: boom',
    '    at Object.<anonymous> (/app/node_modules/some-lib/index.js:5:1)',
    '    at internalHandler (node:internal/process/task_queues:95:5)',
  ].join('\n')
  assert.equal(topAppFrame(stack), null)
})

test('normalizeMessage replaces a uuid as a uuid, not a chewed-up run of <hex>', () => {
  const normalized = normalizeMessage('failed for user 3fa85f64-5717-4562-b3fc-2c963f66afa6')
  assert.equal(normalized, 'failed for user <uuid>')
  assert.ok(!normalized.includes('<hex>'))
})

test('normalizeMessage collapses whitespace and lowercases', () => {
  assert.equal(normalizeMessage('  User   NOT\tFound  '), 'user not found')
  assert.equal(normalizeMessage('Multiple   Spaces\nHere'), 'multiple spaces here')
})

test('signalTitle truncates over the cap and the result never exceeds the cap', () => {
  const longMessage = 'x'.repeat(300)
  const title = signalTitle('SomeError', longMessage, 50)
  assert.ok(title.length <= 50)
  assert.ok(title.endsWith('…'))
})

test('signalTitle does not truncate when under the cap', () => {
  const title = signalTitle('SomeError', 'short message', 160)
  assert.equal(title, 'SomeError: short message')
  assert.ok(title.length <= 160)
})
