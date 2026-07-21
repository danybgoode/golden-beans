import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  dispatchPendingDeliveries,
  MAX_CLAIM_BATCH,
  CLAIMABLE_STATUSES,
} from '@/lib/delivery-dispatch'

// event-destination-router · Sprint 1, Story 1.2 — transactional outbox + dark delivery gate.
//
// TWO LAYERS, same discipline as event-context.spec.ts. The pure/injected-client specs assert the
// dispatcher's gate and claim logic DIRECTLY (an HTTP spec cannot reach a guard behind an env flag
// — the multi-tenant-activation S1 lesson). The HTTP specs prove the ingest route actually commits
// the event and its outbox work atomically through ingest_event().
//
// MUTATION-CHECKED against the committed build — actual observed results recorded in the block
// above the HTTP specs.

const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'
const PROJECT_TWO_KEY = 'local-test-key-two-do-not-use-in-prod'

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function projectIdBySlug(db: SupabaseClient, slug: string): Promise<string> {
  const { data } = await db.from('projects').select('id').eq('slug', slug).single()
  if (!data) throw new Error(`fixture project ${slug} not found`)
  return data.id as string
}

// ── test isolation, stated because it is load-bearing ─────────────────────────────────────────
// Playwright runs `fullyParallel` and destinations are PROJECT-GLOBAL, so a NULL-filter enabled
// destination one spec creates matches EVERY concurrent spec's events too. That is not a product
// bug — a NULL filter meaning "all this project's events" is the intended semantics — it is a test
// hygiene problem. So every enabled destination in this file carries an event_filter scoped to its
// own spec's UNIQUE event name, and the "no destinations" / "disabled" specs likewise use unique
// event names that no other spec's destination can match. Nothing here relies on the whole
// project being quiet; each spec is hermetic by naming.
function uniqueEvent(tag: string): string {
  return `outbox_${tag}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function withDestination(
  db: SupabaseClient,
  projectId: string,
  opts: { enabled: boolean; eventFilter: string | null },
  body: (destinationId: string) => Promise<void>,
): Promise<void> {
  const name = `spec-dest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data, error } = await db
    .from('event_destinations')
    .insert({ project_id: projectId, name, enabled: opts.enabled, event_filter: opts.eventFilter })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not create destination: ${error?.message}`)
  try {
    await body(data.id as string)
  } finally {
    await db.from('event_destinations').delete().eq('id', data.id as string)
  }
}

async function track(request: import('@playwright/test').APIRequestContext, key: string, payload: unknown) {
  return request.post('/api/v1/track', { headers: { Authorization: `Bearer ${key}` }, data: payload })
}

// ── the dispatcher gate (injected client, both flag states) ───────────────────────────────────
//
// The flag is read fresh from process.env per call, so these specs set it explicitly and restore
// it — never assume the ambient value. The gate-OFF spec must NOT depend on a broken client, so it
// passes one whose every call would throw: proof the gate short-circuits BEFORE touching the DB.

test('gate OFF → dispatcher reads nothing, claims nothing, even with a client that would throw', async () => {
  const prev = process.env.DESTINATION_DELIVERY_ENABLED
  delete process.env.DESTINATION_DELIVERY_ENABLED
  try {
    // A client whose first DB call would throw. If the gate is checked AFTER any query, this throws
    // and the test fails — which is exactly the regression we want to catch.
    const exploding = {
      from() {
        throw new Error('gate did not short-circuit before touching the database')
      },
    } as unknown as SupabaseClient

    const outcome = await dispatchPendingDeliveries(exploding)
    expect(outcome).toEqual({ ok: true, dispatched: false, reason: 'disabled', claimed: [] })
  } finally {
    if (prev === undefined) delete process.env.DESTINATION_DELIVERY_ENABLED
    else process.env.DESTINATION_DELIVERY_ENABLED = prev
  }
})

test('gate ON with no due work → a clean empty pass, not an error', async () => {
  const prev = process.env.DESTINATION_DELIVERY_ENABLED
  process.env.DESTINATION_DELIVERY_ENABLED = 'true'
  try {
    // Scope to a project with no enabled destinations, so "no due work" is deterministic regardless
    // of what other specs have queued.
    const db = dbClient()
    const p1 = await projectIdBySlug(db, 'project-one')
    const outcome = await dispatchPendingDeliveries(db, { projectId: p1 })
    expect(outcome.ok).toBe(true)
    expect(outcome.dispatched).toBe(true)
  } finally {
    if (prev === undefined) delete process.env.DESTINATION_DELIVERY_ENABLED
    else process.env.DESTINATION_DELIVERY_ENABLED = prev
  }
})

test('gate ON → a claimed row is RELEASED back to pending (Sprint 1 sends nothing)', async () => {
  const prev = process.env.DESTINATION_DELIVERY_ENABLED
  process.env.DESTINATION_DELIVERY_ENABLED = 'true'
  const db = dbClient()
  // A DISPOSABLE project, not shared project-one (cross-review, Codex round 3): the dispatcher scoped
  // to a project claims EVERY due row in it, so on shared project-one this pass could transiently
  // flip a concurrent spec's rows to in_flight, and the old assertion (scoped to our event) could
  // pass without our row ever being the one claimed. An isolated project makes the claim set exactly
  // this test's rows.
  const eventName = uniqueEvent('release')
  const { data: proj } = await db
    .from('projects')
    .insert({ slug: `disp-disp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: `h-${Math.random()}` })
    .select('id')
    .single()
  const pid = proj!.id as string
  try {
    await withDestination(db, pid, { enabled: true, eventFilter: eventName }, async (destId) => {
      const { data: ev } = await db
        .from('events')
        .insert({ project_id: pid, user_id: 'disp-u', event: eventName })
        .select('id')
        .single()
      const { data: del } = await db
        .from('event_deliveries')
        .insert({ project_id: pid, event_id: ev!.id, destination_id: destId })
        .select('id')
        .single()

      const outcome = await dispatchPendingDeliveries(db, { projectId: pid })
      expect(outcome.dispatched).toBe(true)
      // PROOF the intended row was exercised, not merely that it ended pending: it must appear in the
      // claim set this pass actually took ownership of.
      expect(outcome.dispatched && outcome.claimed.map((c) => c.id)).toContain(del!.id)

      // The claimed row is RELEASED, not left in_flight — stranding it would be permanent (the
      // reclaim loop is Story 2.2). attempt_count untouched (nothing was attempted).
      const { data: rows } = await db
        .from('event_deliveries')
        .select('status, attempt_count')
        .eq('event_id', ev!.id)
      expect(rows!.length).toBeGreaterThan(0)
      for (const r of rows!) {
        expect(r.status).toBe('pending')
        expect(r.attempt_count).toBe(0)
      }
    })
  } finally {
    await db.from('projects').delete().eq('id', pid) // CASCADE removes the event + delivery + destination
    if (prev === undefined) delete process.env.DESTINATION_DELIVERY_ENABLED
    else process.env.DESTINATION_DELIVERY_ENABLED = prev
  }
})

test('dispatcher exports are internally consistent', () => {
  // in_flight must NOT be claimable — claiming a row another worker owns is the double-delivery this
  // whole design bounds. Guarding it as a spec so a careless edit to the list is caught.
  expect(CLAIMABLE_STATUSES).not.toContain('in_flight')
  expect(CLAIMABLE_STATUSES).not.toContain('delivered')
  expect(MAX_CLAIM_BATCH).toBeGreaterThan(0)
})

// ── HTTP: ingest_event() commits event + outbox atomically ────────────────────────────────────
//
// MUTATION-CHECKED against the committed build. Each mutation was applied to the LIVE local build
// (ingest_event() via CREATE OR REPLACE; the dispatcher via an edit), the whole file re-run, and
// the exact red specs recorded. Baseline and post-restore: 10 passed.
//
//   A. fan-out `AND d.enabled` → `AND NOT d.enabled` (queue for disabled, skip enabled)
//      → 4 red: "enabled destination queues one row", "DISABLED receives nothing",
//        "event-name filter only queues matching", "replayed ingest converges".
//   B. fan-out `WHERE d.project_id = p_project_id` → `WHERE true` (drop the tenant scope)
//      → 1 red: "a destination only receives its OWN project's events". (Note: the composite FK
//        turns the cross-tenant fan-out into an INSERT that cannot commit, so this surfaces as the
//        ingest 500ing rather than a leaked row — the DB constraint is the real backstop, the spec
//        is what proves it fires.)
//   D. remove the gate short-circuit in lib/delivery-dispatch.ts (check the flag AFTER the query)
//      → 1 red: "gate OFF → dispatcher reads nothing" (the deliberately-throwing client fires).
//   E. remove the `IF NOT v_dedup` guard so fan-out runs on the replay path too (the round-1 bug)
//      → 1 red: "a replay does NOT fan out to a destination enabled AFTER the original ingest".
//         This is the spec added specifically to give Codex's Blocking finding teeth — the earlier
//         "converges / no doubling" spec did NOT catch it (the unique constraint kept the count at
//         1 either way), which is exactly the honest coverage gap round 1 flagged and this closes.

test('an event with no destinations still persists — outbox dark, ingest unaffected', async ({ request }) => {
  const db = dbClient()
  // A unique event name no other spec's filtered destination can match, so "zero deliveries" means
  // "nothing was eligible", never "a concurrent spec's NULL-filter destination hadn't matched yet".
  const res = await track(request, PROJECT_ONE_KEY, {
    userId: `outbox-none-${Date.now()}`,
    event: uniqueEvent('none'),
  })
  expect(res.status()).toBe(201)
  const { id } = await res.json()

  // The event is stored...
  const { data: ev } = await db.from('events').select('id').eq('id', id).single()
  expect(ev?.id).toBe(id)
  // ...and NOT one delivery row exists for it, because nothing was eligible. This is the correct
  // dark state of production today, not a bug.
  const { data: deliveries } = await db.from('event_deliveries').select('id').eq('event_id', id)
  expect(deliveries).toHaveLength(0)
})

test('an enabled destination queues exactly one delivery row, atomically with the event', async ({
  request,
}) => {
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const eventName = uniqueEvent('one')
  await withDestination(db, p1, { enabled: true, eventFilter: eventName }, async (destId) => {
    const res = await track(request, PROJECT_ONE_KEY, { userId: `outbox-one-${Date.now()}`, event: eventName })
    expect(res.status()).toBe(201)
    const { id } = await res.json()

    const { data: deliveries } = await db
      .from('event_deliveries')
      .select('id, destination_id, status, project_id')
      .eq('event_id', id)
    expect(deliveries).toHaveLength(1)
    expect(deliveries![0].destination_id).toBe(destId)
    expect(deliveries![0].status).toBe('pending')
    // The delivery row carries the SAME project as the event — the composite FK makes any other
    // pairing impossible to insert.
    expect(deliveries![0].project_id).toBe(p1)
  })
})

test('a DISABLED destination receives nothing', async ({ request }) => {
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const eventName = uniqueEvent('disabled')
  // A disabled destination whose filter WOULD match — proving `enabled` is what gates it, not the
  // filter. The unique name also keeps a concurrent spec's destination out of the assertion.
  await withDestination(db, p1, { enabled: false, eventFilter: eventName }, async () => {
    const res = await track(request, PROJECT_ONE_KEY, { userId: `outbox-disabled-${Date.now()}`, event: eventName })
    expect(res.status()).toBe(201)
    const { id } = await res.json()
    const { data: deliveries } = await db.from('event_deliveries').select('id').eq('event_id', id)
    expect(deliveries).toHaveLength(0)
  })
})

test('an event-name filter only queues matching events', async ({ request }) => {
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const wanted = uniqueEvent('wanted')
  await withDestination(db, p1, { enabled: true, eventFilter: wanted }, async () => {
    const match = await track(request, PROJECT_ONE_KEY, { userId: 'filt-u', event: wanted })
    const miss = await track(request, PROJECT_ONE_KEY, { userId: 'filt-u', event: `${wanted}_other` })
    const matchId = (await match.json()).id
    const missId = (await miss.json()).id

    const { data: matched } = await db.from('event_deliveries').select('id').eq('event_id', matchId)
    const { data: missed } = await db.from('event_deliveries').select('id').eq('event_id', missId)
    expect(matched).toHaveLength(1)
    expect(missed).toHaveLength(0)
  })
})

test('a destination only receives its OWN project s events', async ({ request }) => {
  // The tenancy property the composite foreign keys enforce at the database level. project-two
  // sending an event named identically to project-one's filter must NOT reach project-one's
  // destination.
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const eventName = uniqueEvent('cross_tenant')
  await withDestination(db, p1, { enabled: true, eventFilter: eventName }, async (destId) => {
    // project-two sends the same event name.
    const res = await track(request, PROJECT_TWO_KEY, { userId: 'p2-u', event: eventName })
    expect(res.status()).toBe(201)
    const { id } = await res.json()

    // No delivery row for project-two's event against project-one's destination.
    const { data: leaked } = await db
      .from('event_deliveries')
      .select('id')
      .eq('event_id', id)
      .eq('destination_id', destId)
    expect(leaked).toHaveLength(0)
  })
})

test('a replayed ingest converges on the same delivery work, never doubling it', async ({ request }) => {
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const eventName = uniqueEvent('replay_destined')
  await withDestination(db, p1, { enabled: true, eventFilter: eventName }, async () => {
    const key = `outbox-idem-${Date.now()}`
    const payload = {
      userId: 'replay-u',
      event: eventName,
      context: { version: 1, idempotencyKey: key },
    }
    const first = await track(request, PROJECT_ONE_KEY, payload)
    expect(first.status()).toBe(201)
    const firstId = (await first.json()).id

    const second = await track(request, PROJECT_ONE_KEY, payload)
    expect(second.status()).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.deduplicated).toBe(true)
    expect(secondBody.id).toBe(firstId)

    // ONE event, and exactly ONE delivery row — the replay did not double the work.
    const { data: deliveries } = await db.from('event_deliveries').select('id').eq('event_id', firstId)
    expect(deliveries).toHaveLength(1)
  })
})

test('a replay does NOT fan out to a destination enabled AFTER the original ingest', async ({
  request,
}) => {
  // Cross-review round 1 (Codex): the fan-out must run ONLY on a fresh insert. If it re-ran on the
  // dedup path, a client's at-least-once RETRY would retroactively attach the original event to any
  // destination enabled in the meantime — routing it through a filter its canonical event never
  // matched at ingest time. Retroactive delivery is Story 2.2's operator REPLAY, a deliberate act,
  // never an accident of a client retry.
  const db = dbClient()
  const p1 = await projectIdBySlug(db, 'project-one')
  const eventName = uniqueEvent('replay_no_refan')
  const key = `refan-${Date.now()}`
  const payload = { userId: 'refan-u', event: eventName, context: { version: 1, idempotencyKey: key } }

  // Original ingest: NO destination exists yet, so it queues nothing.
  const first = await track(request, PROJECT_ONE_KEY, payload)
  expect(first.status()).toBe(201)
  const firstId = (await first.json()).id
  const { data: before } = await db.from('event_deliveries').select('id').eq('event_id', firstId)
  expect(before).toHaveLength(0)

  // NOW create + enable a matching destination, then replay the identical request.
  await withDestination(db, p1, { enabled: true, eventFilter: eventName }, async () => {
    const second = await track(request, PROJECT_ONE_KEY, payload)
    expect(second.status()).toBe(200)
    expect((await second.json()).deduplicated).toBe(true)

    // The replay must have attached NOTHING — the destination did not exist when the event was born.
    const { data: after } = await db.from('event_deliveries').select('id').eq('event_id', firstId)
    expect(after).toHaveLength(0)
  })
})
