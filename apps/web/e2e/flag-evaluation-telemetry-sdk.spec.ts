import { expect, test } from '@playwright/test'
import { createGrowthEngineClient } from '@golden-beans/sdk'

function response(deduplicated = false) {
  return new Response(
    JSON.stringify({ ok: true, id: 'event-1', ...(deduplicated ? { deduplicated: true } : {}) }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

const input = {
  flagKey: 'checkout.stripe_enabled',
  flagVersion: 7,
  variant: 'on',
  reason: 'STATIC',
  snapshotVersion: 40,
  environment: 'production' as const,
  subject: { type: 'merchant', id: 'merchant-opaque-123' },
}

test('ordinary flag evaluations use canonical track with bounded facts and stable idempotency', async () => {
  const bodies: Record<string, unknown>[] = []
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'ingest-key',
    userId: 'service-subject',
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return response(bodies.length > 1)
    },
  })

  await expect(growth.trackFlagEvaluation(input)).resolves.toEqual({ ok: true, id: 'event-1' })
  await expect(growth.trackFlagEvaluation(input)).resolves.toEqual({
    ok: true,
    id: 'event-1',
    deduplicated: true,
  })
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toEqual({
    userId: 'service-subject',
    event: 'flag_evaluated',
    featureId: input.flagKey,
    tags: {
      flag_key: input.flagKey,
      flag_definition_version: 7,
      variant: 'on',
      reason: 'STATIC',
      snapshot_version: 40,
      environment: 'production',
    },
    context: {
      version: 1,
      subject: input.subject,
      idempotencyKey: expect.stringMatching(/^flag_eval:[0-9a-f]{16}$/),
    },
  })
  expect((bodies[1].context as { idempotencyKey: string }).idempotencyKey).toBe(
    (bodies[0].context as { idempotencyKey: string }).idempotencyKey
  )
})

test('experiment-bound evaluations reuse the existing exposure denominator and failures stay non-throwing', async () => {
  let body: Record<string, unknown> | undefined
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'ingest-key',
    userId: 'service-subject',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body))
      throw new Error('offline')
    },
  })
  await expect(
    growth.trackFlagEvaluation({
      ...input,
      experiment: { key: 'checkout-experiment', definitionVersion: 3 },
    })
  ).resolves.toMatchObject({ ok: false })
  expect(body).toMatchObject({ event: 'experiment_exposed', featureId: 'checkout-experiment' })
})

test('sampling happens before transport, so a noisy hot path cannot consume ingest quota', async () => {
  let calls = 0
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'ingest-key',
    userId: 'service-subject',
    flagEvaluationSampleRate: 0,
    fetchImpl: async () => {
      calls += 1
      return response()
    },
  })
  await expect(growth.trackFlagEvaluation(input)).resolves.toMatchObject({ ok: false, code: 'SAMPLED_OUT' })
  expect(calls).toBe(0)
})

test('experiment exposures are never sampled because they are the analysis denominator', async () => {
  let calls = 0
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'ingest-key',
    userId: 'service-subject',
    flagEvaluationSampleRate: 0,
    fetchImpl: async () => {
      calls += 1
      return response()
    },
  })
  await expect(
    growth.trackFlagEvaluation({
      ...input,
      experiment: { key: 'checkout-experiment', definitionVersion: 3 },
    })
  ).resolves.toEqual({ ok: true, id: 'event-1' })
  expect(calls).toBe(1)
})
