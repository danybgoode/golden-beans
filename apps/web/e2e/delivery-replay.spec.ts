import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { dispatchPendingDeliveries } from '@/lib/delivery-dispatch'
import { retryDecision, MAX_ATTEMPTS, BASE_DELAY_MS, MAX_DELAY_MS } from '@/lib/retry-policy'
import { verifyWebhookSignature } from '@/lib/webhook-signature'

// event-destination-router · Sprint 2, Story 2.2 — retry, terminal failure, and replay.
//
// THREE LAYERS, the house discipline:
//   • PURE — the retry SCHEDULE, asserted at the first/middle/terminal attempt (Sprint QA).
//   • INJECTED — the dispatcher's send + settle, driven with a disposable project, a deliverable
//     destination, a real event/delivery row, and a FAKE fetch, so every settle branch (delivered /
//     retry-scheduled / dead-letter / permanent) is observed directly. The flag is set in-process
//     (read fresh per call) — an HTTP spec can't reach these branches (the LEARNINGS.md lesson).
//   • HTTP — the cron trigger's AUTH + dark no-op, which IS reachable over HTTP.
//
// The authenticated /app replay + delivery-history UI is a real-session BROWSER smoke owed to Daniel.

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

// A DELIVERABLE destination + a real event + its queued delivery row, in an isolated disposable
// project (so the project-scoped dispatcher claims exactly this test's rows, never a concurrent
// spec's — the isolation lesson from delivery-outbox.spec.ts).
async function fixture(db: SupabaseClient) {
  const { data: proj } = await db
    .from('projects')
    .insert({ slug: `disp-rep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, api_key_hash: `h-${Math.random()}` })
    .select('id')
    .single()
  const pid = proj!.id as string
  const { data: dest } = await db
    .from('event_destinations')
    .insert({
      project_id: pid,
      name: `dest-${Math.random().toString(36).slice(2, 8)}`,
      enabled: true,
      target_url: 'https://receiver.example.test/hook',
      signing_secret: 'whsec_replay_spec_secret_0123456789',
      secret_set_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  const { data: ev } = await db
    .from('events')
    .insert({ project_id: pid, user_id: 'rep-u', event: 'order_placed' })
    .select('id')
    .single()
  const { data: del } = await db
    .from('event_deliveries')
    .insert({ project_id: pid, event_id: ev!.id, destination_id: dest!.id })
    .select('id')
    .single()
  return { pid, destId: dest!.id as string, eventId: ev!.id as string, deliveryId: del!.id as string }
}

// A resolver returning a PUBLIC IP so the send-time SSRF guard passes deterministically and the
// dispatcher specs stay hermetic (the fixture's .test host would otherwise hit real DNS).
const PUBLIC_RESOLVE = async () => ['93.184.216.34']

function stubFetch(status: number) {
  const bodies: { body: string; signature: string }[] = []
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    bodies.push({ body: String(init?.body), signature: headers.get('X-GB-Signature') ?? '' })
    return new Response('', { status })
  }) as unknown as typeof fetch
  return { impl, bodies }
}

async function withGateOn(body: () => Promise<void>) {
  const prev = process.env.DESTINATION_DELIVERY_ENABLED
  process.env.DESTINATION_DELIVERY_ENABLED = 'true'
  try {
    await body()
  } finally {
    if (prev === undefined) delete process.env.DESTINATION_DELIVERY_ENABLED
    else process.env.DESTINATION_DELIVERY_ENABLED = prev
  }
}

// ── the retry schedule (pure) ─────────────────────────────────────────────────────────────────
test('retryDecision: first failure waits BASE, then doubles — EXACT delays', () => {
  expect(retryDecision(1)).toEqual({ retry: true, delayMs: BASE_DELAY_MS })
  expect(retryDecision(2)).toEqual({ retry: true, delayMs: BASE_DELAY_MS * 2 })
  expect(retryDecision(3)).toEqual({ retry: true, delayMs: BASE_DELAY_MS * 4 })
  expect(retryDecision(4)).toEqual({ retry: true, delayMs: BASE_DELAY_MS * 8 })
  // Attempt 5 is the last retry (MAX_ATTEMPTS=6). Its delay is base·16 = 8m, which at the current
  // constants is BELOW MAX_DELAY_MS (1h) — so the ceiling is NOT reached in normal operation
  // (cross-review, Codex round 8: the old `<= MAX_DELAY_MS` assertion was vacuous). Assert the exact
  // value AND that the ceiling is defensive headroom for a larger MAX_ATTEMPTS, not active today.
  expect(retryDecision(5)).toEqual({ retry: true, delayMs: BASE_DELAY_MS * 16 })
  expect(BASE_DELAY_MS * 16).toBeLessThan(MAX_DELAY_MS)
})

test('retryDecision: at MAX_ATTEMPTS the delivery is dead — no further retry', () => {
  expect(retryDecision(MAX_ATTEMPTS)).toEqual({ retry: false })
  expect(retryDecision(MAX_ATTEMPTS + 1)).toEqual({ retry: false })
})

// ── the dispatcher's send + settle (injected fetch) ───────────────────────────────────────────
test('a 2xx settles the delivery as DELIVERED with one attempt, over a verifiable signature', async () => {
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, eventId, deliveryId } = await fixture(db)
    const { impl, bodies } = stubFetch(200)
    try {
      const outcome = await dispatchPendingDeliveries(db, pid, { fetchImpl: impl, resolveHost: PUBLIC_RESOLVE })
      expect(outcome.ok && outcome.dispatched).toBe(true)
      expect(outcome.dispatched && outcome.claimed.map((c) => c.id)).toContain(deliveryId)

      const { data: row } = await db.from('event_deliveries').select('status, attempt_count').eq('id', deliveryId).single()
      expect(row!.status).toBe('delivered')
      expect(row!.attempt_count).toBe(1)

      // The receiver would verify exactly what we sent, and the envelope id is the EVENT id (the
      // dedup anchor a receiver keys off).
      expect(bodies).toHaveLength(1)
      expect(JSON.parse(bodies[0].body).id).toBe(eventId)
      expect(verifyWebhookSignature('whsec_replay_spec_secret_0123456789', bodies[0].body, bodies[0].signature)).toEqual({ ok: true })
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('a 5xx settles as FAILED with a future next_attempt_at (a retry is scheduled, not dead)', async () => {
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId } = await fixture(db)
    try {
      const before = Date.now()
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(503).impl, resolveHost: PUBLIC_RESOLVE })
      const { data: row } = await db
        .from('event_deliveries')
        .select('status, attempt_count, next_attempt_at, last_error')
        .eq('id', deliveryId)
        .single()
      expect(row!.status).toBe('failed')
      expect(row!.attempt_count).toBe(1)
      expect(new Date(row!.next_attempt_at as string).getTime()).toBeGreaterThan(before)
      expect(row!.last_error).toContain('503')
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('a permanent 4xx dead-letters IMMEDIATELY (no backoff burned)', async () => {
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId } = await fixture(db)
    try {
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(400).impl, resolveHost: PUBLIC_RESOLVE })
      const { data: row } = await db.from('event_deliveries').select('status, attempt_count').eq('id', deliveryId).single()
      expect(row!.status).toBe('dead')
      expect(row!.attempt_count).toBe(1) // one real attempt, then terminal — not the whole schedule
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('repeated 5xx eventually DEAD-LETTERS after the attempt budget is spent', async () => {
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId } = await fixture(db)
    try {
      // Drive the row through its whole schedule. Each pass claims it only if due, so force it due by
      // resetting next_attempt_at to the past between passes (the backoff would otherwise make us
      // wait). We keep attempt_count as the dispatcher set it — only the clock is moved.
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await db.from('event_deliveries').update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq('id', deliveryId).eq('status', 'failed')
        await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(503).impl, resolveHost: PUBLIC_RESOLVE })
      }
      const { data: row } = await db.from('event_deliveries').select('status, attempt_count').eq('id', deliveryId).single()
      expect(row!.status).toBe('dead')
      expect(row!.attempt_count).toBe(MAX_ATTEMPTS)
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('after a delivery, a REPLAY (reset to pending) re-sends with the SAME logical event id — dedupable', async () => {
  // The acceptance's substance: replay creates one new attempt for the SAME logical event id, so a
  // receiver can deduplicate it against the original. We deliver once, reset the row the way
  // replayDelivery() does (status→pending, attempt_count→0), dispatch again, and assert the second
  // send carries the identical envelope id. (The /app replay button + its settled-state guard is the
  // browser smoke owed to Daniel; this pins the delivery-level property it depends on.)
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, eventId, deliveryId } = await fixture(db)
    try {
      const first = stubFetch(200)
      await dispatchPendingDeliveries(db, pid, { fetchImpl: first.impl, resolveHost: PUBLIC_RESOLVE })
      expect((await db.from('event_deliveries').select('status').eq('id', deliveryId).single()).data!.status).toBe('delivered')

      // Replay: the same reset replayDelivery() performs.
      await db.from('event_deliveries').update({ status: 'pending', attempt_count: 0, next_attempt_at: new Date().toISOString(), claimed_at: null, last_error: null }).eq('id', deliveryId)

      const second = stubFetch(200)
      await dispatchPendingDeliveries(db, pid, { fetchImpl: second.impl, resolveHost: PUBLIC_RESOLVE })
      const { data: row } = await db.from('event_deliveries').select('status, attempt_count').eq('id', deliveryId).single()
      expect(row!.status).toBe('delivered')
      expect(row!.attempt_count).toBe(1) // one NEW attempt, budget reset

      // Same logical id across both sends — this is what makes at-least-once delivery dedupable.
      expect(JSON.parse(first.bodies[0].body).id).toBe(eventId)
      expect(JSON.parse(second.bodies[0].body).id).toBe(eventId)
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('each settled send is LOGGED to the append-only attempt log, and a replay ADDS rather than erases', async () => {
  // Cross-review (Codex 2026-07-21): replay resets the delivery ROW, so history must live elsewhere.
  // Deliver once → one 'delivered' attempt logged. Replay + deliver again → a SECOND attempt logged,
  // the first still present. The delivery it already made is never erased.
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId } = await fixture(db)
    try {
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(200).impl, resolveHost: PUBLIC_RESOLVE })
      let { data: attempts } = await db.from('event_delivery_attempts').select('outcome, attempt_no').eq('delivery_id', deliveryId).order('attempt_no')
      expect(attempts).toHaveLength(1)
      expect(attempts![0].outcome).toBe('delivered')

      // Replay (the same reset replayDelivery performs) + deliver again.
      await db.from('event_deliveries').update({ status: 'pending', attempt_count: 0, next_attempt_at: new Date().toISOString(), claimed_at: null }).eq('id', deliveryId)
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(200).impl, resolveHost: PUBLIC_RESOLVE })

      ;({ data: attempts } = await db.from('event_delivery_attempts').select('outcome, attempt_no').eq('delivery_id', deliveryId).order('created_at'))
      // TWO delivered attempts — the replay ADDED to history, the original was not erased.
      expect(attempts).toHaveLength(2)
      expect(attempts!.every((a) => a.outcome === 'delivered')).toBe(true)
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('delivery_health counts SUCCESSFUL deliveries from the attempt log — so replay does not lose the count', async () => {
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId, destId } = await fixture(db)
    try {
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(200).impl, resolveHost: PUBLIC_RESOLVE })
      // Replay + deliver again: the ROW is delivered once (current state), but TWO deliveries happened.
      await db.from('event_deliveries').update({ status: 'pending', attempt_count: 0, next_attempt_at: new Date().toISOString(), claimed_at: null }).eq('id', deliveryId)
      await dispatchPendingDeliveries(db, pid, { fetchImpl: stubFetch(200).impl, resolveHost: PUBLIC_RESOLVE })

      const { data } = await db.rpc('delivery_health', { p_project_id: pid })
      const row = (data as Record<string, unknown>[]).find((r) => r.destination_id === destId)!
      expect(Number(row.delivered)).toBe(2) // both deliveries counted — from the attempt log
      expect(Number(row.dead)).toBe(0)
      expect(row.last_delivery_at).not.toBeNull()
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('a past deadline RELEASES claimed rows back to pending WITHOUT sending — never strands in_flight', async () => {
  // Cross-review (Codex 2026-07-21): a project's full batch of slow sends could overrun the function
  // deadline. With the deadline already passed, the dispatcher must claim, then release everything
  // back to pending unattempted — no send, no row left in_flight.
  const db = dbClient()
  await withGateOn(async () => {
    const { pid, deliveryId } = await fixture(db)
    const stub = stubFetch(200)
    try {
      const outcome = await dispatchPendingDeliveries(db, pid, {
        fetchImpl: stub.impl,
        resolveHost: PUBLIC_RESOLVE,
        deadlineMs: Date.now() - 1, // already past → stop before the first send
      })
      expect(outcome.ok && outcome.dispatched).toBe(true)
      expect(stub.bodies).toHaveLength(0) // nothing was sent
      const { data: row } = await db.from('event_deliveries').select('status, attempt_count, claimed_at').eq('id', deliveryId).single()
      expect(row!.status).toBe('pending') // released, not stranded in_flight
      expect(row!.attempt_count).toBe(0)
      expect(row!.claimed_at).toBeNull()
    } finally {
      await db.from('projects').delete().eq('id', pid)
    }
  })
})

test('delete_destination drains outstanding work, and replay_delivery REFUSES a removed destination', async () => {
  // Cross-review (Codex rounds 12-13): both operations must be atomic. delete_destination
  // soft-deletes AND drains in one transaction; replay_delivery re-checks liveness INSIDE its UPDATE,
  // so a concurrent delete can never let replay resurrect unclaimable work.
  const db = dbClient()
  const { pid, destId, deliveryId } = await fixture(db)
  try {
    // The delivery starts pending. Remove the destination via the RPC.
    const { data: deleted, error: delErr } = await db.rpc('delete_destination', {
      p_project_id: pid,
      p_destination_id: destId,
      p_now: new Date().toISOString(),
    })
    expect(delErr).toBeNull()
    expect(deleted).toBe(true)

    // The CREDENTIAL is destroyed, not merely hidden (cross-review, Codex round 21) — the UI promises
    // the secret is lost, so a DB/backup compromise must not be able to recover a forgeable secret.
    const { data: tomb } = await db
      .from('event_destinations')
      .select('signing_secret, secret_set_at, target_url, deleted_at')
      .eq('id', destId)
      .single()
    expect(tomb!.signing_secret).toBeNull()
    expect(tomb!.secret_set_at).toBeNull()
    expect(tomb!.target_url).toBeNull()
    expect(tomb!.deleted_at).not.toBeNull()

    // Its outstanding work was DRAINED to dead — not left pending-and-unclaimable.
    const { data: row } = await db.from('event_deliveries').select('status, last_error').eq('id', deliveryId).single()
    expect(row!.status).toBe('dead')
    expect(row!.last_error).toBe('destination removed')

    // And replay REFUSES it (returns null), so the drained row cannot be resurrected.
    const { data: replayed, error: repErr } = await db.rpc('replay_delivery', {
      p_project_id: pid,
      p_delivery_id: deliveryId,
      p_now: new Date().toISOString(),
    })
    expect(repErr).toBeNull()
    expect(replayed == null || (Array.isArray(replayed) && replayed.length === 0)).toBe(true)
    // Still dead — the refusal actually prevented the write.
    const { data: after } = await db.from('event_deliveries').select('status').eq('id', deliveryId).single()
    expect(after!.status).toBe('dead')
  } finally {
    await db.from('projects').delete().eq('id', pid)
  }
})

test('replay_delivery accepts TERMINAL rows only — a mid-retry `failed` row is refused', async () => {
  // Cross-review (Codex round 14): a `failed` row is already scheduled for an automatic retry, so
  // replaying it would silently override that schedule and reset its attempt budget — a different
  // operation from what "replay" says. Terminal only: delivered | dead.
  const db = dbClient()
  const { pid, deliveryId } = await fixture(db)
  const future = new Date(Date.now() + 60_000).toISOString()
  try {
    // A row mid-retry: failed, with a scheduled next attempt and a spent budget.
    await db
      .from('event_deliveries')
      .update({ status: 'failed', attempt_count: 2, next_attempt_at: future })
      .eq('id', deliveryId)

    const { data: refused } = await db.rpc('replay_delivery', {
      p_project_id: pid,
      p_delivery_id: deliveryId,
      p_now: new Date().toISOString(),
    })
    expect(refused == null || (Array.isArray(refused) && refused.length === 0)).toBe(true)
    // Untouched: its retry schedule and budget survive.
    const { data: row } = await db.from('event_deliveries').select('status, attempt_count').eq('id', deliveryId).single()
    expect(row!.status).toBe('failed')
    expect(row!.attempt_count).toBe(2)

    // A DEAD row, by contrast, replays fine.
    await db.from('event_deliveries').update({ status: 'dead' }).eq('id', deliveryId)
    const { data: accepted } = await db.rpc('replay_delivery', {
      p_project_id: pid,
      p_delivery_id: deliveryId,
      p_now: new Date().toISOString(),
    })
    expect(accepted).toBeTruthy()
  } finally {
    await db.from('projects').delete().eq('id', pid)
  }
})

test('a REMOVED destination leaves no claimable work — enumeration ignores it', async () => {
  // Cross-review (Codex round 12): a deleted destination can never be re-enabled and the dispatcher
  // only claims ENABLED destinations, so any delivery left pending for it would be undrainable.
  // deleteDestination drains them to dead; here we pin the enumeration half — a project whose only
  // work belongs to a removed destination is not enumerated as having due work.
  const db = dbClient()
  const { pid, destId } = await fixture(db)
  try {
    // Soft-delete the destination the way deleteDestination does.
    await db
      .from('event_destinations')
      .update({ deleted_at: new Date().toISOString(), enabled: false })
      .eq('id', destId)

    const { data } = await db.rpc('projects_with_due_work', {
      p_now: new Date().toISOString(),
      p_limit: 200,
      p_stale_after_ms: 300000,
    })
    expect((data as { project_id: string }[]).map((r) => r.project_id)).not.toContain(pid)
  } finally {
    await db.from('projects').delete().eq('id', pid)
  }
})

// ── enumeration eligibility (projects_with_due_work RPC) ──────────────────────────────────────
test('projects_with_due_work surfaces a project whose ONLY due work is a STALE in_flight row', async () => {
  // Cross-review (Codex + Antigravity 2026-07-21): the old Node enumeration filtered pending/failed
  // only, so a project stranded with a stale in_flight row (dead worker) was never enumerated and its
  // rows never reached the stale-reclaim path. The RPC includes the stale-in_flight condition.
  const db = dbClient()
  const { pid, deliveryId } = await fixture(db)
  try {
    // Mark the delivery in_flight and claimed 10 minutes ago — a dead-worker casualty.
    const staleClaim = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await db.from('event_deliveries').update({ status: 'in_flight', claimed_at: staleClaim }).eq('id', deliveryId)

    const { data } = await db.rpc('projects_with_due_work', {
      p_now: new Date().toISOString(),
      p_limit: 200,
      p_stale_after_ms: 300000, // 5 min — the row is 10 min stale, so it qualifies
    })
    expect((data as { project_id: string }[]).map((r) => r.project_id)).toContain(pid)
  } finally {
    await db.from('projects').delete().eq('id', pid)
  }
})

test('projects_with_due_work EXCLUDES a project whose due work is behind a DISABLED destination', async () => {
  // The starvation fix (#8): a disabled destination's backlog is not "due work" and must not occupy
  // the enumeration, crowding out tenants with real work.
  const db = dbClient()
  const { pid, destId, deliveryId } = await fixture(db)
  try {
    await db.from('event_destinations').update({ enabled: false }).eq('id', destId)
    // The delivery row is pending + due, but its destination is disabled.
    await db.from('event_deliveries').update({ status: 'pending', next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq('id', deliveryId)

    const { data } = await db.rpc('projects_with_due_work', {
      p_now: new Date().toISOString(),
      p_limit: 200,
      p_stale_after_ms: 300000,
    })
    expect((data as { project_id: string }[]).map((r) => r.project_id)).not.toContain(pid)
  } finally {
    await db.from('projects').delete().eq('id', pid)
  }
})

// ── the cron trigger's auth + dark no-op (HTTP) ───────────────────────────────────────────────
test('the dispatch cron refuses an unauthenticated request', async ({ request }) => {
  const res = await request.post('/api/internal/dispatch-deliveries')
  expect(res.status()).toBe(401)
})

test('the dispatch cron refuses a WRONG bearer secret', async ({ request }) => {
  const res = await request.post('/api/internal/dispatch-deliveries', {
    headers: { Authorization: 'Bearer definitely-not-the-secret' },
  })
  expect(res.status()).toBe(401)
})

test('with the RIGHT secret but the delivery gate OFF, the cron is an authenticated no-op', async ({ request }) => {
  // The gate script boots the server with CRON_SECRET set and DESTINATION_DELIVERY_ENABLED unset —
  // so a correctly-authenticated tick returns enabled:false, sending nothing. Skips gracefully if
  // the secret isn't in the env (a bare `next dev` without the gate script).
  const secret = process.env.CRON_SECRET
  test.skip(!secret, 'CRON_SECRET not set (run via the gate script)')
  const res = await request.post('/api/internal/dispatch-deliveries', {
    headers: { Authorization: `Bearer ${secret}` },
  })
  expect(res.status()).toBe(200)
  expect((await res.json()).enabled).toBe(false)
})
