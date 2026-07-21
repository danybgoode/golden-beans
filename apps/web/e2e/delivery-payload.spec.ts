import { test, expect } from '@playwright/test'
import {
  serializeEnvelope,
  buildEventEnvelope,
  buildTestEnvelope,
  type CanonicalEventRow,
} from '@/lib/delivery-payload'
import { verifyWebhookSignature } from '@/lib/webhook-signature'
import { deliverWebhook } from '@/lib/webhook-delivery'
import type { DeliverableDestination } from '@/lib/destinations'

// event-destination-router · Sprint 2 — the delivery ENVELOPE (pure) and the signed SEND (injected
// fetch). Pure/injected so both are asserted directly, the same discipline as webhook-signature.spec
// — a receiver copies verifyWebhookSignature() and parses this envelope, so both must be provably
// correct in isolation, not merely observed through the dispatcher.

test('serializeEnvelope emits a FIXED key order — the signed bytes are deterministic', () => {
  // If key order varied, two serializations of the same envelope would sign differently and a
  // receiver re-serializing to verify would fail. Assert the exact string.
  const body = serializeEnvelope({
    id: 'evt_1',
    type: 'order_placed',
    occurredAt: '2026-07-22T00:00:00.000Z',
    data: { userId: 'u1' },
  })
  expect(body).toBe(
    '{"id":"evt_1","type":"order_placed","occurredAt":"2026-07-22T00:00:00.000Z","data":{"userId":"u1"}}',
  )
})

test('the test envelope carries test:true; a real event envelope never does', () => {
  const testBody = JSON.parse(serializeEnvelope(buildTestEnvelope(new Date('2026-07-22T00:00:00Z'))))
  expect(testBody.test).toBe(true)
  expect(String(testBody.id)).toMatch(/^evt_test_/)

  const realRow: CanonicalEventRow = { id: 'evt_real', event: 'order_placed', occurred_at: '2026-07-22T00:00:00.000Z' }
  const realBody = JSON.parse(serializeEnvelope(buildEventEnvelope(realRow)))
  // Absent, not `false` — a field only ever present-when-true can't be mistaken for a real event by
  // a receiver that checks truthiness.
  expect('test' in realBody).toBe(false)
})

test('buildEventEnvelope omits null fields and folds actor/subject into objects', () => {
  const row: CanonicalEventRow = {
    id: 'evt_2',
    event: 'signup',
    occurred_at: '2026-07-22T00:00:00.000Z',
    user_id: 'u2',
    feature_id: null,
    tags: {},
    metadata: { plan: 'pro' },
    actor_type: 'user',
    actor_id: 'a1',
    subject_type: null,
    subject_id: null,
    correlation_id: 'corr-1',
  }
  const env = buildEventEnvelope(row)
  expect(env.data).toEqual({
    userId: 'u2',
    metadata: { plan: 'pro' }, // tags:{} dropped as empty; feature_id null dropped
    actor: { type: 'user', id: 'a1' },
    correlationId: 'corr-1',
  })
  expect('subject' in env.data).toBe(false)
})

test('occurredAt falls back to created_at when the event asserted no occurred_at', () => {
  const env = buildEventEnvelope({ id: 'e', event: 'x', occurred_at: null, created_at: '2026-01-01T00:00:00.000Z' })
  expect(env.occurredAt).toBe('2026-01-01T00:00:00.000Z')
})

// ── the signed send, against an injected fetch (no network) ───────────────────────────────────
const DEST: DeliverableDestination = {
  id: 'd1',
  name: 'stub',
  targetUrl: 'https://receiver.example.com/hook',
  signingSecret: 'whsec_stub_secret_0123456789',
}

// Inject a resolver returning a PUBLIC IP so the send-time SSRF guard passes deterministically and
// the unit suite stays hermetic (no real DNS). A separate test injects a PRIVATE-resolving one.
const PUBLIC_RESOLVE = async () => ['93.184.216.34']

function stubFetch(status: number, body = 'ok'): { impl: typeof fetch; seen: { url: string; signature: string; body: string }[] } {
  const seen: { url: string; signature: string; body: string }[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    seen.push({ url: String(url), signature: headers.get('X-GB-Signature') ?? '', body: String(init?.body) })
    return new Response(body, { status })
  }) as unknown as typeof fetch
  return { impl, seen }
}

test('a 2xx is delivered, and the delivered request carries a VERIFIABLE signature over the body', async () => {
  const { impl, seen } = stubFetch(200)
  const body = serializeEnvelope(buildTestEnvelope())
  const T = 1_800_000_000
  const result = await deliverWebhook(DEST, body, { fetchImpl: impl, timestampSeconds: T, resolveHost: PUBLIC_RESOLVE })
  expect(result.disposition).toBe('delivered')
  expect(result.status).toBe(200)
  // The receiver verifies exactly what we sent — same secret, same body, the header we signed.
  expect(seen[0].body).toBe(body)
  expect(verifyWebhookSignature(DEST.signingSecret, body, seen[0].signature, T)).toEqual({ ok: true })
})

test('a 5xx is RETRYABLE; a 4xx (not 408/429) is PERMANENT; 429 is retryable', async () => {
  const b = 'x'
  expect((await deliverWebhook(DEST, b, { fetchImpl: stubFetch(503).impl, resolveHost: PUBLIC_RESOLVE })).disposition).toBe('retryable')
  expect((await deliverWebhook(DEST, b, { fetchImpl: stubFetch(400).impl, resolveHost: PUBLIC_RESOLVE })).disposition).toBe('permanent')
  expect((await deliverWebhook(DEST, b, { fetchImpl: stubFetch(404).impl, resolveHost: PUBLIC_RESOLVE })).disposition).toBe('permanent')
  expect((await deliverWebhook(DEST, b, { fetchImpl: stubFetch(429).impl, resolveHost: PUBLIC_RESOLVE })).disposition).toBe('retryable')
  expect((await deliverWebhook(DEST, b, { fetchImpl: stubFetch(408).impl, resolveHost: PUBLIC_RESOLVE })).disposition).toBe('retryable')
})

test('a network error is retryable and never throws', async () => {
  const exploding = (async () => {
    throw new Error('ECONNREFUSED')
  }) as unknown as typeof fetch
  const result = await deliverWebhook(DEST, 'x', { fetchImpl: exploding, resolveHost: PUBLIC_RESOLVE })
  expect(result.disposition).toBe('retryable')
  expect(result.status).toBeNull()
  expect(result.error).toContain('ECONNREFUSED')
})

test('a timeout aborts and is reported as retryable', async () => {
  // A fetch that never resolves until aborted — the AbortController fires our timeout.
  const hang = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })) as unknown as typeof fetch
  const result = await deliverWebhook(DEST, 'x', { fetchImpl: hang, timeoutMs: 20, resolveHost: PUBLIC_RESOLVE })
  expect(result.disposition).toBe('retryable')
  expect(result.error).toContain('timed out')
})

test('send-time SSRF: a host RESOLVING to a private IP is refused and NEVER fetched', async () => {
  // Cross-review (Codex 2026-07-21): a public hostname can resolve to a private IP. The send-time
  // guard must refuse it BEFORE any request leaves. fetch must not be called at all.
  let fetched = false
  const shouldNotFetch = (async () => {
    fetched = true
    return new Response('', { status: 200 })
  }) as unknown as typeof fetch
  const result = await deliverWebhook(DEST, 'x', {
    fetchImpl: shouldNotFetch,
    resolveHost: async () => ['10.0.0.5'], // the hostname resolves inward
  })
  expect(fetched).toBe(false)
  expect(result.disposition).toBe('permanent') // not retryable — the target is structurally unsafe
  expect(result.error).toContain('private')
})

test('send-time SSRF: the http://localhost TEST receiver is EXEMPT when opted in (dev/CI only)', async () => {
  // Cross-review (Codex round 3/4): the localhost test receiver is deliberately allowed to be
  // loopback, but ONLY under the dev/CI opt-in (off in production). The send-time guard must grant
  // the SAME exception the create-time guard does, or the documented receiver could never be
  // delivered to. Set the opt-in for this test.
  const prev = process.env.WEBHOOK_ALLOW_LOCALHOST
  process.env.WEBHOOK_ALLOW_LOCALHOST = 'true'
  try {
    const localDest: DeliverableDestination = { ...DEST, targetUrl: 'http://localhost:4000/hook' }
    const { impl, seen } = stubFetch(200)
    // A resolver that WOULD flag loopback — proving the carve-out short-circuits BEFORE resolution.
    const result = await deliverWebhook(localDest, 'x', { fetchImpl: impl, resolveHost: async () => ['127.0.0.1'] })
    expect(result.disposition).toBe('delivered')
    expect(seen).toHaveLength(1)
  } finally {
    if (prev === undefined) delete process.env.WEBHOOK_ALLOW_LOCALHOST
    else process.env.WEBHOOK_ALLOW_LOCALHOST = prev
  }
})
