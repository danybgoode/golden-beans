import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  buildExperimentPlan,
  resolveTemplateDefaults,
  type ExperimentPlan,
} from '@/lib/experiment-builder-plan'
import type { EventCatalog } from '@/lib/event-catalog'
import {
  cleanupExperimentProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

// experiments-for-humans · Story 3.2 (epic README D7) — Save draft is ONE transactional, idempotent
// function. Everything here goes through the real `save_experiment_draft` on local Supabase; the
// plan it saves comes from the real planner, exactly as the server action will call it.

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(requireLocalSupabaseApiUrl(), key, { auth: { persistSession: false } })
}

async function createUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `save-draft-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-save-draft-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create auth fixture: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, ownerId: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({
      slug: `save-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: `h-${crypto.randomUUID()}`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create project fixture: ${error?.message}`)
  const member = await client
    .from('project_members')
    .insert({ project_id: data.id, user_id: ownerId, role: 'owner' })
  if (member.error) throw new Error(`could not add owner: ${member.error.message}`)
  return data.id as string
}

const CATALOG: EventCatalog = {
  events: [
    {
      event: 'application_completed',
      count14d: 700,
      count24h: 50,
      daily: Array(14).fill(50),
      reserved: false,
    },
    {
      event: 'application_abandoned',
      count14d: 300,
      count24h: 20,
      daily: Array(14).fill(21),
      reserved: false,
    },
  ],
  entities: [{ type: 'merchant', subjects14d: 2800 }],
  baselines: [
    { event: 'application_completed', type: 'merchant', baseline: 0.25 },
    { event: 'application_abandoned', type: 'merchant', baseline: 0.1 },
  ],
  segments: [],
  flagEvaluations: [],
  truncated: false,
  rowCap: 50000,
  windowDays: 14,
  asOf: '2026-09-24T15:00:00.000Z',
  segmentCombos: { rows: 0, combos: [], complete: true },
  observedDays: 14,
}

function plan(overrides: { split?: number; nextVersion?: number } = {}): {
  plan: ExperimentPlan
  answers: Record<string, unknown>
} {
  const resolved = resolveTemplateDefaults('copy', { catalog: CATALOG, flagKey: null })
  if (!resolved.answers) throw new Error('no answers')
  const answers = { ...resolved.answers, split: overrides.split ?? 50 }
  const result = buildExperimentPlan(answers, {
    catalog: CATALOG,
    served: null,
    now: new Date('2026-09-24T15:00:00.000Z'),
    nextVersion: overrides.nextVersion ?? 1,
    takenExperimentKeys: [],
    takenFlagKeys: [],
  })
  if (!result.ok) throw new Error(result.errors.join('; '))
  return { plan: result.plan, answers }
}

function save(client: SupabaseClient, projectId: string, actor: string, saved: ReturnType<typeof plan>) {
  return client.rpc('save_experiment_draft', {
    p_project_id: projectId,
    p_experiment_key: saved.plan.experimentKey,
    p_definition: saved.plan.definition,
    p_flag_key: saved.plan.flagKey,
    p_flag_definition: saved.plan.flagDefinition,
    p_answers: saved.answers,
    p_actor_user_id: actor,
  })
}

test.describe('save_experiment_draft (D7)', () => {
  // One project, one experiment key, versions that build on each other: order is the point.
  test.describe.configure({ mode: 'serial' })
  let client: SupabaseClient
  let owner: string
  let stranger: string
  let projectId: string

  test.beforeAll(async () => {
    client = db()
    owner = await createUser(client, 'owner')
    stranger = await createUser(client, 'stranger')
    projectId = await createProject(client, owner)
  })
  test.afterAll(async () => {
    await cleanupExperimentProjects([projectId])
    await Promise.all([owner, stranger].map((id) => client.auth.admin.deleteUser(id)))
  })

  test('two CONCURRENT identical saves create one version, one flag version, one binding, one answers row — nothing activated', async () => {
    const saved = plan()
    const [first, second] = await Promise.all([
      save(client, projectId, owner, saved),
      save(client, projectId, owner, saved),
    ])
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    const rows = [first.data![0], second.data![0]]
    expect(rows.map((row) => row.version)).toEqual([1, 1])
    expect(rows.map((row) => row.created).sort()).toEqual([false, true])
    expect(rows[0].flag_version_id).toBe(rows[1].flag_version_id)

    const versions = await client
      .from('experiment_definition_versions')
      .select('id,status')
      .eq('project_id', projectId)
    expect(versions.data).toHaveLength(1)
    expect(versions.data![0].status).toBe('draft')
    const flagVersions = await client
      .from('flag_definition_versions')
      .select('id,definition')
      .eq('project_id', projectId)
    expect(flagVersions.data).toHaveLength(1)
    // D2: the flag version names the experiment AND the version the function created.
    expect(flagVersions.data![0].definition.metadata).toMatchObject({
      experiment_key: saved.plan.experimentKey,
      experiment_version: 1,
      experiment_rules: '0,10',
    })
    const bindings = await client
      .from('experiment_flag_version_bindings')
      .select('id')
      .eq('project_id', projectId)
    expect(bindings.data).toHaveLength(1)
    const answers = await client
      .from('experiment_builder_answers')
      .select('answers')
      .eq('project_id', projectId)
    expect(answers.data).toHaveLength(1)
    expect(answers.data![0].answers).toEqual(saved.answers)
    const activations = await client
      .from('flag_environment_activations')
      .select('flag_id')
      .eq('project_id', projectId)
    expect(activations.data).toEqual([])
  })

  test('a CHANGED plan is a new version, bound to a new flag version that names it', async () => {
    const saved = plan({ split: 20, nextVersion: 2 })
    const { data, error } = await save(client, projectId, owner, saved)
    expect(error).toBeNull()
    expect(data![0]).toMatchObject({ version: 2, created: true })
    const flagVersion = await client
      .from('flag_definition_versions')
      .select('definition')
      .eq('id', data![0].flag_version_id)
      .single()
    expect(flagVersion.data!.definition.metadata.experiment_version).toBe(2)
  })

  test('only an OWNER can save, and the refusal comes before any input is judged', async () => {
    const saved = plan()
    const { error } = await save(client, projectId, stranger, saved)
    expect(error?.code).toBe('42501')
    const garbage = await client.rpc('save_experiment_draft', {
      p_project_id: projectId,
      p_experiment_key: 'BAD KEY',
      p_definition: {},
      p_flag_key: 'x',
      p_flag_definition: {},
      p_answers: {},
      p_actor_user_id: stranger,
    })
    expect(garbage.error?.code).toBe('42501')
  })

  test('a flag definition that names ANOTHER experiment is refused, and nothing is written', async () => {
    const saved = plan({ nextVersion: 3 })
    const before = await client
      .from('experiment_definition_versions')
      .select('id')
      .eq('project_id', projectId)
    const { error } = await save(client, projectId, owner, {
      ...saved,
      plan: {
        ...saved.plan,
        flagDefinition: {
          ...saved.plan.flagDefinition,
          metadata: { ...saved.plan.flagDefinition.metadata, experiment_key: 'someone_else' },
        },
      },
    })
    expect(error?.code).toBe('22023')
    const after = await client.from('experiment_definition_versions').select('id').eq('project_id', projectId)
    expect(after.data).toHaveLength(before.data!.length)
  })

  test('anon cannot execute the function (a FUNCTION-level denial, not an RLS error), and the answers table is append-only', async () => {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
    const anon = createClient(requireLocalSupabaseApiUrl(), anonKey, { auth: { persistSession: false } })
    const saved = plan()
    const { error } = await anon.rpc('save_experiment_draft', {
      p_project_id: projectId,
      p_experiment_key: saved.plan.experimentKey,
      p_definition: saved.plan.definition,
      p_flag_key: saved.plan.flagKey,
      p_flag_definition: saved.plan.flagDefinition,
      p_answers: saved.answers,
      p_actor_user_id: owner,
    })
    expect(error).not.toBeNull()
    // A FUNCTION-level denial — not "function not found" (PGRST202), which would also pass if the
    // function were missing, and not an RLS error, which would mean EXECUTE leaked and the body ran.
    expect(`${error?.code} ${error?.message}`).toMatch(
      /^42501 permission denied for function save_experiment_draft/
    )

    // The application's role may read the answers and do nothing else to them.
    const update = await client
      .from('experiment_builder_answers')
      .update({ answers: {} })
      .eq('project_id', projectId)
      .select()
    expect(update.error?.code).toBe('42501')
    const del = await client.from('experiment_builder_answers').delete().eq('project_id', projectId).select()
    expect(del.error?.code).toBe('42501')
  })
})
