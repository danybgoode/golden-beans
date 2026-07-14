import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 3.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md) —
// POST /v1/north-star/sync + GET /v1/north-star.
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

test('missing Authorization header → 401 on both sync and list', async ({ request }) => {
  const sync = await request.post('/api/v1/north-star/sync', {
    data: { metric: { key: 'm', name: 'M' }, inputs: [{ key: 'i', name: 'I', valueSource: 'external_push' }] },
  })
  expect(sync.status()).toBe(401)

  const list = await request.get('/api/v1/north-star')
  expect(list.status()).toBe(401)
})

test('telemetry_event input missing sourceEvent → 400', async ({ request }) => {
  const res = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `spec-metric-${Date.now()}`, name: 'Spec Metric' },
      inputs: [{ key: 'spec_input', name: 'Spec Input', valueSource: 'telemetry_event' }],
    },
  })
  expect(res.status()).toBe(400)
})

test('external_push input WITH a sourceEvent → 400 (must be omitted for pushed inputs)', async ({ request }) => {
  const res = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `spec-metric-${Date.now()}`, name: 'Spec Metric' },
      inputs: [
        { key: 'spec_input', name: 'Spec Input', valueSource: 'external_push', sourceEvent: 'should_not_be_here' },
      ],
    },
  })
  expect(res.status()).toBe(400)
})

test('duplicate input keys in one payload → 400', async ({ request }) => {
  const inputKey = `spec-dup-${Date.now()}`
  const res = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `spec-metric-${Date.now()}`, name: 'Spec Metric' },
      inputs: [
        { key: inputKey, name: 'One', valueSource: 'external_push' },
        { key: inputKey, name: 'Two', valueSource: 'external_push' },
      ],
    },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain(inputKey)
})

test('valid sync defines a metric with both a telemetry_event and an external_push input, queryable after', async ({
  request,
}) => {
  const metricKey = `payable_sellers_spec_${Date.now()}`
  const telemetryInputKey = `setup_guide_shares_spec_${Date.now()}`
  const pushInputKey = `attributed_revenue_spec_${Date.now()}`

  const sync = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: metricKey, name: 'Payable Sellers', description: 'Spec fixture' },
      inputs: [
        {
          key: telemetryInputKey,
          name: 'Setup Guide Shares',
          valueSource: 'telemetry_event',
          sourceEvent: 'setup_guide_share_tapped',
        },
        { key: pushInputKey, name: 'Attributed Revenue', valueSource: 'external_push' },
      ],
    },
  })
  expect(sync.status()).toBe(200)
  const syncBody = await sync.json()
  expect(syncBody.ok).toBe(true)
  expect(syncBody.inputsSynced).toBe(2)

  const list = await request.get('/api/v1/north-star', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(list.status()).toBe(200)
  const listBody = await list.json()
  const metric = listBody.metrics.find((m: { key: string }) => m.key === metricKey)
  expect(metric).toBeTruthy()
  expect(metric.inputs).toHaveLength(2)
  const telemetryInput = metric.inputs.find((i: { key: string }) => i.key === telemetryInputKey)
  expect(telemetryInput.valueSource).toBe('telemetry_event')
  expect(telemetryInput.sourceEvent).toBe('setup_guide_share_tapped')
  const pushInput = metric.inputs.find((i: { key: string }) => i.key === pushInputKey)
  expect(pushInput.valueSource).toBe('external_push')
  expect(pushInput.sourceEvent).toBeNull()

  // Re-sync updates in place, not a duplicate row.
  const resync = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: metricKey, name: 'Payable Sellers (renamed)' },
      inputs: [{ key: telemetryInputKey, name: 'Setup Guide Shares', valueSource: 'telemetry_event', sourceEvent: 'setup_guide_share_tapped' }],
    },
  })
  expect(resync.status()).toBe(200)

  const db = dbClient()
  const { data: metricRows } = await db.from('north_star_metrics').select('name').eq('key', metricKey)
  expect(metricRows?.length).toBe(1)
  expect(metricRows?.[0]?.name).toBe('Payable Sellers (renamed)')
})

test('tenant isolation: project-two sees its own metric but not project-one\'s', async ({ request }) => {
  // A positive check on project-two's OWN data, not just an absence check on project-one's key —
  // an endpoint that always returned an empty list would wrongly "pass" an absence-only test.
  const projectOneKey = `spec-isolation-one-${Date.now()}`
  const projectTwoKey = `spec-isolation-two-${Date.now()}`

  await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: projectOneKey, name: 'Spec One' },
      inputs: [{ key: `spec-isolation-input-one-${Date.now()}`, name: 'Spec', valueSource: 'external_push' }],
    },
  })
  await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: {
      metric: { key: projectTwoKey, name: 'Spec Two' },
      inputs: [{ key: `spec-isolation-input-two-${Date.now()}`, name: 'Spec', valueSource: 'external_push' }],
    },
  })

  const list = await request.get('/api/v1/north-star', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
  })
  const listBody = await list.json()
  expect(listBody.metrics.find((m: { key: string }) => m.key === projectTwoKey)).toBeTruthy()
  expect(listBody.metrics.find((m: { key: string }) => m.key === projectOneKey)).toBeUndefined()
})
