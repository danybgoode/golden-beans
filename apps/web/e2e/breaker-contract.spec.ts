import { expect, test } from '@playwright/test'
import {
  parseBreakerAdminOperation,
  parseBreakerAutomaticOperation,
} from '@/lib/breaker-admin-operation'

const policyId = '018f0d3a-2577-7a53-8d41-b7c189e23f30'
const evidenceId = '018f0d3a-2655-7d97-816f-33d7b8df7281'

test('manual breaker confirmation is exact and never carries a flag or value', () => {
  const command = {
    operation: 'prepare_manual',
    policyId,
    evidenceId,
    expectedPolicyRevision: 1,
    expectedSnapshotVersion: 7,
    reason: 'Prepare the reviewed protective transition.',
  }
  expect(parseBreakerAdminOperation(command)).toEqual(command)
  expect(parseBreakerAdminOperation({ ...command, flagKey: 'caller.chosen' })).toBeNull()
  expect(parseBreakerAdminOperation({ ...command, enabled: false })).toBeNull()
})

test('automatic operation accepts only policy, evidence and CAS state', () => {
  const command = {
    policyId,
    evidenceId,
    expectedPolicyRevision: 1,
    expectedSnapshotVersion: 7,
    reason: 'Apply the owner-approved protective transition.',
  }
  expect(parseBreakerAutomaticOperation(command)).toEqual(command)
  expect(parseBreakerAutomaticOperation({ ...command, protectiveVariant: 'off' })).toBeNull()
})
