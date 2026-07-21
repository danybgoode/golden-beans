import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// multi-tenant-activation · Sprint 1, Story 1.3 — API keys as a revocable lifecycle. lib/auth.ts
// resolves the Bearer key from the api_keys table (active rows only) instead of the single
// projects.api_key_hash column. We drive the DB directly at the same service-role authority the
// ingest route itself uses (mirrors track.spec.ts's approach) to prove the three acceptance
// properties: backfill continuity, immediate revocation, and rotation overlap.

const SEEDED_KEY = 'local-test-key-do-not-use-in-prod' // project-one's key (apps/web/supabase/seed.sql)

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newPlaintextKey(): string {
  return `gb_key_${randomBytes(24).toString('base64url')}`
}

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function projectOneId(client: ReturnType<typeof db>): Promise<string> {
  const { data, error } = await client.from('projects').select('id').eq('slug', 'project-one').single()
  if (error || !data) throw new Error(`Could not resolve project-one: ${error?.message}`)
  return data.id as string
}

async function track(request: import('@playwright/test').APIRequestContext, key: string) {
  return request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${key}` },
    data: { userId: 'u-keys-spec', event: 'keys_spec_event' },
  })
}

test('a seeded/migrated key still authorizes /track (backfill continuity)', async ({ request }) => {
  const res = await track(request, SEEDED_KEY)
  expect(res.status()).toBe(201)
})

test('a revoked key → 401 immediately, no cache window', async ({ request }) => {
  const client = db()
  const projectId = await projectOneId(client)
  const plaintext = newPlaintextKey()

  const { error: insertError } = await client
    .from('api_keys')
    .insert({ project_id: projectId, key_hash: sha256(plaintext), label: 'revoke-spec' })
  expect(insertError).toBeNull()

  // Active → authorizes.
  expect((await track(request, plaintext)).status()).toBe(201)

  // Revoke, then the very next request 401s.
  const { error: revokeError } = await client
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('key_hash', sha256(plaintext))
  expect(revokeError).toBeNull()

  expect((await track(request, plaintext)).status()).toBe(401)
})

test('two active keys overlap during rotation', async ({ request }) => {
  const client = db()
  const projectId = await projectOneId(client)
  const keyA = newPlaintextKey()
  const keyB = newPlaintextKey()

  const { error } = await client.from('api_keys').insert([
    { project_id: projectId, key_hash: sha256(keyA), label: 'rotate-A' },
    { project_id: projectId, key_hash: sha256(keyB), label: 'rotate-B' },
  ])
  expect(error).toBeNull()

  // Both resolve to the same project — the old key keeps working while the new one is in place.
  expect((await track(request, keyA)).status()).toBe(201)
  expect((await track(request, keyB)).status()).toBe(201)
})
