import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { EXACT_SEGMENT_TAG_FIELDS, MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS } from '@/lib/entity-contract'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import {
  MAX_JOURNEY_STAGES,
  MAX_PREDICATE_STRING_LENGTH,
  parseJourneyDefinition,
} from '@/lib/journey-definition'
import {
  JOURNEY_REGISTRY_RELATIONAL_SELECT,
  mapJourneyRegistryRows,
  type JourneyRegistryRelationRow,
} from '@/lib/journey-registry-view'

// entity-journeys-projections · Sprint 1, Story 1.1.
// Pure contract + HTTP dark path + database state machine. The database tests drive the same
// service-role RPCs the app uses and deliberately try owner/member/foreign identities; no API key is
// treated as a management credential.
//
// MUTATION EVIDENCE (2026-07-22, exact focused runs):
//   A. Replaced the flag's exact comparison with Boolean(env): "only the exact string" failed 1/1
//      at JOURNEY_PROJECTIONS_ENABLED="false" (received true).
//   B. disabled `!ALLOWED_TAGS.has(field)`: "rejects unsafe/high-cardinality" failed 1/1 because
//      `{email: ...}` was accepted (received true).
//   C. removed PUBLIC from create_journey_version's REVOKE, reset local Supabase, then ran the
//      service-role-only spec: failed 1/1 with 42501 "journey management requires project
//      ownership" — proof anon reached the FUNCTION BODY, exactly the leak this assertion detects.
// Every mutation was reverted. The independent-review run replayed migrations cleanly, passed this
// focused registry file 9/9, and passed the dedicated built-server OFF spec 1/1.

const VALID_DEFINITION = {
  entityType: 'merchant',
  description: 'Activation lifecycle',
  stages: [
    { key: 'signed_up', event: 'merchant_signed_up', tags: { source: 'organic', plan: 'founding' } },
    { key: 'published', event: 'store_published', tags: { region: 'mx', campaign: 42, channel: true } },
  ],
  cohortEntry: { stageKey: 'signed_up' },
  retention: { stageKey: 'published', anchorStageKey: 'signed_up', withinDays: 30 },
}

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function createUser(client: SupabaseClient, suffix: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `journey-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-journey-spec-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create auth fixture: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, suffix: string): Promise<string> {
  const { data, error } = await client
    .from('projects')
    .insert({ slug: `journey-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: `h-${crypto.randomUUID()}` })
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
  return client.rpc('create_journey_version', {
    p_project_id: projectId,
    p_journey_key: key,
    p_definition: definition,
    p_actor_user_id: ownerId,
  })
}

test.describe('JOURNEY_PROJECTIONS_ENABLED — dark by default', () => {
  test('only the exact string "true" enables it', () => {
    const original = process.env.JOURNEY_PROJECTIONS_ENABLED
    try {
      delete process.env.JOURNEY_PROJECTIONS_ENABLED
      expect(isJourneyProjectionsEnabled()).toBe(false)
      for (const off of ['false', '0', 'off', 'TRUE', ' true', '']) {
        process.env.JOURNEY_PROJECTIONS_ENABLED = off
        expect(isJourneyProjectionsEnabled()).toBe(false)
      }
      process.env.JOURNEY_PROJECTIONS_ENABLED = 'true'
      expect(isJourneyProjectionsEnabled()).toBe(true)
    } finally {
      if (original === undefined) delete process.env.JOURNEY_PROJECTIONS_ENABLED
      else process.env.JOURNEY_PROJECTIONS_ENABLED = original
    }
  })

})

test.describe('journey definition — closed bounded contract', () => {
  // Mutation proof D: flipping the mapper's active-version equality makes this test fail with all
  // three lifecycle states misclassified, proving the single-snapshot mapping is actually pinned.
  test('one embedded snapshot maps active, superseded and draft versions coherently', () => {
    const rows: JourneyRegistryRelationRow[] = [{
      id: 'journey-1',
      key: 'merchant_activation',
      active_version_id: 'version-2',
      created_by: 'owner-1',
      created_at: '2026-07-22T00:00:00.000Z',
      versions: [
        { id: 'version-1', version: 1, definition: VALID_DEFINITION, created_by: 'owner-1', created_at: '2026-07-22T00:00:00.000Z', activated_by: 'owner-1', activated_at: '2026-07-22T01:00:00.000Z' },
        { id: 'version-3', version: 3, definition: VALID_DEFINITION, created_by: 'owner-1', created_at: '2026-07-22T03:00:00.000Z', activated_by: null, activated_at: null },
        { id: 'version-2', version: 2, definition: VALID_DEFINITION, created_by: 'owner-1', created_at: '2026-07-22T02:00:00.000Z', activated_by: 'owner-1', activated_at: '2026-07-22T02:30:00.000Z' },
      ],
    }]
    const mapped = mapJourneyRegistryRows(rows)
    expect(mapped[0].activeVersionId).toBe('version-2')
    expect(mapped[0].versions.map((version) => [version.version, version.state])).toEqual([
      [3, 'draft'], [2, 'active'], [1, 'superseded'],
    ])
  })

  test('accepts 1–20 ordered stages, the five reusable dimensions and exact scalar predicates', () => {
    expect(EXACT_SEGMENT_TAG_FIELDS).toEqual(['source', 'channel', 'campaign', 'plan', 'region'])
    expect(parseJourneyDefinition(VALID_DEFINITION)).toEqual({ ok: true, definition: VALID_DEFINITION })

    const twenty = {
      entityType: 'account',
      stages: Array.from({ length: MAX_JOURNEY_STAGES }, (_, i) => ({ key: `stage_${i}`, event: `event_${i}` })),
    }
    expect(parseJourneyDefinition(twenty).ok).toBe(true)
  })

  test('rejects empty/oversized stages, duplicates, unknown fields and non-lower_snake_case keys', () => {
    for (const definition of [
      { entityType: 'merchant', stages: [] },
      { entityType: 'merchant', stages: Array.from({ length: 21 }, (_, i) => ({ key: `s_${i}`, event: 'x' })) },
      { entityType: 'merchant', stages: [{ key: 'same', event: 'x' }, { key: 'same', event: 'y' }] },
      { entityType: 'Merchant', stages: [{ key: 'ok', event: 'x' }] },
      { entityType: 'merchant', stages: [{ key: 'Not_Snake', event: 'x' }] },
      { entityType: 'merchant', stages: [{ key: 'ok', event: 'x', expression: 'return true' }] },
      { entityType: 'merchant', stages: [{ key: 'ok', event: 'x' }], sql: 'select true' },
    ]) expect(parseJourneyDefinition(definition).ok).toBe(false)
  })

  test('rejects unsafe/high-cardinality tag fields, non-scalars and overlong strings', () => {
    for (const tags of [
      { email: 'person@example.test' },
      { subject_id: 'merchant-123' },
      { source: { nested: true } },
      { source: null },
      { source: 'x'.repeat(MAX_PREDICATE_STRING_LENGTH + 1) },
      { source: 'a', channel: 'b', campaign: 'c', plan: 'd', region: 'e', sixth: 'f' },
    ]) {
      expect(parseJourneyDefinition({ entityType: 'merchant', stages: [{ key: 'one', event: 'x', tags }] }).ok).toBe(false)
    }
  })

  test('numeric predicates accept the bounded safe-integer maximum and reject fractions or unsafe integers', () => {
    const definitionFor = (campaign: number) => ({
      entityType: 'merchant',
      stages: [{ key: 'one', event: 'x', tags: { campaign } }],
    })
    expect(parseJourneyDefinition(definitionFor(MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS)).ok).toBe(true)
    expect(parseJourneyDefinition(definitionFor(-MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS)).ok).toBe(true)
    for (const rejected of [42.5, MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS + 1, Number.MAX_SAFE_INTEGER + 1]) {
      const result = parseJourneyDefinition(definitionFor(rejected))
      expect(result.ok, String(rejected)).toBe(false)
      if (!result.ok) expect(result.errors.join(' ')).toContain('safe integer')
    }
  })

  test('cohort entry can only be stage 1; retention anchor must precede/equal target within 1–365 days', () => {
    const base = { entityType: 'merchant', stages: [{ key: 'one', event: 'x' }, { key: 'two', event: 'y' }] }
    expect(parseJourneyDefinition({ ...base, cohortEntry: { stageKey: 'two' } }).ok).toBe(false)
    expect(parseJourneyDefinition({ ...base, retention: { stageKey: 'one', anchorStageKey: 'two', withinDays: 30 } }).ok).toBe(false)
    expect(parseJourneyDefinition({ ...base, retention: { stageKey: 'two', anchorStageKey: 'one', withinDays: 0 } }).ok).toBe(false)
    expect(parseJourneyDefinition({ ...base, retention: { stageKey: 'two', anchorStageKey: 'two', withinDays: 365 } }).ok).toBe(true)
  })
})

test('DB RPCs bind owner identity, allocate versions safely, activate once, and audit atomically', async () => {
  const client = db()
  const [owner, member, foreignOwner] = await Promise.all([
    createUser(client, 'owner'), createUser(client, 'member'), createUser(client, 'foreign'),
  ])
  const [projectId, foreignProjectId] = await Promise.all([
    createProject(client, 'primary'), createProject(client, 'foreign'),
  ])
  try {
    expect((await client.from('project_members').insert([
      { project_id: projectId, user_id: owner, role: 'owner' },
      { project_id: projectId, user_id: member, role: 'member' },
      { project_id: foreignProjectId, user_id: foreignOwner, role: 'owner' },
    ])).error).toBeNull()

    // Session actor binding is enforced again in the DB. A member and another project's owner both
    // fail even though the service-role client itself has authority to execute the RPC.
    expect((await createVersion(client, projectId, member, 'blocked_member')).error?.code).toBe('42501')
    expect((await createVersion(client, projectId, foreignOwner, 'blocked_foreign')).error?.code).toBe('42501')

    // Concurrent same-key calls must serialize to distinct contiguous versions. These successful
    // calls also prove the private-schema JSON CHECK is executable through the service-role RPC
    // after schema USAGE was revoked from public/anon/authenticated.
    const creates = await Promise.all([
      createVersion(client, projectId, owner, 'merchant_activation'),
      createVersion(client, projectId, owner, 'merchant_activation'),
      createVersion(client, projectId, owner, 'merchant_activation'),
    ])
    for (const result of creates) expect(result.error).toBeNull()
    const createdRows = creates.flatMap((result) => result.data ?? []) as Array<Record<string, unknown>>
    expect(createdRows.map((row) => Number(row.version)).sort()).toEqual([1, 2, 3])
    const journeyId = createdRows[0].journey_id as string

    const { data: versions } = await client
      .from('journey_definition_versions')
      .select('id, version, definition, activated_at')
      .eq('project_id', projectId)
      .eq('journey_id', journeyId)
      .order('version')
    expect(versions).toHaveLength(3)

    const v1 = versions![0]
    const v2 = versions![1]
    const firstActivation = await client.rpc('activate_journey_version', {
      p_project_id: projectId, p_journey_id: journeyId, p_version_id: v1.id, p_actor_user_id: owner,
    })
    expect(firstActivation.error).toBeNull()
    expect(firstActivation.data).toBe(true)

    const secondActivation = await client.rpc('activate_journey_version', {
      p_project_id: projectId, p_journey_id: journeyId, p_version_id: v2.id, p_actor_user_id: owner,
    })
    expect(secondActivation.error).toBeNull()
    expect(secondActivation.data).toBe(true)

    // The private immutability trigger is exercised by activation (its one allowed transition).
    // A direct service-role rewrite is denied, so an active document cannot be edited in place.
    const rewrite = await client
      .from('journey_definition_versions')
      .update({ definition: { entityType: 'merchant', stages: [{ key: 'hacked', event: 'x' }] } })
      .eq('id', v2.id)
    expect(rewrite.error).not.toBeNull()

    const reactivation = await client.rpc('activate_journey_version', {
      p_project_id: projectId, p_journey_id: journeyId, p_version_id: v1.id, p_actor_user_id: owner,
    })
    expect(reactivation.error).toBeNull()
    expect(reactivation.data).toBe(false)

    const { data: registry } = await client
      .from('journey_registries').select('active_version_id').eq('id', journeyId).single()
    expect(registry?.active_version_id).toBe(v2.id)

    // The exact embedded relationship used by listJourneyRegistries resolves pointer + activation
    // fields in one SQL statement/snapshot, then the shared mapper derives coherent states.
    const { data: relational, error: relationalError } = await client
      .from('journey_registries')
      .select(JOURNEY_REGISTRY_RELATIONAL_SELECT)
      .eq('id', journeyId)
      .single()
    expect(relationalError).toBeNull()
    const mappedRegistry = mapJourneyRegistryRows([relational as unknown as JourneyRegistryRelationRow])[0]
    expect(mappedRegistry.activeVersionId).toBe(v2.id)
    expect(mappedRegistry.versions.find((version) => version.id === v2.id)?.state).toBe('active')
    expect(mappedRegistry.versions.find((version) => version.id === v1.id)?.state).toBe('superseded')

    const { data: audit } = await client
      .from('journey_definition_audit')
      .select('action, actor_user_id, created_at')
      .eq('project_id', projectId)
      .eq('journey_id', journeyId)
    expect(audit?.filter((row) => row.action === 'version_created')).toHaveLength(3)
    expect(audit?.filter((row) => row.action === 'version_activated')).toHaveLength(2)
    expect(audit?.every((row) => row.actor_user_id === owner && Boolean(row.created_at))).toBe(true)

    // DB backstop rejects the same high-cardinality predicate even when TypeScript is bypassed, and
    // a failed create leaves neither a version nor an audit row (one RPC transaction).
    const unsafe = await createVersion(client, projectId, owner, 'unsafe_definition', {
      entityType: 'merchant', stages: [{ key: 'one', event: 'x', tags: { email: 'x@example.test' } }],
    })
    expect(unsafe.error).not.toBeNull()
    expect((await client.from('journey_registries').select('id').eq('project_id', projectId).eq('key', 'unsafe_definition')).data).toHaveLength(0)

    // SQL's three-valued NULL logic must not let absent required JSON fields slip through. Drive
    // the RPC directly (bypassing the pure TypeScript validator), including the DB-side 32KiB cap.
    for (const [key, definition] of [
      ['missing_entity', { stages: [{ key: 'one', event: 'x' }] }],
      ['missing_stages', { entityType: 'merchant' }],
      ['missing_stage_key', { entityType: 'merchant', stages: [{ event: 'x' }] }],
      ['missing_stage_event', { entityType: 'merchant', stages: [{ key: 'one' }] }],
      ['missing_cohort_key', { entityType: 'merchant', stages: [{ key: 'one', event: 'x' }], cohortEntry: {} }],
      ['missing_retention_field', { entityType: 'merchant', stages: [{ key: 'one', event: 'x' }], retention: { stageKey: 'one', withinDays: 30 } }],
      ['oversized_json', { entityType: 'merchant', description: 'x'.repeat(33 * 1024), stages: [{ key: 'one', event: 'x' }] }],
    ] as const) {
      const rejected = await createVersion(client, projectId, owner, key, definition)
      expect(rejected.error, key).not.toBeNull()
    }

    // Raw JSON preserves the numeric literal sent to Postgres. Use the REST function endpoint
    // directly to prove the SQL safe-integer backstop rejects both a fraction and 1e400; passing
    // the latter through a JS object would turn it into Infinity/null before the RPC.
    const supabaseUrl = process.env.SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    for (const [key, literal] of [['decimal_numeric', '42.5'], ['huge_numeric', '1e400']] as const) {
      const rawBody = JSON.stringify({
        p_project_id: projectId,
        p_journey_key: key,
        p_definition: {
          entityType: 'merchant',
          stages: [{ key: 'one', event: 'x', tags: { campaign: '__RAW_NUMBER__' } }],
        },
        p_actor_user_id: owner,
      }).replace('"__RAW_NUMBER__"', literal)
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/create_journey_version`, {
        method: 'POST',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: rawBody,
      })
      expect(response.ok, key).toBe(false)
      expect((await client.from('journey_registries').select('id').eq('project_id', projectId).eq('key', key)).data).toHaveLength(0)
    }

    // Concurrent activation always settles on the highest version. Each successful state change
    // has exactly one audit row; losing/obsolete attempts return false and write none.
    const raceCreates = []
    for (let i = 0; i < 3; i += 1) raceCreates.push(await createVersion(client, projectId, owner, 'activation_race'))
    const raceRows = raceCreates.flatMap((result) => result.data ?? []) as Array<Record<string, unknown>>
    const raceJourneyId = raceRows[0].journey_id as string
    const activations = await Promise.all(raceRows.map((row) => client.rpc('activate_journey_version', {
      p_project_id: projectId,
      p_journey_id: raceJourneyId,
      p_version_id: row.version_id,
      p_actor_user_id: owner,
    })))
    for (const activation of activations) expect(activation.error).toBeNull()
    const highest = raceRows.find((row) => Number(row.version) === 3)!
    const { data: raceRegistry } = await client
      .from('journey_registries').select('active_version_id').eq('id', raceJourneyId).single()
    expect(raceRegistry?.active_version_id).toBe(highest.version_id)
    const { data: raceAudit } = await client
      .from('journey_definition_audit')
      .select('version_id')
      .eq('journey_id', raceJourneyId)
      .eq('action', 'version_activated')
    expect(raceAudit).toHaveLength(activations.filter((result) => result.data === true).length)
    expect(raceAudit?.some((row) => row.version_id === highest.version_id)).toBe(true)

    // Audit is append-only to the app role: INSERT, UPDATE and DELETE attempts fail; TRUNCATE is
    // asserted at migration time because PostgREST intentionally exposes no TRUNCATE method.
    const auditInsert = await client.from('journey_definition_audit').insert({
      project_id: projectId,
      journey_id: journeyId,
      version_id: v1.id,
      action: 'version_created',
      actor_user_id: owner,
    })
    const auditUpdate = await client
      .from('journey_definition_audit').update({ actor_user_id: member }).eq('journey_id', journeyId)
    const auditDelete = await client.from('journey_definition_audit').delete().eq('journey_id', journeyId)
    expect(auditInsert.error).not.toBeNull()
    expect(auditUpdate.error).not.toBeNull()
    expect(auditDelete.error).not.toBeNull()
  } finally {
    // Best-effort fixture cleanup only: service_role intentionally has no direct projects DELETE.
    // The migration-owner property assertion proves project cascade + audit survival instead.
    await client.from('projects').delete().in('id', [projectId, foreignProjectId])
    await Promise.all([owner, member, foreignOwner].map((id) => client.auth.admin.deleteUser(id)))
  }
})

test('journey mutation RPCs are service-role-only with function-level denial, never an RLS fallthrough', async () => {
  const url = process.env.SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  test.skip(!url || !anon, 'anon key not available')
  const anonClient = createClient(url!, anon!, { auth: { persistSession: false } })
  const zero = '00000000-0000-0000-0000-000000000000'
  const calls: [string, Record<string, unknown>][] = [
    ['create_journey_version', { p_project_id: zero, p_journey_key: 'x', p_definition: VALID_DEFINITION, p_actor_user_id: zero }],
    ['activate_journey_version', { p_project_id: zero, p_journey_id: zero, p_version_id: zero, p_actor_user_id: zero }],
  ]
  for (const [name, args] of calls) {
    const { error } = await anonClient.rpc(name, args)
    expect(error).not.toBeNull()
    const code = error?.code ?? ''
    const message = (error?.message ?? '').toLowerCase()
    const functionLevel =
      (code === '42501' && message.includes('function')) ||
      code === 'PGRST202' || message.includes('could not find the function')
    expect(functionLevel, `${name}: expected function denial, got ${code} ${message}`).toBe(true)
    expect(message).not.toContain('row-level security')
  }
})
