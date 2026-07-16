import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 1.3 (commercial-shell/sprint-1.md) — POST /v1/public/waitlist. No public read endpoint
// for the waitlist, so row presence is verified via a direct service-role DB read, mirroring
// track.spec.ts's pattern for the ingest route.
//
// Each test sends its own randomly-generated x-forwarded-for header (the route's rate-limit key
// input) so tests don't contend for one shared bucket — real client IPs differ per visitor in
// production; a local/CI test runner has no real forwarded-for at all, so without this every test
// in this file would share one rate-limit bucket and become order- AND rerun-dependent (a fixed
// literal IP would collide with itself across repeated local runs within the 10-minute window,
// since rate_limit_hits persists in the local Postgres volume between `npx playwright test`
// invocations — CI starts a fresh Supabase per run, so it wouldn't see this, but local dev would).
function randomIp(): string {
  return Array.from({ length: 4 }, () => Math.floor(Math.random() * 256)).join('.')
}

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

test('malformed email → 400', async ({ request }) => {
  const res = await request.post('/api/v1/public/waitlist', {
    headers: { 'x-forwarded-for': randomIp() },
    data: { email: 'not-an-email' },
  })
  expect(res.status()).toBe(400)
})

test('honeypot filled → 200 but no row inserted', async ({ request }) => {
  const email = `spec-honeypot-${Date.now()}@example.com`
  const res = await request.post('/api/v1/public/waitlist', {
    headers: { 'x-forwarded-for': randomIp() },
    data: { email, company: 'a bot filled this' },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)

  const db = dbClient()
  const { data } = await db.from('waitlist').select('id').eq('email', email).maybeSingle()
  expect(data).toBeNull()
})

test('valid email → 200 and the row is persisted', async ({ request }) => {
  const email = `spec-valid-${Date.now()}@example.com`
  const res = await request.post('/api/v1/public/waitlist', {
    headers: { 'x-forwarded-for': randomIp() },
    data: { email },
  })
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.ok).toBe(true)

  const db = dbClient()
  const { data } = await db.from('waitlist').select('id, email').eq('email', email).maybeSingle()
  expect(data?.email).toBe(email)
})

test('duplicate submit → still 200, still exactly one row', async ({ request }) => {
  const email = `spec-dup-${Date.now()}@example.com`
  const headers = { 'x-forwarded-for': randomIp() }
  const first = await request.post('/api/v1/public/waitlist', { headers, data: { email } })
  expect(first.status()).toBe(200)
  const second = await request.post('/api/v1/public/waitlist', { headers, data: { email } })
  expect(second.status()).toBe(200)

  const db = dbClient()
  const { data, count } = await db
    .from('waitlist')
    .select('id', { count: 'exact' })
    .eq('email', email)
  expect(count).toBe(1)
  expect(data?.length).toBe(1)
})

test('rapid repeated requests from the same IP → later ones 429', async ({ request }) => {
  const headers = { 'x-forwarded-for': randomIp() }
  const responses = []
  for (let i = 0; i < 8; i++) {
    const email = `spec-rate-${Date.now()}-${i}@example.com`
    responses.push(await request.post('/api/v1/public/waitlist', { headers, data: { email } }))
  }
  const statuses = responses.map((r) => r.status())
  expect(statuses.some((s) => s === 429)).toBe(true)
})

// A naive "SELECT count, then INSERT if under the limit" rate limiter races: truly concurrent
// requests can all read the same pre-insert count and all pass, letting a burst blow well past
// `max`. checkRateLimit() closes this with a single atomic `INSERT ... ON CONFLICT DO UPDATE`
// Postgres function (increment_rate_limit) — this test fires 12 requests genuinely in parallel
// (Promise.all, not a sequential loop) and asserts the count of successes is EXACTLY `max` (5),
// not "at least one 429 eventually." This would fail intermittently against the racy shape.
test('12 genuinely concurrent requests from the same IP → exactly max (5) succeed, never more', async ({
  request,
}) => {
  const headers = { 'x-forwarded-for': randomIp() }
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      request.post('/api/v1/public/waitlist', {
        headers,
        data: { email: `spec-concurrent-${Date.now()}-${i}@example.com` },
      }),
    ),
  )
  const succeeded = responses.filter((r) => r.status() === 200).length
  const rateLimited = responses.filter((r) => r.status() === 429).length
  expect(succeeded).toBe(5)
  expect(rateLimited).toBe(7)
})
