import assert from 'node:assert/strict'
import test from 'node:test'
import { parseScenarioImpactCaptureRequest } from './scenario-impact-request.ts'

const request = {
  runId: '018f0d3a-2577-7a53-8d41-b7c189e23f30',
  asOf: '2026-07-29T12:00:00.000Z',
  idempotencyKey: '018f0d3a-2655-7d97-816f-33d7b8df7281',
  reason: 'Capture the stopped internal drill evidence.',
}

test('impact capture accepts one exact bounded command and canonicalizes time', () => {
  assert.deepEqual(
    parseScenarioImpactCaptureRequest(request, '2026-07-29T12:01:00.000Z'),
    request
  )
})

test('impact capture rejects future timestamps and caller-selected evidence', () => {
  assert.equal(
    parseScenarioImpactCaptureRequest(request, '2026-07-29T11:59:00.000Z'),
    null
  )
  assert.equal(
    parseScenarioImpactCaptureRequest(
      { ...request, technical: { fault: { attempts: 999 } } },
      '2026-07-29T12:01:00.000Z'
    ),
    null
  )
})
