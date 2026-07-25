import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSweepFixtureUser, FIXTURE_PREFIX } from './fixture-sweep.ts'

// The sweep predicate authorises DELETING real auth users, so every guard gets a test. The
// dangerous direction is a false positive: sweeping something that is not ours, or that a parallel
// run is actively signed in as. Each case below is a way that could happen.

const HOUR = 60 * 60 * 1000
const now = Date.parse('2026-07-25T12:00:00.000Z')
const ago = (ms: number) => new Date(now - ms).toISOString()

const fixture = (over: Partial<{ id: string; email: string; created_at: string }> = {}) => ({
  id: 'user-1',
  email: `${FIXTURE_PREFIX}+123-456@example.invalid`,
  created_at: ago(2 * HOUR),
  ...over,
})

test('an old fixture user from a crashed run is swept', () => {
  assert.equal(shouldSweepFixtureUser(fixture(), { now, currentUserId: 'other' }), true)
})

test('the CURRENT run’s own user is never swept', () => {
  // Teardown runs while its own record is still on disk; sweeping itself would race the delete it
  // already performs and turn a clean teardown into a confusing double-delete error.
  assert.equal(shouldSweepFixtureUser(fixture({ id: 'me' }), { now, currentUserId: 'me' }), false)
})

test('a RECENT fixture user is never swept — this is the concurrency floor', () => {
  // The case that matters most. A parallel run's user is seconds old; without the age floor a
  // sibling teardown deletes the account another worker is mid-session on.
  for (const age of [0, 1000, 5 * 60 * 1000, HOUR - 1]) {
    assert.equal(
      shouldSweepFixtureUser(fixture({ created_at: ago(age) }), { now, currentUserId: null }),
      false,
      `a user ${age}ms old must not be swept`
    )
  }
  assert.equal(
    shouldSweepFixtureUser(fixture({ created_at: ago(HOUR + 1000) }), { now, currentUserId: null }),
    true
  )
})

test('a REAL user is never swept, however similar it looks', () => {
  for (const email of [
    'daniel@example.com',
    'someone@golden-beans.com',
    // The prefix alone is not enough — the reserved TLD is the second, independent guard.
    `${FIXTURE_PREFIX}+123@gmail.com`,
    `${FIXTURE_PREFIX}@realdomain.io`,
    // A lookalike that merely CONTAINS the prefix rather than starting with it.
    `real-user-${FIXTURE_PREFIX}@example.invalid`,
  ]) {
    assert.equal(
      shouldSweepFixtureUser(fixture({ email }), { now, currentUserId: null }),
      false,
      `must not sweep ${email}`
    )
  }
})

test('a missing or unparseable timestamp is never swept', () => {
  // "I cannot tell how old this is" is a reason to leave a real user alone, not to delete it.
  assert.equal(
    shouldSweepFixtureUser(fixture({ created_at: 'not a date' }), { now, currentUserId: null }),
    false
  )
  assert.equal(shouldSweepFixtureUser(fixture({ created_at: '' }), { now, currentUserId: null }), false)
})

test('a missing email is never swept', () => {
  assert.equal(
    shouldSweepFixtureUser({ id: 'x', email: null, created_at: ago(5 * HOUR) }, { now, currentUserId: null }),
    false
  )
  assert.equal(
    shouldSweepFixtureUser({ id: 'x', created_at: ago(5 * HOUR) }, { now, currentUserId: null }),
    false
  )
})
