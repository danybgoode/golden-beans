import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Story 2.1 (Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md) — POST /v1/features/sync.
// Fixtures: supabase/seed.sql seeds project-one (see e2e/track.spec.ts); this spec creates its
// own feature rows through the endpoint under test rather than relying on static seed data.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

test('missing Authorization header → 401', async ({ request }) => {
  const res = await request.post('/api/v1/features/sync', {
    data: { features: [{ key: 'spec_feature', enabled: true }] },
  })
  expect(res.status()).toBe(401)
})

test('malformed body (empty features array) → 400', async ({ request }) => {
  const res = await request.post('/api/v1/features/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { features: [] },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
})

test('valid sync → 200, row upserted with fresh synced_at, and re-sync updates without duplicating', async ({
  request,
}) => {
  const key = `spec-sync-feature-${Date.now()}`

  const first = await request.post('/api/v1/features/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      features: [
        {
          key,
          enabled: true,
          targetEvent: 'spec_target',
          adoptedEvent: 'spec_adopted',
          retainedEvent: 'spec_retained',
          retentionDays: 5,
        },
      ],
    },
  })
  expect(first.status()).toBe(200)
  const firstBody = await first.json()
  expect(firstBody.ok).toBe(true)
  expect(firstBody.synced).toBe(1)

  const db = dbClient()
  const { data: firstRow, error } = await db
    .from('features')
    .select('key, enabled, target_event, retention_days, synced_at, project_id, projects(slug)')
    .eq('key', key)
    .single()
  expect(error).toBeNull()
  expect(firstRow?.enabled).toBe(true)
  expect(firstRow?.target_event).toBe('spec_target')
  expect(firstRow?.retention_days).toBe(5)
  // @ts-expect-error -- supabase-js types the joined relation loosely; the runtime shape is correct
  expect(firstRow?.projects?.slug).toBe('project-one')

  // Re-sync with enabled flipped to false — must update in place, not duplicate the row.
  await new Promise((r) => setTimeout(r, 5)) // ensure a distinguishable synced_at
  const second = await request.post('/api/v1/features/sync', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { features: [{ key, enabled: false }] },
  })
  expect(second.status()).toBe(200)

  const { data: rows } = await db.from('features').select('enabled, synced_at').eq('key', key)
  expect(rows?.length).toBe(1) // upsert, not insert — no duplicate row
  expect(rows?.[0]?.enabled).toBe(false)
  expect(new Date(rows![0].synced_at).getTime()).toBeGreaterThan(new Date(firstRow!.synced_at).getTime())
})

test('tenant isolation: project-two cannot write a features row that resolves to project-one', async ({
  request,
}) => {
  const key = `spec-sync-isolation-${Date.now()}`
  const res = await request.post('/api/v1/features/sync', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: { features: [{ key, enabled: true }] },
  })
  expect(res.status()).toBe(200)

  const db = dbClient()
  const { data: row } = await db.from('features').select('projects(slug)').eq('key', key).single()
  // @ts-expect-error -- see note above
  expect(row?.projects?.slug).toBe('project-two')
})
