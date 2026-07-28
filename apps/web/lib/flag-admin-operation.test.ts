import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  flagAdminMutationErrorStatus,
  isVerifiedMiyagiActor,
  parseFlagAdminOperation,
} from './flag-admin-operation.ts'

test('flag admin operation accepts the complete, typed optimistic command', () => {
  assert.deepEqual(
    parseFlagAdminOperation({
      key: 'checkout.stripe_enabled',
      enabled: false,
      expectedSnapshotVersion: 40,
      reason: '  approved checkout rollback drill  ',
    }),
    {
      key: 'checkout.stripe_enabled',
      enabled: false,
      expectedSnapshotVersion: 40,
      reason: 'approved checkout rollback drill',
    }
  )
})

test('flag admin operation rejects coercions, stale-version shapes, and empty reasons', () => {
  for (const command of [
    { key: 'checkout.stripe_enabled', enabled: 'false', expectedSnapshotVersion: 1, reason: 'x' },
    { key: 'checkout.stripe_enabled', enabled: false, expectedSnapshotVersion: -1, reason: 'x' },
    { key: 'checkout.stripe_enabled', enabled: false, expectedSnapshotVersion: 1.1, reason: 'x' },
    { key: 'checkout.stripe_enabled', enabled: false, expectedSnapshotVersion: 1, reason: '   ' },
    { key: 'unknown key', enabled: false, expectedSnapshotVersion: 1, reason: 'x' },
    { key: 'Checkout.stripe_enabled', enabled: false, expectedSnapshotVersion: 1, reason: 'x' },
    { key: '-checkout.stripe_enabled', enabled: false, expectedSnapshotVersion: 1, reason: 'x' },
  ]) {
    assert.equal(parseFlagAdminOperation(command), null)
  }
})

test('only a bounded Clerk user id can become the external audit actor', () => {
  assert.equal(isVerifiedMiyagiActor('user_2zyA7cQ9'), true)
  for (const value of [null, '', 'user_', 'admin@example.com', 'user_a/b', 'usr_abc']) {
    assert.equal(isVerifiedMiyagiActor(value), false)
  }
})

test('invalid or non-operable database commands are actionable, while unknown failures stay opaque', () => {
  assert.equal(flagAdminMutationErrorStatus('22023'), 400)
  assert.equal(flagAdminMutationErrorStatus('P0001'), 409)
  assert.equal(flagAdminMutationErrorStatus('42501'), 500)
  assert.equal(flagAdminMutationErrorStatus(undefined), 500)
})
