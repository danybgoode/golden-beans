import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createGrowthEngineClient } from '@golden-beans/sdk'

// Story 4.2 (Roadmap/01-growth-engine/growth-engine-v1/sprint-4.md) — an exposure event fired
// when a user is bucketed, queryable alongside Sprint 1's event stream. trackExposure() is a thin
// wrapper around the existing track()/`/api/v1/track` path — no new server-side surface.
const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

// Same direct-DB-read pattern as track.spec.ts — there's no public read endpoint in v1.
function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

test('trackExposure() persists an experiment_exposed event with the assigned variant', async ({ baseURL }) => {
  const userId = `exposure-spec-user-${Date.now()}`
  const growth = createGrowthEngineClient({ baseUrl: baseURL!, apiKey: PROJECT_ONE_KEY, userId })

  const bucketResult = growth.bucket('exposure-spec-experiment', [{ key: 'control' }, { key: 'treatment' }])
  expect(bucketResult.ok).toBe(true)
  if (!bucketResult.ok) return

  const trackResult = await growth.trackExposure('exposure-spec-experiment', bucketResult.variant)
  expect(trackResult.ok).toBe(true)
  if (!trackResult.ok) return

  const db = dbClient()
  const { data: row, error } = await db
    .from('events')
    .select('user_id, event, feature_id, tags')
    .eq('id', trackResult.id)
    .single()

  expect(error).toBeNull()
  expect(row?.user_id).toBe(userId)
  expect(row?.event).toBe('experiment_exposed')
  expect(row?.feature_id).toBe('exposure-spec-experiment')
  expect((row?.tags as Record<string, unknown> | null)?.variant).toBe(bucketResult.variant)
})

test('trackExposure() merges caller-supplied tags with the variant, not overwrite them', async ({ baseURL }) => {
  const userId = `exposure-spec-user-tags-${Date.now()}`
  const growth = createGrowthEngineClient({ baseUrl: baseURL!, apiKey: PROJECT_ONE_KEY, userId })

  const trackResult = await growth.trackExposure('exposure-spec-experiment-tags', 'control', {
    tags: { cohortPercentage: 50, region: 'mx' },
  })
  expect(trackResult.ok).toBe(true)
  if (!trackResult.ok) return

  const db = dbClient()
  const { data: row } = await db.from('events').select('tags').eq('id', trackResult.id).single()
  const tags = row?.tags as Record<string, unknown> | null
  expect(tags?.variant).toBe('control')
  expect(tags?.cohortPercentage).toBe(50)
  expect(tags?.region).toBe('mx')
})

test('exposure events are queryable alongside Sprint 1\'s event stream by feature_id', async ({ baseURL }) => {
  const experimentKey = `exposure-spec-stream-${Date.now()}`
  const growth = createGrowthEngineClient({
    baseUrl: baseURL!,
    apiKey: PROJECT_ONE_KEY,
    userId: `exposure-spec-user-stream-${Date.now()}`,
  })

  await growth.trackExposure(experimentKey, 'control')
  await growth.track('exposure_spec_conversion', { featureId: experimentKey })

  const db = dbClient()
  const { data: rows, error } = await db
    .from('events')
    .select('event, feature_id')
    .eq('feature_id', experimentKey)
    .order('created_at', { ascending: true })

  expect(error).toBeNull()
  expect(rows?.map((r) => r.event)).toEqual(['experiment_exposed', 'exposure_spec_conversion'])
})
