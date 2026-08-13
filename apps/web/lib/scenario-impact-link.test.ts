import assert from 'node:assert/strict'
import test from 'node:test'
import { scenarioImpactExperimentKey } from './scenario-impact-link.ts'

test('an immutable scenario impact returns its exact downstream experiment key', () => {
  assert.equal(
    scenarioImpactExperimentKey({ experiment: { key: 'checkout_copy', definitionVersion: 3 } }),
    'checkout_copy'
  )
})

test('legacy or malformed impact evidence yields no link instead of crashing the workspace', () => {
  for (const evidence of [null, {}, { experiment: null }, { experiment: {} }, { experiment: { key: 3 } }])
    assert.equal(scenarioImpactExperimentKey(evidence), null)
})
