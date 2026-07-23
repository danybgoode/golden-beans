import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import {
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'
import {
  mapExperimentDecisionRows,
  type ExperimentDecisionRow,
} from '@/lib/experiment-decision-contract'

const DECISION_READ_COLUMNS =
  'id, ordinal, definition_version, record_kind, outcome, chosen_variant_key, rationale, analysis_snapshot, integrity_snapshot, actor_user_id, created_at, supersedes_record_id'

const DEFINITION = {
  hypothesis: 'A clearer founding-store promise increases completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: {
    description: 'Consented founding-store applicants in Mexico.',
    tags: { region: 'mx', plan: 'founding' },
  },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'new-copy', weight: 1 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_abandoned', direction: 'decrease' }],
  segmentFields: ['source', 'region'],
  plannedWindow: {
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-08-01T00:00:00.000Z',
  },
  minimumSamplePerVariant: 10,
}

const ANALYSIS = {
  window: {
    startAt: '2026-07-01T00:00:00.000Z',
    endAt: '2026-08-01T00:00:00.000Z',
    asOf: '2026-08-01T00:00:00.000Z',
  },
  decisionReady: true,
  integrityReady: true,
  sampleStatus: 'met',
  blockers: [],
  variants: [
    { key: 'control', observedSubjects: 10, expectedSubjects: 10, minimumSampleStatus: 'met' },
    { key: 'new-copy', observedSubjects: 10, expectedSubjects: 10, minimumSampleStatus: 'met' },
  ],
  primaryMetric: {
    event: 'founding_application_completed',
    direction: 'increase',
    variants: [],
    absoluteDelta: 0.1,
    relativeLift: 0.2,
    directionalStatus: 'favorable',
  },
  guardrailMetrics: [{
    event: 'founding_application_abandoned',
    direction: 'decrease',
    variants: [],
    absoluteDelta: 0,
    relativeLift: 0,
    directionalStatus: 'no_difference',
  }],
  diagnostics: {
    srm: { status: 'clear', alpha: 0.01, chiSquare: 0, pValue: 1 },
    integrity: [],
    validExposureSubjects: 20,
  },
  freshness: {
    latestEffectiveFactAt: '2026-07-31T00:00:00.000Z',
    latestReceiptAt: '2026-07-31T00:00:01.000Z',
    staleAfterHours: 24,
    isStale: false,
  },
  segment: { status: 'not_requested' },
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
    email: `decision-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-decision-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create auth fixture: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({
      slug: `decision-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      api_key_hash: `h-${crypto.randomUUID()}`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create project fixture: ${error?.message}`)
  return data.id as string
}

async function createStoppedVersion(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  key: string,
) {
  const created = await client.rpc('create_experiment_version', {
    p_project_id: projectId,
    p_experiment_key: key,
    p_definition: DEFINITION,
    p_actor_user_id: ownerId,
  })
  if (created.error || !created.data?.[0]) {
    throw new Error(`could not create version: ${created.error?.message}`)
  }
  const row = created.data[0] as {
    experiment_id: string
    version_id: string
    version: number
  }
  for (const target of ['running', 'stopped']) {
    const transition = await client.rpc('transition_experiment_version', {
      p_project_id: projectId,
      p_experiment_id: row.experiment_id,
      p_version_id: row.version_id,
      p_target_status: target,
      p_actor_user_id: ownerId,
    })
    if (transition.error || transition.data?.[0]?.status !== target) {
      throw new Error(`could not transition version to ${target}: ${transition.error?.message}`)
    }
  }
  return row
}

function recordDecision(
  client: SupabaseClient,
  input: {
    projectId: string
    experimentId: string
    versionId: string
    actorId: string
    kind?: 'decision' | 'correction'
    outcome?: 'ship_treatment' | 'keep_control' | 'iterate' | 'inconclusive' | 'invalid'
    chosenVariant?: string | null
    rationale?: string
    analysis?: unknown
    idempotencyKey?: string
    supersedesId?: string | null
  },
) {
  return client.rpc('record_experiment_decision', {
    p_project_id: input.projectId,
    p_experiment_id: input.experimentId,
    p_version_id: input.versionId,
    p_record_kind: input.kind ?? 'decision',
    p_outcome: input.outcome ?? 'ship_treatment',
    p_chosen_variant_key: input.chosenVariant === undefined ? 'new-copy' : input.chosenVariant,
    p_rationale: input.rationale ?? 'The primary metric improved with clear allocation integrity.',
    p_analysis_snapshot: input.analysis ?? ANALYSIS,
    p_actor_user_id: input.actorId,
    p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
    p_supersedes_record_id: input.supersedesId ?? null,
  })
}

async function cleanupRetainedExperimentEvidence(projectIds: string[]): Promise<void> {
  const postgres = new PgClient({ connectionString: requireTestDatabaseUrl() })
  await postgres.connect()
  try {
    await postgres.query('BEGIN')
    await postgres.query('DELETE FROM public.projects WHERE id = ANY($1::uuid[])', [projectIds])
    await postgres.query(
      'DELETE FROM public.experiment_decision_records WHERE project_id = ANY($1::uuid[])',
      [projectIds],
    )
    await postgres.query(
      'DELETE FROM public.experiment_lifecycle_audit WHERE project_id = ANY($1::uuid[])',
      [projectIds],
    )
    await postgres.query('COMMIT')
  } catch (error) {
    await postgres.query('ROLLBACK')
    throw error
  } finally {
    await postgres.end()
  }
}

test('decision ledger is owner-only, atomic, idempotent and a linear immutable correction chain', async () => {
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
    const version = await createStoppedVersion(client, projectId, owner, 'founding-message-decision')
    const foreignVersion = await createStoppedVersion(
      client,
      foreignProjectId,
      foreignOwner,
      'foreign-decision',
    )

    for (const actorId of [member, foreignOwner]) {
      const denied = await recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId,
      })
      expect(denied.error?.code).toBe('42501')
    }
    const foreignScope = await recordDecision(client, {
      projectId,
      experimentId: foreignVersion.experiment_id,
      versionId: foreignVersion.version_id,
      actorId: owner,
    })
    expect(foreignScope.error).toBeNull()
    expect(foreignScope.data).toEqual([])

    for (const [outcome, chosenVariant] of [
      ['ship_treatment', 'control'],
      ['keep_control', 'new-copy'],
      ['iterate', 'new-copy'],
    ] as const) {
      const invalid = await recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId: owner,
        outcome,
        chosenVariant,
      })
      expect(invalid.error?.code).toBe('22023')
    }
    const malformedSnapshot = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      analysis: { decisionReady: true },
    })
    expect(malformedSnapshot.error?.code).toBe('22023')
    expect((await client
      .from('experiment_decision_records')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('version_id', version.version_id)).count).toBe(0)
    expect((await client
      .from('experiment_definition_versions')
      .select('status')
      .eq('project_id', projectId)
      .eq('id', version.version_id)
      .single()).data?.status).toBe('stopped')

    const idempotencyKey = crypto.randomUUID()
    const concurrent = await Promise.all([
      recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId: owner,
        idempotencyKey,
      }),
      recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId: owner,
        idempotencyKey,
      }),
    ])
    for (const result of concurrent) expect(result.error).toBeNull()
    const initialIds = concurrent.map((result) => result.data?.[0]?.id)
    expect(initialIds[0]).toBeTruthy()
    expect(new Set(initialIds).size).toBe(1)
    const initial = concurrent[0].data![0] as Record<string, unknown>
    expect(initial).toMatchObject({
      project_id: projectId,
      experiment_id: version.experiment_id,
      version_id: version.version_id,
      definition_version: 1,
      ordinal: 1,
      record_kind: 'decision',
      outcome: 'ship_treatment',
      chosen_variant_key: 'new-copy',
      actor_user_id: owner,
      idempotency_key: idempotencyKey,
    })
    expect(initial.definition_snapshot).toEqual(DEFINITION)
    expect(initial.analysis_snapshot).toEqual(ANALYSIS)
    expect(initial.integrity_snapshot).toMatchObject({
      integrityReady: true,
      decisionReady: true,
      blockers: [],
      srm: { status: 'clear' },
      diagnostics: [],
    })
    expect((await client
      .from('experiment_definition_versions')
      .select('status')
      .eq('project_id', projectId)
      .eq('id', version.version_id)
      .single()).data?.status).toBe('decided')
    expect((await client
      .from('experiment_lifecycle_audit')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('version_id', version.version_id)
      .eq('action', 'version_decided')).count).toBe(1)

    const replay = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      idempotencyKey,
    })
    expect(replay.error).toBeNull()
    expect(replay.data?.[0]?.id).toBe(initial.id)
    expect(replay.data?.[0]?.outcome).toBe('ship_treatment')
    const conflictingReplay = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      outcome: 'invalid',
      chosenVariant: null,
      rationale: 'A changed payload cannot silently reuse prior evidence.',
      idempotencyKey,
    })
    expect(conflictingReplay.error?.code).toBe('22023')

    const correctionKey = crypto.randomUUID()
    const correction = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      kind: 'correction',
      outcome: 'inconclusive',
      chosenVariant: null,
      rationale: 'Late data changed the interpretation; no rollout action is implied.',
      idempotencyKey: correctionKey,
      supersedesId: initial.id as string,
      analysis: { ...ANALYSIS, decisionReady: false, blockers: ['srm_detected'] },
    })
    expect(correction.error).toBeNull()
    expect(correction.data?.[0]).toMatchObject({
      ordinal: 2,
      record_kind: 'correction',
      supersedes_record_id: initial.id,
      outcome: 'inconclusive',
      chosen_variant_key: null,
    })
    const correctionReplay = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      kind: 'correction',
      outcome: 'inconclusive',
      chosenVariant: null,
      rationale: 'Late data changed the interpretation; no rollout action is implied.',
      analysis: { ...ANALYSIS, decisionReady: false, blockers: ['srm_detected'] },
      idempotencyKey: correctionKey,
      supersedesId: initial.id as string,
    })
    expect(correctionReplay.error).toBeNull()
    expect(correctionReplay.data?.[0]?.id).toBe(correction.data?.[0]?.id)

    const staleCorrection = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      kind: 'correction',
      outcome: 'invalid',
      chosenVariant: null,
      supersedesId: initial.id as string,
    })
    expect(staleCorrection.error?.code).toBe('55000')
    expect((await client
      .from('experiment_decision_records')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('version_id', version.version_id)).count).toBe(2)
  } finally {
    try {
      await cleanupRetainedExperimentEvidence([projectId, foreignProjectId])
    } finally {
      await Promise.all([owner, member, foreignOwner].map((id) => client.auth.admin.deleteUser(id)))
    }
  }
})

test('decision records deny direct writes, survive parent cleanup and never mutate feature state', async () => {
  const client = db()
  const owner = await createUser(client, 'retention-owner')
  const projectId = await createProject(client, 'retention')
  const postgres = new PgClient({ connectionString: requireTestDatabaseUrl() })
  let postgresConnected = false
  try {
    expect((await client.from('project_members').insert({
      project_id: projectId,
      user_id: owner,
      role: 'owner',
    })).error).toBeNull()
    expect((await client.from('features').insert({
      project_id: projectId,
      key: 'miyagi-owned-rollout',
      enabled: true,
      description: 'Sentinel: the decision ledger must never change this pushed state.',
    })).error).toBeNull()
    const version = await createStoppedVersion(client, projectId, owner, 'retained-decision')
    const recorded = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      outcome: 'keep_control',
      chosenVariant: 'control',
    })
    expect(recorded.error).toBeNull()
    const recordId = recorded.data![0].id as string
    expect((await client
      .from('features')
      .select('enabled')
      .eq('project_id', projectId)
      .eq('key', 'miyagi-owned-rollout')
      .single()).data).toEqual({ enabled: true })

    expect((await client.from('experiment_decision_records').insert({
      ...recorded.data![0],
      id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
    })).error).not.toBeNull()
    expect((await client
      .from('experiment_decision_records')
      .update({ rationale: 'rewrite' })
      .eq('id', recordId)).error).not.toBeNull()
    expect((await client
      .from('experiment_decision_records')
      .delete()
      .eq('id', recordId)).error).not.toBeNull()

    await postgres.connect()
    postgresConnected = true
    await expect(postgres.query(
      'UPDATE public.experiment_decision_records SET rationale = $1 WHERE id = $2',
      ['owner rewrite', recordId],
    )).rejects.toMatchObject({ code: '55000' })
    await expect(postgres.query(
      'DELETE FROM public.experiment_decision_records WHERE id = $1',
      [recordId],
    )).rejects.toMatchObject({ code: '55000' })
    await expect(postgres.query(
      'TRUNCATE public.experiment_decision_records',
    )).rejects.toMatchObject({ code: '55000' })

    await postgres.query('BEGIN')
    try {
      await postgres.query('SET LOCAL ROLE service_role')
      for (const statement of [
        `INSERT INTO public.experiment_decision_records (
          project_id, experiment_id, version_id, definition_version, ordinal, record_kind, outcome,
          chosen_variant_key, rationale, definition_snapshot, analysis_snapshot, integrity_snapshot,
          actor_user_id, idempotency_key
        ) SELECT project_id, experiment_id, version_id, definition_version, 2, 'correction',
          'invalid', NULL, 'direct insert', definition_snapshot, analysis_snapshot, integrity_snapshot,
          actor_user_id, gen_random_uuid()
          FROM public.experiment_decision_records WHERE id = '${recordId}'`,
        `UPDATE public.experiment_decision_records SET rationale = 'direct update' WHERE id = '${recordId}'`,
        `DELETE FROM public.experiment_decision_records WHERE id = '${recordId}'`,
        'TRUNCATE public.experiment_decision_records',
      ]) {
        await expect(postgres.query(statement)).rejects.toMatchObject({ code: '42501' })
        await postgres.query('ROLLBACK')
        await postgres.query('BEGIN')
        await postgres.query('SET LOCAL ROLE service_role')
      }
    } finally {
      await postgres.query('ROLLBACK')
    }

    await postgres.query('DELETE FROM public.projects WHERE id = $1', [projectId])
    expect((await postgres.query(
      `SELECT project_id, experiment_id, version_id, definition_snapshot, analysis_snapshot
       FROM public.experiment_decision_records WHERE id = $1`,
      [recordId],
    )).rows).toHaveLength(1)
    expect((await postgres.query(
      'SELECT id FROM public.experiment_registries WHERE project_id = $1',
      [projectId],
    )).rows).toHaveLength(0)
    await postgres.query(
      'DELETE FROM public.experiment_decision_records WHERE project_id = $1',
      [projectId],
    )
    await postgres.query(
      'DELETE FROM public.experiment_lifecycle_audit WHERE project_id = $1',
      [projectId],
    )
  } finally {
    if (postgresConnected) await postgres.end()
    await client.auth.admin.deleteUser(owner)
  }
})

test('decision history fails closed before its cumulative analysis payload exceeds 4 MiB', async () => {
  const client = db()
  const owner = await createUser(client, 'payload-owner')
  const projectId = await createProject(client, 'payload-cap')
  try {
    expect((await client.from('project_members').insert({
      project_id: projectId,
      user_id: owner,
      role: 'owner',
    })).error).toBeNull()
    const version = await createStoppedVersion(client, projectId, owner, 'payload-bounded-decision')
    // Large enough that 16 records fit below 4 MiB and the 17th crosses it, while every individual
    // snapshot remains below the independent 256 KiB ceiling.
    const largeAnalysis = { ...ANALYSIS, proofPadding: 'x'.repeat(250_000) }
    let latest = (await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      outcome: 'inconclusive',
      chosenVariant: null,
      analysis: largeAnalysis,
    })).data?.[0]
    expect(latest).toBeTruthy()

    for (let ordinal = 2; ordinal <= 16; ordinal += 1) {
      const correction = await recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId: owner,
        kind: 'correction',
        outcome: 'inconclusive',
        chosenVariant: null,
        rationale: `Bounded correction ${ordinal}.`,
        analysis: largeAnalysis,
        supersedesId: latest!.id,
      })
      expect(correction.error, `ordinal ${ordinal}`).toBeNull()
      latest = correction.data?.[0]
    }

    const overCap = await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      kind: 'correction',
      outcome: 'inconclusive',
      chosenVariant: null,
      rationale: 'This correction would make the serialized history exceed four MiB.',
      analysis: largeAnalysis,
      supersedesId: latest!.id,
    })
    expect(overCap.error?.code).toBe('54000')
    expect((await client
      .from('experiment_decision_records')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('version_id', version.version_id)).count).toBe(16)
  } finally {
    try {
      await cleanupRetainedExperimentEvidence([projectId])
    } finally {
      await client.auth.admin.deleteUser(owner)
    }
  }
})

test('a long-rationale history accepted by the write cap always maps through the read resolver', async () => {
  // Teeth for the write/read cap alignment: the write cap must count the SAME rationale + analysis +
  // integrity bytes the read resolver bounds. Under the earlier analysis-only write cap, a history of
  // maxed multi-byte rationales was accepted on write yet exceeded the read bound — permanently
  // bricking the governed view. Here we fill until the payload cap fires, then prove every accepted
  // record maps without ExperimentDecisionResourceLimitError. This fails if the write cap regresses to
  // counting analysis alone.
  const client = db()
  const owner = await createUser(client, 'readable-owner')
  const projectId = await createProject(client, 'readable-cap')
  try {
    expect((await client.from('project_members').insert({
      project_id: projectId,
      user_id: owner,
      role: 'owner',
    })).error).toBeNull()
    const version = await createStoppedVersion(client, projectId, owner, 'readable-bounded-decision')
    // Moderate analysis (~50 KiB) so the payload cap fires well before the 100-record cap, plus a
    // MAX rationale of 2000 emoji code points (8000 UTF-8 bytes) — the exact uncounted term the old
    // cap ignored.
    const analysis = { ...ANALYSIS, proofPadding: 'x'.repeat(50_000) }
    const bigRationale = '😀'.repeat(2_000)
    let latest = (await recordDecision(client, {
      projectId,
      experimentId: version.experiment_id,
      versionId: version.version_id,
      actorId: owner,
      outcome: 'inconclusive',
      chosenVariant: null,
      rationale: bigRationale,
      analysis,
    })).data?.[0]
    expect(latest).toBeTruthy()

    let accepted = 1
    let capFired = false
    for (let ordinal = 2; ordinal <= 100; ordinal += 1) {
      const res = await recordDecision(client, {
        projectId,
        experimentId: version.experiment_id,
        versionId: version.version_id,
        actorId: owner,
        kind: 'correction',
        outcome: 'inconclusive',
        chosenVariant: null,
        rationale: bigRationale,
        analysis,
        supersedesId: latest!.id,
      })
      if (res.error) {
        expect(res.error.code, `unexpected error at ordinal ${ordinal}`).toBe('54000')
        capFired = true
        break
      }
      latest = res.data?.[0]
      accepted += 1
    }
    // The payload cap — not the 100-record cap — must be what stopped the fill.
    expect(capFired, 'payload cap must fire before the 100-record cap').toBe(true)
    expect(accepted).toBeLessThan(100)

    const { data: rows, error } = await client
      .from('experiment_decision_records')
      .select(DECISION_READ_COLUMNS)
      .eq('project_id', projectId)
      .eq('version_id', version.version_id)
      .order('ordinal', { ascending: true })
    expect(error).toBeNull()
    expect(rows?.length).toBe(accepted)
    // The whole accepted history reads back through the exact read-mapping logic without tripping its
    // resource bound: proof that anything the write cap accepts is always readable.
    expect(() =>
      mapExperimentDecisionRows(rows as unknown as ExperimentDecisionRow[]),
    ).not.toThrow()
  } finally {
    try {
      await cleanupRetainedExperimentEvidence([projectId])
    } finally {
      await client.auth.admin.deleteUser(owner)
    }
  }
})

test('decision RPC is service-role-only with function-level anon denial', async () => {
  const url = requireLocalSupabaseApiUrl()
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const zero = '00000000-0000-0000-0000-000000000000'
  const { error } = await client.rpc('record_experiment_decision', {
    p_project_id: zero,
    p_experiment_id: zero,
    p_version_id: zero,
    p_record_kind: 'decision',
    p_outcome: 'invalid',
    p_chosen_variant_key: null,
    p_rationale: 'This must never reach the function body.',
    p_analysis_snapshot: ANALYSIS,
    p_actor_user_id: zero,
    p_idempotency_key: crypto.randomUUID(),
    p_supersedes_record_id: null,
  })
  expect(error).not.toBeNull()
  const message = (error?.message ?? '').toLowerCase()
  const functionLevel =
    (error?.code === '42501' && message.includes('function')) ||
    error?.code === 'PGRST202' ||
    message.includes('could not find the function')
  expect(functionLevel, `${error?.code} ${message}`).toBe(true)
  expect(message).not.toContain('row-level security')
})
