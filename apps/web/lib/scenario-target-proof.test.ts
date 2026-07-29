import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createScenarioTargetChallenge,
  createScenarioTargetRegistrationChallenge,
  createScenarioTargetRequestSignature,
  createScenarioTargetResponseProof,
  hashScenarioTargetChallenge,
  scenarioTargetProofMatches,
} from './scenario-target-proof.ts'

const INPUT = {
  secret: 'gb_admin_fixture_secret_0123456789',
  challenge: 'a'.repeat(64),
  targetKey: 'miyagi.frontend.resilience_probe',
  origin: 'https://miyagisanchez.com',
}

test('target proof domains request and response signatures and pins stable vectors', () => {
  assert.equal(
    createScenarioTargetRegistrationChallenge(INPUT),
    'cab33f14049126d83a565df91c22720dd8955c9e0f1067c3c4440c0347bebf8c'
  )
  assert.equal(
    createScenarioTargetRequestSignature(INPUT),
    'da5bba67b8dd10fed378030a3822ff14d1ec9a3a8679508292cf3df7ab68536d'
  )
  assert.equal(
    createScenarioTargetResponseProof(INPUT),
    'd66fa55cfee3c2ad83f41d3f3e373fb03be8edc10e988dddae5791c369e935c6'
  )
  assert.notEqual(createScenarioTargetRequestSignature(INPUT), createScenarioTargetResponseProof(INPUT))
})

test('challenge generation is fixed-width random hex and hashes before persistence', () => {
  const first = createScenarioTargetChallenge()
  const second = createScenarioTargetChallenge()
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.match(second, /^[0-9a-f]{64}$/)
  assert.notEqual(first, second)
  assert.match(hashScenarioTargetChallenge(first), /^[0-9a-f]{64}$/)
  assert.notEqual(hashScenarioTargetChallenge(first), first)
})

test('proof comparison is constant-time for valid shapes and rejects malformed input', () => {
  const expected = createScenarioTargetResponseProof(INPUT)
  assert.equal(scenarioTargetProofMatches(expected, expected), true)
  for (const received of [null, '', expected.toUpperCase(), expected.slice(1), 'x'.repeat(64)]) {
    assert.equal(scenarioTargetProofMatches(expected, received), false)
  }
})

test('proofs reject non-origin URLs, weak secrets and malformed identifiers', () => {
  for (const changed of [
    { ...INPUT, secret: 'short' },
    { ...INPUT, origin: 'http://miyagisanchez.com' },
    { ...INPUT, origin: 'https://miyagisanchez.com/path' },
    { ...INPUT, origin: 'https://user:pass@miyagisanchez.com' },
    { ...INPUT, targetKey: 'Bad Target' },
    { ...INPUT, challenge: 'a'.repeat(63) },
  ]) {
    assert.throws(() => createScenarioTargetRequestSignature(changed))
  }
})
