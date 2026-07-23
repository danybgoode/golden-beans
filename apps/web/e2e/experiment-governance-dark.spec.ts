import { test, expect } from '@playwright/test'
import { createGrowthEngineClient } from '@golden-beans/sdk'
import { isExperimentGovernanceEnabled } from '@/lib/flags'

test('governance management is nonexistent while OFF and legacy experiments remain unchanged', async ({ request }) => {
  test.skip(
    isExperimentGovernanceEnabled(),
    'dedicated dark-path pass requires EXPERIMENT_GOVERNANCE_ENABLED=false',
  )

  expect((await request.get('/app/experiments/golden-beans-demo')).status()).toBe(404)
  // Legacy compare still authenticates normally; it is not hidden by the governance gate.
  expect((await request.get(
    '/api/v1/experiments/legacy-experiment/compare?metricEvent=checkout_completed',
  )).status()).toBe(401)
  // The new version-explicit analysis seam disappears before authentication while the same
  // route's legacy metric comparison above remains available.
  expect((await request.get(
    '/api/v1/experiments/legacy-experiment/compare?version=1',
  )).status()).toBe(404)
  const local = createGrowthEngineClient({
    baseUrl: 'http://unused.invalid',
    apiKey: 'unused',
    userId: 'legacy-dark-user',
  })
  expect(local.bucket('legacy-experiment', [{ key: 'control' }, { key: 'treatment' }]).ok).toBe(true)
  expect((await request.get('/llms.txt')).status()).toBe(200)
})
