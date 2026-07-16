import { test, expect } from '@playwright/test'

// Story 1.2 (commercial-shell/sprint-1.md) — the public /v1/public/* routes may only ever serve
// the synthetic demo project. `miyagisanchez` is the REAL production project slug (confirmed live
// in Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md and sprint-3.md) — the least-convenient
// input, per the growth-engine-v1 retrospective's "test with a real Miyagi projectId" lesson —
// not a nonsense string that would 404 for an unrelated reason.
const DEMO_SLUG = 'golden-beans-demo'
const REAL_PRODUCTION_SLUG = 'miyagisanchez'

test.describe('GET /v1/public/funnel', () => {
  test('a real, non-demo project slug → 403, not 404', async ({ request }) => {
    const res = await request.get(`/api/v1/public/funnel?project=${REAL_PRODUCTION_SLUG}&feature=setup_guide`)
    expect(res.status()).toBe(403)
  })

  test('missing query params → 400', async ({ request }) => {
    const res = await request.get('/api/v1/public/funnel')
    expect(res.status()).toBe(400)
  })

  test('the demo project slug → 200 with real numbers (seeded by scripts/seed-demo-project.mjs)', async ({
    request,
  }) => {
    const res = await request.get(`/api/v1/public/funnel?project=${DEMO_SLUG}&feature=setup_guide`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.project.slug).toBe(DEMO_SLUG)
    expect(body.tars.targeted).toBeGreaterThan(0)
  })
})

test.describe('GET /v1/public/north-star', () => {
  test('a real, non-demo project slug → 403, not 404', async ({ request }) => {
    const res = await request.get(`/api/v1/public/north-star?project=${REAL_PRODUCTION_SLUG}&feature=setup_guide`)
    expect(res.status()).toBe(403)
  })

  test('the demo project slug → 200 with real inputs', async ({ request }) => {
    const res = await request.get(`/api/v1/public/north-star?project=${DEMO_SLUG}&feature=setup_guide`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.inputs)).toBe(true)
    expect(body.inputs.length).toBeGreaterThan(0)
  })
})

test.describe('GET /v1/public/experiments', () => {
  test('a real, non-demo project slug → 403, not 404', async ({ request }) => {
    const res = await request.get(
      `/api/v1/public/experiments?project=${REAL_PRODUCTION_SLUG}&experiment=quick-upload-ui&metricEvent=upload_completed`,
    )
    expect(res.status()).toBe(403)
  })

  test('missing metricEvent → 400', async ({ request }) => {
    const res = await request.get(`/api/v1/public/experiments?project=${DEMO_SLUG}&experiment=quick-upload-ui`)
    expect(res.status()).toBe(400)
  })

  test('the demo project slug → 200 with real variant comparison', async ({ request }) => {
    const res = await request.get(
      `/api/v1/public/experiments?project=${DEMO_SLUG}&experiment=quick-upload-ui&metricEvent=upload_completed`,
    )
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.comparison.variants.length).toBeGreaterThan(0)
  })
})
