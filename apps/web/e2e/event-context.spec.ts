import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import {
  normalizeEventContext,
  normalizeOccurredAt,
  isValidEntityType,
  isValidOpaqueId,
  CURRENT_CONTEXT_VERSION,
  MAX_ID_LENGTH,
  MAX_FUTURE_SKEW_MS,
} from '@/lib/event-context'

// event-destination-router · Sprint 1, Story 1.1 — the versioned actor/subject contract.
//
// TWO LAYERS, deliberately (Roadmap/LEARNINGS.md, multi-tenant-activation S1): the HTTP specs at
// the bottom prove the route is wired up, but they can only reach the branches a well-formed
// request happens to walk. The pure specs above them assert each validation branch DIRECTLY, which
// is the only way a guard behind a precondition stays honest. Both layers were mutation-checked —
// see the note above the HTTP block.

const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

const NOW = Date.UTC(2026, 6, 22, 12, 0, 0)

// ── entity types are a controlled vocabulary ──────────────────────────────────────────────────

test('entity type accepts lower_snake_case', () => {
  expect(isValidEntityType('merchant')).toBe(true)
  expect(isValidEntityType('founding_merchant')).toBe(true)
  expect(isValidEntityType('shop2')).toBe(true)
})

test('entity type rejects casing and spacing variants that would silently fork a cohort', () => {
  // The whole point of the vocabulary rule: these must not become four distinct entity types that
  // a human reading a dashboard would swear were one.
  expect(isValidEntityType('Merchant')).toBe(false)
  expect(isValidEntityType('MERCHANT')).toBe(false)
  expect(isValidEntityType('merchant ')).toBe(false)
  expect(isValidEntityType('founding merchant')).toBe(false)
})

test('entity type rejects a leading digit, punctuation and the empty string', () => {
  expect(isValidEntityType('2shop')).toBe(false)
  expect(isValidEntityType('_private')).toBe(false)
  expect(isValidEntityType('merchant-v2')).toBe(false)
  expect(isValidEntityType('')).toBe(false)
  expect(isValidEntityType(null)).toBe(false)
  expect(isValidEntityType(42)).toBe(false)
})

// ── opaque ids ────────────────────────────────────────────────────────────────────────────────

test('opaque id accepts arbitrary printable identifiers', () => {
  expect(isValidOpaqueId('merch_01HXYZ')).toBe(true)
  expect(isValidOpaqueId('a')).toBe(true)
  expect(isValidOpaqueId('urn:acme:merchant:9931')).toBe(true)
  expect(isValidOpaqueId('a'.repeat(MAX_ID_LENGTH))).toBe(true)
})

test('opaque id rejects control characters, surrounding whitespace and over-length', () => {
  expect(isValidOpaqueId('merch\x00null')).toBe(false)
  expect(isValidOpaqueId('merch\nnewline')).toBe(false)
  expect(isValidOpaqueId('merch\ttab')).toBe(false)
  // ' u1' and 'u1' rendering identically in a dashboard is the bug this prevents.
  expect(isValidOpaqueId(' u1')).toBe(false)
  expect(isValidOpaqueId('u1 ')).toBe(false)
  expect(isValidOpaqueId('')).toBe(false)
  expect(isValidOpaqueId('a'.repeat(MAX_ID_LENGTH + 1))).toBe(false)
})

// ── occurredAt ────────────────────────────────────────────────────────────────────────────────

test('occurredAt accepts an explicit-offset ISO timestamp and normalises to UTC', () => {
  const utc = normalizeOccurredAt('2026-07-22T10:00:00Z', NOW)
  expect(utc.ok).toBe(true)
  expect(utc.ok && utc.iso).toBe('2026-07-22T10:00:00.000Z')

  // A non-UTC offset is legal and must be converted, not stored as written.
  const offset = normalizeOccurredAt('2026-07-22T12:00:00+02:00', NOW)
  expect(offset.ok).toBe(true)
  expect(offset.ok && offset.iso).toBe('2026-07-22T10:00:00.000Z')
})

test('occurredAt rejects an ambiguous timestamp with no time or no zone', () => {
  // Date.parse() happily accepts both of these and resolves them against UTC or LOCAL time
  // depending on shape — so "it parsed" is not the same as "it means one instant".
  expect(normalizeOccurredAt('2026-07-22', NOW).ok).toBe(false)
  expect(normalizeOccurredAt('2026-07-22T10:00:00', NOW).ok).toBe(false)
})

test('occurredAt rejects unparseable and non-string input', () => {
  expect(normalizeOccurredAt('last tuesday', NOW).ok).toBe(false)
  expect(normalizeOccurredAt('2026-13-45T99:99:99Z', NOW).ok).toBe(false)
  expect(normalizeOccurredAt('', NOW).ok).toBe(false)
  expect(normalizeOccurredAt(1753185600000, NOW).ok).toBe(false)
  expect(normalizeOccurredAt(null, NOW).ok).toBe(false)
})

test('occurredAt rejects a date that PARSES but is not a real calendar date', () => {
  // Codex round 2: Date.parse('2026-02-30T…') silently rolls over to March 2, storing a different
  // instant than the caller supplied. The syntactic regex alone accepts it; the calendar check must
  // reject it.
  expect(normalizeOccurredAt('2026-02-30T10:00:00Z', NOW).ok).toBe(false) // Feb has 28/29 days
  expect(normalizeOccurredAt('2025-02-29T10:00:00Z', NOW).ok).toBe(false) // 2025 is not a leap year
  expect(normalizeOccurredAt('2026-04-31T10:00:00Z', NOW).ok).toBe(false) // April has 30
  expect(normalizeOccurredAt('2026-13-01T10:00:00Z', NOW).ok).toBe(false) // no month 13
  expect(normalizeOccurredAt('2026-01-01T24:00:00Z', NOW).ok).toBe(false) // hour 24
  // ...but a real leap day IS accepted.
  expect(normalizeOccurredAt('2024-02-29T10:00:00Z', NOW).ok).toBe(true) // 2024 is a leap year
})

test('normalizeEventContext rejects a null / non-object input without throwing', () => {
  // Agy round 2: Object.keys(null) would throw a TypeError; the guard must turn that into a clean
  // rejection for any direct caller.
  for (const bad of [null, undefined, 42, 'ctx', [1, 2, 3]] as unknown[]) {
    const result = normalizeEventContext(bad as never, NOW)
    expect(result.ok).toBe(false)
  }
})

test('occurredAt allows arbitrarily old timestamps — backfill is first-class', () => {
  // entity-journeys-projections depends on late/out-of-order facts repairing naturally, so there
  // is deliberately NO lower bound here. If this ever starts failing, that epic breaks with it.
  expect(normalizeOccurredAt('2019-01-01T00:00:00Z', NOW).ok).toBe(true)
  expect(normalizeOccurredAt('1999-12-31T23:59:59Z', NOW).ok).toBe(true)
})

test('occurredAt allows ordinary clock skew but rejects a far-future timestamp', () => {
  // Just inside the skew window: real client clocks drift, that is not an attack.
  const skewed = new Date(NOW + MAX_FUTURE_SKEW_MS - 60_000).toISOString()
  expect(normalizeOccurredAt(skewed, NOW).ok).toBe(true)

  // Just outside it, and absurdly outside it. An unbounded future date would pin itself to the
  // head of its subject's timeline forever and no later real event could displace it.
  const beyond = new Date(NOW + MAX_FUTURE_SKEW_MS + 60_000).toISOString()
  expect(normalizeOccurredAt(beyond, NOW).ok).toBe(false)
  expect(normalizeOccurredAt('2099-01-01T00:00:00Z', NOW).ok).toBe(false)
})

// ── the version discriminator ─────────────────────────────────────────────────────────────────

test('context.version is required — an omitted version is never assumed to be v1', () => {
  const result = normalizeEventContext({ subject: { type: 'merchant', id: 'm1' } }, NOW)
  expect(result.ok).toBe(false)
  expect(result.ok === false && result.errors[0].field).toBe('context.version')
})

test('an unknown context.version is rejected rather than half-stored', () => {
  const result = normalizeEventContext({ version: 2, subject: { type: 'merchant', id: 'm1' } }, NOW)
  expect(result.ok).toBe(false)
  // And ONLY the version error — validating unknown-version fields against v1 rules would produce
  // confidently wrong messages about a contract the caller never claimed to be using.
  expect(result.ok === false && result.errors).toHaveLength(1)
})

// ── whole-context normalisation ───────────────────────────────────────────────────────────────

test('a full merchant context normalises to the exact persisted columns', () => {
  const result = normalizeEventContext(
    {
      version: CURRENT_CONTEXT_VERSION,
      actor: { type: 'staff_user', id: 'staff_7' },
      subject: { type: 'merchant', id: 'merch_01HXYZ' },
      correlationId: 'wf_activation_88',
      occurredAt: '2026-07-22T09:30:00Z',
      idempotencyKey: 'order-1',
    },
    NOW,
  )
  expect(result.ok).toBe(true)
  expect(result.ok && result.context).toEqual({
    context_version: 1,
    actor_type: 'staff_user',
    actor_id: 'staff_7',
    subject_type: 'merchant',
    subject_id: 'merch_01HXYZ',
    correlation_id: 'wf_activation_88',
    occurred_at: '2026-07-22T09:30:00.000Z',
    idempotency_key: 'order-1',
  })
})

test('actor and subject are independent — an admin acting on someone else s shop', () => {
  // The exact case one `userId` column could not express, and the reason this contract exists.
  const result = normalizeEventContext(
    {
      version: 1,
      actor: { type: 'staff_user', id: 'staff_7' },
      subject: { type: 'shop', id: 'shop_42' },
    },
    NOW,
  )
  expect(result.ok).toBe(true)
  expect(result.ok && result.context.actor_id).toBe('staff_7')
  expect(result.ok && result.context.subject_id).toBe('shop_42')
})

test('a half-populated entity is refused, not stored unqueryable', () => {
  const missingId = normalizeEventContext({ version: 1, subject: { type: 'merchant' } }, NOW)
  expect(missingId.ok).toBe(false)
  expect(missingId.ok === false && missingId.errors.some((e) => e.field === 'context.subject.id')).toBe(true)

  const missingType = normalizeEventContext({ version: 1, subject: { id: 'm1' } }, NOW)
  expect(missingType.ok).toBe(false)
  expect(missingType.ok === false && missingType.errors.some((e) => e.field === 'context.subject.type')).toBe(true)
})

test('an entity given as a bare string or array is refused', () => {
  expect(normalizeEventContext({ version: 1, subject: 'merch_1' }, NOW).ok).toBe(false)
  expect(normalizeEventContext({ version: 1, subject: ['merch_1'] }, NOW).ok).toBe(false)
})

test('an entity carrying an unknown property is refused, like the top-level context', () => {
  // Agy round 3: strict-key policy must apply one level down too, or `{ type, id, name }` silently
  // drops `name` while the top level would have rejected the same mistake.
  const result = normalizeEventContext(
    { version: 1, subject: { type: 'merchant', id: 'm1', name: 'Acme' } },
    NOW,
  )
  expect(result.ok).toBe(false)
  expect(result.ok === false && result.errors.some((e) => e.field === 'context.subject.name')).toBe(true)
})

test('every field error is reported at once, not one per round-trip', () => {
  const result = normalizeEventContext(
    {
      version: 1,
      subject: { type: 'Merchant', id: ' spaced ' },
      correlationId: 'a'.repeat(MAX_ID_LENGTH + 1),
      occurredAt: 'not-a-date',
    },
    NOW,
  )
  expect(result.ok).toBe(false)
  const fields = result.ok === false ? result.errors.map((e) => e.field).sort() : []
  expect(fields).toEqual([
    'context.correlationId',
    'context.occurredAt',
    'context.subject.id',
    'context.subject.type',
  ])
})

test('an empty v1 context is valid — every field except version is optional', () => {
  const result = normalizeEventContext({ version: 1 }, NOW)
  expect(result.ok).toBe(true)
  expect(result.ok && result.context.context_version).toBe(1)
  expect(result.ok && result.context.subject_id).toBe(null)
  expect(result.ok && result.context.occurred_at).toBe(null)
})

// ── HTTP: the route is actually wired to all of the above ─────────────────────────────────────
//
// MUTATION-CHECKED. These specs were first mutation-checked against commit 3d6950c, when the route
// wrote events with a plain `.from('events').insert()`. Story 1.2 later moved that write — and the
// idempotent-replay semantics — INTO the plpgsql `ingest_event()` function (the route now calls it
// via `.rpc()`), so the ORIGINAL mutation targets below (the direct-insert spread, the route-level
// 23505 branch) no longer exist as written (cross-review, Codex round 2 nit). The mutations that
// cover the CURRENT wiring live in delivery-outbox.spec.ts's header (A/B/E against the DB function;
// D against the dispatcher). Recorded here for provenance, against the code as it was at 3d6950c:
//
//   A. delete the `...eventContext.context` spread from the insert  → 3 red:
//      round-trip, idempotent replay, per-project idempotency scoping.
//   B. remove the `normalizeEventContext()` call (accept context unvalidated) → 5 red:
//      the three above, plus malformed-context-400 and unknown-version-400.
//   C. delete the 23505 branch → 1 red: idempotent replay (500s instead of returning the original).
//
// The context-VALIDATION mutation (B) still holds against the current route unchanged — validation
// is still in the route before the RPC — and the new hardening specs below (unknown-key, DB-CHECK)
// carry their own mutation provenance in their comments.
//
// Baseline and post-restore runs were both 25 passed. Note what this exercise also revealed: NO
// mutation turns the "context cannot smuggle a project" spec red, because tenancy is enforced by
// the insert taking `auth.projectId` rather than by anything context-specific. That spec is a
// regression tripwire for a future change, not proof of a guard this diff added — worth stating
// plainly rather than letting a green tick imply more coverage than it has.

test('legacy payload still ingests unchanged, with a NULL context', async ({ request }) => {
  // The compatibility guarantee. Every shipped caller sends exactly this shape.
  const userId = `legacy-${Date.now()}`
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: { userId, event: 'spec_legacy_event' },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  expect(body.ok).toBe(true)

  const { data: row } = await dbClient().from('events').select('*').eq('id', body.id).single()
  // NULL, not a defaulted 1: "this row predates the contract" is a fact worth keeping.
  expect(row?.context_version).toBe(null)
  expect(row?.subject_id).toBe(null)
  expect(row?.occurred_at).toBe(null)
})

test('a merchant event round-trips its full versioned context', async ({ request }) => {
  const userId = `ctx-${Date.now()}`
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      userId,
      event: 'merchant_activated',
      context: {
        version: 1,
        actor: { type: 'staff_user', id: 'staff_7' },
        subject: { type: 'merchant', id: `merch-${userId}` },
        correlationId: `wf-${userId}`,
        occurredAt: '2026-07-20T09:30:00Z',
      },
    },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()

  const { data: row } = await dbClient().from('events').select('*').eq('id', body.id).single()
  expect(row?.context_version).toBe(1)
  expect(row?.actor_type).toBe('staff_user')
  expect(row?.actor_id).toBe('staff_7')
  expect(row?.subject_type).toBe('merchant')
  expect(row?.subject_id).toBe(`merch-${userId}`)
  expect(row?.correlation_id).toBe(`wf-${userId}`)
  expect(new Date(row!.occurred_at as string).toISOString()).toBe('2026-07-20T09:30:00.000Z')
  // occurred_at is the CLIENT's assertion; created_at is ours. They must not be conflated.
  expect(row?.created_at).not.toBe(row?.occurred_at)
})

test('malformed context is rejected with 400 and charges no quota', async ({ request }) => {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      userId: `bad-${Date.now()}`,
      event: 'spec_bad_context',
      context: { version: 1, subject: { type: 'Merchant', id: 'm1' }, occurredAt: 'yesterday' },
    },
  })
  expect(res.status()).toBe(400)
  const body = await res.json()
  expect(body.ok).toBe(false)
  expect(body.error).toBe('Malformed event context')
  const fields = (body.issues as { field: string }[]).map((i) => i.field).sort()
  expect(fields).toEqual(['context.occurredAt', 'context.subject.type'])
})

test('an unknown context version is refused rather than silently half-stored', async ({ request }) => {
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      userId: `v2-${Date.now()}`,
      event: 'spec_future_context',
      context: { version: 2, subject: { type: 'merchant', id: 'm1' } },
    },
  })
  expect(res.status()).toBe(400)
})

test('repeating an idempotency key returns the ORIGINAL event id and creates nothing', async ({
  request,
}) => {
  const userId = `idem-${Date.now()}`
  const key = `order-${userId}`
  const payload = {
    userId,
    event: 'order_placed',
    context: { version: 1, subject: { type: 'order', id: key }, idempotencyKey: key },
  }
  const headers = { Authorization: `Bearer ${PROJECT_ONE_KEY}` }

  const first = await request.post('/api/v1/track', { headers, data: payload })
  expect(first.status()).toBe(201)
  const firstBody = await first.json()
  expect(firstBody.deduplicated).toBeUndefined()

  const second = await request.post('/api/v1/track', { headers, data: payload })
  // 200, not 201 — nothing was created this time.
  expect(second.status()).toBe(200)
  const secondBody = await second.json()
  expect(secondBody.ok).toBe(true)
  expect(secondBody.deduplicated).toBe(true)
  // The same LOGICAL event: an at-least-once caller converges on one identity however often it retries.
  expect(secondBody.id).toBe(firstBody.id)

  const { data: rows } = await dbClient()
    .from('events')
    .select('id')
    .eq('idempotency_key', key)
  expect(rows).toHaveLength(1)
})

test('idempotency keys are scoped per project — one tenant cannot collapse another s event', async ({
  request,
}) => {
  // The security property the partial unique index exists for. If uniqueness were GLOBAL,
  // project-two reusing project-one's key would silently resolve to project-one's event id —
  // the cross-tenant bind shape Roadmap/LEARNINGS.md records from multi-tenant-activation S1.
  const key = `shared-key-${Date.now()}`
  const payload = (userId: string) => ({
    userId,
    event: 'order_placed',
    context: { version: 1, idempotencyKey: key },
  })

  const one = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: payload('tenant-one-user'),
  })
  expect(one.status()).toBe(201)
  const oneBody = await one.json()

  const two = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_TWO_KEY}` },
    data: payload('tenant-two-user'),
  })
  // A genuine creation, NOT a dedupe against the other tenant's row.
  expect(two.status()).toBe(201)
  const twoBody = await two.json()
  expect(twoBody.id).not.toBe(oneBody.id)

  const { data: rows } = await dbClient()
    .from('events')
    .select('id, project_id')
    .eq('idempotency_key', key)
  expect(rows).toHaveLength(2)
  expect(new Set(rows!.map((r) => r.project_id)).size).toBe(2)
})

test('context cannot smuggle a project — tenancy still comes only from the credential', async ({
  request,
}) => {
  // Rule #1/Decision 8: no request body field may influence project scoping, and adding a whole new
  // body object is exactly the moment that could regress.
  const { data: foreign } = await dbClient().from('projects').select('id').eq('slug', 'project-two').single()

  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
    data: {
      userId: `smuggle-${Date.now()}`,
      event: 'spec_smuggle',
      // Top-level projectId/project_id are stripped by the (non-passthrough) track schema; the
      // in-CONTEXT smuggle now gets its own, stronger treatment below (a 400), so it is not repeated
      // here — this spec proves the top-level smuggle is accepted-but-ignored, still 201.
      projectId: foreign!.id,
      project_id: foreign!.id,
      context: { version: 1, subject: { type: 'merchant', id: 'm1' } },
    },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()

  const { data: row } = await dbClient().from('events').select('project_id').eq('id', body.id).single()
  expect(row?.project_id).not.toBe(foreign!.id)
})

// ── cross-review round 1 hardening (Codex + Agy, 2026-07-22) ──────────────────────────────────

test('an unknown context field is REFUSED, not silently dropped', async ({ request }) => {
  // Agy's finding: a snake_case misspelling of a real field is the likely mistake, and accepting the
  // request while storing NULL for it strands the integration until someone notices the numbers are
  // wrong. A smuggled `projectId` inside context is the same class — an unknown key — so it 400s
  // here rather than being quietly ignored.
  for (const badContext of [
    { version: 1, idempotency_key: 'order-1' }, // snake_case of idempotencyKey
    { version: 1, subject_id: 'm1' }, // snake_case, and not even a real field
    { version: 1, projectId: 'someone-elses-project', subject: { type: 'merchant', id: 'm1' } },
  ]) {
    const res = await request.post('/api/v1/track', {
      headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
      data: { userId: `unknown-key-${Date.now()}`, event: 'spec_unknown_key', context: badContext },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Malformed event context')
  }
})

test('the DB CHECK constraints enforce the contract for a NON-route writer too', async () => {
  // Codex's finding: the migration comment claimed integrity "for every writer forever", but the
  // original CHECKs only bounded length — a service-role seed/backfill could still inject
  // projection-breaking rows. These assertions go straight through the service-role client (the same
  // authority a rogue seed would have), bypassing lib/event-context.ts entirely, and must be
  // rejected by the DATABASE.
  const db = dbClient()
  const { data: proj } = await db.from('projects').select('id').eq('slug', 'project-one').single()
  const base = { project_id: proj!.id, user_id: 'chk-u', event: 'chk_event' }

  // Capitalised entity type — the cohort-forking bug, at the DB layer.
  const badType = await db.from('events').insert({ ...base, context_version: 1, subject_type: 'Merchant', subject_id: 'm1' })
  expect(badType.error).not.toBeNull()

  // Surrounding whitespace in an opaque id.
  const spacedId = await db.from('events').insert({ ...base, context_version: 1, subject_type: 'merchant', subject_id: ' m1 ' })
  expect(spacedId.error).not.toBeNull()

  // Context populated but no version — an ambiguous row nothing can interpret.
  const noVersion = await db.from('events').insert({ ...base, subject_type: 'merchant', subject_id: 'm1' })
  expect(noVersion.error).not.toBeNull()

  // A control character in an id.
  const ctrl = await db.from('events').insert({ ...base, context_version: 1, subject_type: 'merchant', subject_id: `m${String.fromCharCode(7)}bell` })
  expect(ctrl.error).not.toBeNull()

  // The valid shape still inserts — the constraints reject bad data, not all data.
  const good = await db
    .from('events')
    .insert({ ...base, context_version: 1, subject_type: 'merchant', subject_id: `chk-good-${Date.now()}` })
    .select('id')
    .single()
  expect(good.error).toBeNull()
})

// ── cross-review round 2: idempotency vs. quota, and dedup vs. activation ──────────────────────

// Provisions a throwaway project with a specific monthly quota and returns a usable Bearer key.
// Cleaned up by the caller. Uses the service-role client (the same authority the seed scripts have)
// — this is fixture provisioning, not an app path.
async function provisionProject(
  db: SupabaseClient,
  opts: { quota: number; createdBy?: string | null; ingestRate?: number },
): Promise<{ projectId: string; key: string; cleanup: () => Promise<void> }> {
  const slug = `disposable-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const key = `gb_key_test_${Math.random().toString(36).slice(2)}`
  const keyHash = createHash('sha256').update(key).digest('hex')

  const { data: proj, error: projErr } = await db
    .from('projects')
    .insert({
      slug,
      api_key_hash: keyHash, // legacy column still NOT NULL on projects; the auth path reads api_keys
      monthly_event_quota: opts.quota,
      ...(opts.ingestRate !== undefined ? { ingest_rate_per_min: opts.ingestRate } : {}),
      created_by: opts.createdBy ?? null,
    })
    .select('id')
    .single()
  if (projErr || !proj) throw new Error(`could not provision project: ${projErr?.message}`)

  const { error: keyErr } = await db
    .from('api_keys')
    .insert({ project_id: proj.id, key_hash: keyHash, label: 'spec disposable' })
  if (keyErr) throw new Error(`could not provision api key: ${keyErr.message}`)

  return {
    projectId: proj.id as string,
    key,
    cleanup: async () => {
      await db.from('projects').delete().eq('id', proj.id as string) // CASCADE takes events + keys
    },
  }
}

test('an at-quota tenant can still RETRY an already-accepted idempotent event (200, not 429)', async ({
  request,
}) => {
  // Codex round 2 Blocking: quota was checked before dedup, so a retry of an already-counted event
  // was rejected at quota — a "safe to retry" contract that isn't. The pre-check must resolve the
  // duplicate BEFORE the quota gate.
  const db = dbClient()
  const p = await provisionProject(db, { quota: 1 })
  try {
    const key = `atquota-${Date.now()}`
    const payload = { userId: 'q-u', event: 'order_placed', context: { version: 1, idempotencyKey: key } }
    const auth = { Authorization: `Bearer ${p.key}` }

    // First call consumes the tenant's ONLY quota unit.
    const first = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(first.status()).toBe(201)
    const firstId = (await first.json()).id

    // The tenant is now at quota. A retry of the SAME event must still succeed as a dedup...
    const retry = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(retry.status()).toBe(200)
    const retryBody = await retry.json()
    expect(retryBody.deduplicated).toBe(true)
    expect(retryBody.id).toBe(firstId)

    // ...while a genuinely NEW event is correctly rejected at quota.
    const fresh = await request.post('/api/v1/track', {
      headers: auth,
      data: { userId: 'q-u', event: 'order_placed', context: { version: 1, idempotencyKey: `other-${Date.now()}` } },
    })
    expect(fresh.status()).toBe(429)
  } finally {
    await p.cleanup()
  }
})

test('the burst limiter applies to idempotent RETRIES — the fast path does not bypass it', async ({
  request,
}) => {
  // Codex round 3 Blocking: the idempotency pre-check must NOT sit in front of the rate limiter, or
  // a caller replaying one key gets unlimited authenticated DB reads. With an ingest rate of 1/min,
  // a rapid retry of the SAME key must be rate-limited (429), not waved through as a 200 dedup.
  const db = dbClient()
  const p = await provisionProject(db, { quota: 100, ingestRate: 1 })
  try {
    const key = `burst-${Date.now()}`
    const payload = { userId: 'b-u', event: 'order_placed', context: { version: 1, idempotencyKey: key } }
    const auth = { Authorization: `Bearer ${p.key}` }

    const first = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(first.status()).toBe(201)

    // Immediate retry within the same minute — the rate window still holds, so the burst guard fires
    // BEFORE the dedup fast path can answer.
    const retry = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(retry.status()).toBe(429)
  } finally {
    await p.cleanup()
  }
})

test('a dedup completes first-event activation the original ingest may have left unstamped', async ({
  request,
}) => {
  // Codex round 2 Blocking: the dedup early-return skipped the activation path, so if the original
  // ingest crashed after committing the event but before stamping first_event_at, no retry could
  // ever repair it. We simulate that crash window by manually clearing first_event_at after the
  // first ingest, then replaying — the dedup must re-stamp it.
  //
  // projects.created_by is a UUID FK to auth.users and the activation funnel only fires for a
  // self-serve tenant (created_by set), so we mint a throwaway auth user to own the disposable
  // project.
  const db = dbClient()
  const { data: userData, error: userErr } = await db.auth.admin.createUser({
    email: `activation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@spec.local`,
    email_confirm: true,
  })
  if (userErr || !userData?.user) throw new Error(`could not create auth user: ${userErr?.message}`)
  const funnelUser = userData.user.id
  const p = await provisionProject(db, { quota: 100, createdBy: funnelUser })
  try {
    const key = `activation-${Date.now()}`
    const payload = { userId: 'a-u', event: 'first_thing', context: { version: 1, idempotencyKey: key } }
    const auth = { Authorization: `Bearer ${p.key}` }

    const first = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(first.status()).toBe(201)

    // Simulate "crashed before stamping": force first_event_at back to null.
    await db.from('projects').update({ first_event_at: null }).eq('id', p.projectId)

    // Replay the identical request — a dedup. It must schedule the activation stamp.
    const retry = await request.post('/api/v1/track', { headers: auth, data: payload })
    expect(retry.status()).toBe(200)
    expect((await retry.json()).deduplicated).toBe(true)

    // after() runs post-response (a self-track network call + a DB update), so poll for the stamp
    // rather than asserting instantly. Budget 5s — generous enough that parallel-load jitter can't
    // flake it, still bounded.
    let stamped: string | null = null
    for (let i = 0; i < 50 && stamped === null; i++) {
      await new Promise((r) => setTimeout(r, 100))
      const { data } = await db.from('projects').select('first_event_at').eq('id', p.projectId).single()
      stamped = (data?.first_event_at as string | null) ?? null
    }
    expect(stamped).not.toBeNull()
  } finally {
    await p.cleanup()
    await db.auth.admin.deleteUser(funnelUser).catch(() => {})
  }
})
