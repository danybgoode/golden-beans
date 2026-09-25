import { createHash, randomBytes } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readEventCatalog } from '@/lib/event-catalog-read'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function createProject(client: SupabaseClient, label: string) {
  const key = `gb_event_catalog_${randomBytes(18).toString('hex')}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const { data, error } = await client
    .from('projects')
    .insert({ slug: `event-catalog-${label}-${randomBytes(6).toString('hex')}`, api_key_hash: keyHash })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create event catalog project: ${error?.message}`)
  const { error: keyError } = await client
    .from('api_keys')
    .insert({ project_id: data.id, key_hash: keyHash, label: 'event catalog spec' })
  if (keyError) throw new Error(`could not create event catalog API key: ${keyError.message}`)
  return { id: data.id as string, key }
}

async function track(
  request: APIRequestContext,
  key: string,
  event: string,
  tags: Record<string, unknown>,
  subject?: { type: string; id: string }
) {
  const response = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${key}` },
    data: {
      userId: `event-catalog-user-${randomBytes(6).toString('hex')}`,
      event,
      tags,
      ...(subject ? { context: { version: 1, subject: { type: subject.type, id: subject.id } } } : {}),
    },
  })
  expect(response.status()).toBe(201)
}

test('catalog aggregates canonical ingest facts and cannot cross project boundaries', async ({ request }) => {
  const client = db()
  const [primary, foreign] = await Promise.all([
    createProject(client, 'primary'),
    createProject(client, 'foreign'),
  ])
  try {
    await Promise.all([
      track(
        request,
        primary.key,
        'checkout_completed',
        { source: 'google', plan: 'pro' },
        { type: 'merchant', id: 'm1' }
      ),
      track(
        request,
        primary.key,
        'checkout_completed',
        { source: 'email', plan: 'starter' },
        { type: 'merchant', id: 'm2' }
      ),
      track(
        request,
        primary.key,
        'signup_completed',
        { source: 'google', channel: 'paid', plan: 'pro' },
        { type: 'visitor', id: 'v1' }
      ),
      track(
        request,
        primary.key,
        'flag_evaluated',
        { environment: 'production', flag_key: 'checkout' },
        { type: 'merchant', id: 'm3' }
      ),
      track(
        request,
        primary.key,
        'flag_evaluated',
        { environment: 'production', flag_key: 'search' },
        { type: 'merchant', id: 'm3' }
      ),
      track(request, primary.key, 'experiment_exposed', {}, { type: 'merchant', id: 'm4' }),
      track(request, primary.key, '$error', {}),
      track(
        request,
        foreign.key,
        'foreign_metric',
        { source: 'private' },
        { type: 'merchant', id: 'foreign-1' }
      ),
    ])

    const catalog = await readEventCatalog(client, primary.id)
    expect(catalog.events).toEqual([
      expect.objectContaining({
        event: '$error',
        count14d: 1,
        count24h: 1,
        daily: expect.arrayContaining([1]),
        reserved: true,
      }),
      expect.objectContaining({
        event: 'checkout_completed',
        count14d: 2,
        count24h: 2,
        daily: expect.arrayContaining([2]),
        reserved: false,
      }),
      expect.objectContaining({
        event: 'experiment_exposed',
        count14d: 1,
        count24h: 1,
        daily: expect.arrayContaining([1]),
        reserved: true,
      }),
      expect.objectContaining({
        event: 'flag_evaluated',
        count14d: 2,
        count24h: 2,
        daily: expect.arrayContaining([2]),
        reserved: true,
      }),
      expect.objectContaining({
        event: 'signup_completed',
        count14d: 1,
        count24h: 1,
        daily: expect.arrayContaining([1]),
        reserved: false,
      }),
    ])
    expect(catalog.events.every((event) => event.daily.length === 14)).toBe(true)
    expect(catalog.events.some(({ event }) => event === 'foreign_metric')).toBe(false)
    expect(catalog.entities).toEqual([
      { type: 'merchant', subjects14d: 4 },
      { type: 'visitor', subjects14d: 1 },
    ])
    expect(catalog.baselines).toEqual([
      { event: '$error', type: 'merchant', baseline: 0 },
      { event: '$error', type: 'visitor', baseline: 0 },
      { event: 'checkout_completed', type: 'merchant', baseline: 0.5 },
      { event: 'checkout_completed', type: 'visitor', baseline: 0 },
      { event: 'experiment_exposed', type: 'merchant', baseline: 0.25 },
      { event: 'experiment_exposed', type: 'visitor', baseline: 0 },
      { event: 'flag_evaluated', type: 'merchant', baseline: 0.25 },
      { event: 'flag_evaluated', type: 'visitor', baseline: 0 },
      { event: 'signup_completed', type: 'merchant', baseline: 0 },
      { event: 'signup_completed', type: 'visitor', baseline: 1 },
    ])
    expect(catalog.segments).toEqual([
      {
        field: 'source',
        coverage: 3 / 7,
        values: [
          { value: 'google', share: 2 / 3 },
          { value: 'email', share: 1 / 3 },
        ],
      },
      { field: 'channel', coverage: 1 / 7, values: [{ value: 'paid', share: 1 }] },
      { field: 'campaign', coverage: 0, values: [] },
      {
        field: 'plan',
        coverage: 3 / 7,
        values: [
          { value: 'pro', share: 2 / 3 },
          { value: 'starter', share: 1 / 3 },
        ],
      },
      { field: 'region', coverage: 0, values: [] },
    ])
    expect(catalog.flagEvaluations).toEqual([
      { flagKey: 'checkout', evaluations: 1 },
      { flagKey: 'search', evaluations: 1 },
    ])
    expect(catalog).toMatchObject({ truncated: false, rowCap: 50_000, windowDays: 14 })
  } finally {
    await cleanupExperimentProjects([primary.id, foreign.id])
  }
})

// ⚠️ The row cap PostgREST enforces is 1,000 per request whatever `.limit()` says (architect's review
// of this story: the first version read one page and would have reported `truncated: false` at 1,000).
// Rows share timestamps in runs of 50, so page boundaries fall INSIDE a run of equal `created_at`.
// ⚠️ This does NOT make the `id` tie-break testable: removing it was tried and stayed green, because
// Postgres happens to return equal keys in a stable order for this data. The tie-break is correct by
// construction (without a total order, OFFSET paging may repeat or skip rows at a boundary), and this
// spec guards the paging itself, not the tie-break. Named as a gap rather than implied as covered.
// 1,205 rows are seeded in ONE statement — a fixture, not an application write (AGENTS rule #1 is
// about product code) — so the read has to cross a page boundary and land between two.
test('catalog pages past PostgREST max_rows: 1,205 events count as 1,205, not 1,000', async () => {
  const client = db()
  const project = await createProject(client, 'paging')
  const { Client } = await import('pg')
  const pg = new Client({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await pg.query(
      `insert into events (project_id, user_id, event, tags, created_at)
       select $1, 'u' || n, 'page_seen', '{"region":"MX"}'::jsonb, now() - ((n / 50) || ' seconds')::interval
       from generate_series(1, 1205) n`,
      [project.id]
    )
    const catalog = await readEventCatalog(client, project.id)
    expect(catalog.events).toEqual([expect.objectContaining({ event: 'page_seen', count14d: 1205 })])
    expect(catalog.segments.find((segment) => segment.field === 'region')?.coverage).toBe(1)
    expect(catalog.truncated).toBe(false)
  } finally {
    await pg.end()
    await cleanupExperimentProjects([project.id])
  }
})
