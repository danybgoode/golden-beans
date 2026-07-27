// Unit layer for the agent-resolved counting rule.
//
// The property worth pinning is the one cross-review caught (Agy, PR #38): a task counts only if it
// is agent-resolved RIGHT NOW, not if it ever was. The first implementation filtered to
// connector-resolves and kept the last, so a later dismissal or human resolution was skipped past
// rather than replacing the entry — and the number this feeds is a public maturity claim about
// ourselves.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countAgentResolved, type TransitionRecord } from './task-lifecycle-count.ts'

/** Stand-in classifier: a 7-40 char hex string or an http(s) URL is resolvable. */
const isResolvable = (p: string | null) => !!p && (/^[0-9a-f]{7,40}$/i.test(p) || /^https?:\/\/\S+$/.test(p))

function row(over: Partial<TransitionRecord> = {}): TransitionRecord {
  return { taskId: 't1', via: 'connector', toStatus: 'resolved', evidencePointer: 'abc1234', ...over }
}

test('an agent-resolved task with a resolvable pointer counts, with evidence', () => {
  const c = countAgentResolved([row()], isResolvable)
  assert.deepEqual(c, {
    agentResolvedTotal: 1,
    agentResolvedWithEvidence: 1,
    sampleEvidencePointer: 'abc1234',
  })
})

test('an agent resolution with only a NOTE counts toward the total but NOT toward evidence', () => {
  const c = countAgentResolved([row({ evidencePointer: 'done, trust me' })], isResolvable)
  assert.equal(c.agentResolvedTotal, 1)
  assert.equal(c.agentResolvedWithEvidence, 0)
  assert.equal(c.sampleEvidencePointer, null)
})

test('a DASHBOARD resolution is not an agent resolution', () => {
  assert.equal(countAgentResolved([row({ via: 'dashboard' })], isResolvable).agentResolvedTotal, 0)
  // ...and neither is a transition with no `via` at all.
  assert.equal(countAgentResolved([row({ via: undefined })], isResolvable).agentResolvedTotal, 0)
})

test('a CLAIM is not a resolution', () => {
  assert.equal(countAgentResolved([row({ toStatus: 'claimed' })], isResolvable).agentResolvedTotal, 0)
})

// ── The finding, encoded ───────────────────────────────────────────────────────────────────────

test('THE REGRESSION TEST: a task later DISMISSED stops counting', () => {
  // Oldest-first. The old implementation skipped the dismissal and kept the resolve forever.
  const c = countAgentResolved([row(), row({ toStatus: 'dismissed', evidencePointer: null })], isResolvable)
  assert.equal(c.agentResolvedTotal, 0)
  assert.equal(c.agentResolvedWithEvidence, 0)
})

test('a task later resolved by a HUMAN stops counting as agent-resolved', () => {
  const c = countAgentResolved([row(), row({ via: 'dashboard' })], isResolvable)
  assert.equal(c.agentResolvedTotal, 0)
})

test('a task REOPENED after an agent resolution stops counting', () => {
  const c = countAgentResolved([row(), row({ toStatus: 'open', evidencePointer: null })], isResolvable)
  assert.equal(c.agentResolvedTotal, 0)
})

test('...and a task re-resolved by an agent AFTER a dismissal counts once, on its newest pointer', () => {
  // The other direction: the rule must not simply subtract, it must take the latest state.
  const c = countAgentResolved(
    [
      row({ evidencePointer: 'aaaaaaa' }),
      row({ toStatus: 'dismissed', evidencePointer: null }),
      row({ evidencePointer: 'bbbbbbb' }),
    ],
    isResolvable
  )
  assert.equal(c.agentResolvedTotal, 1)
  assert.equal(c.agentResolvedWithEvidence, 1)
  assert.equal(c.sampleEvidencePointer, 'bbbbbbb')
})

test('one task cannot be counted twice, however many transitions it produced', () => {
  const c = countAgentResolved([row(), row(), row()], isResolvable)
  assert.equal(c.agentResolvedTotal, 1)
})

test('distinct tasks are counted separately', () => {
  const c = countAgentResolved(
    [row({ taskId: 'a' }), row({ taskId: 'b' }), row({ taskId: 'c', evidencePointer: 'note' })],
    isResolvable
  )
  assert.equal(c.agentResolvedTotal, 3)
  assert.equal(c.agentResolvedWithEvidence, 2)
})

test('a row with no task id is discarded rather than grouped under an empty key', () => {
  const c = countAgentResolved([row({ taskId: '' })], isResolvable)
  assert.equal(c.agentResolvedTotal, 0)
})

test('an empty input is a clean zero, not a crash', () => {
  assert.deepEqual(countAgentResolved([], isResolvable), {
    agentResolvedTotal: 0,
    agentResolvedWithEvidence: 0,
    sampleEvidencePointer: null,
  })
})

test('the sample pointer is the FIRST evidenced one, normalised through the caller classifier', () => {
  const c = countAgentResolved(
    [row({ taskId: 'a', evidencePointer: '  abc1234  ' })],
    (p) => isResolvable((p ?? '').trim()),
    (p) => (p ?? '').trim()
  )
  assert.equal(c.sampleEvidencePointer, 'abc1234')
})
