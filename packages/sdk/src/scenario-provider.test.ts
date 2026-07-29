import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { test } from 'node:test'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
const registerHooks = (Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void })
  .registerHooks
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './flags') return nextResolve('./flags.ts', context)
    if (specifier === './scenarios') return nextResolve('./scenarios.ts', context)
    return nextResolve(specifier, context)
  },
})

const { createScenarioProvider } = await import('./scenario-provider.ts')

const NOW = Date.parse('2026-07-29T02:00:00.000Z')

function snapshot(revision = 1, environment = 'production') {
  return {
    contractVersion: 1,
    environment,
    revision,
    generatedAt: '2026-07-29T02:00:00.000Z',
    scenarios: [
      {
        scenarioKey: 'probe',
        scenarioVersion: 2,
        runId: '11111111-1111-4111-8111-111111111111',
        runRevision: 3,
        targetKey: 'miyagi.frontend.resilience_probe',
        cohort: 'internal',
        startAt: '2026-07-29T01:55:00.000Z',
        expiresAt: '2026-07-29T02:05:00.000Z',
        limits: { requestCap: 5, concurrencyCap: 1, leaseTtlSeconds: 10 },
        guardrails: { abortAfterFailures: 2, maxErrorRateBasisPoints: 2_000 },
        flag: {
          key: 'resilience.probe',
          definitionVersion: 4,
          definition: {
            valueType: 'json',
            description: 'Internal provider fixture.',
            defaultVariantKey: 'control',
            variants: [
              { key: 'control', value: { kind: 'none' } },
              { key: 'delay', value: { kind: 'delay', delayMs: 50 } },
            ],
            rules: [
              {
                priority: 1,
                clauses: [{ field: 'source', operator: 'equals', value: 'internal' }],
                variantKey: 'delay',
              },
            ],
          },
        },
      },
    ],
  }
}

test('refreshes once then resolves closed fault data locally without another request', async () => {
  let calls = 0
  const provider = createScenarioProvider({
    baseUrl: 'https://golden.example/',
    flagReadKey: 'secret-read-key',
    refreshIntervalMs: 0,
    now: () => NOW,
    fetchImpl: async (input, init) => {
      calls += 1
      assert.equal(String(input), 'https://golden.example/api/v1/scenarios/snapshot')
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer secret-read-key')
      return new Response(JSON.stringify(snapshot()), { headers: { ETag: '"gbsc-1"' } })
    },
  })

  assert.equal(
    provider.resolveScenario('miyagi.frontend.resilience_probe', { targetingKey: 'x' }).reason,
    'PROVIDER_NOT_READY'
  )
  assert.equal((await provider.initialize()).ok, true)
  assert.equal(
    provider.resolveScenario(
      'miyagi.frontend.resilience_probe',
      { targetingKey: 'x', source: 'internal' },
      NOW
    ).reason,
    'MATCH'
  )
  assert.deepEqual(
    provider.resolveScenario(
      'miyagi.frontend.resilience_probe',
      { targetingKey: 'x', source: 'internal' },
      NOW
    ).value,
    { kind: 'delay', delayMs: 50 }
  )
  assert.equal(calls, 1)
})

test('rejects rollback, wrong environment and malformed snapshots while retaining the last good one', async () => {
  let body: unknown = snapshot(4)
  const provider = createScenarioProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    environment: 'production',
    refreshIntervalMs: 0,
    now: () => NOW,
    fetchImpl: async () => new Response(JSON.stringify(body)),
  })
  assert.equal((await provider.initialize()).ok, true)

  for (body of [snapshot(3), snapshot(5, 'preview'), { arbitraryTarget: 'https://example.com' }]) {
    const result = await provider.refresh()
    assert.equal(result.ok, false)
    assert.equal(provider.getSnapshot()?.revision, 4)
  }
})

test('stale, shutdown, timeout and 304-without-baseline all fail to control without throwing', async () => {
  let now = NOW
  const ready = createScenarioProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    maxStaleMs: 10,
    now: () => now,
    fetchImpl: async () => new Response(JSON.stringify(snapshot())),
  })
  await ready.initialize()
  now += 11
  assert.equal(
    ready.resolveScenario('miyagi.frontend.resilience_probe', { targetingKey: 'x' }).reason,
    'PROVIDER_STALE'
  )
  ready.shutdown()
  assert.equal(
    ready.resolveScenario('miyagi.frontend.resilience_probe', { targetingKey: 'x' }).reason,
    'PROVIDER_SHUTDOWN'
  )

  const noBaseline = createScenarioProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    fetchImpl: async () => new Response(null, { status: 304 }),
  })
  assert.equal((await noBaseline.initialize()).ok, false)

  const timeout = createScenarioProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    refreshTimeoutMs: 1,
    fetchImpl: async () => new Promise<Response>(() => undefined),
  })
  assert.equal((await timeout.initialize()).ok, false)
})

test('reserves and settles database-enforced leases through the scoped execution endpoint', async () => {
  const requests: Array<{ url: string; authorization: string; body: unknown }> = []
  const provider = createScenarioProvider({
    baseUrl: 'https://golden.example/',
    flagReadKey: 'secret-read-key',
    refreshIntervalMs: 0,
    fetchImpl: async (input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push({
        url: String(input),
        authorization: (init?.headers as Record<string, string>).Authorization,
        body,
      })
      if (body.operation === 'reserve') {
        return Response.json({
          operation: 'reserve',
          leaseId: '22222222-2222-4222-8222-222222222222',
          runRevision: 3,
          expiresAt: '2026-07-29T02:00:10.000Z',
          admitted: true,
          reason: 'ADMITTED',
        })
      }
      return Response.json({
        operation: 'settle',
        leaseId: '22222222-2222-4222-8222-222222222222',
        runRevision: 3,
        runStatus: 'running',
        activeLeaseCount: 0,
        successCount: 1,
        failureCount: 0,
        settled: true,
        reason: 'SETTLED',
      })
    },
  })

  const reserved = await provider.reserveExecution('11111111-1111-4111-8111-111111111111', 3)
  assert.equal(reserved.ok, true)
  if (!reserved.ok || !reserved.admitted) assert.fail('expected admitted reservation')
  const settled = await provider.settleExecution(
    '11111111-1111-4111-8111-111111111111',
    reserved.leaseId,
    true
  )
  assert.equal(settled.ok, true)
  assert.deepEqual(requests, [
    {
      url: 'https://golden.example/api/v1/scenarios/execution',
      authorization: 'Bearer secret-read-key',
      body: {
        operation: 'reserve',
        runId: '11111111-1111-4111-8111-111111111111',
        expectedRunRevision: 3,
      },
    },
    {
      url: 'https://golden.example/api/v1/scenarios/execution',
      authorization: 'Bearer secret-read-key',
      body: {
        operation: 'settle',
        runId: '11111111-1111-4111-8111-111111111111',
        leaseId: '22222222-2222-4222-8222-222222222222',
        succeeded: true,
      },
    },
  ])
})

test('execution rejects invalid input and malformed or failed responses without throwing', async () => {
  let calls = 0
  let response = new Response('unavailable', { status: 503 })
  const provider = createScenarioProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    fetchImpl: async () => {
      calls += 1
      return response
    },
  })

  const invalid = await provider.reserveExecution('not-a-uuid', 1)
  assert.deepEqual(invalid, {
    ok: false,
    errorCode: 'INVALID_ARGUMENT',
    errorMessage: 'Invalid scenario execution reservation.',
  })
  assert.equal(calls, 0)

  const unavailable = await provider.reserveExecution('11111111-1111-4111-8111-111111111111', 1)
  assert.equal(unavailable.ok, false)
  assert.equal(calls, 1)

  response = Response.json({
    operation: 'reserve',
    leaseId: null,
    runRevision: 1,
    expiresAt: null,
    admitted: true,
    reason: 'ADMITTED',
  })
  const malformed = await provider.reserveExecution('11111111-1111-4111-8111-111111111111', 1)
  assert.equal(malformed.ok, false)
  assert.equal(calls, 2)
})
