import { test, expect } from '@playwright/test'

// Story 3.4 (Roadmap/01-growth-engine/growth-engine-v1/sprint-3.md) — the per-feature
// input-impact report (endpoint + page). Self-contained: defines a metric + both input
// types via /v1/north-star/sync, links a feature to both, fires real telemetry events
// for the telemetry_event input and pushes real values for the external_push input,
// then asserts both the JSON endpoint and the SSR page reflect the resulting series.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

async function track(request: import('@playwright/test').APIRequestContext, userId: string, event: string, featureId: string) {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event, featureId },
  })
  expect(res.status()).toBe(201)
}

test('GET /v1/features/:key/impact → 404 for a feature with no linked inputs', async ({ request }) => {
  const res = await request.get(`/api/v1/features/spec-unlinked-${Date.now()}/impact`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(404)
})

test('impact endpoint + page reflect real telemetry AND real pushed-revenue series for a linked feature', async ({
  request,
}) => {
  const suffix = Date.now()
  const featureKey = `spec-impact-feature-${suffix}`
  const telemetryEvent = `spec_impact_shared_${suffix}`
  const telemetryInputKey = `spec-impact-shares-${suffix}`
  const revenueInputKey = `spec-impact-revenue-${suffix}`

  const sync = await request.post('/api/v1/north-star/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      metric: { key: `spec-impact-metric-${suffix}`, name: 'Payable Sellers (spec)' },
      inputs: [
        { key: telemetryInputKey, name: 'Shares', valueSource: 'telemetry_event', sourceEvent: telemetryEvent },
        { key: revenueInputKey, name: 'Revenue', valueSource: 'external_push' },
      ],
    },
  })
  expect(sync.status()).toBe(200)

  for (const inputKey of [telemetryInputKey, revenueInputKey]) {
    const link = await request.post(`/api/v1/features/${featureKey}/link-input`, {
      headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
      data: { inputKey },
    })
    expect(link.status()).toBe(200)
  }

  // Real telemetry: 2 shares from 2 distinct users, same day.
  await track(request, 'alice', telemetryEvent, featureKey)
  await track(request, 'bob', telemetryEvent, featureKey)

  const push = await request.post(`/api/v1/inputs/${revenueInputKey}/values`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      values: [
        { occurredOn: '2026-03-01', value: 120.5 },
        { occurredOn: '2026-03-02', value: 80 },
      ],
    },
  })
  expect(push.status()).toBe(200)

  const impactRes = await request.get(`/api/v1/features/${featureKey}/impact`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(impactRes.status()).toBe(200)
  const body = await impactRes.json()
  expect(body.ok).toBe(true)
  expect(body.inputs).toHaveLength(2)

  const telemetryResult = body.inputs.find((i: { key: string }) => i.key === telemetryInputKey)
  expect(telemetryResult.valueSource).toBe('telemetry_event')
  const today = new Date().toISOString().slice(0, 10)
  expect(telemetryResult.series).toEqual([{ date: today, value: 2 }])

  const revenueResult = body.inputs.find((i: { key: string }) => i.key === revenueInputKey)
  expect(revenueResult.valueSource).toBe('external_push')
  expect(revenueResult.series).toEqual([
    { date: '2026-03-01', value: 120.5 },
    { date: '2026-03-02', value: 80 },
  ])

  const pageRes = await request.get(`/impact/project-one/${featureKey}`)
  expect(pageRes.status()).toBe(200)
  const html = await pageRes.text()
  expect(html).toContain(featureKey)
  expect(html).toContain('120.5')
  expect(html).toContain('2026-03-01')
})

test('impact page 404s for a feature with no linked inputs', async ({ request }) => {
  const res = await request.get(`/impact/project-one/spec-unlinked-page-${Date.now()}`)
  expect(res.status()).toBe(404)
})
