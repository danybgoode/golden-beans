// The kill-switch's OFF path, asserted where it is actually reachable.
//
// e2e/agent-rail-dark.spec.ts covers what an anonymous HTTP caller can prove and says so plainly;
// this file covers the polarity itself. Break `shouldRenderAgentRail` to render while the gate is
// OFF and the first test here goes red — that is the mutation check sprint-2.md asks for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldRenderAgentRail, pendingChipState } from './agent-rail-visibility.ts'

test('D6 — the rail does not render while the gate is OFF, member or not', () => {
  assert.equal(shouldRenderAgentRail({ enabled: false, projectId: 'a-real-project-id' }), false)
  assert.equal(shouldRenderAgentRail({ enabled: false, projectId: null }), false)
})

test('a resolved membership is required even when the gate is ON', () => {
  // The condition that makes the switch safe to flip: no membership resolved server-side, no rail.
  // An anonymous reader of the demo project's dashboards is exactly this case.
  assert.equal(shouldRenderAgentRail({ enabled: true, projectId: null }), false)
  assert.equal(shouldRenderAgentRail({ enabled: true, projectId: '' }), false)
})

test('both conditions together are what turns it on', () => {
  assert.equal(shouldRenderAgentRail({ enabled: true, projectId: 'a-real-project-id' }), true)
})

// ── The summary chip's three states ───────────────────────────────────────────────────────────
// The rail's panel is server-rendered closed, so on a phone the chip is the ONLY thing a reader
// sees. An unreadable proposals table must not produce the same summary as an empty one.

test('an unreadable read is its own state, never a zero', () => {
  assert.deepEqual(pendingChipState(null), { kind: 'unreadable' })
})

test('a genuine empty is distinct from unreadable, and from a count', () => {
  assert.deepEqual(pendingChipState([]), { kind: 'empty' })
})

test('a real count carries its number', () => {
  assert.deepEqual(pendingChipState([{}, {}, {}]), { kind: 'count', value: 3 })
})

test('the three states are mutually exclusive — no input yields two, and none yields none', () => {
  // The mutation this kills: `pending?.length ?? 0` followed by `> 0`, which collapses `null` and
  // `[]` into one branch. Under that implementation the first assertion below returns 'empty'.
  const kinds = [null, [], [{}]].map((input) => pendingChipState(input as readonly unknown[] | null).kind)
  assert.deepEqual(kinds, ['unreadable', 'empty', 'count'])
  assert.equal(new Set(kinds).size, 3)
})
