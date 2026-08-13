import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import {
  MAX_SCENARIO_ABORT_FAILURES,
  MAX_SCENARIO_CONCURRENCY_CAP,
  MAX_SCENARIO_DURATION_SECONDS,
  MAX_SCENARIO_ERROR_RATE_BASIS_POINTS,
  MAX_SCENARIO_LEASE_TTL_SECONDS,
  MAX_SCENARIO_REQUEST_CAP,
} from '@golden-frijoles/sdk'
import type { ScenarioAuthoringDraft } from './scenario-authoring-draft.ts'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
const registerHooks = (Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void })
  .registerHooks
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    )
      return nextResolve(`${specifier}.ts`, context)
    return nextResolve(specifier, context)
  },
})

const { buildScenarioDefinition, SCENARIO_AUTHORING_COHORTS, SCENARIO_AUTHORING_LIMITS } =
  await import('./scenario-authoring-draft.ts')

const valid: ScenarioAuthoringDraft = {
  kind: 'resilience',
  cohort: 'synthetic',
  targetKey: 'miyagi.synthetic.probe',
  environment: 'production',
  startAt: '2026-08-13T12:00:00.000Z',
  durationSeconds: 300,
  requestCap: 10,
  concurrencyCap: 2,
  leaseTtlSeconds: 10,
  abortAfterFailures: 2,
  maxErrorRatePercent: 12.34,
  flagKey: 'scenario.synthetic_probe',
  flagVersion: 3,
}

test('form limits are references to every SDK authoring bound', () => {
  assert.deepEqual(SCENARIO_AUTHORING_LIMITS, {
    durationSeconds: MAX_SCENARIO_DURATION_SECONDS,
    requestCap: MAX_SCENARIO_REQUEST_CAP,
    concurrencyCap: MAX_SCENARIO_CONCURRENCY_CAP,
    leaseTtlSeconds: MAX_SCENARIO_LEASE_TTL_SECONDS,
    abortAfterFailures: MAX_SCENARIO_ABORT_FAILURES,
    errorRateBasisPoints: MAX_SCENARIO_ERROR_RATE_BASIS_POINTS,
  })
})

test('authoring excludes external cohorts and checks concurrency before parsing', () => {
  assert.deepEqual(SCENARIO_AUTHORING_COHORTS, ['synthetic', 'internal'])
  const result = buildScenarioDefinition({ ...valid, requestCap: 3, concurrencyCap: 4 })
  assert.deepEqual(result, {
    ok: false,
    field: 'concurrencyCap',
    error: 'Concurrency cannot exceed the request cap.',
  })
})

test('percent input round-trips through the canonical basis-point seam', () => {
  const result = buildScenarioDefinition(valid)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.definition.guardrails.maxErrorRateBasisPoints, 1_234)
    assert.equal(result.definition.expiresAt, '2026-08-13T12:05:00.000Z')
  }
})
