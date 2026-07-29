import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import { hashCredential } from '@/lib/credential-hash'
import { requireLocalSupabaseApiUrl, requireTestDatabaseUrl } from './helpers/test-db-cleanup'

const ACTOR = 'user_ScenarioFixture'
const projectIds: string[] = []
const userIds: string[] = []

const closedFaultFlag = {
  valueType: 'json',
  description: 'Disposable closed resilience payload.',
  defaultVariantKey: 'control',
  variants: [
    { key: 'control', value: { kind: 'none' } },
    { key: 'delay', value: { kind: 'delay', delayMs: 25 } },
    {
      key: 'synthetic_error',
      value: { kind: 'synthetic_error', errorCode: 'GB_RESILIENCE_503' },
    },
  ],
  rules: [
    {
      priority: 1,
      clauses: [{ field: 'source', operator: 'equals', value: 'internal' }],
      variantKey: 'delay',
    },
  ],
}

function db(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  requireTestDatabaseUrl()
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function fixtureUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `scenario-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-scenario-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create scenario user: ${error?.message}`)
  userIds.push(data.user.id)
  return data.user.id
}

async function fixtureProject(client: SupabaseClient, userId: string, label: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({
      slug: `scenario-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: hashCredential(`fixture-${crypto.randomUUID()}`),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create scenario project: ${error?.message}`)
  const projectId = data.id as string
  projectIds.push(projectId)
  const membership = await client
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId, role: 'owner' })
  if (membership.error) throw new Error(`could not create scenario owner: ${membership.error.message}`)
  return projectId
}

async function fixtureCredentials(client: SupabaseClient, projectId: string, ownerId: string, label: string) {
  const adminKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const readKey = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  const admin = await client.rpc('create_flag_admin_key', {
    p_project_id: projectId,
    p_environment: 'production',
    p_key_hash: hashCredential(adminKey),
    p_label: `${label} scenario admin`,
    p_expires_at: null,
    p_actor_user_id: ownerId,
  })
  if (admin.error) throw new Error(`could not mint scenario admin key: ${admin.error.message}`)
  const read = await client.rpc('create_flag_read_key', {
    p_project_id: projectId,
    p_environment: 'production',
    p_key_hash: hashCredential(readKey),
    p_label: `${label} scenario reader`,
    p_expires_at: null,
    p_actor_user_id: ownerId,
  })
  if (read.error) throw new Error(`could not mint scenario read key: ${read.error.message}`)
  return { adminKey, readKey }
}

async function fixtureFlag(client: SupabaseClient, projectId: string, ownerId: string, key: string) {
  const { data, error } = await client.rpc('create_flag_definition_version', {
    p_project_id: projectId,
    p_flag_key: key,
    p_definition: closedFaultFlag,
    p_reason: 'scenario fixture flag',
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create scenario flag: ${error?.message}`)
  return data[0] as { flag_id: string; version_id: string; version: number }
}

async function fixtureExperiment(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  key: string,
  flag: { flag_id: string; version_id: string }
) {
  const now = Date.now()
  const { data, error } = await client.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: key,
    p_definition: {
      hypothesis: 'A bounded resilience fault changes the internal probe outcome.',
      assignmentEntityType: 'probe',
      eligibility: { description: 'Synthetic internal resilience subjects only.' },
      variants: [
        { key: 'control', weight: 1 },
        { key: 'delay', weight: 1 },
        { key: 'synthetic_error', weight: 1 },
      ],
      controlVariantKey: 'control',
      primaryMetric: { event: 'probe_completed', direction: 'increase' },
      guardrailMetrics: [{ event: 'probe_failed', direction: 'decrease' }],
      segmentFields: [],
      plannedWindow: {
        startAt: new Date(now - 60_000).toISOString(),
        endAt: new Date(now + 30 * 60_000).toISOString(),
      },
      minimumSamplePerVariant: 1,
    },
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create scenario experiment: ${error?.message}`)
  const version = data[0] as { experiment_id: string; version_id: string; version: number }
  const binding = await client.rpc('bind_experiment_flag_version', {
    p_project_id: projectId,
    p_experiment_id: version.experiment_id,
    p_experiment_version_id: version.version_id,
    p_flag_id: flag.flag_id,
    p_flag_version_id: flag.version_id,
    p_actor_user_id: ownerId,
  })
  if (binding.error) throw new Error(`could not bind scenario experiment: ${binding.error.message}`)
  const started = await client.rpc('transition_experiment_version', {
    p_project_id: projectId,
    p_experiment_id: version.experiment_id,
    p_version_id: version.version_id,
    p_target_status: 'running',
    p_actor_user_id: ownerId,
  })
  if (started.error) throw new Error(`could not start scenario experiment: ${started.error.message}`)
  return version
}

async function fixtureTarget(client: SupabaseClient, adminKey: string, label: string) {
  const challengeHash = hashCredential(`challenge-${crypto.randomUUID()}`)
  const targetKey = `miyagi.${label}.probe`
  const registered = await client.rpc('register_scenario_target', {
    p_key_hash: hashCredential(adminKey),
    p_target_key: targetKey,
    p_target_kind: 'miyagi_resilience_probe_v1',
    p_origin: `https://${label}.example.test`,
    p_ownership_challenge_hash: challengeHash,
    p_reason: 'register fixture target',
    p_external_actor_id: ACTOR,
  })
  if (registered.error || !registered.data?.[0]) {
    throw new Error(`could not register scenario target: ${registered.error?.message}`)
  }
  const targetId = registered.data[0].target_id as string
  const verified = await client.rpc('verify_scenario_target', {
    p_key_hash: hashCredential(adminKey),
    p_target_id: targetId,
    p_expected_challenge_hash: challengeHash,
    p_reason: 'fixture ownership challenge observed through guarded transport',
    p_external_actor_id: ACTOR,
  })
  if (verified.error || verified.data?.[0]?.status !== 'verified') {
    throw new Error(`could not verify scenario target: ${verified.error?.message}`)
  }
  return { targetId, targetKey, challengeHash }
}

function scenarioDefinition({
  targetKey,
  flagKey,
  startAt = new Date(Date.now() - 60_000).toISOString(),
  expiresAt = new Date(Date.now() + 30 * 60_000).toISOString(),
  kind = 'resilience',
  cohort = 'internal',
  requestCap = 3,
  concurrencyCap = 2,
  leaseTtlSeconds = 10,
  abortAfterFailures = 1,
  maxErrorRateBasisPoints = 10_000,
  securityTemplate = 'malformed_payload_v1',
  experiment,
}: {
  targetKey: string
  flagKey: string
  startAt?: string
  expiresAt?: string
  kind?: 'resilience' | 'security'
  cohort?: 'synthetic' | 'internal' | 'external'
  requestCap?: number
  concurrencyCap?: number
  leaseTtlSeconds?: number
  abortAfterFailures?: number
  maxErrorRateBasisPoints?: number
  securityTemplate?:
    'malformed_payload_v1' | 'rate_limit_v1' | 'invalid_credential_v1' | 'revoked_credential_v1'
  experiment?: { key: string; definitionVersion: number }
}) {
  return {
    contractVersion: 1,
    kind,
    targetKey,
    environment: 'production',
    cohort,
    startAt,
    expiresAt,
    limits: { requestCap, concurrencyCap, leaseTtlSeconds },
    guardrails: { abortAfterFailures, maxErrorRateBasisPoints },
    flag: { key: flagKey, definitionVersion: 1 },
    ...(experiment ? { experiment } : {}),
    ...(kind === 'security' ? { securityTemplate } : {}),
  }
}

async function createScenario(
  client: SupabaseClient,
  adminKey: string,
  key: string,
  definition: ReturnType<typeof scenarioDefinition>
) {
  const { data, error } = await client.rpc('create_scenario_definition_version', {
    p_key_hash: hashCredential(adminKey),
    p_scenario_key: key,
    p_definition: definition,
    p_reason: 'create fixture scenario',
    p_external_actor_id: ACTOR,
  })
  if (error || !data?.[0]) throw new Error(`could not create scenario: ${error?.message}`)
  return data[0] as {
    scenario_id: string
    scenario_version_id: string
    version: number
  }
}

async function createRun(client: SupabaseClient, adminKey: string, versionId: string) {
  const { data, error } = await client.rpc('create_scenario_run', {
    p_key_hash: hashCredential(adminKey),
    p_scenario_version_id: versionId,
    p_reason: 'create fixture run',
    p_external_actor_id: ACTOR,
  })
  if (error || !data?.[0]) throw new Error(`could not create scenario run: ${error?.message}`)
  return data[0] as { run_id: string; revision: number }
}

async function cleanupFixtures() {
  if (projectIds.length > 0) {
    const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
    await pg.connect()
    try {
      await pg.query('BEGIN')
      await pg.query('DELETE FROM public.audit_log WHERE project_id = ANY($1::uuid[])', [projectIds])
      await pg.query('DELETE FROM public.projects WHERE id = ANY($1::uuid[])', [projectIds])
      await pg.query('DELETE FROM public.scenario_impact_evidence WHERE project_id = ANY($1::uuid[])', [
        projectIds,
      ])
      await pg.query('DELETE FROM public.scenario_lifecycle_audit WHERE project_id = ANY($1::uuid[])', [
        projectIds,
      ])
      await pg.query('DELETE FROM public.flag_lifecycle_audit WHERE project_id = ANY($1::uuid[])', [
        projectIds,
      ])
      await pg.query('DELETE FROM public.experiment_flag_binding_audit WHERE project_id = ANY($1::uuid[])', [
        projectIds,
      ])
      await pg.query('COMMIT')
    } catch (error) {
      await pg.query('ROLLBACK')
      throw error
    } finally {
      await pg.end()
    }
  }
  const client = db()
  for (const userId of userIds) await client.auth.admin.deleteUser(userId)
}

test.afterAll(cleanupFixtures)

test('scenario lifecycle is tenant-bound, snapshot-safe, CAS-controlled, and globally capped', async () => {
  const client = db()
  const ownerA = await fixtureUser(client, 'lifecycle-a')
  const ownerB = await fixtureUser(client, 'lifecycle-b')
  const projectA = await fixtureProject(client, ownerA, 'lifecycle-a')
  const projectB = await fixtureProject(client, ownerB, 'lifecycle-b')
  const credentialsA = await fixtureCredentials(client, projectA, ownerA, 'lifecycle-a')
  const credentialsB = await fixtureCredentials(client, projectB, ownerB, 'lifecycle-b')
  await fixtureFlag(client, projectA, ownerA, 'scenario.lifecycle_probe')
  const target = await fixtureTarget(client, credentialsA.adminKey, 'lifecycle')
  const foreignTarget = await fixtureTarget(client, credentialsB.adminKey, 'foreign-lifecycle')
  const version = await createScenario(
    client,
    credentialsA.adminKey,
    'lifecycle_probe',
    scenarioDefinition({ targetKey: target.targetKey, flagKey: 'scenario.lifecycle_probe' })
  )
  const draft = await createRun(client, credentialsA.adminKey, version.scenario_version_id)
  const started = await client.rpc('start_scenario_run', {
    p_key_hash: hashCredential(credentialsA.adminKey),
    p_run_id: draft.run_id,
    p_expected_revision: draft.revision,
    p_reason: 'start fixture run',
    p_external_actor_id: ACTOR,
  })
  expect(started.error).toBeNull()
  expect(started.data?.[0]).toMatchObject({ revision: 2, changed: true })

  const stale = await client.rpc('transition_scenario_run', {
    p_key_hash: hashCredential(credentialsA.adminKey),
    p_run_id: draft.run_id,
    p_expected_revision: 1,
    p_transition: 'stop',
    p_reason: 'stale transition must not win',
    p_external_actor_id: ACTOR,
  })
  expect(stale.error?.code).toBe('P0001')

  const snapshot = await client.rpc('get_scenario_read_snapshot', {
    p_key_hash: hashCredential(credentialsA.readKey),
  })
  expect(snapshot.error).toBeNull()
  expect(snapshot.data?.[0]?.snapshot_version).toBeGreaterThan(1)
  const entry = snapshot.data?.[0]?.scenarios?.[0] as Record<string, unknown>
  expect(entry).toMatchObject({
    scenarioKey: 'lifecycle_probe',
    scenarioVersion: 1,
    runId: draft.run_id,
    runRevision: 2,
    targetKey: target.targetKey,
  })
  expect(entry).not.toHaveProperty('experiment')
  expect(entry).not.toHaveProperty('origin')
  expect(JSON.stringify(entry)).not.toContain(target.challengeHash)

  const admin = await client.rpc('get_scenario_admin_snapshot', {
    p_key_hash: hashCredential(credentialsA.adminKey),
  })
  expect(admin.error).toBeNull()
  expect(admin.data?.[0]?.targets?.[0]).toMatchObject({
    id: target.targetId,
    key: target.targetKey,
    origin: 'https://lifecycle.example.test',
    status: 'verified',
  })
  expect(JSON.stringify(admin.data?.[0])).not.toContain('ownership_challenge_hash')
  expect(JSON.stringify(admin.data?.[0])).not.toContain(target.challengeHash)
  expect(JSON.stringify(admin.data?.[0])).not.toContain(foreignTarget.targetId)
  expect(JSON.stringify(admin.data?.[0])).not.toContain(foreignTarget.targetKey)
  const startedAudit = (admin.data?.[0]?.audit as Array<Record<string, unknown>>).find(
    (entry) => entry.action === 'run_started'
  )
  expect(Object.keys(startedAudit ?? {}).sort()).toEqual(
    [
      'id',
      'scenarioId',
      'scenarioVersionId',
      'runId',
      'targetId',
      'action',
      'actorUserId',
      'externalActorId',
      'reason',
      'metadata',
      'createdAt',
    ].sort()
  )
  expect(startedAudit).toMatchObject({
    scenarioId: version.scenario_id,
    scenarioVersionId: version.scenario_version_id,
    runId: draft.run_id,
    targetId: target.targetId,
    action: 'run_started',
    externalActorId: ACTOR,
  })

  const foreignSnapshot = await client.rpc('get_scenario_read_snapshot', {
    p_key_hash: hashCredential(credentialsB.readKey),
  })
  expect(foreignSnapshot.data?.[0]?.scenarios).toEqual([])
  const foreignReserve = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsB.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  expect(foreignReserve.error).toBeNull()
  expect(foreignReserve.data).toEqual([])

  const first = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  const second = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  const concurrent = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  expect(first.data?.[0]).toMatchObject({ admitted: true, reason: 'ADMITTED' })
  expect(second.data?.[0]).toMatchObject({ admitted: true, reason: 'ADMITTED' })
  expect(concurrent.data?.[0]).toMatchObject({ admitted: false, reason: 'CONCURRENCY_CAP' })

  const settledFirst = await client.rpc('settle_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_lease_id: first.data?.[0]?.lease_id,
    p_succeeded: true,
  })
  expect(settledFirst.data?.[0]).toMatchObject({
    settled: true,
    run_status: 'running',
    success_count: 1,
  })
  const third = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  expect(third.data?.[0]).toMatchObject({ admitted: true, reason: 'ADMITTED' })
  const capped = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_expected_run_revision: 2,
  })
  expect(capped.data?.[0]).toMatchObject({ admitted: false, reason: 'REQUEST_CAP' })

  const settledSecond = await client.rpc('settle_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_lease_id: second.data?.[0]?.lease_id,
    p_succeeded: true,
  })
  expect(settledSecond.data?.[0]).toMatchObject({ run_status: 'running', success_count: 2 })
  const tripped = await client.rpc('settle_scenario_execution', {
    p_key_hash: hashCredential(credentialsA.readKey),
    p_run_id: draft.run_id,
    p_lease_id: third.data?.[0]?.lease_id,
    p_succeeded: false,
  })
  expect(tripped.data?.[0]).toMatchObject({
    settled: true,
    run_status: 'aborted',
    active_lease_count: 0,
    success_count: 2,
    failure_count: 1,
  })
  expect(tripped.data?.[0]?.run_revision).toBe(3)

  const afterAbort = await client.rpc('get_scenario_read_snapshot', {
    p_key_hash: hashCredential(credentialsA.readKey),
  })
  expect(afterAbort.data?.[0]?.scenarios).toEqual([])
  const runAudit = await client
    .from('scenario_lifecycle_audit')
    .select('external_actor_id')
    .eq('project_id', projectA)
    .eq('action', 'run_started')
    .single()
  expect(runAudit.data?.external_actor_id).toBe(ACTOR)

  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await pg.query(
      `INSERT INTO public.scenario_lifecycle_audit(
         project_id, action, actor_user_id, external_actor_id, reason, metadata, created_at
       )
       SELECT $1, 'target_registered', $2, $3, 'Bounded admin audit fixture.',
              jsonb_build_object('fixtureSequence', fixture),
              statement_timestamp() + fixture * INTERVAL '1 millisecond'
       FROM generate_series(1, 105) AS fixture`,
      [projectA, ownerA, ACTOR]
    )
  } finally {
    await pg.end()
  }
  const boundedAdmin = await client.rpc('get_scenario_admin_snapshot', {
    p_key_hash: hashCredential(credentialsA.adminKey),
  })
  const boundedAudit = boundedAdmin.data?.[0]?.audit as Array<{
    metadata: { fixtureSequence?: number }
  }>
  expect(boundedAudit).toHaveLength(100)
  expect(boundedAudit[0]?.metadata.fixtureSequence).toBe(105)
  expect(boundedAudit[99]?.metadata.fixtureSequence).toBe(6)
  expect(JSON.stringify(boundedAudit)).not.toContain(foreignTarget.targetId)
})

test('external production security needs both immutable owner approvals', async () => {
  const client = db()
  const owner = await fixtureUser(client, 'security')
  const project = await fixtureProject(client, owner, 'security')
  const credentials = await fixtureCredentials(client, project, owner, 'security')
  await fixtureFlag(client, project, owner, 'scenario.security_probe')
  const target = await fixtureTarget(client, credentials.adminKey, 'security')
  const version = await createScenario(
    client,
    credentials.adminKey,
    'security_probe',
    scenarioDefinition({
      targetKey: target.targetKey,
      flagKey: 'scenario.security_probe',
      kind: 'security',
      cohort: 'external',
    })
  )
  const run = await createRun(client, credentials.adminKey, version.scenario_version_id)
  const start = () =>
    client.rpc('start_scenario_run', {
      p_key_hash: hashCredential(credentials.adminKey),
      p_run_id: run.run_id,
      p_expected_revision: run.revision,
      p_reason: 'security approval fixture',
      p_external_actor_id: ACTOR,
    })

  expect((await start()).error?.code).toBe('42501')
  const external = await client.rpc('approve_scenario_definition', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_scenario_version_id: version.scenario_version_id,
    p_approval_kind: 'external_cohort',
    p_reason: 'explicit external cohort fixture approval',
    p_external_actor_id: ACTOR,
  })
  expect(external.data?.[0]?.created).toBe(true)
  expect((await start()).error?.code).toBe('42501')
  const productionSecurity = await client.rpc('approve_scenario_definition', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_scenario_version_id: version.scenario_version_id,
    p_approval_kind: 'production_security',
    p_reason: 'explicit production security fixture approval',
    p_external_actor_id: ACTOR,
  })
  expect(productionSecurity.data?.[0]?.created).toBe(true)
  const started = await start()
  expect(started.data?.[0]).toMatchObject({ revision: 2, changed: true })

  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await expect(
      pg.query('UPDATE public.scenario_owner_approvals SET reason = $1 WHERE id = $2', [
        'rewritten',
        external.data?.[0]?.approval_id,
      ])
    ).rejects.toMatchObject({ code: '55000' })

    const readCredentialCannotRun = await client.rpc('reserve_security_scenario_execution', {
      p_key_hash: hashCredential(credentials.readKey),
      p_run_id: run.run_id,
      p_expected_run_revision: 2,
    })
    expect(readCredentialCannotRun.error).toBeNull()
    expect(readCredentialCannotRun.data).toEqual([])

    const reserved = await client.rpc('reserve_security_scenario_execution', {
      p_key_hash: hashCredential(credentials.adminKey),
      p_run_id: run.run_id,
      p_expected_run_revision: 2,
    })
    expect(reserved.data?.[0]).toMatchObject({
      admitted: true,
      reason: 'ADMITTED',
      target_key: target.targetKey,
      target_origin: 'https://security.example.test',
      template: 'malformed_payload_v1',
      request_units: 1,
    })
    const settled = await client.rpc('settle_security_scenario_execution', {
      p_key_hash: hashCredential(credentials.adminKey),
      p_run_id: run.run_id,
      p_lease_id: reserved.data?.[0]?.lease_id,
      p_observed_statuses: [400],
      p_latency_ms: 25,
    })
    expect(settled.data?.[0]).toMatchObject({
      observed_outcome: 'validation_rejected',
      succeeded: true,
      settled: true,
      reason: 'SETTLED',
    })
    const duplicateSettlement = await client.rpc('settle_security_scenario_execution', {
      p_key_hash: hashCredential(credentials.adminKey),
      p_run_id: run.run_id,
      p_lease_id: reserved.data?.[0]?.lease_id,
      p_observed_statuses: [500],
      p_latency_ms: 50,
    })
    expect(duplicateSettlement.data?.[0]).toMatchObject({
      result_id: settled.data?.[0]?.result_id,
      observed_outcome: 'validation_rejected',
      succeeded: true,
      settled: false,
      reason: 'ALREADY_SETTLED',
    })
    const cooldown = await client.rpc('reserve_security_scenario_execution', {
      p_key_hash: hashCredential(credentials.adminKey),
      p_run_id: run.run_id,
      p_expected_run_revision: 2,
    })
    expect(cooldown.data?.[0]).toMatchObject({
      admitted: false,
      reason: 'COOLDOWN',
    })
    const results = await client.rpc('get_scenario_security_results', {
      p_key_hash: hashCredential(credentials.adminKey),
    })
    expect(results.data?.[0]?.results?.[0]).toMatchObject({
      id: settled.data?.[0]?.result_id,
      scenarioVersionId: version.scenario_version_id,
      runId: run.run_id,
      template: 'malformed_payload_v1',
      expectedOutcome: 'validation_rejected',
      observedOutcome: 'validation_rejected',
      observedStatuses: [400],
      succeeded: true,
      latencyMs: 25,
    })
    expect(JSON.stringify(results.data?.[0])).not.toContain('https://security.example.test')
    expect(JSON.stringify(results.data?.[0])).not.toContain(target.challengeHash)
    await expect(
      pg.query('UPDATE public.scenario_security_results SET latency_ms = 1 WHERE id = $1', [
        settled.data?.[0]?.result_id,
      ])
    ).rejects.toMatchObject({ code: '55000' })
  } finally {
    await pg.end()
  }
  const stopped = await client.rpc('transition_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: run.run_id,
    p_expected_revision: 2,
    p_transition: 'stop',
    p_reason: 'security fixture cleanup',
    p_external_actor_id: ACTOR,
  })
  expect(stopped.data?.[0]).toMatchObject({ revision: 3, changed: true })

  const rateVersion = await createScenario(
    client,
    credentials.adminKey,
    'security_rate_probe',
    scenarioDefinition({
      targetKey: target.targetKey,
      flagKey: 'scenario.security_probe',
      kind: 'security',
      cohort: 'internal',
      securityTemplate: 'rate_limit_v1',
      requestCap: 3,
      abortAfterFailures: 10,
    })
  )
  const rateApproval = await client.rpc('approve_scenario_definition', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_scenario_version_id: rateVersion.scenario_version_id,
    p_approval_kind: 'production_security',
    p_reason: 'explicit rate-template fixture approval',
    p_external_actor_id: ACTOR,
  })
  expect(rateApproval.data?.[0]?.created).toBe(true)
  const rateRun = await createRun(client, credentials.adminKey, rateVersion.scenario_version_id)
  const rateStart = await client.rpc('start_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: rateRun.run_id,
    p_expected_revision: 1,
    p_reason: 'start bounded rate fixture',
    p_external_actor_id: ACTOR,
  })
  expect(rateStart.data?.[0]?.revision).toBe(2)
  const rateReserve = await client.rpc('reserve_security_scenario_execution', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: rateRun.run_id,
    p_expected_run_revision: 2,
  })
  expect(rateReserve.data?.[0]).toMatchObject({
    admitted: true,
    template: 'rate_limit_v1',
    request_units: 3,
  })
  const rateCapped = await client.rpc('reserve_security_scenario_execution', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: rateRun.run_id,
    p_expected_run_revision: 2,
  })
  expect(rateCapped.data?.[0]).toMatchObject({
    admitted: false,
    reason: 'REQUEST_CAP',
  })
  const rateSettled = await client.rpc('settle_security_scenario_execution', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: rateRun.run_id,
    p_lease_id: rateReserve.data?.[0]?.lease_id,
    p_observed_statuses: [204, 204, 429],
    p_latency_ms: 75,
  })
  expect(rateSettled.data?.[0]).toMatchObject({
    observed_outcome: 'rate_limited',
    succeeded: true,
  })
  await client.rpc('transition_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: rateRun.run_id,
    p_expected_revision: 2,
    p_transition: 'stop',
    p_reason: 'rate fixture cleanup',
    p_external_actor_id: ACTOR,
  })
})

test('expired leases are reclaimed and scenario TTL lazily resolves to control', async () => {
  const client = db()
  const owner = await fixtureUser(client, 'expiry')
  const project = await fixtureProject(client, owner, 'expiry')
  const credentials = await fixtureCredentials(client, project, owner, 'expiry')
  await fixtureFlag(client, project, owner, 'scenario.expiry_probe')
  const target = await fixtureTarget(client, credentials.adminKey, 'expiry')
  const version = await createScenario(
    client,
    credentials.adminKey,
    'expiry_probe',
    scenarioDefinition({
      targetKey: target.targetKey,
      flagKey: 'scenario.expiry_probe',
      requestCap: 3,
      concurrencyCap: 1,
      leaseTtlSeconds: 1,
      abortAfterFailures: 10,
    })
  )
  const run = await createRun(client, credentials.adminKey, version.scenario_version_id)
  const started = await client.rpc('start_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: run.run_id,
    p_expected_revision: 1,
    p_reason: 'start expiry fixture',
    p_external_actor_id: ACTOR,
  })
  expect(started.data?.[0]?.revision).toBe(2)
  const first = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentials.readKey),
    p_run_id: run.run_id,
    p_expected_run_revision: 2,
  })
  expect(first.data?.[0]?.admitted).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 1_100))
  const second = await client.rpc('reserve_scenario_execution', {
    p_key_hash: hashCredential(credentials.readKey),
    p_run_id: run.run_id,
    p_expected_run_revision: 2,
  })
  expect(second.data?.[0]).toMatchObject({ admitted: true, reason: 'ADMITTED' })
  const runRow = await client
    .from('scenario_runs')
    .select('request_count,active_lease_count,failure_count')
    .eq('project_id', project)
    .eq('id', run.run_id)
    .single()
  expect(runRow.data).toEqual({ request_count: 2, active_lease_count: 1, failure_count: 1 })
  const firstLease = await client
    .from('scenario_run_leases')
    .select('status,outcome')
    .eq('project_id', project)
    .eq('id', first.data?.[0]?.lease_id)
    .single()
  expect(firstLease.data).toEqual({ status: 'expired', outcome: 'lease_expired' })
  await client.rpc('settle_scenario_execution', {
    p_key_hash: hashCredential(credentials.readKey),
    p_run_id: run.run_id,
    p_lease_id: second.data?.[0]?.lease_id,
    p_succeeded: true,
  })
  const stopped = await client.rpc('transition_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: run.run_id,
    p_expected_revision: 2,
    p_transition: 'stop',
    p_reason: 'lease fixture complete',
    p_external_actor_id: ACTOR,
  })
  expect(stopped.data?.[0]?.changed).toBe(true)

  const ttlVersion = await createScenario(
    client,
    credentials.adminKey,
    'ttl_probe',
    scenarioDefinition({
      targetKey: target.targetKey,
      flagKey: 'scenario.expiry_probe',
      expiresAt: new Date(Date.now() + 3_000).toISOString(),
    })
  )
  const ttlRun = await createRun(client, credentials.adminKey, ttlVersion.scenario_version_id)
  const ttlStarted = await client.rpc('start_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: ttlRun.run_id,
    p_expected_revision: 1,
    p_reason: 'start TTL fixture',
    p_external_actor_id: ACTOR,
  })
  expect(ttlStarted.data?.[0]?.changed).toBe(true)
  await new Promise((resolve) => setTimeout(resolve, 3_100))
  const expiredSnapshot = await client.rpc('get_scenario_read_snapshot', {
    p_key_hash: hashCredential(credentials.readKey),
  })
  expect(expiredSnapshot.data?.[0]?.scenarios).toEqual([])
  const expiredRun = await client
    .from('scenario_runs')
    .select('status,revision,stop_reason')
    .eq('project_id', project)
    .eq('id', ttlRun.run_id)
    .single()
  expect(expiredRun.data).toEqual({
    status: 'expired',
    revision: 3,
    stop_reason: 'Scenario TTL expired.',
  })
})

test('impact capture persists one immutable tenant-bound canonical evidence snapshot', async ({
  request,
}) => {
  const client = db()
  const owner = await fixtureUser(client, 'impact')
  const project = await fixtureProject(client, owner, 'impact')
  const credentials = await fixtureCredentials(client, project, owner, 'impact')
  const flag = await fixtureFlag(client, project, owner, 'scenario.impact_probe')
  const experimentKey = `scenario_impact_${Date.now()}`
  const experiment = await fixtureExperiment(client, project, owner, experimentKey, flag)
  const target = await fixtureTarget(client, credentials.adminKey, 'impact')
  const version = await createScenario(
    client,
    credentials.adminKey,
    'impact_probe',
    scenarioDefinition({
      targetKey: target.targetKey,
      flagKey: 'scenario.impact_probe',
      experiment: { key: experimentKey, definitionVersion: experiment.version },
      abortAfterFailures: 10,
    })
  )
  const run = await createRun(client, credentials.adminKey, version.scenario_version_id)
  const started = await client.rpc('start_scenario_run', {
    p_key_hash: hashCredential(credentials.adminKey),
    p_run_id: run.run_id,
    p_expected_revision: 1,
    p_reason: 'start impact fixture',
    p_external_actor_id: ACTOR,
  })
  expect(started.data?.[0]?.revision).toBe(2)

  const facts = [
    {
      project_id: project,
      user_id: 'impact-executor',
      event: 'experiment_exposed',
      feature_id: experimentKey,
      tags: { variant: 'control', experiment_definition_version: experiment.version },
      context_version: 1,
      subject_type: 'probe',
      subject_id: 'impact-control-1',
    },
    {
      project_id: project,
      user_id: 'impact-executor',
      event: 'experiment_exposed',
      feature_id: experimentKey,
      tags: { variant: 'delay', experiment_definition_version: experiment.version },
      context_version: 1,
      subject_type: 'probe',
      subject_id: 'impact-fault-1',
    },
    {
      project_id: project,
      user_id: 'impact-executor',
      event: 'probe_completed',
      tags: {},
      context_version: 1,
      subject_type: 'probe',
      subject_id: 'impact-control-1',
    },
    {
      project_id: project,
      user_id: 'impact-executor',
      event: 'scenario_executed',
      feature_id: 'impact_probe',
      tags: {
        scenario_definition_version: version.version,
        run_id: run.run_id,
        arm: 'control',
        failed: false,
        latency_ms: 10,
      },
      context_version: 1,
      subject_type: 'probe',
      subject_id: 'impact-control-1',
    },
    {
      project_id: project,
      user_id: 'impact-executor',
      event: 'scenario_executed',
      feature_id: 'impact_probe',
      tags: {
        scenario_definition_version: version.version,
        run_id: run.run_id,
        arm: 'fault',
        failed: true,
        latency_ms: 50,
      },
      context_version: 1,
      subject_type: 'probe',
      subject_id: 'impact-fault-1',
    },
  ]
  expect((await client.from('events').insert(facts)).error).toBeNull()
  const asOf = new Date().toISOString()
  const idempotencyKey = crypto.randomUUID()
  const capture = await request.post('/api/v1/scenarios/impact', {
    headers: {
      Authorization: `Bearer ${credentials.adminKey}`,
      'x-miyagi-clerk-actor': ACTOR,
    },
    data: {
      runId: run.run_id,
      asOf,
      idempotencyKey,
      reason: 'Capture immutable internal impact evidence.',
    },
  })
  expect(capture.status()).toBe(200)
  const body = await capture.json()
  expect(body).toMatchObject({
    ok: true,
    created: true,
    evidence: {
      contractVersion: 1,
      cohort: 'internal',
      scenario: { key: 'impact_probe', definitionVersion: 1, runId: run.run_id },
      technical: {
        control: { attempts: 1, failures: 0, latencyP95Ms: 10 },
        fault: { attempts: 1, failures: 1, latencyP95Ms: 50 },
        nonZeroDifference: true,
      },
      claim: { causal: false },
    },
  })

  const replay = await request.post('/api/v1/scenarios/impact', {
    headers: {
      Authorization: `Bearer ${credentials.adminKey}`,
      'x-miyagi-clerk-actor': ACTOR,
    },
    data: {
      runId: run.run_id,
      asOf,
      idempotencyKey,
      reason: 'Capture immutable internal impact evidence.',
    },
  })
  expect(await replay.json()).toMatchObject({
    ok: true,
    evidenceId: body.evidenceId,
    created: false,
  })
  const listed = await request.get('/api/v1/scenarios/impact', {
    headers: { Authorization: `Bearer ${credentials.adminKey}` },
  })
  expect((await listed.json()).evidence[0]).toMatchObject({
    id: body.evidenceId,
    runId: run.run_id,
    scenarioKey: 'impact_probe',
  })
  const foreignOwner = await fixtureUser(client, 'impact-foreign')
  const foreignProject = await fixtureProject(client, foreignOwner, 'impact-foreign')
  const foreignCredentials = await fixtureCredentials(
    client,
    foreignProject,
    foreignOwner,
    'impact-foreign'
  )
  const foreign = await request.get('/api/v1/scenarios/impact', {
    headers: { Authorization: `Bearer ${foreignCredentials.adminKey}` },
  })
  expect((await foreign.json()).evidence).toEqual([])

  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await expect(
      pg.query(
        'UPDATE public.scenario_impact_evidence SET reason = $1 WHERE id = $2',
        ['rewritten', body.evidenceId]
      )
    ).rejects.toMatchObject({ code: '55000' })
  } finally {
    await pg.end()
  }
})

test('every scenario RPC denies anon/authenticated at the function boundary', async () => {
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    const signatures = [
      'public.register_scenario_target(text,text,text,text,text,text,text)',
      'public.verify_scenario_target(text,uuid,text,text,text)',
      'public.revoke_scenario_target(text,uuid,text,text)',
      'public.create_scenario_definition_version(text,text,jsonb,text,text)',
      'public.approve_scenario_definition(text,uuid,text,text,text)',
      'public.create_scenario_run(text,uuid,text,text)',
      'public.start_scenario_run(text,uuid,bigint,text,text)',
      'public.transition_scenario_run(text,uuid,bigint,text,text,text)',
      'public.get_scenario_admin_snapshot(text)',
      'public.get_scenario_read_snapshot(text)',
      'public.reserve_scenario_execution(text,uuid,bigint)',
      'public.settle_scenario_execution(text,uuid,uuid,boolean)',
      'public.reserve_security_scenario_execution(text,uuid,bigint)',
      'public.settle_security_scenario_execution(text,uuid,uuid,smallint[],integer)',
      'public.get_scenario_security_results(text)',
      'public.get_scenario_impact_source(text,uuid,timestamp with time zone)',
      'public.record_scenario_impact_evidence(text,uuid,jsonb,text,text,uuid)',
      'public.get_scenario_impact_evidence(text)',
    ]
    for (const signature of signatures) {
      const privilege = await pg.query<{
        anon: boolean
        authenticated: boolean
        service_role: boolean
      }>(
        `SELECT has_function_privilege('anon', $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
                has_function_privilege('service_role', $1, 'EXECUTE') AS service_role`,
        [signature]
      )
      expect(privilege.rows[0], signature).toEqual({
        anon: false,
        authenticated: false,
        service_role: true,
      })
    }
  } finally {
    await pg.end()
  }
})
