import { test, expect } from '@playwright/test'

// multi-tenant-activation · Sprint 1, Stories 1.1 + 1.2 — the auth boundary at the HTTP level.
// The authed happy path (sign in → see only your own projects) is a real-session BROWSER smoke
// owed to Daniel; here we pin the api-testable negatives that make the boundary real:
//   • every unauthed /app surface bounces to /login;
//   • slug-guessing a REAL foreign project (miyagisanchez — confirmed live in public-demo.spec)
//     never serves data;
//   • the demo project stays anonymously readable (the allow-list carve-out survives).

const REAL_FOREIGN_SLUG = 'miyagisanchez'
const DEMO_SLUG = 'golden-beans-demo'

test('unauthed /app → redirect to /login', async ({ request }) => {
  const res = await request.get('/app', { maxRedirects: 0 })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toContain('/login')
})

test('unauthed dashboard for a real foreign slug → /login, never data', async ({ request }) => {
  const res = await request.get(`/app/funnel/${REAL_FOREIGN_SLUG}/setup_guide`, { maxRedirects: 0 })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toContain('/login')
})

test('unauthed key management for a foreign slug → /login', async ({ request }) => {
  const res = await request.get(`/app/keys/${REAL_FOREIGN_SLUG}`, { maxRedirects: 0 })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toContain('/login')
})

test('demo dashboard renders anonymously (allow-list carve-out intact)', async ({ request }) => {
  // The demo project (seeded by scripts/seed-demo-project.mjs) is the one project a stranger may
  // read — it must NOT bounce to /login.
  const res = await request.get(`/app/funnel/${DEMO_SLUG}/setup_guide`, { maxRedirects: 0 })
  expect(res.status()).toBe(200)
})
