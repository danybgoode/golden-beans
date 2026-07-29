import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from '@playwright/test'
import { guardedHttpPost, guardedHttpPostForTest, type GuardedHttpPost } from '@/lib/guarded-http'
import { deliverWebhook } from '@/lib/webhook-delivery'
import type { DeliverableDestination } from '@/lib/destinations'

const REQUEST: GuardedHttpPost = {
  targetUrl: 'https://receiver.example.test/hook',
  headers: { 'Content-Type': 'application/json', 'X-Test': 'fixed' },
  body: '{"probe":true}',
  timeoutMs: 100,
}
const PUBLIC_RESOLVE = async () => ['93.184.216.34']

function responseFetch(
  status: number,
  body: BodyInit | null = null,
  inspect?: (input: string | URL | Request, init?: RequestInit) => void
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    inspect?.(input, init)
    return new Response(body, { status })
  }) as typeof fetch
}

test('the production API sends exact POST bytes through the guarded default transport', async () => {
  const previousAllow = process.env.WEBHOOK_ALLOW_LOCALHOST
  const previousVercel = process.env.VERCEL_ENV
  process.env.WEBHOOK_ALLOW_LOCALHOST = 'true'
  delete process.env.VERCEL_ENV

  let seenMethod = ''
  let seenHeader = ''
  let seenBody = ''
  const server = createServer((request, response) => {
    seenMethod = request.method ?? ''
    seenHeader = String(request.headers['x-test'] ?? '')
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      seenBody += String(chunk)
    })
    request.on('end', () => {
      response.writeHead(200, { 'Content-Type': 'text/plain', 'X-Private-Diagnostic': 'discard-me' })
      response.end('receiver-controlled body must be discarded')
    })
  })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')

    const result = await guardedHttpPost({
      ...REQUEST,
      targetUrl: `http://127.0.0.1:${address.port}/hook`,
      timeoutMs: 1_000,
    })

    assert.equal(result.outcome, 'response')
    if (result.outcome === 'response') assert.equal(result.status, 200)
    assert.equal(seenMethod, 'POST')
    assert.equal(seenHeader, 'fixed')
    assert.equal(seenBody, REQUEST.body)
    assert.equal('body' in result, false)
    assert.equal('headers' in result, false)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    if (previousAllow === undefined) delete process.env.WEBHOOK_ALLOW_LOCALHOST
    else process.env.WEBHOOK_ALLOW_LOCALHOST = previousAllow
    if (previousVercel === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = previousVercel
  }
})

test('guarded HTTP refuses private IP literals before any request leaves', async () => {
  for (const targetUrl of [
    'https://10.0.0.5/hook',
    'https://127.0.0.1/hook',
    'https://169.254.169.254/latest/meta-data/',
    'https://[::1]/hook',
    'https://[::ffff:10.0.0.1]/hook',
  ]) {
    let fetched = false
    const result = await guardedHttpPostForTest(
      { ...REQUEST, targetUrl },
      {
        fetchImpl: responseFetch(200, null, () => {
          fetched = true
        }),
      }
    )

    assert.equal(fetched, false, targetUrl)
    assert.deepEqual(result, {
      outcome: 'failure',
      classification: 'blocked_target',
      retryable: false,
      status: null,
      latencyMs: 0,
      error: 'blocked: target resolves to a private or loopback address',
    })
  }
})

test('guarded HTTP refuses a public hostname when any DNS answer is private', async () => {
  let fetched = false
  const result = await guardedHttpPostForTest(REQUEST, {
    resolveHost: async () => ['93.184.216.34', '10.0.0.5'],
    fetchImpl: responseFetch(200, null, () => {
      fetched = true
    }),
  })

  assert.equal(fetched, false)
  assert.equal(result.outcome, 'failure')
  if (result.outcome === 'failure') {
    assert.equal(result.classification, 'blocked_target')
    assert.equal(result.retryable, false)
    assert.match(result.error, /private or loopback/)
  }
})

test('guarded HTTP fails closed on DNS errors and empty DNS answers', async () => {
  for (const resolveHost of [
    async () => {
      throw new Error('NXDOMAIN')
    },
    async () => [] as string[],
  ]) {
    let fetched = false
    const result = await guardedHttpPostForTest(REQUEST, {
      resolveHost,
      fetchImpl: responseFetch(200, null, () => {
        fetched = true
      }),
    })

    assert.equal(fetched, false)
    assert.deepEqual(result, {
      outcome: 'failure',
      classification: 'dns_failure',
      retryable: true,
      status: null,
      latencyMs: 0,
      error: 'target DNS resolution failed',
    })
  }
})

test('connection-time DNS is re-checked and a rebinding flip to private never opens a socket', async () => {
  let connectionLookups = 0
  const connectionLookup = (
    _hostname: string,
    _options: unknown,
    callback: (error: Error | null, address?: unknown, family?: number) => void
  ) => {
    connectionLookups += 1
    // Layer 1 returned public. The actual socket lookup now sees private: the rebinding attack.
    callback(null, '10.0.0.5', 4)
  }

  const result = await guardedHttpPostForTest(
    { ...REQUEST, targetUrl: 'https://rebind.example.test/hook' },
    {
      resolveHost: PUBLIC_RESOLVE,
      connectionLookup,
    }
  )

  assert.equal(connectionLookups, 1)
  assert.equal(result.outcome, 'failure')
  if (result.outcome === 'failure') {
    assert.equal(result.classification, 'blocked_target')
    // This preserves the shipped webhook's connect-error classification; the request is still
    // fail-closed and never reaches the private address.
    assert.equal(result.retryable, true)
    assert.match(result.error, /private or loopback/)
  }
})

test('redirects are returned as status-only responses and are never followed', async () => {
  let calls = 0
  let redirectMode: RequestRedirect | undefined
  const fetchImpl = responseFetch(302, null, (_input, init) => {
    calls += 1
    redirectMode = init?.redirect
  })

  const transportResult = await guardedHttpPostForTest(REQUEST, {
    resolveHost: PUBLIC_RESOLVE,
    fetchImpl,
  })
  assert.equal(calls, 1)
  assert.equal(redirectMode, 'manual')
  assert.equal(transportResult.outcome, 'response')
  if (transportResult.outcome === 'response') {
    assert.equal(transportResult.status, 302)
    // The reusable boundary never exposes the redirect Location (or any other header/body).
    assert.deepEqual(Object.keys(transportResult).sort(), ['latencyMs', 'outcome', 'status'])
  }

  const destination: DeliverableDestination = {
    id: 'dest-1',
    name: 'redirect-test',
    targetUrl: REQUEST.targetUrl,
    signingSecret: 'whsec_redirect_test_0123456789',
  }
  const webhookResult = await deliverWebhook(destination, REQUEST.body, {
    fetchImpl,
    resolveHost: PUBLIC_RESOLVE,
  })
  assert.equal(calls, 2)
  assert.equal(webhookResult.disposition, 'permanent')
  assert.equal(webhookResult.status, 302)
  assert.equal(webhookResult.error, 'HTTP 302')
})

test('the request deadline aborts an in-flight sender and reports a retryable timeout', async () => {
  let observedAbort = false
  const hangingFetch = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          observedAbort = true
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        },
        { once: true }
      )
    })) as typeof fetch

  const result = await guardedHttpPostForTest(
    { ...REQUEST, timeoutMs: 20 },
    { resolveHost: PUBLIC_RESOLVE, fetchImpl: hangingFetch }
  )

  assert.equal(observedAbort, true)
  assert.equal(result.outcome, 'failure')
  if (result.outcome === 'failure') {
    assert.equal(result.classification, 'timeout')
    assert.equal(result.retryable, true)
    assert.equal(result.status, null)
    assert.equal(result.error, 'timed out after 20ms')
  }
})

for (const status of [200, 503]) {
  test(`status ${status}: response bytes are never read or returned, and the stream is cancelled`, async () => {
    let cancelled = 0
    let pulls = 0
    const endlessBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(1024))
      },
      cancel() {
        cancelled += 1
      },
    })
    const fetchImpl = (async () => new Response(endlessBody, { status })) as typeof fetch

    const result = await guardedHttpPostForTest(REQUEST, {
      resolveHost: PUBLIC_RESOLVE,
      fetchImpl,
    })

    assert.equal(result.outcome, 'response')
    assert.equal(cancelled, 1)
    // A stream implementation may eagerly pull once, but cancellation bounds it immediately.
    assert.ok(pulls <= 1, `expected at most one eager pull before cancellation, got ${pulls}`)
    assert.equal('body' in result, false)
    assert.equal('headers' in result, false)
  })
}

test('response cancellation failure is contained and status still wins', async () => {
  const refusingBody = new ReadableStream<Uint8Array>({
    cancel() {
      throw new Error('cancel failed')
    },
  })
  const result = await guardedHttpPostForTest(REQUEST, {
    resolveHost: PUBLIC_RESOLVE,
    fetchImpl: (async () => new Response(refusingBody, { status: 201 })) as typeof fetch,
  })
  assert.deepEqual(result.outcome, 'response')
  if (result.outcome === 'response') assert.equal(result.status, 201)
})

test('the localhost carve-out remains dev/CI-only and is disabled in Vercel production', async () => {
  const previousAllow = process.env.WEBHOOK_ALLOW_LOCALHOST
  const previousVercel = process.env.VERCEL_ENV
  let fetched = 0
  const dependencies = {
    resolveHost: async () => {
      throw new Error('the localhost exception must short-circuit DNS')
    },
    fetchImpl: responseFetch(200, null, () => {
      fetched += 1
    }),
  }

  try {
    process.env.WEBHOOK_ALLOW_LOCALHOST = 'true'
    delete process.env.VERCEL_ENV
    const allowed = await guardedHttpPostForTest(
      { ...REQUEST, targetUrl: 'http://localhost:4000/hook' },
      dependencies
    )
    assert.equal(allowed.outcome, 'response')
    assert.equal(fetched, 1)

    process.env.VERCEL_ENV = 'production'
    const refused = await guardedHttpPostForTest(
      { ...REQUEST, targetUrl: 'http://localhost:4000/hook' },
      dependencies
    )
    assert.equal(refused.outcome, 'failure')
    assert.equal(fetched, 1)
  } finally {
    if (previousAllow === undefined) delete process.env.WEBHOOK_ALLOW_LOCALHOST
    else process.env.WEBHOOK_ALLOW_LOCALHOST = previousAllow
    if (previousVercel === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = previousVercel
  }
})
