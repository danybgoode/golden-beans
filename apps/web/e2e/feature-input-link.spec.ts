import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 3.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md) —
// POST /v1/features/:key/link-input.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function defineInput(request: import('@playwright/test').APIRequestContext, inputKey: string) {
  const res = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `link-spec-metric-${Date.now()}`, name: 'Spec Metric' },
      inputs: [{ key: inputKey, name: 'Spec Input', valueSource: 'external_push' }],
    },
  })
  expect(res.status()).toBe(200)
}

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/features/some_feature/link-input', {
    data: { inputKey: 'whatever' },
  })
  expect(res.status()).toBe(401)
})

test('linking to an unknown input → 404', async ({ request }) => {
  const res = await request.post(`/api/v1/features/setup_guide/link-input`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { inputKey: `nonexistent-input-${Date.now()}` },
  })
  expect(res.status()).toBe(404)
})

test('links a feature to a defined input, idempotently (no duplicate row on re-link)', async ({ request }) => {
  const inputKey = `link-spec-input-${Date.now()}`
  const featureKey = `link-spec-feature-${Date.now()}`
  await defineInput(request, inputKey)

  const first = await request.post(`/api/v1/features/${featureKey}/link-input`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { inputKey },
  })
  expect(first.status()).toBe(200)

  const second = await request.post(`/api/v1/features/${featureKey}/link-input`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { inputKey },
  })
  expect(second.status()).toBe(200)

  const db = dbClient()
  const { data: rows } = await db.from('feature_inputs').select('id').eq('feature_key', featureKey)
  expect(rows?.length).toBe(1) // upsert, not insert — no duplicate row
})

test("tenant isolation: project-two cannot link to project-one's input", async ({ request }) => {
  const inputKey = `link-spec-isolation-input-${Date.now()}`
  await defineInput(request, inputKey) // defined under project-one

  const res = await request.post(`/api/v1/features/some-feature/link-input`, {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: { inputKey },
  })
  expect(res.status()).toBe(404) // project-two has no input by this key, even though project-one does
})
