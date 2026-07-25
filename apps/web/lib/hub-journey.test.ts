import { test } from 'node:test'
import assert from 'node:assert/strict'
import { journeyMarkerIndex } from './hub-journey.ts'

// The marker is the journey view's honesty mechanism at a glance: it must never sit past a
// not-yet-shipped epic (that would claim more progress than the data supports) and it must never
// sit before the true frontier either (that would undersell real, shipped work as still ahead).

test('an empty roadmap places the marker at 0', () => {
  assert.equal(journeyMarkerIndex([]), 0)
})

test('nothing shipped yet — marker sits at the very first epic', () => {
  assert.equal(journeyMarkerIndex([{ shipped: false }, { shipped: false }]), 0)
})

test('everything shipped — marker sits past the end, not on the last epic', () => {
  const epics = [{ shipped: true }, { shipped: true }, { shipped: true }]
  assert.equal(journeyMarkerIndex(epics), epics.length)
})

test('the common case — marker sits on the first unshipped epic', () => {
  const epics = [{ shipped: true }, { shipped: true }, { shipped: false }, { shipped: false }]
  assert.equal(journeyMarkerIndex(epics), 2)
})

test('a gap (an unshipped epic ahead of a later shipped one) still marks the FIRST unshipped one', () => {
  // Build order is not a guarantee of build order execution; the marker answers "what's the next
  // thing not yet done", not "what's the highest-index shipped thing".
  const epics = [{ shipped: true }, { shipped: false }, { shipped: true }]
  assert.equal(journeyMarkerIndex(epics), 1)
})
