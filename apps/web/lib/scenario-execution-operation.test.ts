import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseScenarioExecutionOperation } from './scenario-execution-operation.ts'

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const LEASE_ID = '22222222-2222-4222-8222-222222222222'

test('parses the two closed execution lease operations without coercion', () => {
  assert.deepEqual(
    parseScenarioExecutionOperation({
      operation: 'reserve',
      runId: RUN_ID,
      expectedRunRevision: 3,
    }),
    { operation: 'reserve', runId: RUN_ID, expectedRunRevision: 3 }
  )
  assert.deepEqual(
    parseScenarioExecutionOperation({
      operation: 'settle',
      runId: RUN_ID,
      leaseId: LEASE_ID,
      succeeded: false,
    }),
    { operation: 'settle', runId: RUN_ID, leaseId: LEASE_ID, succeeded: false }
  )
})

test('rejects unknown fields, malformed identifiers, coercions and invalid revisions', () => {
  for (const value of [
    null,
    [],
    { operation: 'unknown', runId: RUN_ID },
    { operation: 'reserve', runId: RUN_ID, expectedRunRevision: 0 },
    { operation: 'reserve', runId: RUN_ID, expectedRunRevision: '3' },
    { operation: 'reserve', runId: 'not-a-uuid', expectedRunRevision: 3 },
    {
      operation: 'reserve',
      runId: RUN_ID,
      expectedRunRevision: 3,
      targetUrl: 'https://attacker.example',
    },
    { operation: 'settle', runId: RUN_ID, leaseId: LEASE_ID, succeeded: 1 },
    { operation: 'settle', runId: RUN_ID, leaseId: 'not-a-uuid', succeeded: true },
    {
      operation: 'settle',
      runId: RUN_ID,
      leaseId: LEASE_ID,
      succeeded: true,
      projectId: 'caller-selected',
    },
  ]) {
    assert.equal(parseScenarioExecutionOperation(value), null)
  }
})
