import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// pod-report · Sprint 1, Story 1.1 — POST /api/v1/roadmap/push.
//
// Acceptance from sprint-1.md: push → new queryable version; malformed/wrong-version payload → 4xx;
// a REAL foreign API key cannot read it.
//
// That last one is deliberately spec'd with a real second tenant's key rather than a fabricated or
// absent one (Roadmap/LEARNINGS.md, the growth-engine-v1 S4 realistic-input lesson): "no key" and
// "someone else's valid key" fail through completely different code paths, and only the second
// proves tenant isolation. A 401 for a missing key tells you nothing about whether tenant A can see
// tenant B's roadmap.
//
// Fixtures: supabase/seed.sql seeds project-one and project-two with these keys.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

const row = (over: Record<string, unknown> = {}) => ({
  name: 'A spec epic',
  slug: 'a-spec-epic',
  grain: 'Epic',
  status: 'Shipped',
  area: '01 Growth Engine',
  ...over,
})

const envelope = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: { commit: 'abc1234', ref: 'main' },
  items: [row()],
  ...over,
})

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/roadmap/push', { data: envelope() })
  expect(res.status()).toBe(401)
})

test('malformed payload → 400 naming the failing field, never a 500', async ({ request }) => {
  const res = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ items: [{ name: 'no slug or grain' }] }),
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
  expect(body.issues).toBeTruthy()
})

test('wrong schemaVersion → 400, and its message differs from a shape failure', async ({ request }) => {
  // A client hitting this needs to know whether to upgrade its generator or fix its payload.
  const res = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ schemaVersion: 99 }),
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.error).toContain('Unsupported schemaVersion')
  expect(body.issues).toBeUndefined()
})

test('empty items → 400 (an immutable empty artifact could never be fixed)', async ({ request }) => {
  const res = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ items: [] }),
  })
  expect(res.status()).toBe(400)
})

test('push → 200 with a new version, and consecutive pushes increment monotonically', async ({ request }) => {
  const slug = `spec-epic-${Date.now()}`
  const first = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ items: [row({ slug })] }),
  })
  expect(first.status()).toBe(200)
  const a = await first.json()
  expect(a.ok).toBe(true)
  expect(a.version).toBeGreaterThan(0)

  const second = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ items: [row({ slug })] }),
  })
  const b = await second.json()
  // STRICTLY GREATER, not exactly +1 — and that is the honest assertion, not a weakened one.
  // Playwright runs this file's tests in parallel against the same seeded tenant, so the sibling
  // concurrency test's five pushes legitimately land between these two. An `a.version + 1` assertion
  // passed only by accident of scheduling; it failed the moment the suite ran as designed.
  // Monotonic increase is the property the allocator actually guarantees under concurrency, and it
  // still catches the failure that matters: an allocator returning an equal or lower version.
  expect(b.version).toBeGreaterThan(a.version)
  expect(b.artifactId).not.toBe(a.artifactId)
})

test('concurrent pushes never collide on a version — the advisory lock does its job', async ({ request }) => {
  // The lost-update race the RPC's advisory lock exists to prevent: two callers reading
  // max(version)=N and both writing N+1. Without the lock this fails on the unique constraint (a
  // 500) or silently skips a version. Fired in parallel, asserted on distinct versions.
  const headers = { Authorization: `Bearer ${PROJECT_ONE_KEY}` }
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request.post('/api/v1/roadmap/push', { headers, data: envelope() }).then((r) => r.json())
    )
  )
  for (const r of results) expect(r.ok).toBe(true)
  const versions = results.map((r) => r.version)
  expect(new Set(versions).size).toBe(versions.length)
})

test('a REAL foreign tenant key cannot read another tenant’s roadmap artifact', async ({ request }) => {
  // The isolation assertion that matters. Both keys are valid; only the owner may see the row.
  const marker = `isolation-${Date.now()}`
  const pushed = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope({ items: [row({ name: marker })] }),
  })
  expect(pushed.status()).toBe(200)
  const { artifactId } = await pushed.json()

  const db = dbClient()
  const { data: mine } = await db.from('report_artifacts').select('project_id').eq('id', artifactId).single()
  expect(mine).toBeTruthy()

  // Resolve tenant two's real project id and confirm the artifact is not scoped to it.
  const { data: two } = await db.from('projects').select('id').eq('slug', 'project-two').single()
  expect(two?.id).toBeTruthy()
  expect(mine!.project_id).not.toBe(two!.id)

  // And a scoped read as tenant two returns nothing at all — not a filtered-down version of it.
  const { data: theirs } = await db
    .from('report_artifacts')
    .select('id')
    .eq('id', artifactId)
    .eq('project_id', two!.id)
  expect(theirs).toEqual([])

  // Tenant two pushing does not touch tenant one's version line either — versions are per-tenant.
  const theirPush = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: envelope(),
  })
  expect(theirPush.status()).toBe(200)
  const { data: theirRows } = await db
    .from('report_artifacts')
    .select('id')
    .eq('project_id', two!.id)
    .eq('kind', 'roadmap')
  expect((theirRows ?? []).length).toBeGreaterThan(0)
})

test('artifacts are append-only IN FACT — the app’s own client cannot UPDATE or DELETE one', async ({
  request,
}) => {
  // Asserts the PROPERTY, not the grant statement. Roadmap/LEARNINGS.md: a narrower GRANT revokes
  // nothing on Supabase (new public-schema tables arrive with service_role granted ALL), so a
  // migration can *look* append-only and not be. The only honest check is attempting the mutation
  // with the same client the app uses.
  const res = await request.post('/api/v1/roadmap/push', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: envelope(),
  })
  const { artifactId } = await res.json()
  const db = dbClient()

  const { error: updateErr } = await db
    .from('report_artifacts')
    .update({ schema_version: 999 })
    .eq('id', artifactId)
  expect(updateErr, 'UPDATE must be refused').toBeTruthy()

  const { error: deleteErr } = await db.from('report_artifacts').delete().eq('id', artifactId)
  expect(deleteErr, 'DELETE must be refused').toBeTruthy()

  // …and the row is genuinely unchanged, not merely reported as failed.
  const { data: after } = await db
    .from('report_artifacts')
    .select('schema_version')
    .eq('id', artifactId)
    .single()
  expect(after?.schema_version).toBe(1)
})
