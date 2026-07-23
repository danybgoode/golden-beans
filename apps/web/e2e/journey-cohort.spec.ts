import { createHash, randomBytes } from 'node:crypto'
import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import {
  computeJourneyCohort,
  encodeCursor,
  isValidJourneyDrilldown,
  journeyCursorScope,
  type JourneyCohortOptions,
} from '@/lib/journey-cohort'
import { parseJourneyCohortRequest } from '@/lib/journey-cohort-request'
import type { JourneyDefinition } from '@/lib/journey-definition'
import type { JourneyProjectionEvent } from '@/lib/journey-projection'
import {
  cleanupJourneyProjects,
  requireLocalSupabaseApiUrl,
  requireTestDatabaseUrl,
} from './helpers/test-db-cleanup'

// Entity journeys Sprint 2. The aggregate truth table pins narrowing conversion, current-stage
// aging, retention and late repair. The HTTP/MCP fixture then proves all external channels call the
// same project-scoped/version-explicit resolver and emit only opaque ids.
//
// Mutation evidence (2026-07-22): replacing positional `>=` with `===` failed the exact occupancy
// counts, and replacing the inclusive retention deadline `<=` with `<` failed the boundary outcome.

const DEFINITION: JourneyDefinition = {
  entityType: 'merchant',
  stages: [
    { key: 'created', event: 'merchant_created', tags: { source: 'organic' } },
    { key: 'configured', event: 'merchant_configured' },
    { key: 'selling', event: 'merchant_sold', tags: { region: 'mx' } },
  ],
  cohortEntry: { stageKey: 'created' },
  retention: { stageKey: 'selling', anchorStageKey: 'created', withinDays: 3 },
}

const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString()
const OPTIONS: JourneyCohortOptions = {
  definitionVersion: 1,
  from: at(1),
  to: at(11),
  asOf: at(11),
  timezone: 'America/Mexico_City',
  staleAfterHours: 24,
  drilldown: 'cohort',
  pageSize: 2,
}

function fact(subjectId: string, event: string, day: number, tags: Record<string, unknown> = {}, receiptDay = day): JourneyProjectionEvent {
  return {
    id: crypto.randomUUID(),
    event,
    tags,
    occurredAt: at(day),
    createdAt: at(receiptDay),
    subjectId,
  }
}

function truthTableEvents(): JourneyProjectionEvent[] {
  return [
    fact('a', 'merchant_created', 2, { source: 'organic' }),
    fact('a', 'merchant_configured', 3),
    fact('a', 'merchant_sold', 4, { region: 'mx' }),
    fact('b', 'merchant_created', 2, { source: 'organic' }),
    fact('b', 'merchant_configured', 4, {
      contact_email: 'sensitive-customer@example.test',
      phone: '+52-55-sensitive',
      metadata: { customerName: 'Sensitive Person' },
    }),
    fact('c', 'merchant_created', 3, { source: 'organic' }),
    fact('d', 'merchant_created', 9, { source: 'organic' }, 10),
    // Jumps directly from stage 1 to stage 3. Conversion says "at or beyond" stage 2, while the
    // underlying subject history truthfully contains no configured-stage satisfaction.
    fact('jump', 'merchant_created', 2, { source: 'organic' }),
    fact('jump', 'merchant_sold', 5, { region: 'mx' }),
    // Highest independently-satisfied stage is preserved, but configured cohort entry means this
    // subject is not silently admitted without stage 1.
    fact('stage-three-only', 'merchant_sold', 2, { region: 'mx' }),
  ]
}

test('cohort aggregate narrows conversion, computes age percentiles/retention, and paginates opaque ids', () => {
  const result = computeJourneyCohort(DEFINITION, truthTableEvents(), OPTIONS)
  expect(result).toMatchObject({
    populationStatus: 'nonzero',
    cohort: {
      entryMode: 'configured_stage_1',
      entryStageKey: 'created',
      from: at(1),
      to: at(11),
      asOf: at(11),
      timezone: 'America/Mexico_City',
      subjectCount: 5,
    },
    diagnostics: { relevantEventCount: 10 },
    stages: [
      { key: 'created', satisfiedCount: 5, atOrBeyondCount: 5, currentCount: 2, missingNextStageCount: 2, medianAgeHours: 120, p90AgeHours: 192 },
      { key: 'configured', satisfiedCount: 2, atOrBeyondCount: 3, currentCount: 1, missingNextStageCount: 1, medianAgeHours: 168, p90AgeHours: 168 },
      { key: 'selling', satisfiedCount: 2, atOrBeyondCount: 2, currentCount: 2, missingNextStageCount: null, medianAgeHours: 156, p90AgeHours: 168 },
    ],
    retention: {
      eligibleCount: 5,
      maturedCount: 4,
      metCount: 2,
      missedCount: 2,
      pendingCount: 1,
      rate: 0.5,
    },
    freshness: { latestReceiptAt: at(10), isStale: false },
    drilldown: { key: 'cohort', total: 5, subjectIds: ['a', 'b'] },
  })
  expect(result.stages.map((stage) => stage.cohortConversionRate)).toEqual([1, 0.4, 0.4])
  expect(result.stages.map((stage) => stage.continuationFromPreviousRate)).toEqual([1, 0.4, 0.5])
  expect(result.stages.every((stage) => (stage.continuationFromPreviousRate ?? 0) <= 1)).toBe(true)
  expect(result.stages.map((stage) => stage.atOrBeyondShare)).toEqual([1, 0.6, 0.4])
  expect(result.drilldown?.nextCursor).toBe(encodeCursor('b', journeyCursorScope(OPTIONS)))

  const pageTwo = computeJourneyCohort(DEFINITION, truthTableEvents(), {
    ...OPTIONS,
    cursor: result.drilldown!.nextCursor!,
  })
  expect(pageTwo.drilldown).toMatchObject({ subjectIds: ['c', 'd'] })
  expect(pageTwo.drilldown?.nextCursor).not.toBeNull()

  const afterInsertionBeforeCursor = computeJourneyCohort(DEFINITION, [
    ...truthTableEvents(),
    fact('aa', 'merchant_created', 2, { source: 'organic' }),
  ], {
    ...OPTIONS,
    cursor: result.drilldown!.nextCursor!,
  })
  expect(afterInsertionBeforeCursor.drilldown?.subjectIds).toEqual(['c', 'd'])
})

test('late facts repair cohort conversion and retention without a projector', () => {
  const before = computeJourneyCohort(DEFINITION, truthTableEvents(), OPTIONS)
  const after = computeJourneyCohort(DEFINITION, [
    ...truthTableEvents(),
    // Arrives after the cohort window closed, but its effective fact time belongs inside it.
    fact('b', 'merchant_sold', 5, { region: 'mx' }, 12),
  ], { ...OPTIONS, asOf: at(13) })
  expect(before.stages[2].atOrBeyondCount).toBe(2)
  expect(after.stages[2].atOrBeyondCount).toBe(3)
  expect(after.stages[1].missingNextStageCount).toBe(0)
  expect(after.retention).toMatchObject({ maturedCount: 5, metCount: 3, missedCount: 2, pendingCount: 0, rate: 0.6 })
  expect(after.freshness.latestReceiptAt).toBe(at(12))
})

test('retention uses exact microsecond deadlines and a matured-only denominator', () => {
  const definition: JourneyDefinition = {
    entityType: 'merchant',
    stages: [
      { key: 'started', event: 'started' },
      { key: 'returned', event: 'returned' },
    ],
    cohortEntry: { stageKey: 'started' },
    retention: { stageKey: 'returned', anchorStageKey: 'started', withinDays: 1 },
  }
  const exact = '2026-01-02T00:00:00.000100Z'
  const outside = '2026-01-02T00:00:00.000101Z'
  const anchor = '2026-01-01T00:00:00.000100Z'
  const rows: JourneyProjectionEvent[] = [
    { ...fact('exact', 'started', 1), occurredAt: anchor, createdAt: anchor },
    { ...fact('exact', 'returned', 2), occurredAt: exact, createdAt: exact },
    { ...fact('outside', 'started', 1), occurredAt: anchor, createdAt: anchor },
    { ...fact('outside', 'returned', 2), occurredAt: outside, createdAt: outside },
    { ...fact('pending', 'started', 3), occurredAt: at(3), createdAt: at(3) },
    // The first-ever target is before the anchor, but a qualifying repeat after the anchor meets
    // retention. Looking only at projected first satisfaction would misclassify this subject.
    { ...fact('repeat', 'returned', 1), occurredAt: at(1), createdAt: at(1) },
    { ...fact('repeat', 'started', 2), occurredAt: at(2), createdAt: at(2) },
    {
      ...fact('repeat', 'returned', 2),
      id: 'repeat-retention-target',
      occurredAt: '2026-01-02T12:00:00.000000Z',
      createdAt: '2026-01-02T12:00:00.000000Z',
    },
  ]
  const result = computeJourneyCohort(definition, rows, {
    ...OPTIONS,
    from: '2026-01-01T00:00:00.000000Z',
    to: '2026-01-03T12:00:00.000000Z',
    asOf: '2026-01-03T12:00:00.000000Z',
  })
  expect(result.retention).toMatchObject({
    eligibleCount: 4,
    maturedCount: 3,
    metCount: 2,
    missedCount: 1,
    pendingCount: 1,
    rate: 0.666667,
  })
})

test('no qualifying events, zero cohort subjects, stale source and request failures are distinct', () => {
  const irrelevant = [fact('x', 'merchant_note', 2)]
  expect(computeJourneyCohort(DEFINITION, irrelevant, OPTIONS).populationStatus).toBe('no_qualifying_events')
  const zeroAndStale = computeJourneyCohort(DEFINITION, [fact('x', 'merchant_created', 1, { source: 'organic' })], {
    ...OPTIONS,
    from: at(2),
    staleAfterHours: 1,
  })
  expect(zeroAndStale.populationStatus).toBe('zero_subjects')
  expect(zeroAndStale.freshness.status).toBe('stale')
  const afterWindowOnly = computeJourneyCohort(
    DEFINITION,
    [fact('after', 'merchant_created', 12, { source: 'organic' })],
    { ...OPTIONS, asOf: at(13) },
  )
  expect(afterWindowOnly.populationStatus).toBe('no_qualifying_events')

  expect(isValidJourneyDrilldown(DEFINITION, 'satisfied:unknown')).toBe(false)
  expect(isValidJourneyDrilldown(DEFINITION, 'missing_next:selling')).toBe(false)
  expect(isValidJourneyDrilldown({ ...DEFINITION, retention: undefined }, 'retention:met')).toBe(false)
  expect(() => computeJourneyCohort(DEFINITION, truthTableEvents(), {
    ...OPTIONS,
    drilldown: 'missing_next:selling',
  })).toThrow('drilldown is not valid')

  expect(parseJourneyCohortRequest({ version: '1', from: at(11), to: at(1), asOf: at(11), timezone: 'UTC' }))
    .toEqual({ ok: false, error: 'from must be before to' })
  expect(parseJourneyCohortRequest({ version: '1', from: at(1), to: at(11), asOf: at(11), timezone: 'Not/A_Zone' }).ok)
    .toBe(false)
  expect(parseJourneyCohortRequest({ version: '1', from: at(1), to: at(11), asOf: at(11), timezone: 'UTC', cursor: 'garbage' }).ok)
    .toBe(false)
  expect(parseJourneyCohortRequest({ version: '1', from: at(1), to: at(11), asOf: at(11), timezone: 'UTC', pageSize: '101' }).ok)
    .toBe(false)
  expect(parseJourneyCohortRequest(
    { version: '1', from: at(1), to: at(12), asOf: at(12), timezone: 'UTC' },
    Date.parse(at(11)),
  )).toEqual({ ok: false, error: 'asOf must not be in the future' })
  expect(parseJourneyCohortRequest(
    { version: '1', from: at(1), to: at(12), asOf: at(11), timezone: 'UTC' },
    Date.parse(at(11)),
  )).toEqual({ ok: false, error: 'to must not be after asOf' })
  const serverCaptured = parseJourneyCohortRequest(
    { version: '1', from: at(1), to: at(11), timezone: 'UTC' },
    Date.parse(at(11)),
  )
  expect(serverCaptured.ok && serverCaptured.options.asOf).toBe(at(11))

  const cursor = computeJourneyCohort(DEFINITION, truthTableEvents(), OPTIONS).drilldown!.nextCursor!
  expect(parseJourneyCohortRequest({
    version: '1',
    from: OPTIONS.from,
    to: OPTIONS.to,
    asOf: OPTIONS.asOf,
    timezone: OPTIONS.timezone,
    drilldown: 'cohort',
    cursor,
  }).ok).toBe(true)
  expect(parseJourneyCohortRequest({
    version: '2',
    from: OPTIONS.from,
    to: OPTIONS.to,
    asOf: OPTIONS.asOf,
    timezone: OPTIONS.timezone,
    drilldown: 'cohort',
    cursor,
  }).ok).toBe(false)
})

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  return createClient(requireLocalSupabaseApiUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function createOwner(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `journey-cohort-${label}-${Date.now()}-${randomBytes(5).toString('hex')}@example.test`,
    password: 'local-only-journey-cohort-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create owner: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string) {
  const key = `gb_journey_cohort_${randomBytes(18).toString('hex')}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const slug = `journey-cohort-${label}-${randomBytes(6).toString('hex')}`
  const { data, error } = await client.from('projects').insert({ slug, api_key_hash: keyHash }).select('id').single()
  if (error || !data) throw new Error(`could not create project: ${error?.message}`)
  const { error: keyError } = await client.from('api_keys').insert({ project_id: data.id, key_hash: keyHash, label: 'cohort spec' })
  if (keyError) throw new Error(`could not create key: ${keyError.message}`)
  const token = `gb_connector_${randomBytes(24).toString('base64url')}`
  const { error: tokenError } = await client.from('connector_tokens').insert({ project_id: data.id, token })
  if (tokenError) throw new Error(`could not create connector: ${tokenError.message}`)
  return { id: data.id as string, slug, key, token }
}

async function createVersion(client: SupabaseClient, projectId: string, ownerId: string, journeyKey: string) {
  expect((await client.from('project_members').insert({ project_id: projectId, user_id: ownerId, role: 'owner' })).error).toBeNull()
  const { data, error } = await client.rpc('create_journey_version', {
    p_project_id: projectId,
    p_journey_key: journeyKey,
    p_definition: DEFINITION,
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create version: ${error?.message}`)
  return Number(data[0].version)
}

async function insertEvents(client: SupabaseClient, projectId: string, rows: JourneyProjectionEvent[]) {
  const { error } = await client.from('events').insert(rows.map((row) => ({
    id: row.id,
    project_id: projectId,
    user_id: `journey-cohort-user-${randomBytes(8).toString('hex')}`,
    event: row.event,
    tags: row.tags,
    context_version: 1,
    subject_type: 'merchant',
    subject_id: row.subjectId,
    occurred_at: row.occurredAt,
    created_at: row.createdAt,
  })))
  if (error) throw new Error(`could not insert events: ${error.message}`)
}

async function withMigrationOwner<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requireTestDatabaseUrl() })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

async function mcpCall(request: APIRequestContext, token: string, name: string, args: unknown) {
  const response = await request.post(`/api/v1/public/mcp/c/${token}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const body = await response.json()
  if (!body.result) return { response, payload: body }
  const text = body.result.content[0].text as string
  try {
    return { response, payload: JSON.parse(text) }
  } catch {
    return { response, payload: text }
  }
}

test('cohort snapshot succeeds at 50,000 facts, then fails closed on 32 MiB and 50,001', async () => {
  test.setTimeout(120_000)
  const client = db()
  const project = await createProject(client, 'bounds')
  const shortEvent = 'cohort_cap'
  const longEvent = 'e'.repeat(128)
  const longSubject = 's'.repeat(128)
  const asOf = new Date().toISOString()
  try {
    await withMigrationOwner(async (owner) => {
      await owner.query(
        `
          INSERT INTO public.events (
            project_id, user_id, event, tags, context_version,
            subject_type, subject_id, occurred_at, created_at
          )
          SELECT
            $1::UUID,
            'cohort-cap-' || n,
            $2::TEXT,
            '{}'::JSONB,
            1,
            'merchant',
            'cohort-cap-subject',
            '2026-01-01T00:00:00Z'::TIMESTAMPTZ + n * INTERVAL '1 microsecond',
            '2026-01-01T00:00:00Z'::TIMESTAMPTZ + n * INTERVAL '1 microsecond'
          FROM generate_series(1, 50000) AS n
        `,
        [project.id, shortEvent],
      )
    })

    const atLimit = await client.rpc('get_journey_cohort_events', {
      p_project_id: project.id,
      p_subject_type: 'merchant',
      p_event_names: [shortEvent],
      p_to: at(11),
      p_as_of: asOf,
    })
    expect(atLimit.error).toBeNull()
    expect(atLimit.data).toHaveLength(50_000)

    await withMigrationOwner(async (owner) => {
      await owner.query(
        `
          UPDATE public.events
          SET occurred_at = '2026-01-12T00:00:00Z'::TIMESTAMPTZ,
              created_at = '2026-01-12T00:00:00Z'::TIMESTAMPTZ
          WHERE project_id = $1::UUID
        `,
        [project.id],
      )
    })
    const postWindowOnly = await client.rpc('get_journey_cohort_events', {
      p_project_id: project.id,
      p_subject_type: 'merchant',
      p_event_names: [shortEvent],
      p_to: at(11),
      p_as_of: asOf,
    })
    expect(postWindowOnly.error).toBeNull()
    expect(postWindowOnly.data).toEqual([])

    await withMigrationOwner(async (owner) => {
      await owner.query(
        `
          UPDATE public.events
          SET event = $2::TEXT,
              subject_id = $3::TEXT,
              occurred_at = '2026-01-01T00:00:00Z'::TIMESTAMPTZ,
              created_at = '2026-01-01T00:00:00Z'::TIMESTAMPTZ,
              tags = jsonb_build_object(
                'source', repeat('a', 64),
                'channel', repeat('b', 64),
                'campaign', repeat('c', 64),
                'plan', repeat('d', 64),
                'region', repeat('e', 64),
                'contact_email', 'must-never-cross@example.test'
              )
          WHERE project_id = $1::UUID
        `,
        [project.id, longEvent, longSubject],
      )
    })
    const overPayload = await client.rpc('get_journey_cohort_events', {
      p_project_id: project.id,
      p_subject_type: 'merchant',
      p_event_names: [longEvent],
      p_to: at(11),
      p_as_of: asOf,
    })
    expect(overPayload.data).toBeNull()
    expect(overPayload.error?.code).toBe('54000')
    expect(overPayload.error?.message).toContain('payload limit exceeded')

    await withMigrationOwner(async (owner) => {
      await owner.query(
        `
          INSERT INTO public.events (
            project_id, user_id, event, tags, context_version,
            subject_type, subject_id, occurred_at, created_at
          ) VALUES (
            $1::UUID, 'cohort-cap-over', $2::TEXT, '{}'::JSONB, 1,
            'merchant', $3::TEXT, '2026-01-02T00:00:00Z', '2026-01-02T00:00:00Z'
          )
        `,
        [project.id, longEvent, longSubject],
      )
    })
    const overEvents = await client.rpc('get_journey_cohort_events', {
      p_project_id: project.id,
      p_subject_type: 'merchant',
      p_event_names: [longEvent],
      p_to: at(11),
      p_as_of: asOf,
    })
    expect(overEvents.data).toBeNull()
    expect(overEvents.error?.code).toBe('54000')
    expect(overEvents.error?.message).toContain('event limit exceeded')

    const index = await withMigrationOwner((owner) => owner.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'events_journey_cohort_idx'`,
    ))
    expect(index.rows[0]?.indexdef).toContain('project_id, subject_type, event')
    expect(index.rows[0]?.indexdef).toContain('COALESCE(occurred_at, created_at)')
  } finally {
    await cleanupJourneyProjects([project.id])
  }
})

test('Bearer API and gated MCP return the same isolated versioned cohort with bounded pagination', async ({ request }) => {
  const client = db()
  const [ownerOne, ownerTwo] = await Promise.all([createOwner(client, 'one'), createOwner(client, 'two')])
  const [one, two] = await Promise.all([createProject(client, 'one'), createProject(client, 'two')])
  const journeyKey = `merchant_activation_${Date.now()}`
  try {
    const [versionOne] = await Promise.all([
      createVersion(client, one.id, ownerOne, journeyKey),
      createVersion(client, two.id, ownerTwo, journeyKey),
    ])
    await insertEvents(client, one.id, truthTableEvents())
    await insertEvents(client, two.id, [
      fact('foreign-only', 'merchant_created', 2, { source: 'organic' }),
      fact('foreign-only', 'merchant_sold', 3, { region: 'mx' }),
    ])

    const query = new URLSearchParams({
      version: String(versionOne),
      from: OPTIONS.from,
      to: OPTIONS.to,
      asOf: OPTIONS.asOf,
      timezone: OPTIONS.timezone,
      staleAfterHours: '24',
      drilldown: 'cohort',
      pageSize: '2',
    })
    const api = await request.get(`/api/v1/journeys/${journeyKey}/cohort?${query}`, {
      headers: { Authorization: `Bearer ${one.key}` },
    })
    expect(api.status()).toBe(200)
    const apiBody = await api.json()
    expect(apiBody.journey).toEqual({ key: journeyKey, definitionVersion: 1, entityType: 'merchant' })
    expect(apiBody.cohort.cohort.subjectCount).toBe(5)
    expect(apiBody.cohort.drilldown.subjectIds).toEqual(['a', 'b'])
    expect(apiBody.diagnostics).toMatchObject({
      queryKind: 'cohort',
      relevantEventCount: 10,
      telemetryStatus: 'available',
      sampleCount: 1,
      materializationDecision: 'keep_query_time',
      thresholds: {
        p95QueryDurationMs: 2_000,
        relevantEventCount: 1_000_000,
      },
    })
    expect(apiBody.diagnostics.queryDurationMs).toBeGreaterThanOrEqual(0)
    expect(JSON.stringify(apiBody.diagnostics).toLowerCase()).not.toContain('subject')
    expect(JSON.stringify(apiBody)).not.toContain('sensitive-customer@example.test')
    expect(JSON.stringify(apiBody)).not.toContain('+52-55-sensitive')
    expect(JSON.stringify(apiBody)).not.toContain('Sensitive Person')
    expect(JSON.stringify(apiBody)).not.toContain('foreign-only')

    const mcp = await mcpCall(request, one.token, 'get_journey_cohort', {
      journeyKey,
      version: versionOne,
      from: OPTIONS.from,
      to: OPTIONS.to,
      asOf: OPTIONS.asOf,
      timezone: OPTIONS.timezone,
      staleAfterHours: 24,
      drilldown: 'cohort',
      pageSize: 2,
    })
    expect(mcp.response.status()).toBe(200)
    expect(mcp.payload.ok).toBe(true)
    expect(mcp.payload.journey).toEqual(apiBody.journey)
    expect(mcp.payload.cohort).toEqual(apiBody.cohort)
    expect(mcp.payload.diagnostics).toMatchObject({
      queryKind: 'cohort',
      relevantEventCount: 10,
      telemetryStatus: 'available',
      sampleCount: 2,
      materializationDecision: 'keep_query_time',
    })

    const malformedMcp = await mcpCall(request, one.token, 'get_journey_cohort', {
      journeyKey: 'Not-A-Journey',
      version: versionOne,
      from: OPTIONS.from,
      to: OPTIONS.to,
      asOf: OPTIONS.asOf,
      timezone: 'UTC',
    })
    expect(malformedMcp.response.status()).toBe(200)
    expect(malformedMcp.payload).toContain('MCP error -32602')

    const wrongVersion = new URLSearchParams(query)
    wrongVersion.set('version', '999')
    expect((await request.get(`/api/v1/journeys/${journeyKey}/cohort?${wrongVersion}`, {
      headers: { Authorization: `Bearer ${one.key}` },
    })).status()).toBe(404)

    const invalidDrilldown = new URLSearchParams(query)
    invalidDrilldown.set('drilldown', 'satisfied:unknown')
    expect((await request.get(`/api/v1/journeys/${journeyKey}/cohort?${invalidDrilldown}`, {
      headers: { Authorization: `Bearer ${one.key}` },
    })).status()).toBe(400)

    const foreign = await request.get(`/api/v1/journeys/${journeyKey}/cohort?${query}`, {
      headers: { Authorization: `Bearer ${two.key}` },
    })
    expect((await foreign.json()).cohort.cohort.subjectCount).toBe(1)

    const unauthedUi = await request.get(`/app/journeys/${one.slug}/${journeyKey}`, { maxRedirects: 0 })
    expect([302, 307]).toContain(unauthedUi.status())
    expect(unauthedUi.headers().location).toContain('/login')

    expect((await request.get(`/api/v1/journeys/${journeyKey}/cohort?${query}`)).status()).toBe(401)
    expect((await request.get(`/api/v1/journeys/${journeyKey}/cohort?version=1&from=bad&to=${encodeURIComponent(at(11))}`, {
      headers: { Authorization: `Bearer ${one.key}` },
    })).status()).toBe(400)

    expect((await client.from('connector_tokens').update({ revoked_at: new Date().toISOString() }).eq('token', one.token)).error).toBeNull()
    const revoked = await mcpCall(request, one.token, 'get_journey_cohort', {
      journeyKey, version: versionOne, from: OPTIONS.from, to: OPTIONS.to, asOf: OPTIONS.asOf, timezone: 'UTC',
    })
    expect(revoked.response.status()).toBe(401)
  } finally {
    try {
      await cleanupJourneyProjects([one.id, two.id])
    } finally {
      await Promise.all([client.auth.admin.deleteUser(ownerOne), client.auth.admin.deleteUser(ownerTwo)])
    }
  }
})
