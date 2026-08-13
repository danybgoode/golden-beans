import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import type { ScenarioSnapshotEntry } from './scenarios.ts'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (
  Module as typeof Module & {
    registerHooks: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './flags') return nextResolve('./flags.ts', context)
    return nextResolve(specifier, context)
  },
})

const {
  MAX_SCENARIO_DELAY_MS,
  MAX_SCENARIO_ERROR_RATE_BASIS_POINTS,
  SCENARIO_FAULT_KINDS,
  SCENARIO_KINDS,
  evaluateScenario,
  parseScenarioDefinition,
  parseScenarioFault,
  parseScenarioSnapshot,
} = await import('./scenarios.ts')

const NOW = Date.parse('2026-07-29T02:00:00.000Z')

const ENTRY: ScenarioSnapshotEntry = {
  scenarioKey: 'checkout_probe',
  scenarioVersion: 3,
  runId: '11111111-1111-4111-8111-111111111111',
  runRevision: 7,
  targetKey: 'miyagi.frontend.resilience_probe',
  cohort: 'internal',
  startAt: '2026-07-29T01:55:00.000Z',
  expiresAt: '2026-07-29T02:05:00.000Z',
  limits: { requestCap: 10, concurrencyCap: 2, leaseTtlSeconds: 10 },
  guardrails: { abortAfterFailures: 2, maxErrorRateBasisPoints: 2_000 },
  flag: {
    key: 'resilience.checkout_probe',
    definitionVersion: 4,
    definition: {
      valueType: 'json',
      description: 'Bounded internal resilience probe.',
      defaultVariantKey: 'control',
      variants: [
        { key: 'control', value: { kind: 'none' } },
        { key: 'delay', value: { kind: 'delay', delayMs: 200 } },
      ],
      rules: [
        {
          priority: 1,
          clauses: [{ field: 'source', operator: 'equals', value: 'internal' }],
          variantKey: 'delay',
        },
      ],
      metadata: { owner: 'product' },
    },
  },
}

const DEFINITION = {
  contractVersion: 1,
  kind: 'resilience',
  targetKey: ENTRY.targetKey,
  environment: 'production',
  cohort: 'internal',
  startAt: ENTRY.startAt,
  expiresAt: ENTRY.expiresAt,
  limits: ENTRY.limits,
  guardrails: ENTRY.guardrails,
  flag: { key: ENTRY.flag.key, definitionVersion: ENTRY.flag.definitionVersion },
}

test('authoring choices and numeric bounds are exported runtime contracts', () => {
  assert.deepEqual(SCENARIO_KINDS, ['resilience', 'security'])
  assert.deepEqual(SCENARIO_FAULT_KINDS, ['none', 'delay', 'synthetic_error'])
  assert.equal(MAX_SCENARIO_ERROR_RATE_BASIS_POINTS, 10_000)
})

test('fault payloads are a closed, bounded union', () => {
  assert.deepEqual(parseScenarioFault({ kind: 'none' }), { kind: 'none' })
  assert.deepEqual(parseScenarioFault({ kind: 'delay', delayMs: MAX_SCENARIO_DELAY_MS }), {
    kind: 'delay',
    delayMs: MAX_SCENARIO_DELAY_MS,
  })
  assert.deepEqual(parseScenarioFault({ kind: 'synthetic_error', errorCode: 'GB_RESILIENCE_503' }), {
    kind: 'synthetic_error',
    errorCode: 'GB_RESILIENCE_503',
  })
  for (const rejected of [
    { kind: 'delay', delayMs: 0 },
    { kind: 'delay', delayMs: MAX_SCENARIO_DELAY_MS + 1 },
    { kind: 'synthetic_error', errorCode: 'CALLER_CHOSEN_ERROR' },
    { kind: 'url', value: 'https://example.com' },
    { kind: 'none', header: 'x' },
  ]) {
    assert.equal(parseScenarioFault(rejected), null, JSON.stringify(rejected))
  }
})

test('registry definitions reject unknown fields, long TTLs and open-ended security commands', () => {
  assert.equal(parseScenarioDefinition(DEFINITION).ok, true)

  for (const changed of [
    { ...DEFINITION, arbitraryUrl: 'https://example.com' },
    { ...DEFINITION, expiresAt: '2026-07-29T04:05:00.000Z' },
    {
      ...DEFINITION,
      kind: 'security',
      securityTemplate: 'caller_request_builder',
    },
    {
      ...DEFINITION,
      limits: { ...DEFINITION.limits, concurrencyCap: DEFINITION.limits.requestCap + 1 },
    },
  ]) {
    const result = parseScenarioDefinition(changed)
    assert.equal(result.ok, false, JSON.stringify(changed))
  }
})

test('security definitions accept only the four closed defensive templates', () => {
  for (const securityTemplate of [
    'malformed_payload_v1',
    'rate_limit_v1',
    'invalid_credential_v1',
    'revoked_credential_v1',
  ]) {
    assert.equal(
      parseScenarioDefinition({ ...DEFINITION, kind: 'security', securityTemplate }).ok,
      true,
      securityTemplate
    )
  }
})

test('scenario snapshots reject target data, duplicate targets and non-fault JSON variants', () => {
  const valid = {
    contractVersion: 1,
    environment: 'production',
    revision: 8,
    generatedAt: '2026-07-29T02:00:00.000Z',
    scenarios: [ENTRY],
  }
  assert.equal(parseScenarioSnapshot(valid).ok, true)

  const withUrl = {
    ...valid,
    scenarios: [{ ...ENTRY, targetUrl: 'https://internal.example' }],
  }
  assert.equal(parseScenarioSnapshot(withUrl).ok, false)

  const duplicateTarget = {
    ...valid,
    scenarios: [
      ENTRY,
      {
        ...ENTRY,
        scenarioKey: 'second_probe',
        runId: '22222222-2222-4222-8222-222222222222',
      },
    ],
  }
  assert.equal(parseScenarioSnapshot(duplicateTarget).ok, false)

  const arbitraryFault = {
    ...valid,
    scenarios: [
      {
        ...ENTRY,
        flag: {
          ...ENTRY.flag,
          definition: {
            ...ENTRY.flag.definition,
            variants: [
              { key: 'control', value: { kind: 'none' } },
              { key: 'open', value: { kind: 'delay', delayMs: 10, query: 'drop table' } },
            ],
          },
        },
      },
    ],
  }
  assert.equal(parseScenarioSnapshot(arbitraryFault).ok, false)
})

test('local evaluation is target/time/context bound and evaluation alone only returns data', () => {
  const match = evaluateScenario(
    ENTRY,
    'miyagi.frontend.resilience_probe',
    { targetingKey: 'synthetic-1', source: 'internal' },
    NOW
  )
  assert.equal(match.reason, 'MATCH')
  assert.deepEqual(match.value, { kind: 'delay', delayMs: 200 })
  assert.equal(match.runRevision, 7)
  assert.equal(match.flagVersion, 4)

  assert.equal(
    evaluateScenario(ENTRY, 'miyagi.backend.other', { targetingKey: 'synthetic-1' }, NOW).reason,
    'TARGET_MISMATCH'
  )
  assert.equal(
    evaluateScenario(
      ENTRY,
      ENTRY.targetKey,
      { targetingKey: 'synthetic-1', source: 'internal' },
      Date.parse(ENTRY.startAt) - 1
    ).reason,
    'NOT_STARTED'
  )
  assert.equal(
    evaluateScenario(
      ENTRY,
      ENTRY.targetKey,
      { targetingKey: 'synthetic-1', source: 'internal' },
      Date.parse(ENTRY.expiresAt)
    ).reason,
    'EXPIRED'
  )
  assert.deepEqual(evaluateScenario(ENTRY, ENTRY.targetKey, { targetingKey: 'synthetic-1' }, NOW).value, {
    kind: 'none',
  })
})

test('malformed scenario state always resolves to control and never throws', () => {
  const broken = {
    ...ENTRY,
    flag: {
      ...ENTRY.flag,
      definition: {
        ...ENTRY.flag.definition,
        variants: [{ key: 'control', value: { kind: 'arbitrary_code', code: 'while(true){}' } }],
      },
    },
  } as ScenarioSnapshotEntry
  assert.doesNotThrow(() => evaluateScenario(broken, ENTRY.targetKey, { targetingKey: 'x' }, NOW))
  assert.deepEqual(evaluateScenario(broken, ENTRY.targetKey, { targetingKey: 'x' }, NOW).value, {
    kind: 'none',
  })
})
