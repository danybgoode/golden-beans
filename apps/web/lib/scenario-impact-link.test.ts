import assert from 'node:assert/strict'
import test from 'node:test'
import { scenarioImpactExperimentReference } from './scenario-impact-link.ts'

test('an immutable scenario impact returns its exact downstream experiment key', () => {
  assert.deepEqual(
    scenarioImpactExperimentReference({ experiment: { key: 'checkout_copy', definitionVersion: 3 } }),
    { key: 'checkout_copy', definitionVersion: 3 }
  )
})

test('legacy or malformed impact evidence yields no link instead of crashing the workspace', () => {
  for (const evidence of [
    null,
    {},
    { experiment: null },
    { experiment: {} },
    { experiment: { key: 3, definitionVersion: 1 } },
    { experiment: { key: 'missing-version' } },
    { experiment: { key: 'bad-version', definitionVersion: 0 } },
  ])
    assert.equal(scenarioImpactExperimentReference(evidence), null)
})
