import { test, expect } from '@playwright/test'

// Story 2.3 (Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md) — the funnel
// endpoint/page. Self-contained: registers a feature via /v1/features/sync, fires real
// events via /v1/track, then asserts both the JSON endpoint and the SSR page's HTML.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

async function track(request: import('@playwright/test').APIRequestContext, userId: string, event: string, featureId: string) {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event, featureId },
  })
  expect(res.status()).toBe(201)
}

test('GET /v1/features/:key/funnel → 404 for an unregistered feature', async ({ request }) => {
  const res = await request.get(`/api/v1/features/spec-unregistered-${Date.now()}/funnel`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(res.status()).toBe(404)
})

test('funnel endpoint + page reflect a real event sequence for a registered feature', async ({ request }) => {
  const featureKey = `spec-funnel-feature-${Date.now()}`

  const sync = await request.post('/api/v1/features/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      features: [
        {
          key: featureKey,
          enabled: true,
          targetEvent: 'spec_viewed',
          adoptedEvent: 'spec_completed',
          retainedEvent: 'spec_shared',
          retentionDays: 7,
        },
      ],
    },
  })
  expect(sync.status()).toBe(200)

  // alice: viewed -> completed -> shared -> fully retained. bob: viewed only -> targeted, not adopted.
  await track(request, 'alice', 'spec_viewed', featureKey)
  await track(request, 'alice', 'spec_completed', featureKey)
  await track(request, 'alice', 'spec_shared', featureKey)
  await track(request, 'bob', 'spec_viewed', featureKey)

  const funnelRes = await request.get(`/api/v1/features/${featureKey}/funnel`, {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
  })
  expect(funnelRes.status()).toBe(200)
  const funnelBody = await funnelRes.json()
  expect(funnelBody.ok).toBe(true)
  expect(funnelBody.tars).toEqual({ targeted: 2, adopted: 1, retained: 1 })
  expect(funnelBody.note).toContain('registry-declared')

  // Story 1.2 (multi-tenant-activation): the dashboard page moved behind per-tenant auth. Unauthed
  // access to a NON-demo project's page now bounces to /login — the authed content render (the HTML
  // assertions this test used to make) is the browser smoke owed to Daniel. The JSON endpoint above
  // remains the api-level data-correctness coverage.
  const pageRes = await request.get(`/app/funnel/project-one/${featureKey}`, { maxRedirects: 0 })
  expect([302, 307]).toContain(pageRes.status())
  expect(pageRes.headers()['location']).toContain('/login')
})

test('the demo funnel page 404s for an unregistered feature (anonymous carve-out still resolves)', async ({ request }) => {
  // The demo project renders anonymously, so a missing feature reaches notFound() (404) rather than
  // the /login bounce a non-demo slug would get — proving both the carve-out and the 404 path.
  const res = await request.get(`/app/funnel/golden-beans-demo/spec-unregistered-page-${Date.now()}`, {
    maxRedirects: 0,
  })
  expect(res.status()).toBe(404)
})
