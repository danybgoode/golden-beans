import { test, expect } from '@playwright/test'
import { safeRedirectPath } from '../lib/safe-redirect'
import { isOwner } from '../lib/roles'

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

// Cross-review (Codex, 2026-07-20) caught an open redirect in /auth/callback: `/\evil.example`
// passes a naive `startsWith('/') && !startsWith('//')` string check, but new URL() normalizes the
// backslash to `//` and resolves off-origin.
//
// These assert the guard DIRECTLY as a pure function, not over HTTP. That's deliberate: the route
// only consults `next` after a successful code exchange, so an unauthenticated HTTP request never
// reaches the branch — an HTTP-level version of this spec passed against a deliberately vulnerable
// build (a false-positive tautology, caught by a mutation check). Same pattern lib/flags.ts uses.
test.describe('safeRedirectPath — the auth-callback open-redirect guard', () => {
  const base = 'https://golden-beans-gamma.vercel.app'

  for (const hostile of [
    '/\\evil.example', // backslash normalizes to // — the exact bypass Codex found
    '//evil.example',
    'https://evil.example',
    '/\\/evil.example',
    'javascript:alert(1)',
    'https://golden-beans-gamma.vercel.app.evil.example/x', // prefix-lookalike host
  ]) {
    test(`rejects ${hostile} → falls back on-origin`, () => {
      const result = safeRedirectPath(hostile, base)
      expect(result).toBe(`${base}/app`)
      expect(result).not.toContain('evil.example')
    })
  }

  test('allows a genuine same-origin relative path', () => {
    expect(safeRedirectPath('/app/keys/my-project', base)).toBe(`${base}/app/keys/my-project`)
  })

  test('allows an absolute URL that is genuinely same-origin', () => {
    expect(safeRedirectPath(`${base}/app/funnel/x/y`, base)).toBe(`${base}/app/funnel/x/y`)
  })

  test('no next param → the default landing', () => {
    expect(safeRedirectPath(null, base)).toBe(`${base}/app`)
  })
})

// Credential administration is OWNER-only (cross-review round 2): an ordinary member can read the
// project's dashboards but must not mint a full ingest credential or revoke production's key. The
// authed member-vs-owner HTTP path needs a real session (browser smoke owed to Daniel), so the
// predicate itself is pinned here — it's the whole rule, and it must never default-allow.
test.describe('isOwner — the credential-admin predicate', () => {
  test('only the literal owner role passes', () => {
    expect(isOwner({ projectId: 'p1', role: 'owner' })).toBe(true)
    expect(isOwner({ projectId: 'p1', role: 'member' })).toBe(false)
  })

  test('null membership and unknown roles never pass (fails closed)', () => {
    expect(isOwner(null)).toBe(false)
    expect(isOwner({ projectId: 'p1', role: '' })).toBe(false)
    expect(isOwner({ projectId: 'p1', role: 'Owner' })).toBe(false) // case-exact, no fuzzy match
    expect(isOwner({ projectId: 'p1', role: 'admin' })).toBe(false)
  })
})

test('demo dashboard renders anonymously (allow-list carve-out intact)', async ({ request }) => {
  // The demo project (seeded by scripts/seed-demo-project.mjs) is the one project a stranger may
  // read — it must NOT bounce to /login.
  const res = await request.get(`/app/funnel/${DEMO_SLUG}/setup_guide`, { maxRedirects: 0 })
  expect(res.status()).toBe(200)
})
