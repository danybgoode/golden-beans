import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { MAX_TRACK_PAYLOAD_BYTES } from '../lib/quota-window'

// multi-tenant-activation · Sprint 2, Story 2.2 — the isolation guardrails on the shared ingest
// path: payload cap, per-KEY rate limit, per-PROJECT monthly quota.
//
// Every test provisions its OWN throwaway project + key with deliberately tiny limits, rather
// than lowering the shared seed fixtures' limits. Two reasons, both learned the hard way in this
// suite (see waitlist.spec.ts's header on shared rate-limit buckets):
//   1. The counters are DB-backed and survive between local `playwright test` runs, so a fixed
//      project would carry its exhausted window into the next run and the spec would only pass
//      once. A fresh api_keys row per run means a fresh `ingest:<keyId>` counter key.
//   2. Mutating a shared fixture's limits makes these tests order-dependent with every other
//      spec that ingests.
// The limits are set as DATA on the project row — which is also the acceptance criterion ("quota
// values configurable per project row, not hardcoded") demonstrated rather than asserted.

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

type Tenant = { projectId: string; plaintextKey: string }

async function createTenant(
  db: SupabaseClient,
  limits: { monthly_event_quota?: number; ingest_rate_per_min?: number } = {},
): Promise<Tenant> {
  const slug = `spec-guardrails-${randomBytes(6).toString('hex')}`
  const { data: project, error } = await db
    .from('projects')
    .insert({ slug, api_key_hash: null, ...limits })
    .select('id')
    .single()
  if (error || !project) throw new Error(`could not create fixture project: ${error?.message}`)

  const plaintextKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  const { error: keyError } = await db.from('api_keys').insert({
    project_id: project.id,
    key_hash: createHash('sha256').update(plaintextKey).digest('hex'),
    label: 'guardrails spec',
  })
  if (keyError) throw new Error(`could not create fixture key: ${keyError.message}`)

  return { projectId: project.id as string, plaintextKey }
}

// ON DELETE CASCADE takes the api_keys and events rows with it.
async function destroyTenant(db: SupabaseClient, tenant: Tenant): Promise<void> {
  await db.from('projects').delete().eq('id', tenant.projectId)
}

function fire(request: APIRequestContext, tenant: Tenant, data: unknown) {
  return request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${tenant.plaintextKey}` },
    data: data as Record<string, unknown>,
  })
}

test.describe('payload cap', () => {
  test('an oversized body → 413, and nothing is persisted', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db)
    try {
      // Comfortably over the cap, built from a single metadata string — the realistic shape of an
      // accidental blob (someone stuffing a whole request log into metadata), not a contrived one.
      const oversized = {
        userId: 'u1',
        event: 'oversized',
        metadata: { blob: 'x'.repeat(MAX_TRACK_PAYLOAD_BYTES + 1024) },
      }
      const res = await fire(request, tenant, oversized)
      expect(res.status()).toBe(413)

      const { data } = await db.from('events').select('id').eq('project_id', tenant.projectId)
      expect(data ?? []).toHaveLength(0)
    } finally {
      await destroyTenant(db, tenant)
    }
  })

  test('a normal-sized body is unaffected', async ({ request }) => {
    // The cap must not be so tight that an ordinary metadata-carrying event trips it — a guard
    // that also blocks legitimate traffic is a regression, not a guardrail.
    const db = dbClient()
    const tenant = await createTenant(db)
    try {
      const res = await fire(request, tenant, {
        userId: 'u1',
        event: 'normal',
        metadata: { note: 'x'.repeat(2000) },
      })
      expect(res.status()).toBe(201)
    } finally {
      await destroyTenant(db, tenant)
    }
  })
})

test.describe('per-key ingest rate limit', () => {
  test('over the per-minute ceiling → 429 with a readable body', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, { ingest_rate_per_min: 2 })
    try {
      // Sequential, not parallel: the assertion is about the ORDER (the first two pass, the third
      // is refused), which a concurrent burst would make non-deterministic.
      expect((await fire(request, tenant, { userId: 'u1', event: 'e1' })).status()).toBe(201)
      expect((await fire(request, tenant, { userId: 'u1', event: 'e2' })).status()).toBe(201)

      const third = await fire(request, tenant, { userId: 'u1', event: 'e3' })
      expect(third.status()).toBe(429)
      const body = await third.json()
      expect(body.ok).toBe(false)
      // The message must name the actual ceiling — "429" alone leaves a customer guessing which
      // of the two limits they hit and what number to ask us to raise.
      expect(body.error).toContain('rate limit')
      expect(body.error).toContain('2')
    } finally {
      await destroyTenant(db, tenant)
    }
  })

  test('the limit is per KEY — a second key on the same project is unaffected', async ({ request }) => {
    // The property that makes revoking one runaway integration a complete fix, instead of the
    // tenant's healthy integrations being starved alongside it.
    const db = dbClient()
    const tenant = await createTenant(db, { ingest_rate_per_min: 1 })
    try {
      const secondKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
      await db.from('api_keys').insert({
        project_id: tenant.projectId,
        key_hash: createHash('sha256').update(secondKey).digest('hex'),
        label: 'second integration',
      })

      expect((await fire(request, tenant, { userId: 'u1', event: 'e1' })).status()).toBe(201)
      expect((await fire(request, tenant, { userId: 'u1', event: 'e2' })).status()).toBe(429)

      const viaSecondKey = await request.post('/api/v1/track', {
        headers: { Authorization: `Bearer ${secondKey}` },
        data: { userId: 'u1', event: 'e3' },
      })
      expect(viaSecondKey.status()).toBe(201)
    } finally {
      await destroyTenant(db, tenant)
    }
  })
})

test.describe('monthly event quota', () => {
  test('over quota → 429 naming the ceiling and the reset date', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db, { monthly_event_quota: 1, ingest_rate_per_min: 600 })
    try {
      expect((await fire(request, tenant, { userId: 'u1', event: 'e1' })).status()).toBe(201)

      const over = await fire(request, tenant, { userId: 'u1', event: 'e2' })
      expect(over.status()).toBe(429)
      const body = await over.json()
      expect(body.error).toContain('quota')
      // A quota rejection without a reset date is an unanswerable support ticket.
      expect(body.error).toMatch(/resets on \d{4}-\d{2}-\d{2}/)
    } finally {
      await destroyTenant(db, tenant)
    }
  })

  test('quota is per PROJECT — one tenant exhausting it cannot block another', async ({ request }) => {
    // The isolation property the whole story exists for: open signup means a stranger shares this
    // route with Miyagi's real traffic.
    const db = dbClient()
    const exhausted = await createTenant(db, { monthly_event_quota: 1 })
    const healthy = await createTenant(db, { monthly_event_quota: 100 })
    try {
      expect((await fire(request, exhausted, { userId: 'u1', event: 'e1' })).status()).toBe(201)
      expect((await fire(request, exhausted, { userId: 'u1', event: 'e2' })).status()).toBe(429)
      expect((await fire(request, healthy, { userId: 'u1', event: 'e1' })).status()).toBe(201)
    } finally {
      await destroyTenant(db, exhausted)
      await destroyTenant(db, healthy)
    }
  })

  test('the ceiling is data — raising it is an UPDATE, not a deploy', async ({ request }) => {
    // Story 2.2's acceptance, demonstrated end-to-end: the same key that was refused starts
    // working again after a row update, with no restart in between.
    const db = dbClient()
    const tenant = await createTenant(db, { monthly_event_quota: 1 })
    try {
      expect((await fire(request, tenant, { userId: 'u1', event: 'e1' })).status()).toBe(201)
      expect((await fire(request, tenant, { userId: 'u1', event: 'e2' })).status()).toBe(429)

      await db.from('projects').update({ monthly_event_quota: 50 }).eq('id', tenant.projectId)

      expect((await fire(request, tenant, { userId: 'u1', event: 'e3' })).status()).toBe(201)
    } finally {
      await destroyTenant(db, tenant)
    }
  })
})

test.describe('audit trail', () => {
  test('provisioning-independent actions still record an actor-less row', async () => {
    // The trail must be append-only *by grant*: service_role has SELECT + INSERT and deliberately
    // no UPDATE/DELETE, so a bug (or a compromised app path) cannot rewrite history. Asserted by
    // attempting the mutation with the very client the app uses.
    const db = dbClient()
    const { data: inserted, error: insertError } = await db
      .from('audit_log')
      .insert({ action: 'api_key_issued', metadata: { label: 'spec' } })
      .select('id')
      .single()
    expect(insertError).toBeNull()
    expect(inserted?.id).toBeTruthy()

    const { error: updateError } = await db
      .from('audit_log')
      .update({ action: 'rewritten' })
      .eq('id', inserted!.id)
    expect(updateError, 'audit_log must not be UPDATE-able by the application role').not.toBeNull()

    const { error: deleteError } = await db.from('audit_log').delete().eq('id', inserted!.id)
    expect(deleteError, 'audit_log must not be DELETE-able by the application role').not.toBeNull()
  })
})
