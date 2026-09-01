// console-ia-overhaul · Sprint 2, Story 2.3. The merge, and the words on it.
//
// `/app/setup/keys` is owner-gated, so the `api` project only ever sees a 404 or a login redirect.
// Everything worth asserting about this page is therefore asserted here, against the projection.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Module from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
  isCredentialKind,
  isCurrentlyUsable,
  credentialCapability,
  credentialTitle,
  formatExpiry,
  AGENT_KEY_EXPIRY_DAYS,
  CREDENTIAL_MINT_FIELD,
  CREDENTIAL_MINT_ORDER,
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
  // ⚠️ REWRITTEN. The first version declared `const scopesInDatabase = [...]` under a comment
  // claiming it was "keyed on the database's own set rather than on what someone remembered, so a
  // seventh scope added later shows up here as a failure". The array WAS what someone remembered:
  // adding a scope in a migration could not make it fail, because a human had to retype the literal
  // first. A guard that cannot fail, wearing a comment asserting a property it does not have — this
  // repo's exact recurring defect, and cross-review caught it (PR #123).
  //
  // It reads the migrations now. `scope` is redefined by successive CHECK constraints, so the
  // authoritative set is the one in the LAST migration that names it.
  const migrationsDir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
  const defining = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    // ⚠️ `\s+` and `/i`, not a literal `scope IN (`. Detection keyed on exact casing and exactly one
    // space would not recognise `scope IN(`, `scope in (`, or a line break — and the failure mode is
    // a SILENT STALE PASS: the new migration is not seen as defining, `newest` stays the old file,
    // the widest set is unchanged, the `>= 5` floor still passes, and the new scope is never
    // checked. That is the "a guard keyed on syntax is an allow-list of shapes" trap this file's own
    // header warns about, one level down (fresh reviewer, PR #123).
    .filter((name) => /scope\s+IN\s*\(/i.test(readFileSync(`${migrationsDir}${name}`, 'utf8')))
  assert.ok(defining.length > 0, 'no migration defines the api_keys scope set')

  const newest = readFileSync(`${migrationsDir}${defining[defining.length - 1]}`, 'utf8')
  // The widest `scope IN (...)` in that file is the column's own CHECK; the narrower ones are arms
  // of the composite share_lens constraint.
  const sets = [...newest.matchAll(/scope\s+IN\s*\(([^)]*)\)/gi)].map((match) =>
    match[1].split(',').map((raw) => raw.trim().replace(/'/g, ''))
  )
  const scopesInDatabase = sets.reduce((widest, next) => (next.length > widest.length ? next : widest), [])
  assert.ok(scopesInDatabase.length >= 5, `parsed only ${scopesInDatabase.length} scopes — the parse broke`)
  // The file we picked must be the one that actually (re)defines the column's constraint. The
  // constraint NAME is what identifies it and is stable across formatting, unlike the IN-list, so
  // this catches "we parsed a file that merely mentions scopes" — the other way a stale pass hides.
  assert.match(
    newest,
    /api_keys_scope_check/,
    'the newest file matching `scope IN (…)` does not define api_keys_scope_check — wrong file'
  )

  const listed = ['ingest', 'flag_read', 'flag_sync', 'agent_write']
  const excluded = CREDENTIAL_KINDS_NOT_LISTED.map((entry) => entry.kind)
  for (const scope of scopesInDatabase) {
    assert.ok(
      listed.includes(scope) || excluded.includes(scope as (typeof excluded)[number]),
      `${scope} is in the database's scope set but is neither listed nor named as an exclusion`
    )
  }
})

test('connector tokens are named as an exclusion — they are a DIFFERENT table, and were missed', () => {
  // ⚠️ The completeness test above reads `api_keys.scope`, and connector tokens do not live there.
  // So the page claimed to list "everything that can reach this project with a credential" while
  // omitting a plaintext bearer URL that reads the whole project over MCP — one this very sprint
  // made self-serve mintable. The universe was wrong, not the list (fresh reviewer, PR #123).
  //
  // This asserts the second universe explicitly, because no scope-based check ever will.
  const connector = CREDENTIAL_KINDS_NOT_LISTED.find((entry) => entry.kind === 'connector')
  assert.ok(connector, "connector tokens are neither listed nor named — the page's claim is false")
  assert.equal(connector.where, '/app/setup/connect')
  assert.match(connector.why, /whole project|MCP/i)
})

test('an empty project renders an empty list, not a crash', () => {
  assert.deepEqual(buildCredentialInventory(EMPTY), [])
})

// ── An expired key cannot authenticate, so it must not be COUNTED as access ───────────────────

test('an expired but unrevoked credential is not currently usable', () => {
  // Revoked is not the only way a key stops working: every serving path requires
  // `expires_at IS NULL OR expires_at > now()`. Counting one would make the page's own lede —
  // "this is what has access now" — false. Re-graded from Nit once A19 put this page in front of
  // every owner on day one (fresh reviewer, PR #123).
  const now = new Date('2026-08-27T00:00:00Z')
  const row = (expiresAt: string | null) => ({
    id: 'x',
    kind: 'flag_read' as const,
    label: 'snapshot',
    capability: 'anything',
    scope: 'production',
    createdAt: '2026-01-01T00:00:00Z',
    expiresAt,
  })

  assert.equal(isCurrentlyUsable(row('2026-01-01T00:00:00Z'), now), false, 'an expired key counted as access')
  assert.equal(isCurrentlyUsable(row('2027-01-01T00:00:00Z'), now), true)
  assert.equal(isCurrentlyUsable(row(null), now), true, 'no expiry means it never expires')
  // Unparseable errs toward SHOWING it: we cannot prove it is dead, and over-counting gives an
  // owner something to check rather than hiding live access.
  assert.equal(isCurrentlyUsable(row('not-a-date'), now), true)
})

test('the count and the rendered list can legitimately differ, and only in one direction', () => {
  // The row still renders (an owner cleaning up wants to see it) — it is the COUNT that must not
  // claim it. So usable <= listed, always.
  const rows = buildCredentialInventory({
    ...EMPTY,
    flagReadKeys: [
      {
        id: 'r1',
        label: 'live',
        environment: 'production' as const,
        createdAt: '2026-08-01T00:00:00Z',
        expiresAt: '2027-01-01T00:00:00Z',
        revokedAt: null,
      },
      {
        id: 'r2',
        label: 'stale',
        environment: 'production' as const,
        createdAt: '2026-08-02T00:00:00Z',
        expiresAt: '2026-01-01T00:00:00Z',
        revokedAt: null,
      },
    ],
  })
  const now = new Date('2026-08-27T00:00:00Z')
  const usable = rows.filter((row) => isCurrentlyUsable(row, now))
  assert.equal(rows.length, 2, 'the expired row stopped rendering — it should still be visible')
  assert.equal(usable.length, 1, 'the expired row is still counted as access')
  assert.ok(usable.length <= rows.length)
})

// ── design-system-rails · Sprint 4, Story 4.5 ─────────────────────────────────────────────────

test('a credential kind cannot be forged through the prototype chain', () => {
  // ⚠️ **This is the Blocking finding cross-family review (agy) found, pinned so it cannot return.**
  //
  // `revokeCredentialAction` guarded with `kind in REVOKE_AUDIT`, and `in` walks the prototype chain:
  // `'toString'`, `'valueOf'` and `'constructor'` all passed. The request then fell past every
  // explicit branch into the last one — `revokeAgentWriteKey` — and the audit lookup resolved to
  // `Object.prototype.toString`, a FUNCTION, which is not `null`, so the trail was handed a function
  // where an action name belongs.
  //
  // Not a privilege escalation (`requireProjectOwnership` runs first and every revoke is scope- and
  // project-constrained), but the record of a real revocation was corrupt or lost — and LEARNINGS is
  // explicit that an audit label chosen by picking an endpoint is worse than no audit log.
  for (const forged of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']) {
    assert.equal(
      isCredentialKind(forged),
      false,
      `"${forged}" was accepted as a credential kind — the guard walks the prototype chain again`
    )
  }
  // ...and the four real ones still pass, so the fix is not simply "refuse everything".
  for (const kind of CREDENTIAL_MINT_ORDER) {
    assert.equal(isCredentialKind(kind), true, `${kind} is a real kind and was refused`)
  }
  // Non-strings are refused before any lookup happens: a Server Action receives `unknown`, and an
  // object reaching `Object.hasOwn` would be a `TypeError` inside the lib rather than a refusal.
  for (const wrong of [null, undefined, 42, {}, [], true]) {
    assert.equal(isCredentialKind(wrong), false, `${JSON.stringify(wrong)} was accepted as a kind`)
  }
})

test('the mint metadata covers every kind, exactly once, with nothing invented', () => {
  // The four forms are DATA now — `CREDENTIAL_MINT_FIELD` decides which extra input a kind asks for,
  // and the action validates against the same table. Two things that must agree get a test rather
  // than a shared belief that they do.
  const kinds = [...CREDENTIAL_MINT_ORDER]
  assert.deepEqual(
    [...kinds].sort(),
    Object.keys(CREDENTIAL_MINT_FIELD).sort(),
    'the mint picker and the mint-field table disagree about which kinds exist'
  )
  assert.equal(new Set(kinds).size, kinds.length, 'a kind is offered twice in the picker')
  // Each kind's extra question is DIFFERENT, which is the fact that made merging four forms the work
  // rather than a formatting exercise. If two kinds ever shared one, the picker's second step would
  // be asking the same question twice under different names.
  const fields = kinds.map((kind) => CREDENTIAL_MINT_FIELD[kind])
  assert.equal(new Set(fields).size, fields.length, 'two kinds ask for the same extra input')
  // Every kind the picker offers has words a person can read. A kind with no capability sentence
  // would render as a blank card in the "what is this for" list.
  for (const kind of kinds) {
    assert.ok(credentialTitle(kind).length > 0, `${kind} has no title`)
    assert.ok(credentialCapability(kind).length > 10, `${kind} has no capability sentence`)
  }
})

test('the agent-key expiries are a closed allow-list of positive day counts', () => {
  // The action refuses anything not on this list, and `null` ("until revoked") only when the value is
  // explicitly ABSENT — the fix for "not a number must not mean never expires", which silently
  // handed out a longer-lived write credential than anyone asked for.
  assert.ok(AGENT_KEY_EXPIRY_DAYS.length > 0, 'no expiry is offered at all')
  for (const days of AGENT_KEY_EXPIRY_DAYS) {
    assert.equal(typeof days, 'number')
    assert.ok(Number.isInteger(days) && days > 0, `${days} is not a positive whole number of days`)
  }
})

test('the flag_admin entry no longer claims there are no live rows (D11-3)', () => {
  // ⚠️ Production holds ONE unrevoked, non-expiring `flag_admin` key on the `miyagi` project —
  // re-queried 2026-08-31 while building this story. The entry said the kind had "no minting surface
  // and no live rows"; the first half is true and the second was false, on the one page whose entire
  // job is an accurate access inventory.
  const entry = CREDENTIAL_KINDS_NOT_LISTED.find((row) => row.kind === 'flag_admin')
  assert.ok(entry, 'flag_admin is no longer named as a kind this page does not list')
  assert.equal(
    /no live rows/.test(entry.why),
    false,
    'the corrected flag_admin claim regressed to "no live rows" — production has one'
  )
  // It stays UNLINKED, because there is genuinely no surface: a link to a page that does not exist is
  // the "control that goes nowhere" defect this epic exists to remove.
  assert.equal(entry.where, null, 'flag_admin gained a link to a minting surface that does not exist')
})
