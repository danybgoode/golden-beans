import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import type { FlagDefinition } from '@golden-frijoles/sdk'
import { createBuilderIo, type BuilderIo } from '@/lib/experiment-builder-io'
import {
  saveExperimentDraftCommand,
  startExperimentCommand,
  type BuilderDependencies,
} from '@/lib/experiment-builder-command'
import { rolloutExperimentCommand, undoRolloutCommand } from '@/lib/experiment-rollout-command'
import { computeExperimentAnalysis } from '@/lib/experiment-analysis'
import { prepareExperimentDecisionSnapshot } from '@/lib/experiment-decision-contract'
import type { ExperimentBuilderAnswers } from '@/lib/experiment-builder-plan'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

// experiments-for-humans · Story 4.2 (epic README D8). Decide, then roll out as a SEPARATE write,
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

async function decide(
  client: SupabaseClient,
  fx: Fixture,
  experimentKey: string,
  outcome: 'ship_treatment' | 'keep_control'
) {
  const io = createBuilderIo(client)
  const draft = await io.loadDraft(fx.projectId, experimentKey)
  if (!draft) throw new Error('no experiment')
  const stop = await client.rpc('transition_experiment_version', {
    p_project_id: fx.projectId,
    p_experiment_id: draft.experimentId,
    p_version_id: draft.versionId,
    p_target_status: 'stopped',
    p_actor_user_id: fx.owner,
  })
  if (stop.error) throw new Error(`stop: ${stop.error.message}`)
  const stopped = await io.loadDraft(fx.projectId, experimentKey)
  const now = new Date().toISOString()
  const analysis = computeExperimentAnalysis({
    experimentKey,
    definitionVersion: draft.version,
    definition: draft.definition,
    lifecycle: { status: 'stopped', startedAt: draft.definition.plannedWindow.startAt, endedAt: now },
    asOf: now,
    facts: [],
  })
  const { error } = await client.rpc('record_experiment_decision', {
    p_project_id: fx.projectId,
    p_experiment_id: draft.experimentId,
    p_version_id: draft.versionId,
    p_record_kind: 'decision',
    p_outcome: outcome,
    p_chosen_variant_key: outcome === 'ship_treatment' ? 'on' : 'off',
    p_rationale: 'The main number improved and guardrails held',
    p_analysis_snapshot: prepareExperimentDecisionSnapshot(analysis, now),
    p_actor_user_id: fx.owner,
    p_idempotency_key: crypto.randomUUID(),
    p_supersedes_record_id: null,
  })
  if (error) throw new Error(`decide: ${error.message}`)
  return stopped!
}

async function decisionBytes(projectId: string) {
  const pg = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await pg.connect()
  try {
    const { rows } = await pg.query(
      'select row_to_json(r)::text as bytes from experiment_decision_records r where project_id = $1 order by id',
      [projectId]
    )
    return rows.map((row) => row.bytes as string)
  } finally {
    await pg.end()
  }
}

test.describe('Decide, then roll out (D8)', () => {
  let client: SupabaseClient
  test.beforeAll(() => {
    client = db()
  })
  test.afterAll(async () => {
    await cleanupExperimentProjects(created.map((fx) => fx.projectId))
    await Promise.all(created.map((fx) => client.auth.admin.deleteUser(fx.owner)))
  })

  test('the rollout serves the winner to everyone, the undo restores the split, and the decision record never changes', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    const key = saved.ok ? saved.experimentKey : ''
    const started = await startExperimentCommand(fx.slug, key, deps(client, fx))
    expect(started).toMatchObject({ ok: true, serving: true })

    // Before the decision, a rollout is refused and nothing is written.
    expect(await rolloutExperimentCommand(fx.slug, key, 1, 'on', deps(client, fx))).toMatchObject({
      ok: false,
    })

    await decide(client, fx, key, 'ship_treatment')
    const before = await decisionBytes(fx.projectId)
    expect(before).toHaveLength(1)

    const rollout = await rolloutExperimentCommand(fx.slug, key, 1, 'on', deps(client, fx))
    expect(rollout).toMatchObject({ ok: true, serving: true, variantKey: 'on' })
    const served = await productionVersionOf(client, fx.projectId)
    expect(served.flag_definition_versions.definition.defaultVariantKey).toBe('on')
    expect(served.flag_definition_versions.definition.rules).toEqual([])
    expect(served.flag_definition_versions.definition.metadata?.experiment_key).toBeUndefined()
    expect(await decisionBytes(fx.projectId)).toEqual(before)

    const undo = await undoRolloutCommand(
      fx.slug,
      key,
      rollout.ok ? rollout.previousVersionId : '',
      rollout.ok ? rollout.rolloutVersionId : '',
      deps(client, fx)
    )
    expect(undo).toEqual({ ok: true })
    expect((await productionVersionOf(client, fx.projectId)).version_id).toBe(
      rollout.ok ? rollout.previousVersionId : ''
    )
    expect(await decisionBytes(fx.projectId)).toEqual(before)
  })

  test('the rollout refuses a version that is not part of the test, and the undo refuses a foreign version', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    const key = saved.ok ? saved.experimentKey : ''
    await startExperimentCommand(fx.slug, key, deps(client, fx))
    await decide(client, fx, key, 'keep_control')
    expect(await rolloutExperimentCommand(fx.slug, key, 1, 'nope', deps(client, fx))).toMatchObject({
      ok: false,
    })
    // The record says KEEP: rolling out the treatment is refused by the server, whatever the page sends.
    const before = await productionVersionOf(client, fx.projectId)
    expect(await rolloutExperimentCommand(fx.slug, key, 1, 'on', deps(client, fx))).toEqual({
      ok: false,
      error: 'The roll-out must match the recorded decision.',
    })
    expect((await productionVersionOf(client, fx.projectId)).version_id).toBe(before.version_id)
    // …and the control, which it does name, goes through.
    expect(await rolloutExperimentCommand(fx.slug, key, 1, 'off', deps(client, fx))).toMatchObject({
      ok: true,
      variantKey: 'off',
    })
    expect(
      await undoRolloutCommand(fx.slug, key, crypto.randomUUID(), crypto.randomUUID(), deps(client, fx))
    ).toMatchObject({
      ok: false,
    })
  })

  const CHANGED: FlagDefinition = {
    ...SERVED,
    rules: [
      { priority: 5, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  }

  test('the undo refuses once the feature changed after the rollout — it never rolls that change back', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    const key = saved.ok ? saved.experimentKey : ''
    await startExperimentCommand(fx.slug, key, deps(client, fx))
    await decide(client, fx, key, 'ship_treatment')
    const rollout = await rolloutExperimentCommand(fx.slug, key, 1, 'on', deps(client, fx))
    expect(rollout).toMatchObject({ ok: true, serving: true })
    const theirs = await activate(client, fx, CHANGED)
    const undo = await undoRolloutCommand(
      fx.slug,
      key,
      rollout.ok ? rollout.previousVersionId : '',
      rollout.ok ? rollout.rolloutVersionId : '',
      deps(client, fx)
    )
    expect(undo.ok).toBe(false)
    expect((await productionVersionOf(client, fx.projectId)).version_id).toBe(theirs.version_id)
  })

  test('a change landing between the rollout plan and its write is never overwritten', async () => {
    const fx = await fixture(client)
    const saved = await saveExperimentDraftCommand(fx.slug, answers(), null, deps(client, fx))
    const key = saved.ok ? saved.experimentKey : ''
    await startExperimentCommand(fx.slug, key, deps(client, fx))
    await decide(client, fx, key, 'ship_treatment')
    let theirs: { version_id: string } | null = null
    let calls = 0
    const racing = new Proxy(client, {
      get(target, property) {
        if (property === 'rpc') {
          return async (name: string, args: Record<string, unknown>) => {
            if (name === 'set_flag_activation' && calls++ === 0) theirs = await activate(client, fx, CHANGED)
            return target.rpc(name, args)
          }
        }
        const value = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as SupabaseClient
    const rollout = await rolloutExperimentCommand(
      fx.slug,
      key,
      1,
      'on',
      deps(client, fx, createBuilderIo(racing))
    )
    expect(rollout.ok).toBe(false)
    expect(calls).toBe(1)
    expect((await productionVersionOf(client, fx.projectId)).version_id).toBe(theirs!.version_id)
    expect(await decisionBytes(fx.projectId)).toHaveLength(1)
  })
})
