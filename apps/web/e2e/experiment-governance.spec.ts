import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import {
  MAX_EXPERIMENT_DEFINITION_BYTES,
  MAX_EXPERIMENT_DESCRIPTION_LENGTH,
  MAX_EXPERIMENT_EVENT_LENGTH,
  MAX_EXPERIMENT_PREDICATE_STRING_LENGTH,
  parseExperimentDefinition,
  type ExperimentDefinition,
} from '@/lib/experiment-definition'
import {
  createExperimentVersionAfterGate,
  type ExperimentCreateCommandDependencies,
} from '@/lib/experiment-create-command'
import {
  allowedExperimentTargets,
  mapExperimentRegistryRows,
  type ExperimentRegistryRelationRow,
} from '@/lib/experiment-registry-view'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

const VALID_DEFINITION: ExperimentDefinition = {
  hypothesis: 'A clearer founding-store promise increases completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: {
    description: 'Consented founding-store applicants in Mexico.',
    tags: { region: 'mx', plan: 'founding', campaign: 42 },
  },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'new-copy', weight: 3 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_abandoned', direction: 'decrease' }],
  segmentFields: ['source', 'channel', 'region'],
  plannedWindow: {
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-08-01T00:00:00.000Z',
  },
  minimumSamplePerVariant: 100,
}

function db(): SupabaseClient {
  const url = requireLocalSupabaseApiUrl()
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function createUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `experiment-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-experiment-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create auth fixture: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({
      slug: `experiment-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: `h-${crypto.randomUUID()}`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create project fixture: ${error?.message}`)
  return data.id as string
}

async function createVersion(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  key: string,
  definition: unknown = VALID_DEFINITION,
) {
  return client.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: key,
    p_definition: definition,
    p_actor_user_id: ownerId,
  })
}

async function transition(
  client: SupabaseClient,
  projectId: string,
  experimentId: string,
  versionId: string,
  target: string | null,
  ownerId: string,
) {
  return client.rpc('transition_experiment_version', {
    p_project_id: projectId,
    p_experiment_id: experimentId,
    p_version_id: versionId,
    p_target_status: target,
    p_actor_user_id: ownerId,
  })
}

test.describe('experiment definition — closed bounded contract', () => {
  test('accepts semantic control, primary direction, guardrails, bounded segments and exact microsecond window', () => {
    const result = parseExperimentDefinition({
      ...VALID_DEFINITION,
      plannedWindow: {
        startAt: '2026-01-01T00:00:00.000100+00:00',
        endAt: '2026-01-01T00:00:00.000900Z',
      },
    })
    expect(result).toEqual({
      ok: true,
      definition: {
        ...VALID_DEFINITION,
        plannedWindow: {
          startAt: '2026-01-01T00:00:00.0001Z',
          endAt: '2026-01-01T00:00:00.0009Z',
        },
      },
    })
  })

  test('Unicode limits match PostgreSQL code points while NUL and the independent byte cap fail', async () => {
    const emoji = '🚀'
    expect(parseExperimentDefinition({
      ...VALID_DEFINITION,
      hypothesis: emoji.repeat(MAX_EXPERIMENT_DESCRIPTION_LENGTH),
      eligibility: {
        description: emoji.repeat(MAX_EXPERIMENT_DESCRIPTION_LENGTH),
        tags: { source: emoji.repeat(MAX_EXPERIMENT_PREDICATE_STRING_LENGTH) },
      },
      primaryMetric: {
        event: emoji.repeat(MAX_EXPERIMENT_EVENT_LENGTH),
        direction: 'increase',
      },
    }).ok).toBe(true)
    for (const definition of [
      { ...VALID_DEFINITION, hypothesis: emoji.repeat(MAX_EXPERIMENT_DESCRIPTION_LENGTH + 1) },
      {
        ...VALID_DEFINITION,
        primaryMetric: { event: emoji.repeat(MAX_EXPERIMENT_EVENT_LENGTH + 1), direction: 'increase' },
      },
      {
        ...VALID_DEFINITION,
        eligibility: { description: 'eligible', tags: { source: emoji.repeat(MAX_EXPERIMENT_PREDICATE_STRING_LENGTH + 1) } },
      },
      { ...VALID_DEFINITION, hypothesis: 'contains\0nul' },
    ]) expect(parseExperimentDefinition(definition).ok).toBe(false)

    const dependencies: ExperimentCreateCommandDependencies = {
      requireOwnership: async () => ({ projectId: 'project-1', userId: 'owner-1' }),
      createVersion: async () => ({
        ok: true,
        projectId: 'project-1',
        experimentId: 'experiment-1',
        versionId: 'version-1',
        version: 1,
        status: 'draft',
      }),
    }
    expect((await createExperimentVersionAfterGate(
      'project',
      'valid-key',
      emoji.repeat(MAX_EXPERIMENT_DEFINITION_BYTES),
      dependencies,
    )).result).toEqual({ ok: false, error: 'Definition is too large (maximum 32 KiB).' })

    const depth = 4_000
    const deeplyNestedUnknown = `${'{"x":'.repeat(depth)}null${'}'.repeat(depth)}`
    await expect(createExperimentVersionAfterGate(
      'project',
      'valid-key',
      deeplyNestedUnknown,
      dependencies,
    )).resolves.toMatchObject({ result: { ok: false } })
  })

  test('rejects malformed/duplicate/high-cardinality plans and non-explicit or imprecise windows', () => {
    for (const definition of [
      { ...VALID_DEFINITION, variants: [{ key: 'control', weight: 1 }] },
      { ...VALID_DEFINITION, variants: [{ key: 'same', weight: 1 }, { key: 'same', weight: 1 }] },
      { ...VALID_DEFINITION, variants: [{ key: 'control', weight: 0 }, { key: 'new-copy', weight: 1 }] },
      { ...VALID_DEFINITION, controlVariantKey: 'missing' },
      {
        ...VALID_DEFINITION,
        guardrailMetrics: [{ event: VALID_DEFINITION.primaryMetric.event, direction: 'decrease' }],
      },
      { ...VALID_DEFINITION, segmentFields: ['region', 'region'] },
      { ...VALID_DEFINITION, segmentFields: ['email'] },
      { ...VALID_DEFINITION, eligibility: { description: 'eligible', tags: { email: 'person@example.test' } } },
      { ...VALID_DEFINITION, plannedWindow: { startAt: '2026-01-01', endAt: '2026-02-01T00:00:00Z' } },
      {
        ...VALID_DEFINITION,
        plannedWindow: {
          startAt: '2026-01-01T00:00:00.0000001Z',
          endAt: '2026-02-01T00:00:00Z',
        },
      },
      {
        ...VALID_DEFINITION,
        plannedWindow: {
          startAt: '0000-01-01T00:00:00Z',
          endAt: '2026-02-01T00:00:00Z',
        },
      },
      {
        ...VALID_DEFINITION,
        plannedWindow: {
          startAt: '2026-01-01T00:00:00.000900Z',
          endAt: '2026-01-01T00:00:00.000100Z',
        },
      },
      { ...VALID_DEFINITION, hypothesis: '\u00a0' },
      { ...VALID_DEFINITION, eligibility: { description: '\u3000' } },
      {
        ...VALID_DEFINITION,
        primaryMetric: { event: `completed\u00a0`, direction: 'increase' },
      },
      {
        ...VALID_DEFINITION,
        guardrailMetrics: [{ event: `\u3000abandoned`, direction: 'decrease' }],
      },
      { ...VALID_DEFINITION, minimumSamplePerVariant: 0 },
      { ...VALID_DEFINITION, sql: 'select true' },
    ]) expect(parseExperimentDefinition(definition).ok, JSON.stringify(definition)).toBe(false)
  })
})

test('flag is exact true, and authorization precedes experiment payload validation', async () => {
  const original = process.env.EXPERIMENT_GOVERNANCE_ENABLED
  try {
    for (const off of [undefined, 'false', 'TRUE', '1', ' true']) {
      if (off === undefined) delete process.env.EXPERIMENT_GOVERNANCE_ENABLED
      else process.env.EXPERIMENT_GOVERNANCE_ENABLED = off
      expect(isExperimentGovernanceEnabled()).toBe(false)
    }
    process.env.EXPERIMENT_GOVERNANCE_ENABLED = 'true'
    expect(isExperimentGovernanceEnabled()).toBe(true)
  } finally {
    if (original === undefined) delete process.env.EXPERIMENT_GOVERNANCE_ENABLED
    else process.env.EXPERIMENT_GOVERNANCE_ENABLED = original
  }

  const denied = new Error('owner boundary')
  let creates = 0
  const dependencies: ExperimentCreateCommandDependencies = {
    requireOwnership: async () => { throw denied },
    createVersion: async () => {
      creates += 1
      return {
        ok: true,
        projectId: 'p',
        experimentId: 'e',
        versionId: 'v',
        version: 1,
        status: 'draft',
      }
    },
  }
  for (const [key, definition] of [
    ['valid-key', JSON.stringify(VALID_DEFINITION)],
    ['Not-A-Key', '{'],
    [null, null],
  ]) {
    await expect(createExperimentVersionAfterGate('project', key, definition, dependencies))
      .rejects.toBe(denied)
  }
  expect(creates).toBe(0)
})

test('registry view exposes only lifecycle actions that can succeed', () => {
  const rows: ExperimentRegistryRelationRow[] = [{
    id: 'experiment-1',
    project_id: 'project-1',
    key: 'founding-message-v2',
    created_by: 'owner-1',
    created_at: '2026-07-01T00:00:00Z',
    versions: [
      {
        id: 'v3', project_id: 'project-1', version: 3, definition: VALID_DEFINITION,
        status: 'draft', created_by: 'owner-1', created_at: '2026-07-03T00:00:00Z',
        started_by: null, started_at: null, ended_by: null, ended_at: null,
        invalidated_by: null, invalidated_at: null,
      },
      {
        id: 'v2', project_id: 'project-1', version: 2, definition: VALID_DEFINITION,
        status: 'running', created_by: 'owner-1', created_at: '2026-07-02T00:00:00Z',
        started_by: 'owner-1', started_at: '2026-07-04T00:00:00Z',
        ended_by: null, ended_at: null, invalidated_by: null, invalidated_at: null,
      },
      {
        id: 'v1', project_id: 'project-1', version: 1, definition: VALID_DEFINITION,
        status: 'stopped', created_by: 'owner-1', created_at: '2026-07-01T00:00:00Z',
        started_by: 'owner-1', started_at: '2026-07-01T01:00:00Z',
        ended_by: 'owner-1', ended_at: '2026-07-02T00:00:00Z',
        invalidated_by: null, invalidated_at: null,
      },
    ],
  }]
  const registry = mapExperimentRegistryRows(rows)[0]
  expect(allowedExperimentTargets(registry, registry.versions[0])).toEqual(['invalid'])
  expect(allowedExperimentTargets(registry, registry.versions[1])).toEqual(['stopped', 'invalid'])
  expect(allowedExperimentTargets(registry, registry.versions[2])).toEqual(['invalid'])
})

test('DB registry is owner-scoped, concurrent, immutable, idempotent and append-only', async () => {
  const client = db()
  const [owner, member, foreignOwner] = await Promise.all([
    createUser(client, 'owner'),
    createUser(client, 'member'),
    createUser(client, 'foreign'),
  ])
  const [projectId, foreignProjectId] = await Promise.all([
    createProject(client, 'primary'),
    createProject(client, 'foreign'),
  ])
  try {
    expect((await client.from('project_members').insert([
      { project_id: projectId, user_id: owner, role: 'owner' },
      { project_id: projectId, user_id: member, role: 'member' },
      { project_id: foreignProjectId, user_id: foreignOwner, role: 'owner' },
    ])).error).toBeNull()

    expect((await createVersion(client, projectId, member, 'blocked-member')).error?.code).toBe('42501')
    expect((await createVersion(client, projectId, foreignOwner, 'blocked-foreign')).error?.code).toBe('42501')

    const creates = await Promise.all([
      createVersion(client, projectId, owner, 'founding-message-v2'),
      createVersion(client, projectId, owner, 'founding-message-v2'),
      createVersion(client, projectId, owner, 'founding-message-v2'),
    ])
    for (const result of creates) expect(result.error).toBeNull()
    const created = creates.flatMap((result) => result.data ?? []) as Array<Record<string, unknown>>
    expect(created.map((row) => Number(row.version)).sort()).toEqual([1, 2, 3])
    expect(created.every((row) => row.project_id === projectId && row.status === 'draft')).toBe(true)
    const experimentId = created[0].experiment_id as string

    const { data: versions } = await client
      .from('experiment_definition_versions')
      .select('id, version, definition, status')
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId)
      .order('version')
    expect(versions).toHaveLength(3)
    const [v1, v2, v3] = versions!

    const starts = await Promise.all([
      transition(client, projectId, experimentId, v1.id, 'running', owner),
      transition(client, projectId, experimentId, v1.id, 'running', owner),
    ])
    for (const start of starts) expect(start.error).toBeNull()
    const startRows = starts.flatMap((result) => result.data ?? []) as Array<Record<string, unknown>>
    expect(startRows.filter((row) => row.changed === true)).toHaveLength(1)
    expect(new Set(startRows.map((row) => row.started_at)).size).toBe(1)

    const v4Create = await createVersion(client, projectId, owner, 'founding-message-v2')
    expect(v4Create.error).toBeNull()
    const v4 = (v4Create.data![0] as Record<string, unknown>)
    expect((await transition(
      client, projectId, experimentId, v4.version_id as string, 'running', owner,
    )).data).toHaveLength(0)

    const beforeNullAudit = (await client
      .from('experiment_lifecycle_audit')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)).count
    const nullTarget = await transition(client, projectId, experimentId, v1.id, null, owner)
    expect(nullTarget.error?.code).toBe('22023')
    const genericDecide = await transition(client, projectId, experimentId, v1.id, 'decided', owner)
    expect(genericDecide.error?.code).toBe('22023')
    expect((await client
      .from('experiment_lifecycle_audit')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)).count).toBe(beforeNullAudit)

    const stops = await Promise.all([
      transition(client, projectId, experimentId, v1.id, 'stopped', owner),
      transition(client, projectId, experimentId, v1.id, 'stopped', owner),
    ])
    const stopRows = stops.flatMap((result) => result.data ?? []) as Array<Record<string, unknown>>
    expect(stopRows.filter((row) => row.changed === true)).toHaveLength(1)
    expect(new Set(stopRows.map((row) => row.ended_at)).size).toBe(1)

    const v4Start = await transition(
      client, projectId, experimentId, v4.version_id as string, 'running', owner,
    )
    expect(v4Start.data?.[0]).toMatchObject({ version: 4, status: 'running', changed: true })
    // A never-started older draft cannot become the current run after a newer version ever started.
    expect((await transition(client, projectId, experimentId, v2.id, 'running', owner)).data).toHaveLength(0)

    const invalidated = await transition(
      client, projectId, experimentId, v4.version_id as string, 'invalid', owner,
    )
    expect(invalidated.error).toBeNull()
    expect(invalidated.data?.[0]).toMatchObject({ status: 'invalid', changed: true })
    expect(invalidated.data?.[0].ended_at).toBe(invalidated.data?.[0].invalidated_at)
    const invalidatedAgain = await transition(
      client, projectId, experimentId, v4.version_id as string, 'invalid', owner,
    )
    expect(invalidatedAgain.data?.[0]).toMatchObject({
      status: 'invalid',
      changed: false,
      ended_at: invalidated.data?.[0].ended_at,
      invalidated_at: invalidated.data?.[0].invalidated_at,
    })
    expect((await transition(client, projectId, experimentId, v3.id, 'invalid', owner)).data?.[0])
      .toMatchObject({ status: 'invalid', changed: true, started_at: null, ended_at: null })

    const { data: audit } = await client
      .from('experiment_lifecycle_audit')
      .select('action, actor_user_id, version_id')
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId)
    expect(audit?.filter((row) => row.action === 'version_created')).toHaveLength(4)
    expect(audit?.filter((row) => row.action === 'version_started')).toHaveLength(2)
    expect(audit?.filter((row) => row.action === 'version_stopped')).toHaveLength(1)
    expect(audit?.filter((row) => row.action === 'version_invalidated')).toHaveLength(2)
    expect(audit?.every((row) => row.actor_user_id === owner)).toBe(true)

    const rewrite = await client
      .from('experiment_definition_versions')
      .update({ definition: { ...VALID_DEFINITION, hypothesis: 'rewritten' } })
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId)
      .eq('id', v1.id)
    expect(rewrite.error).not.toBeNull()
    expect((await client.from('experiment_lifecycle_audit').insert({
      project_id: projectId,
      experiment_id: experimentId,
      version_id: v1.id,
      action: 'version_started',
      actor_user_id: owner,
    })).error).not.toBeNull()
    expect((await client
      .from('experiment_lifecycle_audit')
      .delete()
      .eq('project_id', projectId)
      .eq('experiment_id', experimentId)).error).not.toBeNull()

    const ownerDb = new PgClient({ connectionString: requireTestDatabaseUrl() })
    await ownerDb.connect()
    try {
      await expect(ownerDb.query(
        'UPDATE public.experiment_definition_versions SET definition = $1::jsonb WHERE project_id = $2 AND experiment_id = $3 AND id = $4',
        [JSON.stringify({ ...VALID_DEFINITION, hypothesis: 'owner rewrite' }), projectId, experimentId, v1.id],
      )).rejects.toMatchObject({ code: '55000' })
    } finally {
      await ownerDb.end()
    }

    const invalidDefinitions: Array<[string, unknown]> = [
      ['bad-control', { ...VALID_DEFINITION, controlVariantKey: 'missing' }],
      ['bad-segment', { ...VALID_DEFINITION, segmentFields: ['email'] }],
      ['null-primary-direction', {
        ...VALID_DEFINITION,
        primaryMetric: { ...VALID_DEFINITION.primaryMetric, direction: null },
      }],
      ['null-guardrail-direction', {
        ...VALID_DEFINITION,
        guardrailMetrics: [{ event: 'guardrail_with_null_direction', direction: null }],
      }],
      ['blank-unicode-hypothesis', { ...VALID_DEFINITION, hypothesis: '\u00a0' }],
      ['blank-unicode-eligibility', {
        ...VALID_DEFINITION,
        eligibility: { description: '\u3000' },
      }],
      ['unicode-padded-primary-event', {
        ...VALID_DEFINITION,
        primaryMetric: { event: `completed\u00a0`, direction: 'increase' },
      }],
      ['unicode-padded-guardrail-event', {
        ...VALID_DEFINITION,
        guardrailMetrics: [{ event: `\u3000abandoned`, direction: 'decrease' }],
      }],
      ['bad-window', {
        ...VALID_DEFINITION,
        plannedWindow: { startAt: '2026-01-01T00:00:00.0000001Z', endAt: '2026-02-01T00:00:00Z' },
      }],
    ]
    for (const [key, definition] of invalidDefinitions) {
      expect((await createVersion(client, projectId, owner, key, definition)).error).not.toBeNull()
    }
  } finally {
    try {
      await cleanupExperimentProjects([projectId, foreignProjectId])
    } finally {
      await Promise.all([owner, member, foreignOwner].map((id) => client.auth.admin.deleteUser(id)))
    }
  }
})

test('experiment RPCs are service-role-only with function-level denial', async () => {
  const url = requireLocalSupabaseApiUrl()
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const zero = '00000000-0000-0000-0000-000000000000'
  for (const [name, args] of [
    ['create_experiment_version', {
      p_project_id: zero,
      p_experiment_key: 'x',
      p_definition: VALID_DEFINITION,
      p_actor_user_id: zero,
    }],
    ['transition_experiment_version', {
      p_project_id: zero,
      p_experiment_id: zero,
      p_version_id: zero,
      p_target_status: 'running',
      p_actor_user_id: zero,
    }],
    ['get_experiment_analysis_events', {
      p_project_id: zero,
      p_experiment_key: 'x',
      p_definition_version: 1,
      p_metric_events: ['completed'],
      p_analysis_start: '2026-01-01T00:00:00Z',
      p_analysis_end: '2026-01-02T00:00:00Z',
      p_as_of: '2026-01-02T00:00:00Z',
    }],
  ] as const) {
    const { error } = await client.rpc(name, args)
    expect(error).not.toBeNull()
    const message = (error?.message ?? '').toLowerCase()
    const functionLevel =
      (error?.code === '42501' && message.includes('function')) ||
      error?.code === 'PGRST202' ||
      message.includes('could not find the function')
    expect(functionLevel, `${name}: ${error?.code} ${message}`).toBe(true)
    expect(message).not.toContain('row-level security')
  }
})
