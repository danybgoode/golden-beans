// event-destination-router · Sprint 2, Story 2.2 — fast unit layer for the retry SCHEDULE.
//
// The module comment is explicit about why this is pure and unit-tested at the millisecond: "a
// tuning decision you can't unit-test is one you can't safely change." What matters is the
// SCHEDULE, asserted at the first attempt, a middle attempt, and the terminal attempt: exponential
// doubling from BASE_DELAY_MS, and a hard stop at MAX_ATTEMPTS regardless of what the delay math
// would otherwise say.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retryDecision, MAX_ATTEMPTS, BASE_DELAY_MS, MAX_DELAY_MS } from './retry-policy.ts'

test('first failure (attemptsMade = 1) retries after exactly BASE_DELAY_MS', () => {
  const decision = retryDecision(1)
  assert.deepEqual(decision, { retry: true, delayMs: BASE_DELAY_MS })
})

test('second failure (attemptsMade = 2) doubles to 2 * BASE_DELAY_MS', () => {
  const decision = retryDecision(2)
  assert.deepEqual(decision, { retry: true, delayMs: BASE_DELAY_MS * 2 })
})

test('the schedule doubles at each step through the middle of the range', () => {
  // attemptsMade: 1 -> 30s, 2 -> 60s, 3 -> 120s, 4 -> 240s, 5 -> 480s (all well under the 1h ceiling)
  const expected = [1, 2, 4, 8, 16].map((multiplier) => BASE_DELAY_MS * multiplier)
  const actual = [1, 2, 3, 4, 5].map((attemptsMade) => {
    const d = retryDecision(attemptsMade)
    assert.equal(d.retry, true)
    return d.retry ? d.delayMs : -1
  })
  assert.deepEqual(actual, expected)
})

test('attemptsMade >= MAX_ATTEMPTS gives up: no further retry', () => {
  assert.deepEqual(retryDecision(MAX_ATTEMPTS), { retry: false })
})

test('attemptsMade one below MAX_ATTEMPTS still retries (the last chance)', () => {
  const decision = retryDecision(MAX_ATTEMPTS - 1)
  assert.equal(decision.retry, true)
})

test('attemptsMade far beyond MAX_ATTEMPTS still just gives up (no crash, no runaway delay)', () => {
  assert.deepEqual(retryDecision(MAX_ATTEMPTS + 50), { retry: false })
})

test('a giving-up decision never carries a delayMs field', () => {
  const decision = retryDecision(MAX_ATTEMPTS)
  assert.equal(decision.retry, false)
  assert.ok(!('delayMs' in decision))
})

test('delay never exceeds MAX_DELAY_MS for any retryable attempt count', () => {
  for (let attemptsMade = 1; attemptsMade < MAX_ATTEMPTS; attemptsMade++) {
    const decision = retryDecision(attemptsMade)
    assert.equal(decision.retry, true)
    if (decision.retry) assert.ok(decision.delayMs <= MAX_DELAY_MS)
  }
})
