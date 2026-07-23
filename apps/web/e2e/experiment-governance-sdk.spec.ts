import { test, expect } from '@playwright/test'
import {
  createGrowthEngineClient,
  type ExperimentGovernanceContext,
} from '@golden-beans/sdk'

const variants = [
  { key: 'treatment', weight: 3 },
  { key: 'control', weight: 1 },
]
const governance: ExperimentGovernanceContext = {
  definitionVersion: 7,
  assignmentEntity: { type: 'merchant', id: 'm-123' },
}

function response() {
  return new Response(JSON.stringify({ ok: true, id: 'event-1' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('legacy bucket and exposure retain their exact local assignment and request shape', async () => {
  const bodies: unknown[] = []
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'local-test',
    userId: 'legacy-user',
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return response()
    },
  })

  expect(growth.bucket('checkout-cta-copy', variants)).toEqual({ ok: true, variant: 'treatment' })
  await expect(growth.trackExposure('checkout-cta-copy', 'treatment', {
    tags: { region: 'mx', variant: 'caller-value-is-overridden-in-v1' },
  })).resolves.toEqual({ ok: true, id: 'event-1' })
  expect(bodies).toEqual([{
    userId: 'legacy-user',
    event: 'experiment_exposed',
    featureId: 'checkout-cta-copy',
    tags: { region: 'mx', variant: 'treatment' },
  }])
})

test('governed assignment is synchronous, tuple-hashed, sorted and independent of registry/gate/network', () => {
  const growth = createGrowthEngineClient({
    baseUrl: 'http://registry-is-down.invalid',
    apiKey: 'unused',
    userId: 'legacy-user-is-not-the-assignment-unit',
    fetchImpl: async () => { throw new Error('registry unavailable') },
  })
  const original = process.env.EXPERIMENT_GOVERNANCE_ENABLED
  try {
    process.env.EXPERIMENT_GOVERNANCE_ENABLED = 'false'
    const first = growth.bucket('checkout-cta-copy', variants, governance)
    const reordered = growth.bucket('checkout-cta-copy', [...variants].reverse(), governance)
    expect(first).not.toBeInstanceOf(Promise)
    expect(first).toEqual({ ok: true, variant: 'control' })
    expect(reordered).toEqual(first)
  } finally {
    if (original === undefined) delete process.env.EXPERIMENT_GOVERNANCE_ENABLED
    else process.env.EXPERIMENT_GOVERNANCE_ENABLED = original
  }
})

test('governed exposure preserves caller fields and writes canonical assignment context', async () => {
  let body: Record<string, unknown> | null = null
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'local-test',
    userId: 'legacy-user',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body))
      return response()
    },
  })
  const result = await growth.trackExposure('checkout-cta-copy', 'control', {
    tags: {
      region: 'mx',
      variant: 'control',
      experiment_definition_version: 7,
    },
    metadata: { sourceNote: 'kept' },
    context: {
      version: 1,
      actor: { type: 'staff_user', id: 'staff-1' },
      subject: { type: 'merchant', id: 'm-123' },
      correlationId: 'workflow-1',
    },
  }, governance)
  expect(result).toEqual({ ok: true, id: 'event-1' })
  expect(body).toMatchObject({
    userId: 'legacy-user',
    event: 'experiment_exposed',
    featureId: 'checkout-cta-copy',
    tags: {
      region: 'mx',
      variant: 'control',
      experiment_definition_version: 7,
    },
    metadata: { sourceNote: 'kept' },
    context: {
      version: 1,
      actor: { type: 'staff_user', id: 'staff-1' },
      subject: { type: 'merchant', id: 'm-123' },
      correlationId: 'workflow-1',
    },
  })
})

test('governed reserved-field conflicts and malformed assignment fail before fetch', async () => {
  let calls = 0
  const growth = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'local-test',
    userId: 'legacy-user',
    fetchImpl: async () => {
      calls += 1
      return response()
    },
  })
  for (const props of [
    { tags: { variant: 'other' } },
    { tags: { experiment_definition_version: 8 } },
    { context: { version: 1 as const, subject: { type: 'merchant', id: 'other' } } },
  ]) {
    await expect(growth.trackExposure('checkout-cta-copy', 'control', props, governance))
      .resolves.toMatchObject({ ok: false, code: 'GOVERNANCE_CONTEXT_CONFLICT' })
  }
  expect(growth.bucket('checkout-cta-copy', variants, {
    definitionVersion: 0,
    assignmentEntity: { type: 'Merchant', id: ' m-123' },
  })).toMatchObject({ ok: false, code: 'INVALID_GOVERNANCE_CONTEXT' })
  expect(calls).toBe(0)
})
