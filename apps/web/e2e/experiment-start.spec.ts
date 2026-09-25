import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import { createBuilderIo, type BuilderIo } from '@/lib/experiment-builder-io'
import {
  BUILDER_PAUSED,
  retryServingCommand,
  saveExperimentDraftCommand,
  startExperimentCommand,
  type BuilderDependencies,
} from '@/lib/experiment-builder-command'
import { stripExperiment, type ExperimentBuilderAnswers } from '@/lib/experiment-builder-plan'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

// experiments-for-humans · Story 3.3 (epic README D7). The REAL commands the server actions call,
// against real Postgres, with the gate switched on by injection (CI keeps EXPERIMENT_BUILDER_ENABLED
// off, and the push credential cannot change ci.yml — README, D7 correction).

const FLAG_KEY = 'growth.founding_merchants_enabled'
const SERVED: FlagDefinition = {
  valueType: 'boolean',
  description: 'Founding-merchant offer at signup',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
  metadata: { source: 'fixture' },
}

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

type Fixture = { projectId: string; owner: string; slug: string }
const created: Fixture[] = []

async function fixture(client: SupabaseClient): Promise<Fixture> {
  const { data: user, error: userError } = await client.auth.admin.createUser({
    email: `start-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-start-password',
    email_confirm: true,
  })
  if (userError || !user.user) throw new Error(`auth fixture: ${userError?.message}`)
  const slug = `start-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data: project, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: `h-${crypto.randomUUID()}` })
    .select('id')
    .single()
  if (error || !project) throw new Error(`project fixture: ${error?.message}`)
  await client
    .from('project_members')
    .insert({ project_id: project.id, user_id: user.user.id, role: 'owner' })
  const result = { projectId: project.id as string, owner: user.user.id, slug }
  created.push(result)

  // The feature, live in Production — through the product's own RPCs.
  await activate(client, result, SERVED)

  // Traffic: 2,000 merchants seen, 500 of them signed up, all in the last 14 days. A fixture insert,
  // not an application write (AGENTS rule #1 governs product code).
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    await pg.query(
      `insert into events (project_id, user_id, event, context_version, subject_type, subject_id, created_at)
       select $1::uuid, 'u' || n, 'page_viewed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
       from generate_series(1, 2000) n
       union all
       select $1::uuid, 'u' || n, 'signup_completed', 1, 'merchant', 'm' || n, now() - ((n % 300) || ' minutes')::interval
       from generate_series(1, 500) n`,
      [result.projectId]
    )
  } finally {
    await pg.end()
  }
  return result
}

async function activate(client: SupabaseClient, fx: Fixture, definition: FlagDefinition) {
  const { data: version, error } = await client.rpc('create_flag_definition_version', {
    p_project_id: fx.projectId,
    p_flag_key: FLAG_KEY,
    p_definition: definition,
    p_reason: 'fixture',
    p_actor_user_id: fx.owner,
  })
  if (error) throw new Error(`flag fixture: ${error.message}`)
  const { data: state } = await client
    .from('flag_environment_states')
    .select('snapshot_version')
    .eq('project_id', fx.projectId)
    .eq('environment', 'production')
    .maybeSingle()
  const activation = await client.rpc('set_flag_activation', {
    p_project_id: fx.projectId,
    p_environment: 'production',
    p_flag_id: version[0].flag_id,
    p_version_id: version[0].version_id,
    p_expected_snapshot_version: Number(state?.snapshot_version ?? 0),
    p_reason: 'fixture',
    p_actor_user_id: fx.owner,
  })
  if (activation.error) throw new Error(`activation fixture: ${activation.error.message}`)
  return version[0] as { flag_id: string; version_id: string }
}

function answers(overrides: Partial<ExperimentBuilderAnswers> = {}): ExperimentBuilderAnswers {
  return {
    template: 'copy',
    flagKey: FLAG_KEY,
    why: 'funnel',
    direction: 'increase',
    metric: 'signup_completed',
    guardrails: [],
    breakdowns: [],
    mde: 30,
    who: { mode: 'everyone', conditions: [], allocation: 100 },
    entity: 'merchant',
    versions: ['Current', 'New copy'],
    split: 50,
    weeks: 8,
    ...overrides,
  }
}

function deps(
  client: SupabaseClient,
  fx: Fixture,
  io: BuilderIo = createBuilderIo(client),
  enabled = true
): BuilderDependencies {
  return {
    builderEnabled: () => enabled,
    servingEnabled: () => true,
    requireOwnership: async () => ({ projectId: fx.projectId, userId: fx.owner }),
    io,
  }
}

async function productionVersionOf(client: SupabaseClient, projectId: string) {
  const { data } = await client
    .from('flag_environment_activations')
    .select('version_id, flag_definition_versions!inner(definition)')
    .eq('project_id', projectId)
    .eq('environment', 'production')
    .single()
  return data as unknown as { version_id: string; flag_definition_versions: { definition: FlagDefinition } }
}

async function statusOf(client: SupabaseClient, projectId: string) {
  const { data } = await client
    .from('experiment_definition_versions')
    .select('version,status')
    .eq('project_id', projectId)
    .order('version')
  return data ?? []
}

test.describe('Start (D7)', () => {
  let client: SupabaseClient
  test.beforeAll(() => {
    client = db()
  })
  test.afterAll(async () => {
    await cleanupExperimentProjects(created.map((fx) => fx.projectId))
    await Promise.all(created.map((fx) => client.auth.admin.deleteUser(fx.owner)))
  })

  test('Save is inert; Start makes the version running and serves ITS flag version in Production', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    expect(saved).toMatchObject({ ok: true, version: 1, created: true })
    const before = await productionVersionOf(client, fx.projectId)
    expect(before.flag_definition_versions.definition.metadata?.experiment_key).toBeUndefined()

    const started = await startExperimentCommand(
      fx.slug,
      saved.ok ? saved.experimentKey : '',
      deps(client, fx)
    )
    expect(started).toMatchObject({
      ok: true,
      version: 1,
      serving: true,
      flagKey: FLAG_KEY,
      weights: [50, 50],
    })
    expect(await statusOf(client, fx.projectId)).toEqual([{ version: 1, status: 'running' }])
    const serving = await productionVersionOf(client, fx.projectId)
    expect(serving.flag_definition_versions.definition.metadata).toMatchObject({
      experiment_version: 1,
      experiment_rules: '0,10',
    })
  })

  test('a forced activation failure leaves it RUNNING and not serving; the retry serves it', async () => {
    const fx = await fixture(client)
    const real = createBuilderIo(client)
    const failing: BuilderIo = { ...real, activateInProduction: async () => false }
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    const key = saved.ok ? saved.experimentKey : ''
    const started = await startExperimentCommand(fx.slug, key, deps(client, fx, failing))
    expect(started).toMatchObject({ ok: true, serving: false })
    expect(await statusOf(client, fx.projectId)).toEqual([{ version: 1, status: 'running' }])
    expect(
      (await productionVersionOf(client, fx.projectId)).flag_definition_versions.definition.metadata
        ?.experiment_key
    ).toBeUndefined()

    const retried = await retryServingCommand(fx.slug, key, deps(client, fx))
    expect(retried).toMatchObject({ ok: true, serving: true })
    expect(
      (await productionVersionOf(client, fx.projectId)).flag_definition_versions.definition.metadata
        ?.experiment_key
    ).toBe(key)
  })

  test('a failing check blocks Start (recomputed on the server) and nothing moves', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(
      fx.slug,
      answers({ guardrails: ['never_sent_event'] }),
      null,
      deps(client, fx)
    )
    expect(saved).toMatchObject({ ok: true, failing: 1 })
    const started = await startExperimentCommand(
      fx.slug,
      saved.ok ? saved.experimentKey : '',
      deps(client, fx)
    )
    expect(started.ok).toBe(false)
    expect(!started.ok && started.checks?.find((check) => check.id === 'metrics')?.status).toBe('fail')
    expect(await statusOf(client, fx.projectId)).toEqual([{ version: 1, status: 'draft' }])
  })

  test('with the gate off, Save and Start refuse before touching anything', async () => {
    const fx = await fixture(client)
    const off = deps(client, fx, createBuilderIo(client), false)
    expect(await saveExperimentDraftCommand(fx.slug, answers(), null, off)).toEqual({
      ok: false,
      error: BUILDER_PAUSED,
    })
    expect(await startExperimentCommand(fx.slug, 'anything', off)).toEqual({
      ok: false,
      error: BUILDER_PAUSED,
    })
    expect(await statusOf(client, fx.projectId)).toEqual([])
  })

  test('if the feature changed after Save, Start builds from what Production serves NOW — it never rolls a change back', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    // Someone ships a rule on the feature after the draft was saved.
    const changed: FlagDefinition = {
      ...SERVED,
      rules: [
        { priority: 5, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
      ],
    }
    await activate(client, fx, changed)
    const started = await startExperimentCommand(
      fx.slug,
      saved.ok ? saved.experimentKey : '',
      deps(client, fx)
    )
    expect(started).toMatchObject({ ok: true, version: 2, serving: true })
    expect(await statusOf(client, fx.projectId)).toEqual([
      { version: 1, status: 'draft' },
      { version: 2, status: 'running' },
    ])
    const serving = await productionVersionOf(client, fx.projectId)
    expect(stripExperiment(serving.flag_definition_versions.definition)).toEqual(changed)
  })
})
