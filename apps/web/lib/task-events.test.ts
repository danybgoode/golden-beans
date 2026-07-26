// signals-loop · Sprint 2, Story 2.1 — pinning the task lifecycle's event vocabulary as a TOTAL,
// collision-free, output-only contract.
//
// `taskEventForStatus` is a switch with no default, over a status union of exactly four values —
// TypeScript's exhaustiveness check is what makes it total today, but a spec doesn't get to trust
// the compiler on behalf of every future caller (a status added without updating the switch would
// still typecheck against a widened union at a boundary, and the runtime function would then have a
// silent gap). So this file drives all four statuses through the actual function and asserts every
// one returns a non-empty string — the failure mode being pinned against is a lifecycle transition
// that fires and nobody downstream ever hears about it.
//
// The second property is the ingest/emit namespace split: `$`-prefixed names are reserved for
// events the engine INGESTS (`$error`, `$friction`); these are events the engine EMITS through the
// tenant's own destination router, exactly like a tenant's `checkout_completed`. A `$` name here
// would collide with the reserved namespace, so that's asserted explicitly rather than left as an
// accident of the current string literals.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  taskEventForStatus,
  TASK_OPENED_EVENT,
  TASK_CLAIMED_EVENT,
  TASK_RESOLVED_EVENT,
  TASK_DISMISSED_EVENT,
  TASK_SUBJECT_TYPE,
  TASK_LIFECYCLE_EVENTS,
  type TaskStatus,
} from './task-events.ts'

// ── taskEventForStatus is total ──────────────────────────────────────────────────────────────────

test('taskEventForStatus returns a non-empty string for every status in the lifecycle', () => {
  const statuses: TaskStatus[] = ['open', 'claimed', 'resolved', 'dismissed']
  for (const status of statuses) {
    const event = taskEventForStatus(status)
    assert.equal(typeof event, 'string')
    assert.ok(event.length > 0, `status ${status} produced an empty event name`)
  }
})

test('taskEventForStatus maps each status to its documented constant', () => {
  assert.equal(taskEventForStatus('open'), TASK_OPENED_EVENT)
  assert.equal(taskEventForStatus('claimed'), TASK_CLAIMED_EVENT)
  assert.equal(taskEventForStatus('resolved'), TASK_RESOLVED_EVENT)
  assert.equal(taskEventForStatus('dismissed'), TASK_DISMISSED_EVENT)
})

test('no two statuses share an event name', () => {
  const statuses: TaskStatus[] = ['open', 'claimed', 'resolved', 'dismissed']
  const mapped = new Set(statuses.map((s) => taskEventForStatus(s)))
  assert.equal(mapped.size, statuses.length)
})

// ── TASK_LIFECYCLE_EVENTS is exactly the four constants ─────────────────────────────────────────

test('TASK_LIFECYCLE_EVENTS contains exactly the four lifecycle constants, no duplicates', () => {
  assert.equal(TASK_LIFECYCLE_EVENTS.length, 4)
  assert.deepEqual(
    [...TASK_LIFECYCLE_EVENTS].sort(),
    [TASK_OPENED_EVENT, TASK_CLAIMED_EVENT, TASK_RESOLVED_EVENT, TASK_DISMISSED_EVENT].sort()
  )
  assert.equal(new Set(TASK_LIFECYCLE_EVENTS).size, 4)
})

// ── The ingest/emit namespace split ───────────────────────────────────────────────────────────────

test('none of the emitted event names are $-prefixed — that namespace is reserved for ingest', () => {
  // `$error` / `$friction` are events the engine INGESTS as reserved input. These are events the
  // engine EMITS, and a tenant is meant to filter/route them like their own custom events. A `$`
  // name here would silently collide with the reserved ingest namespace.
  for (const event of TASK_LIFECYCLE_EVENTS) {
    assert.ok(!event.startsWith('$'), `${event} is $-prefixed and would collide with ingest events`)
  }
})

// ── Literal pinning — a rename on either side of this cross-module contract must fail here ──────

test('event name constants are pinned as literals', () => {
  assert.equal(TASK_OPENED_EVENT, 'task_opened')
  assert.equal(TASK_CLAIMED_EVENT, 'task_claimed')
  assert.equal(TASK_RESOLVED_EVENT, 'task_resolved')
  assert.equal(TASK_DISMISSED_EVENT, 'task_dismissed')
})

test('TASK_SUBJECT_TYPE is pinned as the literal "task"', () => {
  assert.equal(TASK_SUBJECT_TYPE, 'task')
})
