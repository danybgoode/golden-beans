import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { test } from 'node:test'

// SDK source intentionally uses extensionless imports for the bundled package. Node's native
// TypeScript loader requires the extension, so resolve only this test's two local SDK seams while
// executing the unmodified production source.
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown
) => unknown
type HookRegistrar = (hooks: { resolve: ResolveHook }) => void
const registerHooks = (Module as unknown as { registerHooks?: HookRegistrar }).registerHooks
if (!registerHooks) throw new Error('Native module hooks are required to test the SDK source.')
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './flags') return nextResolve('./flags.ts', context)
    return nextResolve(specifier, context)
  },
})

const { createFlagProvider } = await import('./flag-provider.ts')

test('reports the Golden Frijoles OpenFeature provider identity', () => {
  const provider = createFlagProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    fetchImpl: async () => new Response(null, { status: 500 }),
  })

  assert.deepEqual(provider.metadata, { name: 'golden-frijoles' })
  provider.shutdown()
})

function snapshot(version = 1, environment = 'production') {
  return {
    contractVersion: 1,
    environment,
    snapshotVersion: version,
    flags: [
      {
        key: 'checkout.enabled',
        definitionVersion: version,
        definition: {
          valueType: 'boolean',
          description: 'Enables the checkout fixture.',
          defaultVariantKey: 'off',
          variants: [
            { key: 'off', value: false },
            { key: 'on', value: true },
          ],
          rules: [
            {
              priority: 1,
              clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
              variantKey: 'on',
            },
          ],
          metadata: { owner: 'checkout' },
        },
      },
      {
        key: 'notice.copy',
        definitionVersion: version,
        definition: {
          valueType: 'string',
          description: 'Provides copy for the fixture.',
          defaultVariantKey: 'primary',
          variants: [{ key: 'primary', value: 'Golden copy' }],
          rules: [],
        },
      },
      {
        key: 'retries.maximum',
        definitionVersion: version,
        definition: {
          valueType: 'number',
          description: 'Provides a numeric fixture.',
          defaultVariantKey: 'three',
          variants: [{ key: 'three', value: 3 }],
          rules: [],
        },
      },
      {
        key: 'layout.config',
        definitionVersion: version,
        definition: {
          valueType: 'json',
          description: 'Provides a structured fixture.',
          defaultVariantKey: 'config',
          variants: [{ key: 'config', value: { compact: true } }],
          rules: [],
        },
      },
    ],
  }
}

test('loads a typed snapshot once and evaluates synchronously without exposing the read credential', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = []
  const provider = createFlagProvider({
    baseUrl: 'https://golden.example/',
    flagReadKey: 'read-key-must-not-appear-in-errors',
    refreshIntervalMs: 0,
    fetchImpl: async (input, init) => {
      calls.push({ input: String(input), init })
      return new Response(JSON.stringify(snapshot()), { headers: { ETag: '"v1"' } })
    },
  })

  assert.deepEqual(provider.resolveBooleanEvaluation('checkout.enabled', false), {
    value: false,
    reason: 'ERROR',
    flagMetadata: {},
    errorCode: 'PROVIDER_NOT_READY',
    errorMessage: 'Flag provider has no fresh snapshot.',
  })
  assert.equal((await provider.initialize()).ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].input, 'https://golden.example/api/v1/flags/snapshot')
  assert.equal(
    calls[0].init?.headers instanceof Headers
      ? calls[0].init.headers.get('Authorization')
      : (calls[0].init?.headers as Record<string, string>).Authorization,
    'Bearer read-key-must-not-appear-in-errors'
  )

  assert.deepEqual(provider.resolveBooleanEvaluation('checkout.enabled', false, { plan: 'pro' }), {
    value: true,
    variant: 'on',
    reason: 'TARGETING_MATCH',
    flagMetadata: { owner: 'checkout' },
    flagVersion: 1,
  })
  assert.equal(provider.resolveStringEvaluation('notice.copy', 'safe').value, 'Golden copy')
  assert.equal(provider.resolveNumberEvaluation('retries.maximum', 0).value, 3)
  assert.deepEqual(provider.resolveObjectEvaluation('layout.config', { compact: false }).value, {
    compact: true,
  })
  assert.deepEqual(provider.resolveNumberEvaluation('notice.copy', 7), {
    value: 7,
    reason: 'DEFAULT',
    flagMetadata: {},
    errorCode: 'PARSE_ERROR',
  })
  provider.shutdown()
})

test('deduplicates concurrent refreshes and accepts a matching ETag 304 as a fresh snapshot', async () => {
  let calls = 0
  let release: (() => void) | undefined
  let lastInit: RequestInit | undefined
  const provider = createFlagProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    fetchImpl: async (_input, init) => {
      calls += 1
      lastInit = init
      if (calls === 1) return new Response(JSON.stringify(snapshot()), { headers: { ETag: '"v1"' } })
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return new Response(null, { status: 304 })
    },
  })

  await provider.initialize()
  const first = provider.refresh()
  const second = provider.refresh()
  assert.strictEqual(first, second)
  await Promise.resolve()
  assert.equal(calls, 2)
  release?.()
  assert.deepEqual(await first, { ok: true, changed: false, notModified: true, snapshotVersion: 1 })
  assert.equal(
    lastInit?.headers instanceof Headers
      ? lastInit.headers.get('If-None-Match')
      : (lastInit?.headers as Record<string, string>)['If-None-Match'],
    '"v1"'
  )
  assert.equal(provider.getStatus().state, 'READY')
  provider.shutdown()
})

test('rejects malformed or environment-mismatched updates while retaining the last known good snapshot', async () => {
  const replies = [
    new Response(JSON.stringify(snapshot(1))),
    new Response(
      JSON.stringify({
        contractVersion: 1,
        environment: 'production',
        snapshotVersion: 2,
        flags: [{ key: 'broken' }],
      })
    ),
    new Response(JSON.stringify(snapshot(3, 'preview'))),
    new Response(JSON.stringify(snapshot(0))),
  ]
  const provider = createFlagProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    fetchImpl: async () => replies.shift() ?? new Response(null, { status: 500 }),
  })

  await provider.initialize()
  assert.deepEqual(await provider.refresh(), {
    ok: false,
    errorCode: 'PARSE_ERROR',
    errorMessage: 'Flag snapshot was rejected.',
  })
  assert.equal(provider.resolveBooleanEvaluation('checkout.enabled', false, { plan: 'pro' }).value, true)
  assert.deepEqual(await provider.refresh(), {
    ok: false,
    errorCode: 'PARSE_ERROR',
    errorMessage: 'Flag snapshot was rejected.',
  })
  assert.equal(provider.getSnapshot()?.snapshotVersion, 1)
  assert.deepEqual(await provider.refresh(), {
    ok: false,
    errorCode: 'PARSE_ERROR',
    errorMessage: 'Flag snapshot was rejected.',
  })
  assert.equal(provider.getSnapshot()?.snapshotVersion, 1)
  provider.shutdown()
})

test('times out, honors the stale bound, and makes shutdown final without throwing from evaluation', async () => {
  let clock = 0
  let calls = 0
  const provider = createFlagProvider({
    baseUrl: 'https://golden.example',
    flagReadKey: 'read-key',
    refreshIntervalMs: 0,
    maxStaleMs: 10,
    refreshTimeoutMs: 1,
    now: () => clock,
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return new Response(JSON.stringify(snapshot()))
      return new Promise<Response>((_resolve, reject) => {
        setTimeout(() => reject(new Error('late transport rejection')), 5)
      })
    },
  })

  await provider.initialize()
  clock = 11
  assert.deepEqual(provider.resolveBooleanEvaluation('checkout.enabled', false), {
    value: false,
    reason: 'ERROR',
    flagMetadata: {},
    errorCode: 'PROVIDER_NOT_READY',
    errorMessage: 'Flag snapshot is stale.',
  })
  assert.deepEqual(await provider.refresh(), {
    ok: false,
    errorCode: 'GENERAL',
    errorMessage: 'Flag snapshot refresh failed.',
  })
  // The timed-out request rejects after its bounded caller has moved on. Node's test runner would
  // fail this test on an unhandled rejection if the provider did not retain a rejection handler.
  await new Promise((resolve) => setTimeout(resolve, 10))
  provider.shutdown()
  assert.deepEqual(await provider.refresh(), {
    ok: false,
    errorCode: 'PROVIDER_FATAL',
    errorMessage: 'Flag provider has been shut down.',
  })
  assert.equal(provider.resolveBooleanEvaluation('checkout.enabled', true).value, true)
})
