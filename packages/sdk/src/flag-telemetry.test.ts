import assert from 'node:assert/strict'
import test from 'node:test'
import {
  FLAG_EVALUATED_EVENT,
  flagEvaluationFingerprint,
  normalizeFlagEvaluationSampleRate,
  shouldSampleFlagEvaluation,
  validateFlagEvaluationTelemetry,
} from './flag-telemetry.ts'

const evaluation = {
  flagKey: 'checkout.stripe_enabled',
  flagVersion: 7,
  variant: 'on',
  reason: 'STATIC',
  snapshotVersion: 40,
  environment: 'production' as const,
  subject: { type: 'merchant', id: 'merchant-opaque-123' },
}

test('flag evaluation telemetry is scalar-only and validates its safe subject context', () => {
  assert.equal(FLAG_EVALUATED_EVENT, 'flag_evaluated')
  assert.equal(validateFlagEvaluationTelemetry(evaluation), true)
  for (const id of ['merchant-opaque-123', 'user_2abc', '01J7Z9QF3QH82R6SBCJPK8ZP4W', 'tenant:mx.01']) {
    assert.equal(
      validateFlagEvaluationTelemetry({ ...evaluation, subject: { ...evaluation.subject, id } }),
      true
    )
  }
  for (const id of [
    'person@example.com',
    ' person@example.com ',
    'merchant 123',
    '/shops/123',
    '{"email":"x@y.z"}',
  ]) {
    assert.equal(
      validateFlagEvaluationTelemetry({ ...evaluation, subject: { ...evaluation.subject, id } }),
      false
    )
  }
  assert.equal(
    validateFlagEvaluationTelemetry({ ...evaluation, metadata: { requestBody: 'not allowed' } }),
    false
  )
})

test('sampling and idempotency fingerprint are stable for one decision and version-sensitive', () => {
  const fingerprint = flagEvaluationFingerprint(evaluation)
  assert.equal(flagEvaluationFingerprint({ ...evaluation }), fingerprint)
  assert.notEqual(flagEvaluationFingerprint({ ...evaluation, flagVersion: 8 }), fingerprint)
  assert.equal(shouldSampleFlagEvaluation(evaluation, 0), false)
  assert.equal(shouldSampleFlagEvaluation(evaluation, 1), true)
  assert.equal(shouldSampleFlagEvaluation(evaluation, 0.5), shouldSampleFlagEvaluation(evaluation, 0.5))
  assert.equal(normalizeFlagEvaluationSampleRate(-1), 0)
  assert.equal(normalizeFlagEvaluationSampleRate(2), 1)
  assert.equal(normalizeFlagEvaluationSampleRate(Number.NaN), 1)
})
