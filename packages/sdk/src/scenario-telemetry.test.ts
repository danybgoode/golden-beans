import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SCENARIO_EXECUTED_EVENT,
  validateScenarioExecutionTelemetry,
} from './scenario-telemetry.ts'

const execution = {
  scenarioKey: 'checkout_probe',
  scenarioVersion: 3,
  runId: '018f0d3a-2577-7a53-8d41-b7c189e23f30',
  runRevision: 4,
  targetKey: 'miyagi.backend.resilience_probe',
  leaseId: '018f0d3a-2655-7d97-816f-33d7b8df7281',
  cohort: 'internal' as const,
  environment: 'production' as const,
  arm: 'fault' as const,
  faultKind: 'delay' as const,
  failed: false,
  latencyMs: 125,
  subject: { type: 'probe', id: 'synthetic-01' },
  flag: {
    key: 'resilience.checkout_probe',
    definitionVersion: 2,
    variant: 'delay_125',
    reason: 'TARGETING_MATCH',
    snapshotVersion: 11,
  },
  experiment: { key: 'checkout_probe_impact', definitionVersion: 1 },
}

test('scenario execution telemetry is a closed scalar-only contract', () => {
  assert.equal(SCENARIO_EXECUTED_EVENT, 'scenario_executed')
  assert.equal(validateScenarioExecutionTelemetry(execution), true)
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, metadata: { authorization: 'secret' } }),
    false
  )
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, subject: { type: 'probe', id: 'x@y.z' } }),
    false
  )
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, latencyMs: 300_001 }),
    false
  )
})

test('control and fault arms cannot contradict the closed fault kind', () => {
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, arm: 'control', faultKind: 'delay' }),
    false
  )
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, arm: 'control', faultKind: 'none' }),
    true
  )
  assert.equal(
    validateScenarioExecutionTelemetry({ ...execution, arm: 'fault', faultKind: 'none' }),
    false
  )
})
