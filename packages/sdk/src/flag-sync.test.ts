import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { test } from 'node:test'
import type { FlagDefinition } from './flags.ts'

// Production source intentionally keeps extensionless imports. Teach Node's native TypeScript
// runner about this one local seam without changing what consumers bundle.
type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
const registerHooks = (
  Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void }
).registerHooks
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './flags') return nextResolve('./flags.ts', context)
    return nextResolve(specifier, context)
  },
})

const {
  FLAG_DEFINITION_SYNC_CONTRACT_VERSION,
  MAX_FLAG_DEFINITION_SYNC_BODY_BYTES,
  createFlagDefinitionSyncClient,
  isFlagDefinitionSyncBodyWithinLimit,
  parseFlagDefinitionSyncRequest,
} = await import('./flag-sync.ts')

const definition: FlagDefinition = {
  valueType: 'boolean',
  description: 'Enables the disposable checkout fixture.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
  metadata: { source: 'fixture', criticality: 'low' },
}

test('catalog-sync parser enforces the v1 closed envelope and canonical flag definition parser', () => {
  const parsed = parseFlagDefinitionSyncRequest({
    contractVersion: FLAG_DEFINITION_SYNC_CONTRACT_VERSION,
    entries: [{ key: 'checkout.fixture', definition }],
  })
  assert.equal(parsed.ok, true)
  if (!parsed.ok) return
  assert.equal(parsed.request.entries[0].key, 'checkout.fixture')
  assert.deepEqual(parsed.request.entries[0].definition, definition)

  const invalid = parseFlagDefinitionSyncRequest({
    contractVersion: 2,
    entries: [
      { key: 'checkout.fixture', definition, extra: 'nope' },
      { key: 'checkout.fixture', definition },
    ],
    extra: true,
  })
  assert.equal(invalid.ok, false)
  if (!invalid.ok) {
    assert.ok(invalid.errors.some((error) => error.includes('contractVersion')))
    assert.ok(invalid.errors.some((error) => error.includes('extra is not allowed')))
    assert.ok(invalid.errors.some((error) => error.includes('duplicates checkout.fixture')))
  }
})

test('catalog-sync parser rejects an oversize entry list and body guard is byte-accurate', () => {
  const parsed = parseFlagDefinitionSyncRequest({
    contractVersion: 1,
    entries: Array.from({ length: 101 }, (_, index) => ({
      key: `checkout.fixture_${index}`,
      definition,
    })),
  })
  assert.equal(parsed.ok, false)
  if (!parsed.ok) assert.ok(parsed.errors.some((error) => error.includes('1-100')))

  assert.equal(isFlagDefinitionSyncBodyWithinLimit('x'.repeat(MAX_FLAG_DEFINITION_SYNC_BODY_BYTES)), true)
  assert.equal(isFlagDefinitionSyncBodyWithinLimit(`x${'x'.repeat(MAX_FLAG_DEFINITION_SYNC_BODY_BYTES)}`), false)
})

test('catalog-sync client sends the dedicated key and returns typed created/no-op entries', async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined
  const client = createFlagDefinitionSyncClient({
    baseUrl: 'https://golden.example///',
    flagSyncKey: 'dedicated-sync-key',
    fetchImpl: async (input, init) => {
      request = { url: String(input), init }
      return new Response(
        JSON.stringify({
          ok: true,
          contractVersion: 1,
          entries: [
            { key: 'checkout.fixture', definitionVersion: 1, created: true },
            { key: 'shipping.fixture', definitionVersion: 2, created: false },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    },
  })
  const result = await client.syncFlagDefinitions([
    { key: 'checkout.fixture', definition },
    { key: 'shipping.fixture', definition },
  ])

  assert.deepEqual(result, {
    ok: true,
    contractVersion: 1,
    entries: [
      { key: 'checkout.fixture', definitionVersion: 1, created: true },
      { key: 'shipping.fixture', definitionVersion: 2, created: false },
    ],
  })
  assert.equal(request?.url, 'https://golden.example/api/v1/flags/sync')
  assert.equal(request?.init?.headers instanceof Headers ? request.init.headers.get('Authorization') : (request?.init?.headers as Record<string, string>).Authorization, 'Bearer dedicated-sync-key')
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    contractVersion: 1,
    entries: [
      { key: 'checkout.fixture', definition },
      { key: 'shipping.fixture', definition },
    ],
  })
})

test('catalog-sync client surfaces conflict as typed HTTP 409 and does not send invalid definitions', async () => {
  let calls = 0
  const client = createFlagDefinitionSyncClient({
    baseUrl: 'https://golden.example',
    flagSyncKey: 'dedicated-sync-key',
    fetchImpl: async () => {
      calls += 1
      return new Response(JSON.stringify({ ok: false, error: 'Catalog semantic drift', issues: ['checkout.fixture'] }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })

  const conflict = await client.syncFlagDefinitions([{ key: 'checkout.fixture', definition }])
  assert.deepEqual(conflict, {
    ok: false,
    kind: 'http',
    error: 'Catalog semantic drift',
    status: 409,
    issues: ['checkout.fixture'],
  })
  assert.equal(calls, 1)

  const invalid = await client.syncFlagDefinitions([
    { key: 'Checkout Invalid', definition },
  ])
  assert.equal(invalid.ok, false)
  if (!invalid.ok) {
    assert.equal(invalid.kind, 'validation')
    assert.ok(invalid.issues.some((issue) => issue.includes('valid flag key')))
  }
  assert.equal(calls, 1)
})
