import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import { hashCredential } from '@/lib/credential-hash'
import { type FlagDefinition } from '@/lib/flag-definition'
import {
  cleanupFlagProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

const definition: FlagDefinition = {
  valueType: 'boolean',
  description: 'Disposable flag-serving integration fixture.',
  defaultVariantKey: 'off',
  variants: [{ key: 'off', value: false }, { key: 'on', value: true }],
  rules: [{ priority: 1, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' }],
  metadata: { criticality: 'low' },
}

const projectIds: string[] = []
const userIds: string[] = []

function db(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  requireTestDatabaseUrl()
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function fixtureUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `flag-serving-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-flag-serving-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create flag fixture user: ${error?.message}`)
  userIds.push(data.user.id)
  return data.user.id
}

async function fixtureProject(client: SupabaseClient, userId: string, label: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({ slug: `flag-serving-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: `h-${crypto.randomUUID()}` })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create flag fixture project: ${error?.message}`)
  const projectId = data.id as string
  projectIds.push(projectId)
  const membership = await client.from('project_members').insert({ project_id: projectId, user_id: userId, role: 'owner' })
  if (membership.error) throw new Error(`could not make flag fixture owner: ${membership.error.message}`)
  return projectId
}

async function createVersion(client: SupabaseClient, projectId: string, userId: string, key: string, input: FlagDefinition = definition) {
  const { data, error } = await client.rpc('create_flag_definition_version', {
    p_project_id: projectId,
    p_flag_key: key,
    p_definition: input,
    p_reason: 'fixture definition creation',
    p_actor_user_id: userId,
  })
  if (error || !data?.[0]) throw new Error(`could not create flag version: ${error?.message}`)
  return data[0] as { flag_id: string; version_id: string; version: number }
}

test.afterAll(async () => {
  await cleanupFlagProjects(projectIds)
  const client = db()
  for (const userId of userIds) await client.auth.admin.deleteUser(userId)
})

test('credential-scoped snapshot is ETagged, monotonic, audit-backed, and cannot cross project or scope', async ({ request }) => {
  test.skip(process.env.FLAG_SERVING_ENABLED !== 'true', 'enabled snapshot assertions run only in the owned enabled-gate pass')
  const client = db()
  const ownerA = await fixtureUser(client, 'a')
  const ownerB = await fixtureUser(client, 'b')
  const projectA = await fixtureProject(client, ownerA, 'a')
  const projectB = await fixtureProject(client, ownerB, 'b')
  const aV1 = await createVersion(client, projectA, ownerA, 'checkout.fixture')
  const bV1 = await createVersion(client, projectB, ownerB, 'foreign.fixture')

  const activation = await client.rpc('set_flag_activation', {
    p_project_id: projectA,
    p_environment: 'production',
    p_flag_id: aV1.flag_id,
    p_version_id: aV1.version_id,
    p_expected_snapshot_version: 0,
    p_reason: 'fixture activation',
    p_actor_user_id: ownerA,
  })
  expect(activation.error).toBeNull()
  expect(activation.data?.[0]).toEqual({ snapshot_version: 1, changed: true })

  const readKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const minted = await client.rpc('create_flag_read_key', {
    p_project_id: projectA,
    p_environment: 'production',
    p_key_hash: hashCredential(readKey),
    p_label: 'fixture snapshot reader',
    p_expires_at: null,
    p_actor_user_id: ownerA,
  })
  expect(minted.error).toBeNull()
  const keyId = minted.data?.[0]?.id as string
  expect(keyId).toBeTruthy()

  const first = await request.get(`/api/v1/flags/snapshot?projectId=${projectB}&environment=preview`, {
    headers: { Authorization: `Bearer ${readKey}` },
  })
  expect(first.status()).toBe(200)
  expect(first.headers().etag).toBe('"gbfs-1"')
  expect(first.headers()['cache-control']).toBe('private, max-age=0, must-revalidate')
  await expect(first.json()).resolves.toEqual({
    contractVersion: 1,
    environment: 'production',
    snapshotVersion: 1,
    flags: [{ key: 'checkout.fixture', definitionVersion: 1, definition }],
  })

  const notModified = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: `Bearer ${readKey}`, 'If-None-Match': '"other", "gbfs-1"' },
  })
  expect(notModified.status()).toBe(304)

  // A different project's version cannot be used as A's activation pointer, and the stale expected
  // revision cannot win after A has moved once.
  const foreign = await client.rpc('set_flag_activation', {
    p_project_id: projectA, p_environment: 'production', p_flag_id: aV1.flag_id,
    p_version_id: bV1.version_id, p_expected_snapshot_version: 1, p_reason: 'cross-project attempt', p_actor_user_id: ownerA,
  })
  expect(foreign.error).toBeNull()
  expect(foreign.data).toEqual([])
  const aV2 = await createVersion(client, projectA, ownerA, 'checkout.fixture', { ...definition, description: 'Second immutable fixture version.' })
  const stale = await client.rpc('set_flag_activation', {
    p_project_id: projectA, p_environment: 'production', p_flag_id: aV1.flag_id,
    p_version_id: aV2.version_id, p_expected_snapshot_version: 0, p_reason: 'stale attempt', p_actor_user_id: ownerA,
  })
  expect(stale.error?.code).toBe('40001')
  const moved = await client.rpc('set_flag_activation', {
    p_project_id: projectA, p_environment: 'production', p_flag_id: aV1.flag_id,
    p_version_id: aV2.version_id, p_expected_snapshot_version: 1, p_reason: 'fixture version upgrade', p_actor_user_id: ownerA,
  })
  expect(moved.data?.[0]).toEqual({ snapshot_version: 2, changed: true })

  const second = await request.get('/api/v1/flags/snapshot', { headers: { Authorization: `Bearer ${readKey}` } })
  expect(second.headers().etag).toBe('"gbfs-2"')
  expect((await second.json()).flags[0].definitionVersion).toBe(2)

  const ingestKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const inserted = await client.from('api_keys').insert({ project_id: projectA, key_hash: hashCredential(ingestKey), label: 'fixture ingest scope', scope: 'ingest' })
  expect(inserted.error).toBeNull()
  const wrongScope = await request.get('/api/v1/flags/snapshot', { headers: { Authorization: `Bearer ${ingestKey}` } })
  const unknown = await request.get('/api/v1/flags/snapshot', { headers: { Authorization: 'Bearer definitely-not-a-real-key' } })
  expect(wrongScope.status()).toBe(401)
  expect(await wrongScope.json()).toEqual(await unknown.json())

  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await expect(pg.query("UPDATE public.flag_definition_versions SET definition = jsonb_set(definition, '{description}', '\"rewritten\"'::jsonb) WHERE id = $1", [aV2.version_id])).rejects.toMatchObject({ code: '55000' })
    await expect(pg.query('DELETE FROM public.flag_definition_versions WHERE id = $1', [aV2.version_id])).rejects.toMatchObject({ code: '55000' })
  } finally {
    await pg.end()
  }

  const audit = await client.from('flag_lifecycle_audit').select('action,old_version_id,new_version_id,actor_user_id,reason').eq('project_id', projectA).order('created_at')
  expect(audit.error).toBeNull()
  expect(audit.data).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: 'activated', old_version_id: aV1.version_id, new_version_id: aV2.version_id, actor_user_id: ownerA, reason: 'fixture version upgrade' }),
  ]))

  const revoked = await client.rpc('revoke_flag_read_key', { p_project_id: projectA, p_key_id: keyId, p_actor_user_id: ownerA })
  expect(revoked.data).toBe(true)
  const afterRevoke = await request.get('/api/v1/flags/snapshot', { headers: { Authorization: `Bearer ${readKey}` } })
  expect(afterRevoke.status()).toBe(401)
})
