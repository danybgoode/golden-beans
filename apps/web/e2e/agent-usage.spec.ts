import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
// The zero-import contract module, never lib/finops-query.ts (`server-only` fails collection — lib/signal-events.ts).
import { AGENT_USAGE_EVENT, agentUsageIdempotencyKey, latestSnapshots } from '../lib/agent-usage'
import { specWorkspaceId } from './helpers/spec-workspace'

// finops · Sprint 3, Story 3.1 — `$agent_usage` through the REAL ingest path (POST /api/v1/track): accepted, scrubbed
// to metrics only (D9), idempotent per snapshot and latest-wins per (session, epic) (D22), and confined to the project
// of the key that sent it (D23). Every test provisions its own throwaway tenant (signals-capture.spec's convention).

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

type Tenant = { projectId: string; key: string }

async function createTenant(db: SupabaseClient): Promise<Tenant> {
  const { data: project, error } = await db
    .from('projects')
    .insert({
      workspace_id: await specWorkspaceId(db),
      slug: `spec-usage-${randomBytes(6).toString('hex')}`,
      api_key_hash: null,
    })
    .select('id')
    .single()
  if (error || !project) throw new Error(`could not create fixture project: ${error?.message}`)
  const key = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  const { error: keyError } = await db.from('api_keys').insert({
    project_id: project.id,
    key_hash: createHash('sha256').update(key).digest('hex'),
    label: 'usage spec',
  })
  if (keyError) throw new Error(`could not create fixture key: ${keyError.message}`)
  return { projectId: project.id, key }
}

const tokens = (n: number) => ({
  input: n,
  output: n,
  cache_read: n * 10,
  cache_write_5m: 0,
  cache_write_1h: n,
})
function usage(over: Record<string, unknown> = {}) {
  return {
    session_id: `sess-${randomBytes(4).toString('hex')}`,
    epic: 'finops',
    branch: 'feat/finops-s3',
    model_breakdown: { 'claude-opus-5-5': { tokens: tokens(100), usd: 0.42 } },
    skill_breakdown: { '(no skill)': { tokens: tokens(100), usd: 0.42 } },
    tokens_by_kind: tokens(100),
    usd_estimate: 0.42,
    price_table_date: '2026-10-02',
    first_at: '2026-10-02T10:00:00.000Z',
    last_at: '2026-10-02T11:00:00.000Z',
    ...over,
  }
}

function push(
  request: APIRequestContext,
  key: string,
  metadata: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  const u = metadata as { session_id: string; epic: string; last_at: string }
  return request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: {
      userId: 'agent:claude-code',
      event: AGENT_USAGE_EVENT,
      metadata,
      context: { version: 1, idempotencyKey: agentUsageIdempotencyKey(u) },
      ...extra,
    },
  })
}

async function storedUsage(db: SupabaseClient, projectId: string) {
  const { data, error } = await db
    .from('events')
    .select('metadata, tags')
    .eq('project_id', projectId)
    .eq('event', AGENT_USAGE_EVENT)
  if (error) throw new Error(error.message)
  return data ?? []
}

test.describe('$agent_usage on /api/v1/track (finops 3.1)', () => {
  test('a well-formed snapshot is accepted and stored as metrics only', async ({ request }) => {
    const db = dbClient()
    const t = await createTenant(db)
    const u = usage()
    const res = await push(request, t.key, u)
    expect(res.status()).toBe(201)
    const rows = await storedUsage(db, t.projectId)
    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0].metadata as object).sort()).toEqual(Object.keys(u).sort())
  })

  test('the scrub: a content key, a nested extra or any tag is refused with 400 — and nothing is stored', async ({
    request,
  }) => {
    const db = dbClient()
    const t = await createTenant(db)
    for (const [meta, extra] of [
      [usage({ prompt: 'SECRET PROMPT TEXT' }), {}],
      [usage({ model_breakdown: { m: { tokens: tokens(1), usd: 1, text: 'SECRET' } } }), {}],
      [usage(), { tags: { note: 'SECRET' } }],
      [{ session_id: 'x' }, {}],
    ] as const) {
      const res = await push(request, t.key, meta as Record<string, unknown>, extra)
      expect(res.status()).toBe(400)
    }
    expect(await storedUsage(db, t.projectId)).toHaveLength(0)
  })

  test('idempotent per snapshot: the same snapshot twice is one row; a grown one is a new row; the reader takes the latest', async ({
    request,
  }) => {
    const db = dbClient()
    const t = await createTenant(db)
    const first = usage()
    expect((await push(request, t.key, first)).status()).toBe(201)
    const again = await push(request, t.key, first)
    expect(again.status()).toBe(200)
    expect((await again.json()).deduplicated).toBe(true)
    const grown = { ...first, usd_estimate: 1.1, last_at: '2026-10-02T12:00:00.000Z' }
    expect((await push(request, t.key, grown)).status()).toBe(201)

    const rows = await storedUsage(db, t.projectId)
    expect(rows).toHaveLength(2)
    const latest = latestSnapshots(rows.map((r) => r.metadata))
    expect(latest).toHaveLength(1)
    expect(latest[0].usd_estimate).toBe(1.1)
  })

  test('a key writes only its own project: another project never sees the usage', async ({ request }) => {
    const db = dbClient()
    const mine = await createTenant(db)
    const theirs = await createTenant(db)
    expect((await push(request, mine.key, usage())).status()).toBe(201)
    expect(await storedUsage(db, theirs.projectId)).toHaveLength(0)
    expect(await storedUsage(db, mine.projectId)).toHaveLength(1)
    // There is no project field to forge: an unknown top-level key is not a way in either.
    const forged = await request.post('/api/v1/track', {
      headers: { Authorization: `Bearer ${mine.key}`, 'Content-Type': 'application/json' },
      data: {
        userId: 'agent:claude-code',
        event: AGENT_USAGE_EVENT,
        metadata: usage(),
        projectId: theirs.projectId,
      },
    })
    expect([201, 400]).toContain(forged.status())
    expect(await storedUsage(db, theirs.projectId)).toHaveLength(0)
  })

  test('the envelope is closed too: a person as userId, a featureId or an actor in context is a 400', async ({
    request,
  }) => {
    const db = dbClient()
    const t = await createTenant(db)
    for (const extra of [
      { userId: 'daniel@example.com' },
      { featureId: 'checkout' },
      { context: { version: 1, idempotencyKey: 'k-actor', actor: { type: 'user', id: 'SECRET' } } },
    ]) {
      expect((await push(request, t.key, usage(), extra)).status()).toBe(400)
    }
    expect(await storedUsage(db, t.projectId)).toHaveLength(0)
  })

  test('no key, no write', async ({ request }) => {
    const res = await request.post('/api/v1/track', {
      data: { userId: 'u', event: AGENT_USAGE_EVENT, metadata: usage() },
    })
    expect(res.status()).toBe(401)
  })
})

test('finops 3.3: /app/finops unauthed → /login, never data', async ({ request }) => {
  const res = await request.get('/app/finops/miyagisanchez', { maxRedirects: 0 })
  expect([302, 307]).toContain(res.status())
  expect(res.headers()['location']).toContain('/login')
})
