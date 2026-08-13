import { expect, test } from '@playwright/test'
import { createGrowthEngineClient, type ScenarioExecutionTelemetryInput } from '@golden-frijoles/sdk'

const input: ScenarioExecutionTelemetryInput = {
  scenarioKey: 'checkout_probe',
  scenarioVersion: 3,
  runId: '018f0d3a-2577-7a53-8d41-b7c189e23f30',
  runRevision: 4,
  targetKey: 'miyagi.backend.resilience_probe',
  leaseId: '018f0d3a-2655-7d97-816f-33d7b8df7281',
  cohort: 'internal',
  environment: 'production',
  arm: 'fault',
  faultKind: 'delay',
  failed: false,
  latencyMs: 125,
  subject: { type: 'probe', id: 'synthetic-01' },
  flag: {
    key: 'resilience.checkout_probe',
    definitionVersion: 2,
    variant: 'delay_125',
    reason: 'TARGETING_MATCH',
    snapshotVersion: 11,
  },
  experiment: { key: 'checkout_probe_impact', definitionVersion: 1 },
}

test('scenario telemetry reuses governed exposure then emits one lease-idempotent fact', async () => {
  const requests: Array<Record<string, unknown>> = []
  const growth = createGrowthEngineClient({
    baseUrl: 'https://golden.example',
    apiKey: 'project-key',
    userId: 'resilience-executor',
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({ ok: true, id: `event-${requests.length}` })
    },
  })

  await expect(growth.trackScenarioExecution(input)).resolves.toEqual({ ok: true, id: 'event-2' })
  expect(requests).toHaveLength(2)
  expect(requests[0]).toMatchObject({
    event: 'experiment_exposed',
    featureId: 'checkout_probe_impact',
    tags: {
      variant: 'delay_125',
      experiment_definition_version: 1,
    },
  })
  expect(requests[1]).toMatchObject({
    event: 'scenario_executed',
    featureId: 'checkout_probe',
    tags: {
      run_id: input.runId,
      lease_id: input.leaseId,
      arm: 'fault',
      failed: false,
      latency_ms: 125,
    },
    context: {
      version: 1,
      correlationId: input.runId,
      idempotencyKey: `scenario_exec:${input.leaseId}`,
    },
  })
})

test('scenario telemetry rejects arbitrary fields before making a request', async () => {
  let requests = 0
  const growth = createGrowthEngineClient({
    baseUrl: 'https://golden.example',
    apiKey: 'project-key',
    userId: 'resilience-executor',
    fetchImpl: async () => {
      requests += 1
      return Response.json({ ok: true, id: 'event' })
    },
  })

  await expect(
    growth.trackScenarioExecution({
      ...input,
      metadata: { authorization: 'secret' },
    } as ScenarioExecutionTelemetryInput)
  ).resolves.toMatchObject({ ok: false, code: 'INVALID_SCENARIO_EXECUTION' })
  expect(requests).toBe(0)
})
