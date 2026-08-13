import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeScenarioFaultFlag } from './scenario-fault-flag-summary.ts'

test('fault flag summary names actual payloads and targeting rules', () => {
  const summary = summarizeScenarioFaultFlag({
    valueType: 'json',
    description: 'Bounded injector',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: { kind: 'none' } },
      { key: 'slow', value: { kind: 'delay', delayMs: 250 } },
      { key: 'fail', value: { kind: 'synthetic_error', errorCode: 'GB_RESILIENCE_503' } },
    ],
    rules: [
      {
        priority: 1,
        clauses: [{ field: 'region', operator: 'equals', value: 'mx' }],
        rollout: { basisPoints: 1_000 },
        variantKey: 'slow',
      },
    ],
  })
  assert.deepEqual(summary?.faultKinds, ['none', 'delay', 'synthetic_error'])
  assert.match(summary?.payloadSummary ?? '', /slow: 250ms delay/)
  assert.match(summary?.payloadSummary ?? '', /fail: error GB_RESILIENCE_503/)
  assert.match(summary?.targetingSummary ?? '', /region = "mx" → slow at 10%/)
})

test('a non-fault or partially invalid flag is not offered', () => {
  assert.equal(
    summarizeScenarioFaultFlag({
      valueType: 'json',
      description: 'ordinary JSON',
      defaultVariantKey: 'a',
      variants: [{ key: 'a', value: { arbitrary: true } }],
      rules: [],
    }),
    null
  )
})
