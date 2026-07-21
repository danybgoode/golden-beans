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

  test('a REJECTED event does not consume quota', async ({ request }) => {
    // Cross-review regression guard (Codex 2026-07-20): the first version checked the quota before
    // parsing, so a broken integration sending malformed JSON burned a tenant's monthly allowance
    // with nothing stored — the tenant would see far fewer than their configured quota accepted
    // and nothing in `events` to explain where it went.
    //
    // A quota of exactly 1 makes the bug unmissable: under the old ordering the malformed calls
    // would exhaust it and the one GOOD event would 429.
    const db = dbClient()
    const tenant = await createTenant(db, { monthly_event_quota: 1 })
    try {
      // Schema-invalid (no `event`), then genuinely malformed JSON, then an oversized body — the
      // three ways a request dies before it could ever become a stored event.
      expect((await fire(request, tenant, { userId: 'u1' })).status()).toBe(400)
      const badJson = await request.post('/api/v1/track', {
        headers: {
          Authorization: `Bearer ${tenant.plaintextKey}`,
          'Content-Type': 'application/json',
        },
        data: '{not json',
      })
      expect(badJson.status()).toBe(400)
      expect(
        (
          await fire(request, tenant, {
            userId: 'u1',
            event: 'big',
            metadata: { blob: 'x'.repeat(MAX_TRACK_PAYLOAD_BYTES + 512) },
          })
        ).status(),
      ).toBe(413)

      // The tenant's single unit of quota must still be entirely unspent.
      expect((await fire(request, tenant, { userId: 'u1', event: 'the real one' })).status()).toBe(201)
    } finally {
      await destroyTenant(db, tenant)
    }
  })

  test('raising the ceiling still works after SUSTAINED over-quota traffic', async ({ request }) => {
    // The sharp version of the test below. The counter increments before the comparison (that is
    // what makes it atomic), so a rejected call used to inflate it too — meaning a tenant whose
    // integration kept retrying drove the count arbitrarily far above their ceiling, and "raise
    // the ceiling", the documented and only remedy, silently failed to restore service because
    // the count was already past the new number as well (cross-review, Codex 2026-07-20).
    //
    // The original test raised the ceiling after exactly ONE rejection, which the bug survived.
    // This one hammers it first — the difference between a spec that looks right and one with
    // teeth.
    const db = dbClient()
    const tenant = await createTenant(db, { monthly_event_quota: 1, ingest_rate_per_min: 600 })
    try {
      expect((await fire(request, tenant, { userId: 'u1', event: 'accepted' })).status()).toBe(201)

      // 10 rejected attempts. Under the bug the counter reaches ~11 and a ceiling of 5 stays shut.
      for (let i = 0; i < 10; i++) {
        expect((await fire(request, tenant, { userId: 'u1', event: `over-${i}` })).status()).toBe(429)
      }

      await db.from('projects').update({ monthly_event_quota: 5 }).eq('id', tenant.projectId)

      // The tenant has ONE accepted event against a new ceiling of 5, so this must be allowed.
      expect((await fire(request, tenant, { userId: 'u1', event: 'after raise' })).status()).toBe(201)
    } finally {
      await destroyTenant(db, tenant)
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

test.describe('one self-serve tenant per creator', () => {
  test('the DATABASE refuses a second project for the same creator', async () => {
    // The provisioner's membership pre-check and its project INSERT are two separate round-trips
    // with no transaction between them (supabase-js speaks REST), so two concurrent confirmed
    // callbacks — what a double-clicked confirmation link produces — could both observe "no
    // membership" and both create a project. Application-level idempotency cannot close that;
    // a partial unique index can, and this asserts the index is actually there and actually
    // partial (cross-review, Codex 2026-07-20).
    const db = dbClient()
    // A REAL auth user, not a random UUID. `projects.created_by` is a foreign key into
    // auth.users, so a made-up id fails on the FK and the test would skip itself — verifying
    // nothing while looking green, which is the failure mode this suite exists to avoid.
    const { data: created, error: userError } = await db.auth.admin.createUser({
      email: `spec-creator-${randomBytes(6).toString('hex')}@example.com`,
      password: randomBytes(16).toString('base64url'),
      email_confirm: true,
    })
    if (userError || !created.user) throw new Error(`could not create fixture user: ${userError?.message}`)
    const creator = created.user.id

    const first = await db
      .from('projects')
      .insert({ slug: `spec-creator-${randomBytes(6).toString('hex')}`, created_by: creator })
      .select('id')
      .single()
    expect(first.error, 'the first project for a creator must be allowed').toBeNull()

    try {
      const second = await db
        .from('projects')
        .insert({ slug: `spec-creator-${randomBytes(6).toString('hex')}`, created_by: creator })
        .select('id')
        .single()
      expect(second.error, 'a second project for the same creator must be refused').not.toBeNull()
      expect(second.error?.code).toBe('23505')
    } finally {
      await db.from('projects').delete().eq('created_by', creator)
      await db.auth.admin.deleteUser(creator)
    }
  })

  test('the constraint is PARTIAL — hand-seeded projects (created_by NULL) are unaffected', async () => {
    // The three pre-self-serve tenants all carry NULL here. A non-partial unique index would have
    // allowed exactly one of them to exist, which would have broken production on migrate.
    const db = dbClient()
    const slugs = [`spec-null-${randomBytes(5).toString('hex')}`, `spec-null-${randomBytes(5).toString('hex')}`]
    try {
      for (const slug of slugs) {
        const { error } = await db.from('projects').insert({ slug, created_by: null })
        expect(error, `a second created_by-NULL project must be allowed (${slug})`).toBeNull()
      }
    } finally {
      await db.from('projects').delete().in('slug', slugs)
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
