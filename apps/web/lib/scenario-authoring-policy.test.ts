import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOwnerDirectScenarioOperation,
  isScenarioKindEnabled,
  scenarioLaunchBlocker,
} from './scenario-authoring-policy.ts'

const enabled = { resilience: true, security: true }

test('scenario capability gates are independent and fail closed by kind', () => {
  assert.equal(isScenarioKindEnabled('resilience', { resilience: true, security: false }), true)
  assert.equal(isScenarioKindEnabled('security', { resilience: true, security: false }), false)
  assert.equal(isScenarioKindEnabled('resilience', { resilience: false, security: true }), false)
  assert.equal(isScenarioKindEnabled('security', { resilience: false, security: true }), true)
})

test('owner launch refuses external, unverified, gated, and unapproved production-security runs', () => {
  const base = {
    kind: 'resilience' as const,
    cohort: 'synthetic' as const,
    environment: 'production' as const,
    targetVerified: true,
    productionSecurityApproved: false,
    faultSummaryAvailable: true,
  }
  assert.match(scenarioLaunchBlocker(base, { resilience: false, security: true }) ?? '', /disabled/)
  assert.match(scenarioLaunchBlocker({ ...base, cohort: 'external' }, enabled) ?? '', /External/)
  assert.match(
    scenarioLaunchBlocker({ ...base, faultSummaryAvailable: false }, enabled) ?? '',
    /cannot be disclosed/
  )
  assert.match(scenarioLaunchBlocker({ ...base, targetVerified: false }, enabled) ?? '', /not verified/)
  assert.match(
    scenarioLaunchBlocker({ ...base, kind: 'security' }, enabled) ?? '',
    /Production security approval/
  )
  assert.equal(scenarioLaunchBlocker(base, enabled), null)
})

test('the direct owner action exposes only define, revoke, and stop', () => {
  assert.equal(isOwnerDirectScenarioOperation('create_definition'), true)
  assert.equal(isOwnerDirectScenarioOperation('revoke_target'), true)
  assert.equal(isOwnerDirectScenarioOperation('transition_run', 'stop'), true)
  for (const operation of ['create_run', 'start_run', 'approve_definition'])
    assert.equal(isOwnerDirectScenarioOperation(operation), false)
  assert.equal(isOwnerDirectScenarioOperation('transition_run', 'abort'), false)
})
