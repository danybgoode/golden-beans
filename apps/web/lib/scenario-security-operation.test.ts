import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseScenarioSecurityOperation } from './scenario-security-operation.ts'

const VALID = {
  runId: '11111111-1111-4111-8111-111111111111',
  expectedRevision: 2,
}

test('security runner accepts only an immutable run and CAS revision', () => {
  assert.deepEqual(parseScenarioSecurityOperation(VALID), VALID)
  for (const added of [
    { target: 'https://attacker.example' },
    { template: 'malformed_payload_v1' },
    { credential: 'caller-selected' },
    { requestCount: 100 },
  ]) {
    assert.equal(parseScenarioSecurityOperation({ ...VALID, ...added }), null)
  }
  assert.equal(parseScenarioSecurityOperation({ ...VALID, expectedRevision: 0 }), null)
})
