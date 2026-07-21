import { test, expect, type APIRequestContext } from '@playwright/test'

// Story 4.3 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md) — the side-by-side variant
// comparison view. Self-contained: no experiments registry to seed — fires real exposure +
// metric events via /v1/track, then asserts both the JSON endpoint and the SSR page's HTML.
// Mirrors funnel.spec.ts / impact.spec.ts's pattern.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

async function expose(request: APIRequestContext, userId: string, experimentKey: string, variant: string) {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: 'experiment_exposed', featureId: experimentKey, tags: { variant } },
  })
  expect(res.status()).toBe(201)
}

async function convert(request: APIRequestContext, userId: string, experimentKey: string, metricEvent: string) {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: metricEvent, featureId: experimentKey },
  })
  expect(res.status()).toBe(201)
}

// The realistic shape: a real conversion event (checkout_completed, signup, ...) fired through the
// normal track() path, with no featureId at all — a business event has no reason to know it's also
// "the metric for experiment X." Conversions must still be attributed correctly via the userId join
// against who was exposed, not by requiring the metric event to carry this experiment's key.
async function convertUntagged(request: APIRequestContext, userId: string, metricEvent: string) {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: metricEvent },
  })
  expect(res.status()).toBe(201)
}

test('GET /v1/experiments/:key/compare without metricEvent → 400', async ({ request }) => {
  const res = await request.get(`/api/v1/experiments/spec-experiment-${Date.now()}/compare`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
})

test('an experiment key with no exposure events → 200, honest empty state (not a 404)', async ({ request }) => {
  const experimentKey = `spec-experiment-empty-${Date.now()}`
  const res = await request.get(`/api/v1/experiments/${experimentKey}/compare?metricEvent=spec_conversion`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.comparison.variants).toEqual([])
  expect(body.comparison.baseline).toBeNull()

  // Story 1.2 (multi-tenant-activation): non-demo dashboard pages are auth-gated now — unauthed →
  // /login. The endpoint above already asserts the honest empty state at the api level.
  const pageRes = await request.get(
    `/app/experiments/project-one/${experimentKey}?metricEvent=spec_conversion`,
    { maxRedirects: 0 },
  )
  expect([302, 307]).toContain(pageRes.status())
  expect(pageRes.headers()['location']).toContain('/login')
})

test('comparison endpoint + page compute basic lift from real exposure + conversion events', async ({ request }) => {
  const experimentKey = `spec-experiment-lift-${Date.now()}`
  const metricEvent = 'spec_conversion'

  // control: 4 exposed, 1 converts (25%). treatment: 4 exposed, 2 convert (50%).
  for (const userId of ['c1', 'c2', 'c3', 'c4']) await expose(request, userId, experimentKey, 'control')
  for (const userId of ['t1', 't2', 't3', 't4']) await expose(request, userId, experimentKey, 'treatment')
  await convert(request, 'c1', experimentKey, metricEvent)
  await convert(request, 't1', experimentKey, metricEvent)
  await convert(request, 't2', experimentKey, metricEvent)

  const res = await request.get(`/api/v1/experiments/${experimentKey}/compare?metricEvent=${metricEvent}`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.comparison.baseline).toBe('control')

  const control = body.comparison.variants.find((v: { key: string }) => v.key === 'control')
  const treatment = body.comparison.variants.find((v: { key: string }) => v.key === 'treatment')

  expect(control).toMatchObject({ exposures: 4, conversions: 1, conversionRate: 0.25, lift: null })
  expect(treatment.exposures).toBe(4)
  expect(treatment.conversions).toBe(2)
  expect(treatment.conversionRate).toBeCloseTo(0.5)
  expect(treatment.lift).toBeCloseTo(1.0) // (0.5 - 0.25) / 0.25 = +100%

  // Story 1.2 (multi-tenant-activation): the page is auth-gated; the endpoint above is the
  // data-correctness coverage (the lift math). Authed page render is the browser smoke owed to
  // Daniel — a non-demo project's page bounces to /login when unauthed.
  const pageRes = await request.get(
    `/app/experiments/project-one/${experimentKey}?metricEvent=${metricEvent}`,
    { maxRedirects: 0 },
  )
  expect([302, 307]).toContain(pageRes.status())
  expect(pageRes.headers()['location']).toContain('/login')
})

test('conversions are counted even when the metric event carries no featureId at all', async ({ request }) => {
  const experimentKey = `spec-experiment-untagged-${Date.now()}`
  const metricEvent = `spec_untagged_conversion_${Date.now()}`

  await expose(request, 'u1', experimentKey, 'control')
  await expose(request, 'u2', experimentKey, 'treatment')
  // u2 converts via a real, unrelated-looking business event — no featureId, exactly how a real
  // app would fire it (see the module comment on convertUntagged).
  await convertUntagged(request, 'u2', metricEvent)
  // u3 fires the same metric event but was never exposed to this experiment — must NOT be
  // attributed to either variant (no false attribution from a project-wide, feature-unscoped
  // metric-event query).
  await convertUntagged(request, 'u3', metricEvent)

  const res = await request.get(`/api/v1/experiments/${experimentKey}/compare?metricEvent=${metricEvent}`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)

  const control = body.comparison.variants.find((v: { key: string }) => v.key === 'control')
  const treatment = body.comparison.variants.find((v: { key: string }) => v.key === 'treatment')
  expect(control).toMatchObject({ exposures: 1, conversions: 0, conversionRate: 0 })
  expect(treatment).toMatchObject({ exposures: 1, conversions: 1, conversionRate: 1 })
})
