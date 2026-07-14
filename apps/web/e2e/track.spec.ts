import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 1.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-1.md) — POST /v1/track.
// Fixtures: supabase/seed.sql seeds two projects, local dev + CI only.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

// There's no public read endpoint in v1, so tenant isolation is verified with a direct
// service-role DB read — the same authority level the ingest route itself uses.
function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/track', {
    data: { userId: 'u1', event: 'test' },
  })
  expect(res.status()).toBe(401)
})

test('invalid API key → 401', async ({ request }) => {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: 'Bearer not-a-real-key' },
    data: { userId: 'u1', event: 'test' },
  })
  expect(res.status()).toBe(401)
})

test('malformed body (missing event) → 400', async ({ request }) => {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId: 'u1' },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
})

test('valid request → 201 and the row is persisted, queryable, and correctly tenant-scoped', async ({
  request,
}) => {
  const userId = `spec-user-${Date.now()}`
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: 'spec_event', featureId: 'spec_feature', tags: { source: 'playwright' } },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(typeof body.id).toBe('string')

  const db = dbClient()
  const { data: row, error } = await db
    .from('events')
    .select('id, user_id, event, feature_id, project_id, projects(slug)')
    .eq('id', body.id)
    .single()
  expect(error).toBeNull()
  expect(row?.user_id).toBe(userId)
  // @ts-expect-error -- supabase-js types the joined relation loosely; the runtime shape is correct
  expect(row?.projects?.slug).toBe('project-one')
})

test('tenant isolation: project-two can never write a row that resolves to project-one', async ({
  request,
}) => {
  const userId = `spec-isolation-${Date.now()}`
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: { userId, event: 'spec_isolation_event' },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()

  const db = dbClient()
  const { data: row } = await db
    .from('events')
    .select('project_id, projects(slug)')
    .eq('id', body.id)
    .single()
  // @ts-expect-error -- see note above
  expect(row?.projects?.slug).toBe('project-two')
  expect(row?.project_id).not.toBe(undefined)

  // project-one's key must never be able to authenticate as project-two, and vice versa —
  // there is structurally no request field that lets a caller pick project_id (Decision 8).
  const crossRes = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: 'spec_isolation_event', projectId: 'project-two' } as Record<string, unknown>,
  })
  const crossBody = await crossRes.json()
  const crossRow = await db.from('events').select('projects(slug)').eq('id', crossBody.id).single()
  // @ts-expect-error -- see note above
  expect(crossRow.data?.projects?.slug).toBe('project-one') // the spoofed `projectId` field is ignored
})
