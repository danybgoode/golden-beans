import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { isSignalsEnabled } from '../lib/flags'
// From the zero-import module, NOT from lib/signals.ts — that file imports `server-only`, and
// importing it here fails the whole suite at collection time with an opaque module error
// (Roadmap/LEARNINGS.md; see lib/signal-events.ts's header for the full account).
import { ERROR_EVENT } from '../lib/signal-events'

// signals-loop · Sprint 1, Stories 1.1–1.3 — error capture, deterministic grouping, and the lazy
// friction evaluation, exercised through the REAL ingest path.
//
// ── Two conventions this file follows deliberately ────────────────────────────────────────────
//
// 1. EVERY test provisions its own throwaway tenant. The same reasoning as ingest-guardrails.spec:
//    signal counters are DB-backed and survive between local runs, so a shared fixture would carry
//    its state into the next run and these specs would pass exactly once.
//
// 2. Events are fired through the NORMAL track path, UNTAGGED with any experiment or feature
//    convenience-tagging the implementation happens to find useful. This is the S4 realistic-input
//    lesson, which this repo has now paid for three times (Roadmap/LEARNINGS.md): a read path that
//    silently requires a tag the realistic caller has no reason to set fails as an honest-looking
//    zero, and a zero pages nobody. The scope doc names this rule for this epic specifically.

function dbClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

type Tenant = { projectId: string; slug: string; plaintextKey: string }

async function createTenant(db: SupabaseClient): Promise<Tenant> {
  const slug = `spec-signals-${randomBytes(6).toString('hex')}`
  const { data: project, error } = await db
    .from('projects')
    .insert({ slug, api_key_hash: null })
    .select('id')
    .single()
  if (error || !project) throw new Error(`could not create fixture project: ${error?.message}`)

  const plaintextKey = `gb_key_spec_${randomBytes(24).toString('base64url')}`
  const { createHash } = await import('node:crypto')
  const { error: keyError } = await db.from('api_keys').insert({
    project_id: project.id,
    key_hash: createHash('sha256').update(plaintextKey).digest('hex'),
    label: 'signals spec',
  })
  if (keyError) throw new Error(`could not create fixture key: ${keyError.message}`)

  return { projectId: project.id, slug, plaintextKey }
}

async function captureError(
  request: APIRequestContext,
  tenant: Tenant,
  payload: { userId: string; name: string; message: string; stack?: string; context?: unknown },
) {
  return request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${tenant.plaintextKey}`, 'Content-Type': 'application/json' },
    data: {
      userId: payload.userId,
      event: ERROR_EVENT,
      tags: { name: payload.name, message: payload.message, stack: payload.stack ?? null },
      metadata: { context: payload.context ?? {} },
    },
  })
}

// Grouping is scheduled with `after()`, so it lands just behind the response. Polling rather than a
// fixed sleep: a fixed sleep is either flaky or slow, and usually manages both.
//
// ── Poll for the CONDITION, not for a row count ─────────────────────────────────────────────
// The first version of this helper waited for `rows.length >= expected`, which is satisfied the
// moment the FIRST of several occurrences groups — so a test asserting `event_count === 3` read the
// row while it still said 1 and failed intermittently. Worse, it would have PASSED for any
// assertion the early state happened to satisfy, which is how a race becomes a flake nobody can
// reproduce. Waiting on the predicate the test actually cares about removes the class of bug.
async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let latest = await read()
  while (Date.now() < deadline) {
    if (done(latest)) return latest
    await new Promise((r) => setTimeout(r, 150))
    latest = await read()
  }
  // Returned rather than thrown, so the test's own expect() reports the actual value it saw —
  // a timeout error here would hide the number that makes the failure diagnosable.
  return latest
}

type SignalRows = Array<Record<string, unknown>>

function readSignals(db: SupabaseClient, projectId: string): () => Promise<SignalRows> {
  return async () => {
    const { data } = await db.from('signals').select('*').eq('project_id', projectId)
    return (data ?? []) as SignalRows
  }
}

/** Waits until `count` distinct signals exist for the project. */
async function waitForSignals(db: SupabaseClient, projectId: string, expected: number): Promise<SignalRows> {
  return waitFor(readSignals(db, projectId), (rows) => rows.length >= expected)
}

/** Waits until exactly one signal exists AND its event_count has reached `expected`. */
async function waitForEventCount(
  db: SupabaseClient,
  projectId: string,
  expected: number,
): Promise<SignalRows> {
  return waitFor(
    readSignals(db, projectId),
    (rows) => rows.length >= 1 && Number(rows[0].event_count) >= expected,
  )
}

test.describe('signals capture + grouping', () => {
  test.skip(!isSignalsEnabled(), 'SIGNALS_ENABLED is off — the seam is dark, by design')

  test('the same error twice is ONE signal with a count of 2', async ({ request }) => {
    const db = dbClient()
    const tenant = await createTenant(db)

    const stack = 'Error: boom\n    at handler (/app/routes/checkout.ts:42:11)'
    const a = await captureError(request, tenant, {
      userId: 'user-1',
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
      stack,
    })
    expect(a.status()).toBe(201)

    const b = await captureError(request, tenant, {
      userId: 'user-2',
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
      stack,
    })
    expect(b.status()).toBe(201)

    const rows = await waitForEventCount(db, tenant.projectId, 2)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].event_count)).toBe(2)
    // Two DISTINCT users hit it — this is the number the impact rank multiplies, and the one a
    // naive "count events" implementation gets wrong in exactly the crash-loop case that matters.
    expect(rows[0].users_affected).toBe(2)
  })

  test('the SAME user hitting an error twice does not inflate users_affected', async ({ request }) => {
    // The counter-test to the one above, and the reason signal_users exists as a table rather than
    // an incremented column: one user in a retry loop must never outrank a thousand users hitting
    // a bug once.
    const db = dbClient()
    const tenant = await createTenant(db)
    const stack = 'Error: loop\n    at retry (/app/lib/retry.ts:9:3)'

    for (let i = 0; i < 3; i += 1) {
      const res = await captureError(request, tenant, {
        userId: 'the-same-user',
        name: 'RangeError',
        message: 'retry budget exhausted',
        stack,
      })
      expect(res.status()).toBe(201)
    }

    const rows = await waitForEventCount(db, tenant.projectId, 3)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].event_count)).toBe(3)
    expect(rows[0].users_affected).toBe(1)
  })

  test('errors differing only in an embedded id group together', async ({ request }) => {
    // The whole point of normalization: `User 41 not found` and `User 9182 not found` are one bug.
    // Without this, a per-user error produces one signal per user and the queue is unusable.
    const db = dbClient()
    const tenant = await createTenant(db)
    const stack = 'Error\n    at lookup (/app/lib/users.ts:12:5)'

    await captureError(request, tenant, { userId: 'u1', name: 'NotFound', message: 'User 41 not found', stack })
    await captureError(request, tenant, { userId: 'u2', name: 'NotFound', message: 'User 9182 not found', stack })

    const rows = await waitForEventCount(db, tenant.projectId, 2)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].event_count)).toBe(2)
  })

  test('genuinely different errors stay separate signals', async ({ request }) => {
    // The discrimination half. A grouping function that merged everything would pass the test
    // above and be useless, so both directions are asserted.
    const db = dbClient()
    const tenant = await createTenant(db)

    await captureError(request, tenant, {
      userId: 'u1',
      name: 'TypeError',
      message: 'undefined is not a function',
      stack: 'Error\n    at a (/app/a.ts:1:1)',
    })
    await captureError(request, tenant, {
      userId: 'u1',
      name: 'NetworkError',
      message: 'upstream timed out',
      stack: 'Error\n    at b (/app/b.ts:2:2)',
    })

    const rows = await waitForSignals(db, tenant.projectId, 2)
    expect(rows).toHaveLength(2)
  })

  test('the same message thrown from DIFFERENT call sites stays two signals', async ({ request }) => {
    // ── This spec exists because the one above has no teeth for the stack ────────────────────
    // A mutation check caught it: setting the fingerprint's `stack` input to null — so grouping
    // ignores the call site entirely — left the whole suite green, because every other case varies
    // the name or the message too and would stay distinct anyway. The spec looked like it defended
    // the stack component and defended nothing (Roadmap/LEARNINGS.md: a spec that LOOKS like a
    // teeth test is worse than an absent one, because the next reader stops there).
    //
    // This is the input that distinguishes the two implementations: identical name, identical
    // message, different frame. A generic message like "Request failed" thrown from two unrelated
    // modules is an extremely ordinary shape, and merging those two is a real product failure —
    // the queue would show one problem where there are two, and resolving it would close both.
    const db = dbClient()
    const tenant = await createTenant(db)

    await captureError(request, tenant, {
      userId: 'u1',
      name: 'Error',
      message: 'Request failed',
      stack: 'Error: Request failed\n    at loadCart (/app/cart.ts:14:9)',
    })
    await captureError(request, tenant, {
      userId: 'u1',
      name: 'Error',
      message: 'Request failed',
      stack: 'Error: Request failed\n    at loadProfile (/app/profile.ts:88:3)',
    })

    const rows = await waitForSignals(db, tenant.projectId, 2)
    expect(rows).toHaveLength(2)
  })

  test('a secret in an error message is scrubbed SERVER-SIDE, from a hand-rolled payload', async ({
    request,
  }) => {
    // ── The most important test in this file ────────────────────────────────────────────────
    // It deliberately does NOT use the SDK. The SDK scrubs before sending, so a spec that went
    // through it would prove only that the SDK works — and would pass identically against a server
    // with no scrub at all. The server cannot tell an SDK payload from a curl payload, so the
    // assertion has to be made the way an attacker (or a hand-rolled client) would send it.
    const db = dbClient()
    const tenant = await createTenant(db)
    const secret = `gb_key_${randomBytes(24).toString('base64url')}`

    const res = await captureError(request, tenant, {
      userId: 'u1',
      name: 'AuthError',
      message: `rejected credential ${secret} for daniel@example.com`,
      stack: `Error\n    at auth (/app/auth.ts:3:1)\n  header: Bearer ${secret}`,
      context: { apiKey: secret, note: 'keep me' },
    })
    expect(res.status()).toBe(201)

    const rows = await waitForSignals(db, tenant.projectId, 1)
    expect(rows).toHaveLength(1)

    // The whole stored row, serialized — so this catches the secret wherever it landed, including a
    // field a future change adds without thinking about redaction.
    const serialized = JSON.stringify(rows[0])
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('daniel@example.com')
    // And the non-secret neighbour survived — a scrub that ate everything would pass the assertions
    // above while making every stored error useless.
    expect(serialized).toContain('keep me')
  })

  test('the raw EVENT row is scrubbed too, not just the signal', async ({ request }) => {
    // ── The spec that should have existed first ─────────────────────────────────────────────
    // Cross-review (Codex, 2026-07-26) found this as Blocking, and a probe against the real
    // database confirmed it before it was accepted: scrubbing ran only on the way into `signals`,
    // while ingest_event had already written the caller's RAW tags into `events`. A hand-rolled
    // post produced a clean signal row AND a permanent plaintext credential in events.tags.
    //
    // The spec above it asserted exactly the right property against exactly the wrong table. That
    // is the sharper version of the LEARNINGS lesson: a green assertion about `signals` says
    // nothing about `events`, and `events` is where the durable copy lives — append-only for the
    // service role, so a leak there is not something a later cleanup can fully undo.
    const db = dbClient()
    const tenant = await createTenant(db)
    const secret = `gb_key_${randomBytes(24).toString('base64url')}`

    const res = await captureError(request, tenant, {
      userId: 'u1',
      name: 'AuthError',
      message: `rejected ${secret} for daniel@example.com`,
      stack: `Error\n    at auth (/app/auth.ts:3:1)`,
      context: { apiKey: secret },
    })
    expect(res.status()).toBe(201)

    const { data: events } = await db
      .from('events')
      .select('tags, metadata')
      .eq('project_id', tenant.projectId)
    expect((events ?? []).length).toBeGreaterThan(0)

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain('daniel@example.com')
  })

  test('an ORDINARY event is NOT redacted — only reserved ones are', async ({ request }) => {
    // The counter-test, and the boundary that keeps the fix from becoming its own bug. A tenant's
    // own event vocabulary is data they chose and rely on; redacting it would silently corrupt
    // their analytics. Only `$error`/`$friction` carry payloads assembled by someone else's code.
    const db = dbClient()
    const tenant = await createTenant(db)

    const res = await request.post('/api/v1/track', {
      headers: { Authorization: `Bearer ${tenant.plaintextKey}`, 'Content-Type': 'application/json' },
      data: {
        userId: 'u1',
        event: 'checkout_completed',
        tags: { orderRef: 'a3f5c9d1e7b28406a3f5c9d1e7b28406', email: 'buyer@example.com' },
      },
    })
    expect(res.status()).toBe(201)

    const { data: events } = await db.from('events').select('tags').eq('project_id', tenant.projectId)
    const serialized = JSON.stringify(events)
    expect(serialized).toContain('a3f5c9d1e7b28406a3f5c9d1e7b28406')
    expect(serialized).toContain('buyer@example.com')
  })

  test('a foreign tenant cannot read another tenant signals', async ({ request }) => {
    // Cross-tenant isolation with a REAL foreign key, not a fabricated one (the S4 lesson): a spec
    // using a made-up key proves only that garbage is rejected, which is a different property.
    const db = dbClient()
    const victim = await createTenant(db)
    const attacker = await createTenant(db)

    await captureError(request, victim, {
      userId: 'victim-user',
      name: 'SecretError',
      message: 'victim-only-marker',
      stack: 'Error\n    at v (/app/v.ts:1:1)',
    })
    await waitForSignals(db, victim.projectId, 1)

    // ── Asserted from BOTH sides, after a cross-review Should-fix ───────────────────────────
    // The first version checked only that the attacker's project had no rows, using the
    // service-role client. Codex (2026-07-26) correctly pointed out that this exercises no
    // attacker-AUTHENTICATED read at all, so it could not catch a tenant-scope leak in a read
    // surface — it asserts a property of the data rather than of the boundary.
    //
    // Sprint 1 genuinely has no HTTP read surface for signals yet (that is Story 2.2/2.3), so an
    // end-to-end authenticated read is not reachable here and pretending otherwise would be the
    // "unreachable-by-construction spec" LEARNINGS warns about. What IS assertable today is that
    // the attacker's own credential, used against the one authenticated path that exists, cannot
    // cause a read of the victim's rows — plus the data-side check below. The full authenticated
    // cross-tenant read assertion is owed by Story 2.3 and is named in sprint-2.md's QA section.
    const { data: attackerRows } = await db.from('signals').select('*').eq('project_id', attacker.projectId)
    expect(attackerRows ?? []).toHaveLength(0)

    // The attacker authenticates for real and ingests their own error. Their credential must
    // resolve to THEIR project — the property that makes every downstream read safe by
    // construction, since no tool or route accepts a caller-supplied project id.
    await captureError(request, attacker, {
      userId: 'attacker-user',
      name: 'AttackerError',
      message: 'attacker-only-marker',
      stack: 'Error\n    at a (/app/a.ts:1:1)',
    })
    const attackerAfter = await waitForSignals(db, attacker.projectId, 1)
    expect(JSON.stringify(attackerAfter)).toContain('attacker-only-marker')
    expect(JSON.stringify(attackerAfter)).not.toContain('victim-only-marker')

    const { data: victimRows } = await db.from('signals').select('title').eq('project_id', victim.projectId)
    expect(JSON.stringify(victimRows)).toContain('victim-only-marker')
    expect(JSON.stringify(victimRows)).not.toContain('attacker-only-marker')
  })

  test('a non-reserved event does NOT create a signal', async ({ request }) => {
    // The blast-radius test. Ordinary telemetry vastly outnumbers errors, and a grouping path that
    // fired on every event would fill the queue with noise and cost every tenant write amplification
    // on their hottest path.
    const db = dbClient()
    const tenant = await createTenant(db)

    const res = await request.post('/api/v1/track', {
      headers: { Authorization: `Bearer ${tenant.plaintextKey}`, 'Content-Type': 'application/json' },
      data: { userId: 'u1', event: 'checkout_completed', tags: { message: 'not an error' } },
    })
    expect(res.status()).toBe(201)

    // Given a moment in which it COULD have appeared, and then asserted absent.
    await new Promise((r) => setTimeout(r, 1500))
    const { data } = await db.from('signals').select('id').eq('project_id', tenant.projectId)
    expect(data ?? []).toHaveLength(0)
  })

  test('an oversized error payload is rejected by the existing ingest cap', async ({ request }) => {
    // Signals inherit the shared ingest guards rather than introducing their own — the acceptance
    // criterion "malformed/oversized payload → 4xx". Asserted here so a future change that routed
    // `$error` around the cap would fail loudly.
    const db = dbClient()
    const tenant = await createTenant(db)

    const res = await captureError(request, tenant, {
      userId: 'u1',
      name: 'HugeError',
      message: 'x'.repeat(200_000),
      stack: 'y'.repeat(200_000),
    })
    expect(res.status()).toBe(413)
  })
})
