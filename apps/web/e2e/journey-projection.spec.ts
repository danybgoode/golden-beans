import { createHash } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS } from '@/lib/entity-contract'
import { eventMatchesStage, projectJourneySubject, type JourneyProjectionEvent } from '@/lib/journey-projection'
import type { JourneyDefinition } from '@/lib/journey-definition'
import { parseJourneyTimestamp } from '@/lib/journey-timestamp'
import { cleanupJourneyProjects, requireTestDatabaseUrl } from './helpers/test-db-cleanup'

// entity-journeys-projections · Sprint 1, Story 1.2.
// Pure truth-table coverage plus one real Bearer-authenticated query. The HTTP fixture intentionally
// shares an opaque subject id between two projects: an empty result is therefore meaningful proof
// that both definition and event reads remain scoped to the API-key-resolved project.
//
// MUTATION EVIDENCE (2026-07-22, exact focused runs):
//   A. Replaced `event.tags[key] !== expected` with `false`: the pure truth-table grep failed 1/3
//      (`tag predicates require every exact scalar`) because the first mismatched event entered at day 1,
//      not the exact all-scalar match at day 4.
//   B. Reversed effective-time ordering: the same grep failed 1/3 (`ordered, late, out-of-order…`)
//      because `created` entered at day 4, not its earliest fact time day 1.
//   C. Removed `events.project_id` from the resolver: the HTTP grep failed 1/1 because project
//      two's same-subject event advanced project one's result to `selling` on day 3.
//   D. Replaced the snapshot RPC with an explicitly one-page scoped query (`range(0, 999)`): the
//      HTTP grep failed 1/1 because the qualifying stage and newest freshness fact were omitted.
//   E. Replaced the microsecond comparator with millisecond-only Date ordering: the focused
//      same-millisecond test failed because canonical IDs selected `.000900Z` before `.000100Z`.
// Every mutation was reverted before the restored focused suite.

const DEFINITION: JourneyDefinition = {
  entityType: 'merchant',
  stages: [
    { key: 'created', event: 'merchant_created', tags: { source: 'organic' } },
    { key: 'configured', event: 'merchant_configured', tags: { plan: 'pro', campaign: MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS } },
    { key: 'selling', event: 'merchant_sold', tags: { region: 'mx' } },
  ],
}

const at = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString()

function fact(overrides: Partial<JourneyProjectionEvent> = {}): JourneyProjectionEvent {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    event: overrides.event ?? 'irrelevant',
    tags: overrides.tags ?? {},
    occurredAt: overrides.occurredAt ?? null,
    createdAt: overrides.createdAt ?? at(10),
    subjectId: overrides.subjectId ?? 'merchant-truth-table',
  }
}

test('projection truth table: ordered, late, out-of-order, duplicate, same-time, tags and irrelevant facts converge', () => {
  const subjectId = 'merchant-truth-table'
  const events = [
    // Listed in receipt/input order, deliberately not fact order. The day-1 source event arrived
    // last (day 9 receipt), and must still be the first stage timestamp.
    fact({ id: '00000000-0000-0000-0000-000000000003', event: 'merchant_sold', tags: { region: 'mx' }, occurredAt: at(3), createdAt: at(4), subjectId }),
    fact({ id: '00000000-0000-0000-0000-000000000002', event: 'merchant_configured', tags: { plan: 'pro', campaign: MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS }, occurredAt: at(2), createdAt: at(2), subjectId }),
    // Exact replay: one canonical id cannot create duplicate history.
    fact({ id: '00000000-0000-0000-0000-000000000002', event: 'merchant_configured', tags: { plan: 'pro', campaign: MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS }, occurredAt: at(2), createdAt: at(2), subjectId }),
    // A later lower stage is valid evidence but cannot regress currentStage.
    fact({ id: '00000000-0000-0000-0000-000000000004', event: 'merchant_created', tags: { source: 'organic' }, occurredAt: at(4), createdAt: at(5), subjectId }),
    // Irrelevant but newest source fact: it advances freshness only.
    fact({ id: '00000000-0000-0000-0000-000000000006', event: 'merchant_note', tags: { source: 'organic' }, occurredAt: at(5), createdAt: at(10), subjectId }),
    // `occurredAt: null` falls back to receipt time; it has a nonmatching string "pro"/number 1
    // predicate to prove exact scalar matching does not coerce values.
    fact({ id: '00000000-0000-0000-0000-000000000005', event: 'merchant_configured', tags: { plan: 1, campaign: MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS }, occurredAt: null, createdAt: at(6), subjectId }),
    fact({ id: '00000000-0000-0000-0000-000000000001', event: 'merchant_created', tags: { source: 'organic' }, occurredAt: at(1), createdAt: at(9), subjectId }),
  ]

  const result = projectJourneySubject(DEFINITION, subjectId, events)
  expect(result.currentStage).toEqual({ key: 'selling', enteredAt: at(3) })
  // Stage order, not completion order; each timestamp is an actual source fact.
  expect(result.history).toEqual([
    { key: 'created', enteredAt: at(1) },
    { key: 'configured', enteredAt: at(2) },
    { key: 'selling', enteredAt: at(3) },
  ])
  expect(result.freshness).toEqual({ latestEffectiveFactAt: at(6), latestReceiptAt: at(10) })

  // Same effective time has a canonical-id tie break. The observable projection is stable when the
  // input order flips; this also protects against relying on database return order.
  const sameTime = [
    fact({ id: '00000000-0000-0000-0000-00000000000b', event: 'merchant_created', tags: { source: 'organic' }, occurredAt: at(7), subjectId }),
    fact({ id: '00000000-0000-0000-0000-00000000000a', event: 'merchant_created', tags: { source: 'organic' }, occurredAt: at(7), subjectId }),
  ]
  expect(projectJourneySubject(DEFINITION, subjectId, sameTime)).toEqual(projectJourneySubject(DEFINITION, subjectId, [...sameTime].reverse()))
})

test('projection truth table: no source and source-with-no-match remain distinct honest states', () => {
  expect(projectJourneySubject(DEFINITION, 'empty-subject', [])).toEqual({
    currentStage: null,
    history: [],
    freshness: { latestEffectiveFactAt: null, latestReceiptAt: null },
  })
  expect(projectJourneySubject(DEFINITION, 'no-match-subject', [
    fact({ subjectId: 'no-match-subject', event: 'merchant_note', occurredAt: at(1), createdAt: at(2) }),
  ])).toEqual({
    currentStage: null,
    history: [],
    freshness: { latestEffectiveFactAt: at(1), latestReceiptAt: at(2) },
  })
})

test('projection preserves and orders PostgreSQL microseconds before the canonical-id tie break', () => {
  expect(parseJourneyTimestamp('2026-01-20T02:00:00.000100+02:00').canonical)
    .toBe('2026-01-20T00:00:00.0001Z')
  expect(() => parseJourneyTimestamp('not-a-timestamp')).toThrow('invalid journey source timestamp')

  const subjectId = 'microsecond-subject'
  const events = [
    fact({
      id: '00000000-0000-0000-0000-00000000000a',
      event: 'merchant_created',
      tags: { source: 'organic' },
      occurredAt: '2026-01-20T00:00:00.000900+00:00',
      createdAt: '2026-01-20T00:00:01.000900+00:00',
      subjectId,
    }),
    fact({
      // Larger id but earlier by 800µs: Date.parse would collapse the facts and order this second.
      id: '00000000-0000-0000-0000-00000000000b',
      event: 'merchant_created',
      tags: { source: 'organic' },
      occurredAt: '2026-01-20T00:00:00.000100Z',
      createdAt: '2026-01-20T00:00:01.000100Z',
      subjectId,
    }),
  ]

  const expected = {
    currentStage: { key: 'created', enteredAt: '2026-01-20T00:00:00.0001Z' },
    history: [{ key: 'created', enteredAt: '2026-01-20T00:00:00.0001Z' }],
    freshness: {
      latestEffectiveFactAt: '2026-01-20T00:00:00.0009Z',
      latestReceiptAt: '2026-01-20T00:00:01.0009Z',
    },
  }
  expect(projectJourneySubject(DEFINITION, subjectId, events)).toEqual(expected)
  expect(projectJourneySubject(DEFINITION, subjectId, [...events].reverse())).toEqual(expected)
})

test('projection truth table: tag predicates require every exact scalar with no coercion', () => {
  const definition: JourneyDefinition = {
    entityType: 'merchant',
    stages: [{ key: 'qualified', event: 'merchant_qualified', tags: { source: 'web', channel: true, campaign: 42 } }],
  }
  const subjectId = 'tag-subject'
  const result = projectJourneySubject(definition, subjectId, [
    fact({ subjectId, event: 'merchant_qualified', tags: { source: 'web', channel: 'true', campaign: 42 }, occurredAt: at(1) }),
    fact({ subjectId, event: 'merchant_qualified', tags: { source: 'web', channel: true, campaign: '42' }, occurredAt: at(2) }),
    fact({ subjectId, event: 'merchant_qualified', tags: { source: { value: 'web' }, channel: true, campaign: 42 }, occurredAt: at(3) }),
    fact({ subjectId, event: 'merchant_qualified', tags: { source: 'web', channel: true, campaign: 42 }, occurredAt: at(4) }),
  ])
  expect(result.history).toEqual([{ key: 'qualified', enteredAt: at(4) }])

  const stage = definition.stages[0]
  for (const tags of [null, undefined, [], 'web']) {
    expect(eventMatchesStage(
      { ...fact({ event: 'merchant_qualified' }), tags } as unknown as JourneyProjectionEvent,
      stage,
    )).toBe(false)
  }
})

function db(): SupabaseClient {
  requireTestDatabaseUrl()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function createOwner(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `journey-projection-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'local-only-journey-projection-password',
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`could not create owner fixture: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, label: string): Promise<{ id: string; key: string }> {
  const key = `gb_journey_${crypto.randomUUID()}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const { data, error } = await client
    .from('projects')
    .insert({ slug: `journey-projection-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: keyHash })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create project fixture: ${error?.message}`)
  const { error: keyError } = await client.from('api_keys').insert({ project_id: data.id, key_hash: keyHash, label: 'journey projection spec' })
  if (keyError) throw new Error(`could not create API key fixture: ${keyError.message}`)
  return { id: data.id as string, key }
}

async function createVersion(
  client: SupabaseClient,
  projectId: string,
  ownerId: string,
  key: string,
  definition: JourneyDefinition,
): Promise<number> {
  const { data, error } = await client.rpc('create_journey_version', {
    p_project_id: projectId,
    p_journey_key: key,
    p_definition: definition,
    p_actor_user_id: ownerId,
  })
  if (error || !data?.[0]) throw new Error(`could not create journey version: ${error?.message}`)
  return Number(data[0].version)
}

async function insertSubjectEvent(
  client: SupabaseClient,
  projectId: string,
  subjectId: string,
  event: string,
  tags: Record<string, unknown>,
  occurredAt: string | null,
  createdAt?: string,
  id?: string,
) {
  const { error } = await client.from('events').insert({
    ...(id === undefined ? {} : { id }),
    project_id: projectId,
    user_id: `journey-user-${crypto.randomUUID()}`,
    event,
    tags,
    context_version: 1,
    subject_type: 'merchant',
    subject_id: subjectId,
    occurred_at: occurredAt,
    ...(createdAt === undefined ? {} : { created_at: createdAt }),
  })
  if (error) throw new Error(`could not insert event fixture: ${error.message}`)
}

async function insertPagedSubjectFixture(
  client: SupabaseClient,
  projectId: string,
  subjectId: string,
) {
  const earlyRows = Array.from({ length: 1_000 }, (_, index) => ({
    project_id: projectId,
    user_id: `journey-paged-user-${index}-${crypto.randomUUID()}`,
    event: 'merchant_note',
    tags: {},
    context_version: 1,
    subject_type: 'merchant',
    subject_id: subjectId,
    occurred_at: at(10),
    created_at: at(10),
  }))
  // Keep each fixture write comfortably bounded; the read path, not a large insert response, is
  // what this regression exercises.
  for (let offset = 0; offset < earlyRows.length; offset += 500) {
    const { error } = await client.from('events').insert(earlyRows.slice(offset, offset + 500))
    if (error) throw new Error(`could not insert paged event fixture: ${error.message}`)
  }

  const { error } = await client.from('events').insert([
    {
      project_id: projectId,
      user_id: `journey-paged-stage-${crypto.randomUUID()}`,
      event: 'merchant_sold',
      tags: { region: 'mx' },
      context_version: 1,
      subject_type: 'merchant',
      subject_id: subjectId,
      occurred_at: at(11),
      created_at: at(11),
    },
    {
      project_id: projectId,
      user_id: `journey-paged-freshness-${crypto.randomUUID()}`,
      event: 'merchant_note',
      tags: {},
      context_version: 1,
      subject_type: 'merchant',
      subject_id: subjectId,
      occurred_at: at(12),
      created_at: at(12),
    },
  ])
  if (error) throw new Error(`could not insert later paged event fixture: ${error.message}`)
}

test('GET journey subject is non-zero, version-explicit, opaque-id validated, and project isolated', async ({ request }) => {
  const client = db()
  const [oneOwner, twoOwner] = await Promise.all([createOwner(client, 'one'), createOwner(client, 'two')])
  const [one, two] = await Promise.all([createProject(client, 'one'), createProject(client, 'two')])
  const journeyKey = `merchant_activation_${Date.now()}`
  const subjectId = `merchant-smoke-${Date.now()}`
  const pagedSubjectId = `merchant-paged-${Date.now()}`
  const preciseSubjectId = `merchant-precise-${Date.now()}`
  try {
    expect((await client.from('project_members').insert([
      { project_id: one.id, user_id: oneOwner, role: 'owner' },
      { project_id: two.id, user_id: twoOwner, role: 'owner' },
    ])).error).toBeNull()

    const v1 = await createVersion(client, one.id, oneOwner, journeyKey, DEFINITION)
    const v2 = await createVersion(client, one.id, oneOwner, journeyKey, {
      ...DEFINITION,
      stages: [{ key: 'different', event: 'merchant_different', tags: { source: 'organic' } }],
    })
    await createVersion(client, two.id, twoOwner, journeyKey, DEFINITION)
    await insertSubjectEvent(client, one.id, subjectId, 'merchant_created', { source: 'organic' }, at(1))
    // Both this event tag and v1's definition predicate are stored as JSONB before evaluation.
    // Reaching `configured` below proves the bounded safe integer survives both DB round-trips exactly.
    await insertSubjectEvent(client, one.id, subjectId, 'merchant_configured', {
      plan: 'pro', campaign: MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS,
    }, at(2))
    // Project two deliberately owns the same journey key + opaque subject and has a higher stage.
    await insertSubjectEvent(client, two.id, subjectId, 'merchant_sold', { region: 'mx' }, at(3))
    await insertPagedSubjectFixture(client, one.id, pagedSubjectId)
    // PostgreSQL retains microseconds. IDs are deliberately opposite timestamp order so a
    // millisecond-only comparator chooses the wrong first entry and freshness fact.
    await insertSubjectEvent(
      client,
      one.id,
      preciseSubjectId,
      'merchant_created',
      { source: 'organic' },
      '2026-01-20T00:00:00.000900Z',
      '2026-01-20T00:00:01.000900Z',
      '00000000-0000-0000-0000-00000000000a',
    )
    await insertSubjectEvent(
      client,
      one.id,
      preciseSubjectId,
      'merchant_created',
      { source: 'organic' },
      '2026-01-20T00:00:00.000100Z',
      '2026-01-20T00:00:01.000100Z',
      '00000000-0000-0000-0000-00000000000b',
    )

    const headers = { Authorization: `Bearer ${one.key}` }
    const live = await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${subjectId}&version=${v1}`, { headers })
    expect(live.status()).toBe(200)
    const body = await live.json()
    expect(body).toMatchObject({
      ok: true,
      journey: { key: journeyKey, definitionVersion: v1, entityType: 'merchant' },
      subject: {
        id: subjectId,
        currentStage: { key: 'configured', enteredAt: at(2) },
        history: [{ key: 'created', enteredAt: at(1) }, { key: 'configured', enteredAt: at(2) }],
      },
    })
    expect(body.subject.freshness.latestEffectiveFactAt).toBe(at(2))
    expect(body.subject.freshness.latestReceiptAt).toBeTruthy()

    // A default PostgREST response stops at 1,000 rows. Both observable facts below live after that
    // boundary in deterministic created_at/id order, proving the resolver drains every page.
    const pagedRead = await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${pagedSubjectId}&version=${v1}`, { headers })
    expect(pagedRead.status()).toBe(200)
    expect((await pagedRead.json()).subject).toMatchObject({
      id: pagedSubjectId,
      currentStage: { key: 'selling', enteredAt: at(11) },
      history: [{ key: 'selling', enteredAt: at(11) }],
      freshness: { latestEffectiveFactAt: at(12), latestReceiptAt: at(12) },
    })

    const preciseRead = await request.get(
      `/api/v1/journeys/${journeyKey}/subject?subjectId=${preciseSubjectId}&version=${v1}`,
      { headers },
    )
    expect(preciseRead.status()).toBe(200)
    expect((await preciseRead.json()).subject).toMatchObject({
      currentStage: { key: 'created', enteredAt: '2026-01-20T00:00:00.0001Z' },
      history: [{ key: 'created', enteredAt: '2026-01-20T00:00:00.0001Z' }],
      freshness: {
        latestEffectiveFactAt: '2026-01-20T00:00:00.0009Z',
        latestReceiptAt: '2026-01-20T00:00:01.0009Z',
      },
    })

    // Explicit version freshness: version 2 is a different immutable definition, not a hidden
    // alias to whichever version happens to be active/latest.
    const v2Read = await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${subjectId}&version=${v2}`, { headers })
    expect(v2Read.status()).toBe(200)
    expect((await v2Read.json()).subject.currentStage).toBeNull()

    // Project one's credential must not see project two's event even though all user-controlled
    // identifiers collide. A future resolver that drops `events.project_id` turns this non-zero.
    expect(body.subject.currentStage.key).not.toBe('selling')

    expect((await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=+bad&version=${v1}`, { headers })).status()).toBe(400)
    expect((await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${subjectId}`, { headers })).status()).toBe(400)
    expect((await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${subjectId}&version=01`, { headers })).status()).toBe(400)
    expect((await request.get(`/api/v1/journeys/${journeyKey}/subject?subjectId=${subjectId}&version=2147483648`, { headers })).status()).toBe(400)
    expect((await request.get(`/api/v1/journeys/Not-A-Key/subject?subjectId=${subjectId}&version=${v1}`, { headers })).status()).toBe(400)
    expect((await request.get(`/api/v1/journeys/${journeyKey}/subjects/${subjectId}?version=${v1}`, { headers })).status()).toBe(404)
  } finally {
    try {
      await cleanupJourneyProjects([one.id, two.id])
    } finally {
      // Auth cleanup must still run if the migration-owner connection or SQL cleanup fails.
      await Promise.all([client.auth.admin.deleteUser(oneOwner), client.auth.admin.deleteUser(twoOwner)])
    }
  }
})
