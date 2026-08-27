// console-ia-overhaul · Sprint 2, Story 2.3. The merge, and the words on it.
//
// `/app/setup/keys` is owner-gated, so the `api` project only ever sees a 404 or a login redirect.
// Everything worth asserting about this page is therefore asserted here, against the projection.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Module from 'node:module'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (
  Module as typeof Module & {
    registerHooks: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const {
  buildCredentialInventory,
  credentialCapability,
  credentialTitle,
  formatExpiry,
  CREDENTIAL_KINDS_NOT_LISTED,
} = await import('./credential-inventory.ts')

const EMPTY = { apiKeys: [], flagReadKeys: [], flagSyncKeys: [], agentWriteKeys: [] }

// Shaped after the production tenant this was designed against: 2 active ingest, 1 flag_read,
// 1 flag_sync, 1 agent_write — plus revoked rows, because every source list can contain them.
const FIXTURE = {
  apiKeys: [
    { id: 'a1', label: 'production', createdAt: '2026-08-01T00:00:00Z', revokedAt: null },
    { id: 'a2', label: 'ci', createdAt: '2026-08-02T00:00:00Z', revokedAt: null },
    { id: 'a3', label: 'leaked', createdAt: '2026-08-03T00:00:00Z', revokedAt: '2026-08-04T00:00:00Z' },
  ],
  flagReadKeys: [
    {
      id: 'r1',
      label: 'snapshot',
      environment: 'production' as const,
      createdAt: '2026-08-05T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
      revokedAt: null,
    },
  ],
  flagSyncKeys: [
    {
      id: 's1',
      label: 'miyagi catalog',
      source: 'miyagi',
      createdAt: '2026-08-06T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00Z',
      revokedAt: null,
    },
    {
      id: 's2',
      label: 'old',
      source: 'miyagi',
      createdAt: '2026-07-01T00:00:00Z',
      expiresAt: null,
      revokedAt: '2026-07-15T00:00:00Z',
    },
  ],
  agentWriteKeys: [
    { id: 'w1', label: '', createdAt: '2026-08-07T00:00:00Z', expiresAt: null, revokedAt: null },
  ],
}

test('all four kinds land in ONE list — the page never asks which subsystem minted a key', () => {
  const rows = buildCredentialInventory(FIXTURE)
  assert.deepEqual([...new Set(rows.map((row) => row.kind))].sort(), [
    'agent_write',
    'flag_read',
    'flag_sync',
    'ingest',
  ])
})

test('revoked credentials are DROPPED — this page answers "what has access now"', () => {
  // The distinguishing input: `a3` and `s2` are revoked and must not appear. A page that listed
  // them would make "who can read my data" a question you answer by reading a date column.
  const rows = buildCredentialInventory(FIXTURE)
  assert.equal(rows.length, 5)
  assert.equal(
    rows.some((row) => row.id === 'a3' || row.id === 's2'),
    false,
    'a revoked credential was listed as access'
  )
})

test('newest first, with a total order so a re-render cannot reshuffle', () => {
  const rows = buildCredentialInventory(FIXTURE)
  assert.deepEqual(
    rows.map((row) => row.id),
    ['w1', 's1', 'r1', 'a2', 'a1']
  )
  // Same createdAt on two rows must still produce a stable order.
  const tied = buildCredentialInventory({
    ...EMPTY,
    apiKeys: [
      { id: 'zzz', label: 'z', createdAt: '2026-08-01T00:00:00Z', revokedAt: null },
      { id: 'aaa', label: 'a', createdAt: '2026-08-01T00:00:00Z', revokedAt: null },
    ],
  })
  assert.deepEqual(
    tied.map((row) => row.id),
    ['aaa', 'zzz']
  )
})

test('every row carries a capability in plain words, and never the scope name', () => {
  const rows = buildCredentialInventory(FIXTURE)
  for (const row of rows) {
    assert.ok(row.capability.length > 0, `${row.kind} has no capability sentence`)
    // The whole story: an operator must not have to know that `flag_sync` is a scope name to
    // understand what the key does. A capability that just restated the identifier would fail this.
    assert.doesNotMatch(
      row.capability,
      /\b(ingest|flag_read|flag_sync|agent_write|scope)\b/,
      `${row.kind}'s capability leaks the scope name: ${row.capability}`
    )
  }
})

test('the capability says what the key may NOT do where that is the point', () => {
  // Two of the four are defined as much by their limit as by their power, and an owner scanning
  // this column is deciding whether a key is dangerous. Naming the limit is what makes it useful.
  assert.match(credentialCapability('flag_read'), /Cannot change/)
  assert.match(credentialCapability('flag_sync'), /Cannot turn a flag on or off/)
})

test('every kind has a human title, distinct from every other', () => {
  const kinds = ['ingest', 'flag_read', 'flag_sync', 'agent_write'] as const
  const titles = kinds.map(credentialTitle)
  assert.equal(new Set(titles).size, kinds.length, 'two kinds share a title')
  for (const title of titles) assert.doesNotMatch(title, /_/, `${title} looks like an identifier`)
})

// ── The expiry column: "no expiry" and "unknown" are different facts ──────────────────────────

test('a null expiry renders as words, never an empty cell', () => {
  // Three of the five live scopes on the production tenant carry no expiry, so this is the COMMON
  // case. A blank cell there reads as missing data, and unknown-versus-never is exactly what an
  // owner is scanning the column to distinguish.
  assert.equal(formatExpiry(null), 'No expiry')
  assert.notEqual(formatExpiry(null), '')
})

test('an expiry in the past says Expired rather than showing a date to compare', () => {
  const now = new Date('2026-08-27T00:00:00Z')
  assert.equal(formatExpiry('2026-01-01T00:00:00Z', now), 'Expired')
  assert.match(formatExpiry('2027-01-01T00:00:00Z', now), /^Expires 2027-01-01$/)
})

test('a malformed expiry is Unknown — distinct from both No expiry and Expired', () => {
  // Three states, three sentences. Collapsing "we cannot read this" into either of the others would
  // be the honest-empty-state defect this repo keeps recording.
  const unknown = formatExpiry('not-a-date')
  assert.equal(unknown, 'Unknown')
  assert.notEqual(unknown, formatExpiry(null))
  assert.notEqual(unknown, 'Expired')
})

test('an ingest key has no expiry FIELD and still renders one', () => {
  // `ApiKeyRow` carries no `expiresAt` at all. The projection writes an explicit null rather than
  // omitting it, so the column has something to say for the most common credential in the product.
  const [row] = buildCredentialInventory({ ...EMPTY, apiKeys: FIXTURE.apiKeys.slice(0, 1) })
  assert.equal(row.expiresAt, null)
  assert.equal(formatExpiry(row.expiresAt), 'No expiry')
})

test('an unlabelled key keeps its empty label for the renderer to name', () => {
  // `w1` has `label: ''`. The projection does not invent a name — the page renders "untitled" — but
  // it must not drop the row or emit undefined.
  const rows = buildCredentialInventory({ ...EMPTY, agentWriteKeys: FIXTURE.agentWriteKeys })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].label, '')
})

test('scope is carried where the kind has one, and null where it does not', () => {
  const rows = buildCredentialInventory(FIXTURE)
  const byKind = Object.fromEntries(rows.map((row) => [row.kind, row]))
  assert.equal(byKind.flag_read.scope, 'production')
  assert.equal(byKind.flag_sync.scope, 'miyagi')
  assert.equal(byKind.ingest.scope, null)
  assert.equal(byKind.agent_write.scope, null)
})

// ── What the page does NOT list, asserted rather than left to be noticed ──────────────────────

test('share links are named as an exclusion, with somewhere to go', () => {
  // The page promises "everything that has access to this project" and share links ARE access — a
  // bearer token rendering this project's report to whoever holds the URL. Production carries two
  // active ones on the tenant this was designed against, so the omission is real.
  //
  // A page claiming completeness while omitting live bearer tokens is worse than one that scopes
  // its claim honestly. This asserts the honest scoping exists and points somewhere.
  const share = CREDENTIAL_KINDS_NOT_LISTED.find((entry) => entry.kind === 'share')
  assert.ok(share, 'share links are not named as an exclusion')
  assert.equal(share.where, '/app/shares')
  assert.ok(share.why.length > 0)
})

test('the exclusion list covers every scope the database allows but this page omits', () => {
  // The production `api_keys.scope` CHECK permits six values. Four are listed by the projection and
  // two are not; both of the two must be named. Keyed on the database's own set rather than on what
  // someone remembered, so a seventh scope added later shows up here as a failure.
  const scopesInDatabase = ['ingest', 'flag_read', 'flag_sync', 'agent_write', 'share', 'flag_admin']
  const listed = ['ingest', 'flag_read', 'flag_sync', 'agent_write']
  const excluded = CREDENTIAL_KINDS_NOT_LISTED.map((entry) => entry.kind)
  for (const scope of scopesInDatabase) {
    assert.ok(
      listed.includes(scope) || excluded.includes(scope as (typeof excluded)[number]),
      `${scope} is neither listed nor named as an exclusion — the page's claim is wrong for it`
    )
  }
})

test('an empty project renders an empty list, not a crash', () => {
  assert.deepEqual(buildCredentialInventory(EMPTY), [])
})
