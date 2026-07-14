import { test, expect } from '@playwright/test'
import { createGrowthEngineClient } from '@golden-beans/sdk'

// Story 1.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md) — proves the SDK's
// "≤5-line integration" acceptance: this IS the consumer, not a mock of one.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

test('SDK track() reaches /v1/track and returns an ok envelope with an id', async ({ baseURL }) => {
  const growth = createGrowthEngineClient({
    baseUrl: baseURL!,
    apiKey: PROJECT_ONE_KEY,
    userId: `sdk-spec-user-${Date.now()}`,
  })
  const result = await growth.track('sdk_test_event', { tags: { source: 'sdk-spec' } })

  expect(result.ok).toBe(true)
  if (result.ok) expect(typeof result.id).toBe('string')
})

test('SDK trackAdoption(featureKey) sends a feature_adopted event scoped to that feature', async ({
  baseURL,
}) => {
  const growth = createGrowthEngineClient({
    baseUrl: baseURL!,
    apiKey: PROJECT_ONE_KEY,
    userId: `sdk-spec-user-${Date.now()}`,
  })
  const result = await growth.trackAdoption('growth-engine-sdk-spec-feature')
  expect(result.ok).toBe(true)
})

test('SDK never throws on a bad key — returns an extensible ok:false envelope', async ({ baseURL }) => {
  const growth = createGrowthEngineClient({
    baseUrl: baseURL!,
    apiKey: 'not-a-real-key',
    userId: 'sdk-spec-user',
  })
  const result = await growth.track('sdk_test_event')

  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(typeof result.error).toBe('string')
    expect(result.code).toBe('401') // extensible field beyond the bare ok:false — proves the envelope isn't just a boolean
  }
})
