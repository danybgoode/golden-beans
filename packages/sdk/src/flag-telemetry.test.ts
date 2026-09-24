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

// ── experiments-for-humans D2.3 / D2.4 ───────────────────────────────────────────────────────
import { EXPERIMENT_METADATA_KEYS, experimentForResolution } from './flag-telemetry.ts'

const experimentMetadata = {
  [EXPERIMENT_METADATA_KEYS.key]: 'founding_copy_test',
  [EXPERIMENT_METADATA_KEYS.version]: 3,
  [EXPERIMENT_METADATA_KEYS.rules]: '0,10',
  criticality: 'low',
}

test('experimentForResolution: an experiment rule is an exposure; a fallthrough or a feature rule is not', () => {
  assert.deepEqual(
    experimentForResolution({ reason: 'TARGETING_MATCH', rulePriority: 10, flagMetadata: experimentMetadata }),
    { key: 'founding_copy_test', definitionVersion: 3 },
  )
  // held out: fell through to the default
  assert.equal(experimentForResolution({ reason: 'STATIC', flagMetadata: experimentMetadata }), undefined)
  // served by the feature's own (shifted) rule, not the experiment's
  assert.equal(experimentForResolution({ reason: 'TARGETING_MATCH', rulePriority: 10000, flagMetadata: experimentMetadata }), undefined)
  // a flag that names no experiment
  assert.equal(experimentForResolution({ reason: 'TARGETING_MATCH', rulePriority: 0, flagMetadata: { criticality: 'low' } }), undefined)
})

test('experimentForResolution is total: malformed metadata is "no experiment", never a throw', () => {
  const base = { reason: 'TARGETING_MATCH', rulePriority: 0 }
  for (const flagMetadata of [
    { ...experimentMetadata, experiment_key: 'Not A Key' },
    { ...experimentMetadata, experiment_version: 0 },
    { ...experimentMetadata, experiment_version: '3' },
    { ...experimentMetadata, experiment_rules: '' },
    { ...experimentMetadata, experiment_rules: '0,,10' },
    { ...experimentMetadata, experiment_rules: 0 },
  ]) {
    assert.equal(experimentForResolution({ ...base, flagMetadata }), undefined, JSON.stringify(flagMetadata))
  }
  assert.equal(experimentForResolution({}), undefined)
})

test('segments: the five allow-listed fields as bounded scalars, nothing else', () => {
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { region: 'MX', plan: 1, channel: 'web' } }), true)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: {} }), true)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { country: 'MX' } }), false)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { region: ['MX'] } }), false)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { region: 'x'.repeat(65) } }), false)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { region: '' } }), false)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: { region: 'M\u0085X' } }), false)
  assert.equal(validateFlagEvaluationTelemetry({ ...evaluation, segments: null }), false)
})
