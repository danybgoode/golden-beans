import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hashCredential } from '@/lib/credential-hash'
import type { FlagDefinition } from '@/lib/flag-definition'
import { FLAG_DEFINITION_SYNC_CONTRACT_VERSION, type FlagDefinitionSyncRequest } from '@golden-beans/sdk'
import {
  cleanupFlagProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

const projectIds: string[] = []
const userIds: string[] = []

const definition: FlagDefinition = {
  valueType: 'boolean',
  description: 'Disposable catalog synchronization fixture.',
  defaultVariantKey: 'on',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
  metadata: { source: 'miyagi', polarity: 'killswitch', criticality: 'high', enforcement: 'both' },
}

function db(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  requireTestDatabaseUrl()
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

function key(): string {
  return `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
}

async function fixtureUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `flag-sync-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-flag-sync-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create flag-sync fixture user: ${error?.message}`)
  userIds.push(data.user.id)
  return data.user.id
}

async function fixtureProject(client: SupabaseClient, userId: string, label: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({
      slug: `flag-sync-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: `h-${crypto.randomUUID()}`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create flag-sync fixture project: ${error?.message}`)
  projectIds.push(data.id as string)
  const membership = await client
    .from('project_members')
    .insert({ project_id: data.id, user_id: userId, role: 'owner' })
  if (membership.error)
    throw new Error(`could not create flag-sync fixture owner: ${membership.error.message}`)
  return data.id as string
}

async function mintSyncKey(client: SupabaseClient, projectId: string, ownerId: string, source: string) {
  const plaintext = key()
  const { data, error } = await client.rpc('create_flag_sync_key', {
    p_project_id: projectId,
    p_key_hash: hashCredential(plaintext),
    p_label: `${source} catalog publisher`,
    p_source: source,
    p_expires_at: null,
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]?.id) throw new Error(`could not mint flag-sync key: ${error?.message}`)
  return { plaintext, id: data[0].id as string }
}

function payload(entries: FlagDefinitionSyncRequest['entries']): FlagDefinitionSyncRequest {
  return { contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION, entries }
}

async function sync(
  request: import('@playwright/test').APIRequestContext,
  plaintext: string,
  entries: FlagDefinitionSyncRequest['entries']
) {
  return request.post('/api/v1/flags/sync', {
    headers: { Authorization: `Bearer ${plaintext}` },
    data: payload(entries),
  })
}

test.afterAll(async () => {
  await cleanupFlagProjects(projectIds)
  const client = db()
  for (const userId of userIds) await client.auth.admin.deleteUser(userId)
})

test('scoped fragments create drafts, no-op when identical, retain omissions, and reject drift atomically', async ({
  request,
}) => {
  test.skip(
    process.env.FLAG_DEFINITION_SYNC_ENABLED !== 'true',
    'sync enabled assertions need the owned gate pass'
  )
  const client = db()
  const owner = await fixtureUser(client, 'owner')
  const project = await fixtureProject(client, owner, 'catalog')
  const frontend = await mintSyncKey(client, project, owner, 'frontend')
  const backend = await mintSyncKey(client, project, owner, 'backend')
  const frontendEntries = [{ key: 'catalog.checkout', definition }]
  const backendEntries = [
    { key: 'catalog.checkout', definition },
    { key: 'catalog.shipping', definition },
  ]

  const first = await sync(request, frontend.plaintext, frontendEntries)
  expect(first.status()).toBe(200)
  expect(await first.json()).toMatchObject({
    ok: true,
    entries: [{ key: 'catalog.checkout', definitionVersion: 1, created: true }],
  })
  const states = await client.from('flag_environment_states').select('environment').eq('project_id', project)
  const activations = await client
    .from('flag_environment_activations')
    .select('environment')
    .eq('project_id', project)
  expect(states.data).toEqual([])
  expect(activations.data).toEqual([])

  const repeat = await sync(request, frontend.plaintext, frontendEntries)
  expect(repeat.status()).toBe(200)
  expect((await repeat.json()).entries).toEqual([
    { key: 'catalog.checkout', definitionVersion: 1, created: false },
  ])
  const additive = await sync(request, backend.plaintext, backendEntries)
  expect(additive.status()).toBe(200)
  expect((await additive.json()).entries).toEqual([
    { key: 'catalog.checkout', definitionVersion: 1, created: false },
    { key: 'catalog.shipping', definitionVersion: 1, created: true },
  ])

  const omission = await sync(request, frontend.plaintext, frontendEntries)
  expect(omission.status()).toBe(200)
  const registry = await client.from('flag_registries').select('key').eq('project_id', project).order('key')
  expect(registry.data?.map((row) => row.key)).toEqual(['catalog.checkout', 'catalog.shipping'])

  const drift = await sync(request, backend.plaintext, [
    frontendEntries[0],
    { key: 'catalog.shipping', definition: { ...definition, description: 'Conflicting immutable meaning.' } },
  ])
  expect(drift.status()).toBe(409)
  const versions = await client.from('flag_definition_versions').select('version').eq('project_id', project)
  expect(versions.data).toHaveLength(2)
  const audit = await client
    .from('flag_lifecycle_audit')
    .select('reason')
    .eq('project_id', project)
    .order('created_at')
  expect(audit.data?.map((row) => row.reason)).toEqual([
    'catalog sync from frontend',
    'catalog sync from backend',
  ])
})

test('the sync route accepts only one active flag_sync credential and never trusts a body tenant', async ({
  request,
}) => {
  test.skip(
    process.env.FLAG_DEFINITION_SYNC_ENABLED !== 'true',
    'sync enabled assertions need the owned gate pass'
  )
  const client = db()
  const ownerA = await fixtureUser(client, 'scope-a')
  const ownerB = await fixtureUser(client, 'scope-b')
  const projectA = await fixtureProject(client, ownerA, 'scope-a')
  const projectB = await fixtureProject(client, ownerB, 'scope-b')
  const keyA = await mintSyncKey(client, projectA, ownerA, 'frontend')
  const keyB = await mintSyncKey(client, projectB, ownerB, 'frontend')
  const ingest = key()
  const flagRead = key()
  const flagAdmin = key()
  const agentWrite = key()
  const share = key()
  const expiredSync = key()
  const inserted = await client.from('api_keys').insert([
    { project_id: projectA, key_hash: hashCredential(ingest), label: 'wrong ingest scope', scope: 'ingest' },
    {
      project_id: projectA,
      key_hash: hashCredential(flagRead),
      label: 'wrong read scope',
      scope: 'flag_read',
      flag_environment: 'production',
    },
    {
      project_id: projectA,
      key_hash: hashCredential(flagAdmin),
      label: 'wrong admin scope',
      scope: 'flag_admin',
      flag_environment: 'production',
      flag_actor_user_id: ownerA,
    },
    {
      project_id: projectA,
      key_hash: hashCredential(agentWrite),
      label: 'wrong write scope',
      scope: 'agent_write',
    },
    {
      project_id: projectA,
      key_hash: hashCredential(share),
      label: 'wrong share scope',
      scope: 'share',
      share_lens: 'team',
    },
    {
      project_id: projectA,
      key_hash: hashCredential(expiredSync),
      label: 'expired sync scope',
      scope: 'flag_sync',
      flag_actor_user_id: ownerA,
      flag_sync_source: 'expired',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    },
  ])
  expect(inserted.error).toBeNull()

  const own = await sync(request, keyA.plaintext, [{ key: 'catalog.scope-a', definition }])
  expect(own.status()).toBe(200)
  const wrongScopes = await Promise.all(
    [ingest, flagRead, flagAdmin, agentWrite, share, expiredSync].map((credential) =>
      sync(request, credential, [{ key: 'catalog.wrong-scope', definition }])
    )
  )
  // There is no project field to aim credential B at project A. This succeeds only for B, proving
  // that another tenant's valid key cannot become an A credential by choosing request content.
  const foreign = await sync(request, keyB.plaintext, [{ key: 'catalog.scope-b', definition }])
  const unknown = await sync(request, 'definitely-not-a-real-key', [{ key: 'catalog.unknown', definition }])
  for (const response of [...wrongScopes, unknown]) {
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'Invalid flag definition sync credential' })
  }

  const rowsA = await client.from('flag_registries').select('key').eq('project_id', projectA)
  const rowsB = await client.from('flag_registries').select('key').eq('project_id', projectB)
  expect(rowsA.data?.map((row) => row.key)).toEqual(['catalog.scope-a'])
  expect(foreign.status()).toBe(200)
  expect(rowsB.data?.map((row) => row.key)).toEqual(['catalog.scope-b'])

  await client.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyA.id)
  const revoked = await sync(request, keyA.plaintext, [{ key: 'catalog.revoked', definition }])
  expect(revoked.status()).toBe(401)
})

test('invalid catalog commands and a genuinely oversized body leave no definition behind', async ({
  request,
}) => {
  test.skip(
    process.env.FLAG_DEFINITION_SYNC_ENABLED !== 'true',
    'sync enabled assertions need the owned gate pass'
  )
  const client = db()
  const owner = await fixtureUser(client, 'invalid')
  const project = await fixtureProject(client, owner, 'invalid')
  const syncKey = await mintSyncKey(client, project, owner, 'frontend')
  const headers = { Authorization: `Bearer ${syncKey.plaintext}`, 'Content-Type': 'application/json' }
  const invalidBodies: unknown[] = [
    { contractVersion: 2, entries: [{ key: 'catalog.invalid', definition }] },
    { contractVersion: 1, entries: [{ key: 'catalog.invalid', definition, unexpected: true }] },
    {
      contractVersion: 1,
      entries: [
        { key: 'catalog.duplicate', definition },
        { key: 'catalog.duplicate', definition },
      ],
    },
    { contractVersion: 1, entries: [{ key: 'catalog.invalid', definition }], unexpected: true },
  ]
  for (const body of invalidBodies) {
    const response = await request.post('/api/v1/flags/sync', { headers, data: body })
    expect(response.status()).toBe(400)
  }
  const malformed = await request.post('/api/v1/flags/sync', { headers, data: '{' })
  expect(malformed.status()).toBe(400)
  const oversized = await request.post('/api/v1/flags/sync', {
    headers,
    data: 'x'.repeat(4 * 1024 * 1024 + 1),
  })
  expect(oversized.status()).toBe(413)
  const registry = await client.from('flag_registries').select('id').eq('project_id', project)
  const states = await client.from('flag_environment_states').select('environment').eq('project_id', project)
  expect(registry.data).toEqual([])
  expect(states.data).toEqual([])
})

test('flag catalog sync remains available while flag snapshot serving is switched off', async ({
  request,
}) => {
  test.skip(
    process.env.FLAG_DEFINITION_SYNC_ENABLED !== 'true' || process.env.FLAG_SERVING_ENABLED !== 'false',
    'independence proof runs only with sync ON and flag serving OFF'
  )
  const client = db()
  const owner = await fixtureUser(client, 'serving-off')
  const project = await fixtureProject(client, owner, 'serving-off')
  const syncKey = await mintSyncKey(client, project, owner, 'frontend')
  const response = await sync(request, syncKey.plaintext, [{ key: 'catalog.serving-off', definition }])
  expect(response.status()).toBe(200)
  const states = await client.from('flag_environment_states').select('environment').eq('project_id', project)
  expect(states.data).toEqual([])
})

test('database constraints and grants keep flag_sync credentials narrow', async () => {
  const client = db()
  const owner = await fixtureUser(client, 'constraints')
  const project = await fixtureProject(client, owner, 'constraints')
  const incomplete = await client.from('api_keys').insert({
    project_id: project,
    key_hash: hashCredential(key()),
    label: 'missing-source',
    scope: 'flag_sync',
    flag_actor_user_id: owner,
  })
  expect(incomplete.error).not.toBeNull()
  const forgedIngest = await client.from('api_keys').insert({
    project_id: project,
    key_hash: hashCredential(key()),
    label: 'forged-source',
    scope: 'ingest',
    flag_sync_source: 'frontend',
  })
  expect(forgedIngest.error).not.toBeNull()

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
  const anonymous = createClient(requireLocalSupabaseApiUrl(), anon, { auth: { persistSession: false } })
  const denied = await anonymous.rpc('sync_flag_definition_catalog', {
    p_key_hash: 'a'.repeat(64),
    p_entries: [],
  })
  expect(denied.error).not.toBeNull()
  expect(denied.error?.code).toMatch(/42501|PGRST202/)
  expect(denied.error?.message ?? '').toMatch(/function|permission/i)
  expect(denied.error?.message ?? '').not.toMatch(/row-level|RLS/i)
})
