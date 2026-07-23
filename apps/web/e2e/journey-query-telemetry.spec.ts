import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import {
  assessJourneyMaterialization,
  buildJourneyQueryDiagnostics,
  JOURNEY_MATERIALIZATION_EVENT_COUNT,
  JOURNEY_MATERIALIZATION_P95_MS,
  JOURNEY_QUERY_SAMPLE_LIMIT,
} from '@/lib/journey-query-telemetry'
import {
  cleanupJourneyProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

const DEFINITION = {
  entityType: 'merchant',
  stages: [{ key: 'scouted', event: 'merchant.scouted' }],
}

function db(): SupabaseClient {
  const url = requireLocalSupabaseApiUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function createOwner(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `journey-telemetry-${label}-${Date.now()}-${crypto.randomUUID()}@example.test`,
    password: 'local-only-journey-telemetry-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create owner: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string): Promise<string> {
  const apiKeyHash = createHash('sha256').update(`journey-telemetry-${crypto.randomUUID()}`).digest('hex')
  const { data, error } = await client.from('projects').insert({
    slug: `journey-telemetry-${label}-${crypto.randomUUID()}`,
    api_key_hash: apiKeyHash,
  }).select('id').single()
  if (error || !data) throw new Error(`could not create project: ${error?.message}`)
  return data.id as string
}

async function createJourney(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  key: string,
): Promise<{ journeyId: string; version: number }> {
  const { data, error } = await client.rpc('create_journey_version', {
    p_project_id: projectId,
    p_journey_key: key,
    p_definition: DEFINITION,
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create journey: ${error?.message}`)
  return {
    journeyId: data[0].journey_id as string,
    version: Number(data[0].version),
  }
}

async function record(
  client: SupabaseClient,
  input: {
    projectId: string
    journeyId: string
    version: number
    kind: 'subject' | 'cohort'
    durationMs: number
    relevantEventCount: number
  },
) {
  return client.rpc('record_journey_query_observation', {
    p_project_id: input.projectId,
    p_journey_id: input.journeyId,
    p_definition_version: input.version,
    p_query_kind: input.kind,
    p_duration_ms: input.durationMs,
    p_relevant_event_count: input.relevantEventCount,
  })
}

test('materialization tripwires are strict, explicit and fail honest when telemetry is unavailable', () => {
  expect(assessJourneyMaterialization(
    JOURNEY_MATERIALIZATION_P95_MS,
    JOURNEY_MATERIALIZATION_EVENT_COUNT,
  )).toBe('keep_query_time')
  expect(assessJourneyMaterialization(
    JOURNEY_MATERIALIZATION_P95_MS + 0.01,
    JOURNEY_MATERIALIZATION_EVENT_COUNT,
  )).toBe('materialization_tripwire_reached')
  expect(assessJourneyMaterialization(
    JOURNEY_MATERIALIZATION_P95_MS,
    JOURNEY_MATERIALIZATION_EVENT_COUNT + 1,
  )).toBe('materialization_tripwire_reached')

  expect(buildJourneyQueryDiagnostics({
    queryKind: 'cohort',
    queryDurationMs: 12.34,
    relevantEventCount: 13,
  }, null)).toMatchObject({
    telemetryStatus: 'unavailable',
    sampleCount: null,
    p50QueryDurationMs: null,
    p95QueryDurationMs: null,
    maxRelevantEventCount: null,
    materializationDecision: 'telemetry_unavailable',
  })
})

test('query evidence is project/version-bound, percentile-correct, capped and structurally subject-free', async () => {
  test.skip(!process.env.SUPABASE_URL, 'local Supabase not available')
  const client = db()
  const owner = await createOwner(client, 'owner')
  const projectId = await createProject(client, 'primary')
  const foreignProjectId = await createProject(client, 'foreign')
  const foreignOwner = await createOwner(client, 'foreign-owner')
  try {
    for (const id of [projectId, foreignProjectId]) {
      const actor = id === projectId ? owner : foreignOwner
      const { error } = await client.from('project_members').insert({
        project_id: id,
        user_id: actor,
        role: 'owner',
      })
      if (error) throw new Error(`could not create membership: ${error.message}`)
    }
    const journey = await createJourney(client, projectId, owner, 'merchant_activation')
    const foreignJourney = await createJourney(
      client,
      foreignProjectId,
      foreignOwner,
      'merchant_activation',
    )

    let latest: Awaited<ReturnType<typeof record>> | null = null
    for (const durationMs of [100, 200, 300, 400]) {
      latest = await record(client, {
        projectId,
        journeyId: journey.journeyId,
        version: journey.version,
        kind: 'cohort',
        durationMs,
        relevantEventCount: durationMs,
      })
      expect(latest.error).toBeNull()
    }
    expect(latest?.data?.[0]).toMatchObject({
      sample_count: 4,
      p50_ms: 250,
      p95_ms: 385,
      max_relevant_event_count: 400,
      decision: 'keep_query_time',
    })

    const crossProject = await record(client, {
      projectId,
      journeyId: foreignJourney.journeyId,
      version: foreignJourney.version,
      kind: 'cohort',
      durationMs: 1,
      relevantEventCount: 1,
    })
    expect(crossProject.error?.code).toBe('22023')

    for (let index = 0; index < JOURNEY_QUERY_SAMPLE_LIMIT + 5; index += 1) {
      const result = await record(client, {
        projectId,
        journeyId: journey.journeyId,
        version: journey.version,
        kind: 'subject',
        durationMs: index,
        relevantEventCount: index,
      })
      expect(result.error).toBeNull()
    }

    const directRead = await client.from('journey_query_observations').select('*').limit(1)
    expect(directRead.error).not.toBeNull()

    const postgres = new Client({ connectionString: requireTestDatabaseUrl() })
    await postgres.connect()
    try {
      const { rows: countRows } = await postgres.query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
           FROM public.journey_query_observations
          WHERE project_id = $1 AND journey_id = $2
            AND definition_version = $3 AND query_kind = 'subject'`,
        [projectId, journey.journeyId, journey.version],
      )
      expect(Number(countRows[0].count)).toBe(JOURNEY_QUERY_SAMPLE_LIMIT)

      const { rows: columnRows } = await postgres.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'journey_query_observations'
          ORDER BY ordinal_position`,
      )
      const columns = columnRows.map((row) => row.column_name)
      expect(columns).toEqual([
        'id',
        'project_id',
        'journey_id',
        'definition_version',
        'query_kind',
        'duration_ms',
        'relevant_event_count',
        'observed_at',
      ])
      expect(columns.some((name) => /subject|tag|payload|result|contact/i.test(name))).toBe(false)
    } finally {
      await postgres.end()
    }
  } finally {
    try {
      await cleanupJourneyProjects([projectId, foreignProjectId])
    } finally {
      await Promise.all([
        client.auth.admin.deleteUser(owner),
        client.auth.admin.deleteUser(foreignOwner),
      ])
    }
  }
})
