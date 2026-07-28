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
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [{ priority: 1, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' }],
  metadata: { criticality: 'low' },
}

const miyagiDefinition: FlagDefinition = {
  valueType: 'boolean',
  description: 'Disposable static Miyagi control-plane flag.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
  metadata: { source: 'miyagi', polarity: 'enablement', criticality: 'high', enforcement: 'both' },
}

const experimentDefinition = {
  hypothesis: 'A compatible immutable flag version supports a governed experiment.',
  assignmentEntityType: 'merchant',
  eligibility: { description: 'All disposable integration fixtures.' },
  variants: [
    { key: 'off', weight: 1 },
    { key: 'on', weight: 1 },
  ],
  controlVariantKey: 'off',
  primaryMetric: { event: 'flag_binding_fixture_completed', direction: 'increase' as const },
  guardrailMetrics: [],
  segmentFields: [],
  plannedWindow: { startAt: '2026-07-01T00:00:00Z', endAt: '2026-08-01T00:00:00Z' },
  minimumSamplePerVariant: 1,
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
    .insert({
      slug: `flag-serving-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: `h-${crypto.randomUUID()}`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create flag fixture project: ${error?.message}`)
  const projectId = data.id as string
  projectIds.push(projectId)
  const membership = await client
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId, role: 'owner' })
  if (membership.error) throw new Error(`could not make flag fixture owner: ${membership.error.message}`)
  return projectId
}

async function createVersion(
  client: SupabaseClient,
  projectId: string,
  userId: string,
  key: string,
  input: FlagDefinition = definition
) {
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

async function importCatalog(
  client: SupabaseClient,
  projectId: string,
  userId: string,
  entries: Array<{ key: string; definition: FlagDefinition }>
) {
  const { data, error } = await client.rpc('import_flag_definition_catalog', {
    p_project_id: projectId,
    p_entries: entries,
    p_reason: 'fixture catalog import',
    p_actor_user_id: userId,
  })
  return { data: data as Array<{ flag_key: string; version: number; created: boolean }> | null, error }
}

async function createExperimentVersion(client: SupabaseClient, projectId: string, userId: string) {
  const { data, error } = await client.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: 'flag-binding-fixture',
    p_definition: experimentDefinition,
    p_actor_user_id: userId,
  })
  if (error || !data?.[0]) throw new Error(`could not create experiment fixture: ${error?.message}`)
  return data[0] as { experiment_id: string; version_id: string }
}

test.afterAll(async () => {
  await cleanupFlagProjects(projectIds)
  const client = db()
  for (const userId of userIds) await client.auth.admin.deleteUser(userId)
})

test('catalog import is owner-scoped, idempotent, atomic on drift, and never activates a snapshot', async () => {
  const client = db()
  const owner = await fixtureUser(client, 'catalog-owner')
  const stranger = await fixtureUser(client, 'catalog-stranger')
  const project = await fixtureProject(client, owner, 'catalog')
  const entries = [
    { key: 'miyagi.checkout', definition },
    { key: 'miyagi.shipping', definition: { ...definition, description: 'Second disposable import flag.' } },
  ]

  const first = await importCatalog(client, project, owner, entries)
  expect(first.error).toBeNull()
  expect(first.data?.map((row) => row.created)).toEqual([true, true])

  const second = await importCatalog(client, project, owner, entries)
  expect(second.error).toBeNull()
  expect(second.data?.map((row) => row.created)).toEqual([false, false])
  expect(second.data?.map((row) => row.version)).toEqual([1, 1])

  const states = await client.from('flag_environment_states').select('environment').eq('project_id', project)
  const activations = await client
    .from('flag_environment_activations')
    .select('environment')
    .eq('project_id', project)
  expect(states.data).toEqual([])
  expect(activations.data).toEqual([])

  const drift = await importCatalog(client, project, owner, [
    entries[0],
    { key: 'miyagi.shipping', definition: { ...definition, description: 'Conflicting immutable meaning.' } },
  ])
  expect(drift.error).not.toBeNull()
  const versions = await client
    .from('flag_definition_versions')
    .select('version')
    .eq('project_id', project)
    .order('version')
  expect(versions.data).toHaveLength(2)
  expect(versions.data?.map((row) => row.version)).toEqual([1, 1])

  const foreign = await importCatalog(client, project, stranger, entries)
  expect(foreign.error).not.toBeNull()
})

test('flag_admin credentials bind a Miyagi operation to one project/environment and preserve its Clerk actor', async ({
  request,
}) => {
  const client = db()
  const owner = await fixtureUser(client, 'flag-admin-owner')
  const project = await fixtureProject(client, owner, 'flag-admin')
  const version = await createVersion(client, project, owner, 'checkout.fixture', miyagiDefinition)
  const activation = await client.rpc('set_flag_activation', {
    p_project_id: project,
    p_environment: 'production',
    p_flag_id: version.flag_id,
    p_version_id: version.version_id,
    p_expected_snapshot_version: 0,
    p_reason: 'fixture activation',
    p_actor_user_id: owner,
  })
  expect(activation.data?.[0]).toEqual({ snapshot_version: 1, changed: true })

  // A perfectly valid static boolean with a missing source is intentionally absent from this
  // credential's admin snapshot. Required-field checks must be NULL-safe: `<> 'miyagi'` alone
  // evaluates to NULL for this definition and would let it through. The mutation RPC rejects the
  // same class, so the UI can never show a control that it cannot operate.
  const generic = await createVersion(client, project, owner, 'generic.fixture', {
    ...miyagiDefinition,
    description: 'Static generic boolean that Miyagi must not operate.',
    metadata: { criticality: 'high' },
  })
  const genericActivation = await client.rpc('set_flag_activation', {
    p_project_id: project,
    p_environment: 'production',
    p_flag_id: generic.flag_id,
    p_version_id: generic.version_id,
    p_expected_snapshot_version: 1,
    p_reason: 'generic fixture activation',
    p_actor_user_id: owner,
  })
  expect(genericActivation.data?.[0]).toEqual({ snapshot_version: 2, changed: true })

  const adminKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const minted = await client.rpc('create_flag_admin_key', {
    p_project_id: project,
    p_environment: 'production',
    p_key_hash: hashCredential(adminKey),
    p_label: 'fixture Miyagi server',
    p_expires_at: null,
    p_actor_user_id: owner,
  })
  expect(minted.error).toBeNull()

  const before = await client.rpc('get_flag_admin_snapshot', { p_key_hash: hashCredential(adminKey) })
  expect(before.error).toBeNull()
  expect(before.data?.[0]).toMatchObject({
    environment: 'production',
    snapshot_version: 2,
    flags: [
      {
        key: 'checkout.fixture',
        value: false,
        definitionVersion: 1,
        criticality: 'high',
        polarity: 'enablement',
        description: 'Disposable static Miyagi control-plane flag.',
        reason: 'STATIC',
      },
    ],
  })
  // Pin the supported, owner-created missing-source exclusion independently of the snapshot's
  // other fields. `flag_definition_versions` is intentionally immutable and globally validated.
  expect(before.data?.[0]?.flags).toHaveLength(1)
  expect(before.data?.[0]?.flags?.[0]).toMatchObject({
    key: 'checkout.fixture',
    value: false,
    description: 'Disposable static Miyagi control-plane flag.',
  })
  if (process.env.FLAG_SERVING_ENABLED === 'true') {
    const httpBefore = await request.get('/api/v1/flags/admin', {
      headers: { Authorization: `Bearer ${adminKey}` },
    })
    expect(httpBefore.status()).toBe(200)
    expect(httpBefore.headers()['cache-control']).toBe('no-store')
    expect((await httpBefore.json()).flags).toEqual(before.data?.[0]?.flags)
  }

  // The normal creation path correctly rejects these legacy/corrupt shapes (and the immutable
  // table denies direct rewrites), so exercise the shared predicate without mutating a version.
  // Compatibility metadata/description is harmless; a non-array variants property fails closed
  // before the snapshot's LATERAL jsonb_array_elements expansion can run.
  const compatibleLegacyDefinition = {
    valueType: 'boolean',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false, presentation: { label: 'Disabled' } },
      { key: 'on', value: true, presentation: { label: 'Enabled' } },
    ],
    rules: [],
    metadata: { source: 'miyagi', polarity: null, criticality: 'legacy-unknown' },
  }
  const malformedVariantsDefinition = {
    valueType: 'boolean',
    description: 'Malformed historical fixture that Miyagi must not operate.',
    defaultVariantKey: 'off',
    variants: null,
    rules: [],
    metadata: { source: 'miyagi', polarity: 'enablement', criticality: 'high' },
  }
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    const predicate = await pg.query<{ compatible: boolean; malformed: boolean }>(
      `SELECT private.is_static_miyagi_boolean_definition($1::jsonb) AS compatible,
              private.is_static_miyagi_boolean_definition($2::jsonb) AS malformed`,
      [JSON.stringify(compatibleLegacyDefinition), JSON.stringify(malformedVariantsDefinition)]
    )
    expect(predicate.rows[0]).toEqual({ compatible: true, malformed: false })
  } finally {
    await pg.end()
  }

  const nonOperable = await client.rpc('set_flag_admin_boolean', {
    p_key_hash: hashCredential(adminKey),
    p_flag_key: 'generic.fixture',
    p_enabled: true,
    p_expected_snapshot_version: 2,
    p_reason: 'generic mutation must be rejected',
    p_external_actor_id: 'user_FixtureClerkActor',
  })
  // The Golden route maps this command-class error to HTTP 400. The database assertion pins the
  // source error too, so a future wrapper cannot mistake a non-operable generic flag for an outage.
  expect(nonOperable.error?.code).toBe('22023')

  const changed = await client.rpc('set_flag_admin_boolean', {
    p_key_hash: hashCredential(adminKey),
    p_flag_key: 'checkout.fixture',
    p_enabled: true,
    p_expected_snapshot_version: 2,
    p_reason: 'Miyagi admin fixture flip',
    p_external_actor_id: 'user_FixtureClerkActor',
  })
  expect(changed.error).toBeNull()
  expect(changed.data?.[0]).toEqual({ snapshot_version: 3, definition_version: 2, changed: true })

  const after = await client.rpc('get_flag_admin_snapshot', { p_key_hash: hashCredential(adminKey) })
  expect(after.error).toBeNull()
  // The snapshot contract must faithfully expose BOTH default variants: `off` before this mutation
  // and `on` after it. A JSONB array index derived from WITH ORDINALITY would invert/break this.
  expect(after.data?.[0]?.flags).toEqual([
    expect.objectContaining({
      key: 'checkout.fixture',
      value: true,
      definitionVersion: 2,
      criticality: 'high',
      polarity: 'enablement',
      reason: 'STATIC',
    }),
  ])

  const stale = await client.rpc('set_flag_admin_boolean', {
    p_key_hash: hashCredential(adminKey),
    p_flag_key: 'checkout.fixture',
    p_enabled: false,
    p_expected_snapshot_version: 2,
    p_reason: 'deliberately stale fixture flip',
    p_external_actor_id: 'user_FixtureClerkActor',
  })
  expect(stale.error?.code).toBe('P0001')

  const audit = await client
    .from('flag_lifecycle_audit')
    .select('action,actor_user_id,external_actor_id,new_version_id')
    .eq('project_id', project)
    .eq('action', 'activated')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  expect(audit.error).toBeNull()
  expect(audit.data).toMatchObject({
    actor_user_id: owner,
    external_actor_id: 'user_FixtureClerkActor',
  })
  expect(audit.data?.new_version_id).toBeTruthy()

  const readKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const readMint = await client.rpc('create_flag_read_key', {
    p_project_id: project,
    p_environment: 'production',
    p_key_hash: hashCredential(readKey),
    p_label: 'wrong credential class',
    p_expires_at: null,
    p_actor_user_id: owner,
  })
  expect(readMint.error).toBeNull()
  const wrongScope = await client.rpc('get_flag_admin_snapshot', { p_key_hash: hashCredential(readKey) })
  expect(wrongScope.error).toBeNull()
  expect(wrongScope.data).toEqual([])
})

test('credential-scoped snapshot is ETagged, monotonic, audit-backed, and cannot cross project or scope', async ({
  request,
}) => {
  test.skip(
    process.env.FLAG_SERVING_ENABLED !== 'true',
    'enabled snapshot assertions run only in the owned enabled-gate pass'
  )
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
  const wildcardNotModified = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: `Bearer ${readKey}`, 'If-None-Match': '"other", *' },
  })
  expect(wildcardNotModified.status()).toBe(304)

  // A different project's version cannot be used as A's activation pointer, and the stale expected
  // revision cannot win after A has moved once.
  const foreign = await client.rpc('set_flag_activation', {
    p_project_id: projectA,
    p_environment: 'production',
    p_flag_id: aV1.flag_id,
    p_version_id: bV1.version_id,
    p_expected_snapshot_version: 1,
    p_reason: 'cross-project attempt',
    p_actor_user_id: ownerA,
  })
  expect(foreign.error).toBeNull()
  expect(foreign.data).toEqual([])
  const aV2 = await createVersion(client, projectA, ownerA, 'checkout.fixture', {
    ...definition,
    description: 'Second immutable fixture version.',
  })
  const stale = await client.rpc('set_flag_activation', {
    p_project_id: projectA,
    p_environment: 'production',
    p_flag_id: aV1.flag_id,
    p_version_id: aV2.version_id,
    p_expected_snapshot_version: 0,
    p_reason: 'stale attempt',
    p_actor_user_id: ownerA,
  })
  // A stale revision is a normal application conflict. It must not use SQLSTATE 40001:
  // PostgREST treats the retryable-transaction class specially and can hold the request open.
  expect(stale.error?.code).toBe('P0001')
  const moved = await client.rpc('set_flag_activation', {
    p_project_id: projectA,
    p_environment: 'production',
    p_flag_id: aV1.flag_id,
    p_version_id: aV2.version_id,
    p_expected_snapshot_version: 1,
    p_reason: 'fixture version upgrade',
    p_actor_user_id: ownerA,
  })
  expect(moved.data?.[0]).toEqual({ snapshot_version: 2, changed: true })

  const second = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: `Bearer ${readKey}` },
  })
  expect(second.headers().etag).toBe('"gbfs-2"')
  expect((await second.json()).flags[0].definitionVersion).toBe(2)

  const ingestKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const inserted = await client.from('api_keys').insert({
    project_id: projectA,
    key_hash: hashCredential(ingestKey),
    label: 'fixture ingest scope',
    scope: 'ingest',
  })
  expect(inserted.error).toBeNull()
  const wrongScope = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: `Bearer ${ingestKey}` },
  })
  const unknown = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: 'Bearer definitely-not-a-real-key' },
  })
  expect(wrongScope.status()).toBe(401)
  expect(await wrongScope.json()).toEqual(await unknown.json())

  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await expect(
      pg.query(
        "UPDATE public.flag_definition_versions SET definition = jsonb_set(definition, '{description}', '\"rewritten\"'::jsonb) WHERE id = $1",
        [aV2.version_id]
      )
    ).rejects.toMatchObject({ code: '55000' })
    await expect(
      pg.query('DELETE FROM public.flag_definition_versions WHERE id = $1', [aV2.version_id])
    ).rejects.toMatchObject({ code: '55000' })
  } finally {
    await pg.end()
  }

  const audit = await client
    .from('flag_lifecycle_audit')
    .select('action,old_version_id,new_version_id,actor_user_id,reason')
    .eq('project_id', projectA)
    .order('created_at')
  expect(audit.error).toBeNull()
  expect(audit.data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: 'activated',
        old_version_id: aV1.version_id,
        new_version_id: aV2.version_id,
        actor_user_id: ownerA,
        reason: 'fixture version upgrade',
      }),
    ])
  )

  const revoked = await client.rpc('revoke_flag_read_key', {
    p_project_id: projectA,
    p_key_id: keyId,
    p_actor_user_id: ownerA,
  })
  expect(revoked.data).toBe(true)
  const afterRevoke = await request.get('/api/v1/flags/snapshot', {
    headers: { Authorization: `Bearer ${readKey}` },
  })
  expect(afterRevoke.status()).toBe(401)
})

test('an experiment binds one exact compatible same-project flag version with retained evidence', async () => {
  const client = db()
  const ownerA = await fixtureUser(client, 'binding-a')
  const ownerB = await fixtureUser(client, 'binding-b')
  const projectA = await fixtureProject(client, ownerA, 'binding-a')
  const projectB = await fixtureProject(client, ownerB, 'binding-b')
  const experiment = await createExperimentVersion(client, projectA, ownerA)
  const compatible = await createVersion(client, projectA, ownerA, 'bound.fixture')
  const foreign = await createVersion(client, projectB, ownerB, 'bound.fixture')
  const incompatible = await createVersion(client, projectA, ownerA, 'incompatible.fixture', {
    ...definition,
    variants: [
      { key: 'off', value: false },
      { key: 'other', value: true },
    ],
    defaultVariantKey: 'off',
    rules: [],
  })

  const bound = await client.rpc('bind_experiment_flag_version', {
    p_project_id: projectA,
    p_experiment_id: experiment.experiment_id,
    p_experiment_version_id: experiment.version_id,
    p_flag_id: compatible.flag_id,
    p_flag_version_id: compatible.version_id,
    p_actor_user_id: ownerA,
  })
  expect(bound.error).toBeNull()
  expect(bound.data?.[0]).toEqual(
    expect.objectContaining({
      project_id: projectA,
      experiment_id: experiment.experiment_id,
      experiment_version_id: experiment.version_id,
      flag_id: compatible.flag_id,
      flag_version_id: compatible.version_id,
      created: true,
    })
  )

  const retry = await client.rpc('bind_experiment_flag_version', {
    p_project_id: projectA,
    p_experiment_id: experiment.experiment_id,
    p_experiment_version_id: experiment.version_id,
    p_flag_id: compatible.flag_id,
    p_flag_version_id: compatible.version_id,
    p_actor_user_id: ownerA,
  })
  expect(retry.error).toBeNull()
  expect(retry.data?.[0]?.created).toBe(false)

  const crossProject = await client.rpc('bind_experiment_flag_version', {
    p_project_id: projectA,
    p_experiment_id: experiment.experiment_id,
    p_experiment_version_id: experiment.version_id,
    p_flag_id: foreign.flag_id,
    p_flag_version_id: foreign.version_id,
    p_actor_user_id: ownerA,
  })
  expect(crossProject.error).toBeNull()
  expect(crossProject.data).toEqual([])

  const incompatibleResult = await client.rpc('bind_experiment_flag_version', {
    p_project_id: projectA,
    p_experiment_id: experiment.experiment_id,
    p_experiment_version_id: experiment.version_id,
    p_flag_id: incompatible.flag_id,
    p_flag_version_id: incompatible.version_id,
    p_actor_user_id: ownerA,
  })
  expect(incompatibleResult.error?.code).toBe('22023')

  const bindingId = bound.data?.[0]?.binding_id as string
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await expect(
      pg.query('UPDATE public.experiment_flag_version_bindings SET created_by = $2 WHERE id = $1', [
        bindingId,
        ownerB,
      ])
    ).rejects.toMatchObject({ code: '55000' })
    await expect(
      pg.query('DELETE FROM public.experiment_flag_version_bindings WHERE id = $1', [bindingId])
    ).rejects.toMatchObject({ code: '55000' })
  } finally {
    await pg.end()
  }

  const audit = await client
    .from('experiment_flag_binding_audit')
    .select('project_id,experiment_version_id,flag_version_id,actor_user_id')
    .eq('project_id', projectA)
    .single()
  expect(audit.error).toBeNull()
  expect(audit.data).toEqual({
    project_id: projectA,
    experiment_version_id: experiment.version_id,
    flag_version_id: compatible.version_id,
    actor_user_id: ownerA,
  })
})
