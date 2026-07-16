import { test, expect } from '@playwright/test'

// Story 1.1 (commercial-shell/sprint-1.md) — the engine pages moved from /funnel|impact|
// experiments to /app/funnel|impact|experiments to make room for the public landing at `/`.
// Old links must still resolve (307, not a dead end) rather than 404.
test('old /funnel path redirects to /app/funnel', async ({ request }) => {
  const res = await request.get('/funnel/project-one/setup_guide', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toContain('/app/funnel/project-one/setup_guide')
})

test('old /impact path redirects to /app/impact', async ({ request }) => {
  const res = await request.get('/impact/project-one/setup_guide', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toContain('/app/impact/project-one/setup_guide')
})

test('old /experiments path redirects to /app/experiments', async ({ request }) => {
  const res = await request.get('/experiments/project-one/quick-upload-ui', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  expect(res.headers()['location']).toContain('/app/experiments/project-one/quick-upload-ui')
})
