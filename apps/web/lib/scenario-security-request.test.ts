import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createScenarioSecurityRequestSignature,
  parseScenarioSecurityRequest,
  scenarioSecurityRequestSignatureMatches,
} from './scenario-security-request.ts'

const REQUEST = {
  contractVersion: 1 as const,
  runId: '11111111-1111-4111-8111-111111111111',
  leaseId: '22222222-2222-4222-8222-222222222222',
  runRevision: 4,
  targetKey: 'miyagi.internal.probe',
  template: 'revoked_credential_v1' as const,
  attempt: 1,
}

test('closed security request parser rejects caller-added execution inputs', () => {
  assert.deepEqual(parseScenarioSecurityRequest(REQUEST), REQUEST)
  for (const added of [
    { url: 'https://attacker.example' },
    { credential: 'caller-selected' },
    { headers: { authorization: 'secret' } },
    { body: 'caller-selected' },
  ]) {
    assert.equal(parseScenarioSecurityRequest({ ...REQUEST, ...added }), null)
  }
  assert.equal(parseScenarioSecurityRequest({ ...REQUEST, attempt: 4 }), null)
})

test('request signature is origin- and request-bound with constant-time comparison', () => {
  const secret = 'fixture-secret-with-enough-entropy'
  const origin = 'https://miyagisanchez.com'
  const signature = createScenarioSecurityRequestSignature({
    secret,
    origin,
    request: REQUEST,
  })
  assert.equal(signature, '4daf1091bf79a03119fc7b00531f7b7bb47c87b8a259d36b71ad99c63cd4b97d')
  assert.match(signature, /^[0-9a-f]{64}$/)
  assert.equal(scenarioSecurityRequestSignatureMatches({ secret, origin, request: REQUEST }, signature), true)
  assert.equal(
    scenarioSecurityRequestSignatureMatches(
      {
        secret,
        origin,
        request: { ...REQUEST, template: 'invalid_credential_v1' },
      },
      signature
    ),
    false
  )
  assert.equal(
    scenarioSecurityRequestSignatureMatches(
      { secret, origin: 'https://other.example', request: REQUEST },
      signature
    ),
    false
  )
})
