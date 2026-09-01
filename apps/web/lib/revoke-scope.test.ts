// Every credential revoke is constrained to its OWN scope. Six kinds share one table.
//
// ── Why this file exists ──────────────────────────────────────────────────────────────────────
// `design-system-rails` Story 4.5 found `revokeApiKey` had no scope predicate, so
// `revokeCredentialAction(slug, 'ingest', <a share link's id>)` killed the share link and filed it
// under `api_key_revoked`. The fix added `.eq('scope', 'ingest')` — and the comment announcing it
// cited "`revoke-scope.test.ts` pins all four against their scopes", which did not exist.
//
// ⚠️ **That is the defect the fix was for, committed inside the fix.** The paragraph written to close
// "prose asserting a property the code lacked, on a credential path" was itself prose asserting a
// guard that did not exist (fresh reviewer, Major). Deleting the predicate again would have
// reintroduced the Blocking defect with the whole unit suite green. This is the file it named.
//
// ── Why it reads SOURCE rather than calling the functions ─────────────────────────────────────
// Each revoke is either a Supabase query builder or an RPC, so exercising one needs a database. What
// must be true is structural and is true of the code whether or not a database is up: the UPDATE is
// constrained to one scope. A source guard also covers all six at once and cannot pass for the wrong
// reason — `lib/setup-route-guards.test.ts` makes the same argument about the ownership checks.
//
// Keyed on the SPECIFIER and the call, never on formatting: LEARNINGS records that a guard keyed on
// syntax is an allow-list of shapes, and a renamed binding walks straight past it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
}

/** Comments explain these predicates at length; the ban is on what the CODE does. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * The four kinds Setup › Keys can revoke, where each one's UPDATE lives, and the scope it must be
 * constrained to.
 *
 * `flag_read` and `flag_sync` are revoked by `SECURITY DEFINER` RPCs, so their predicate is in SQL;
 * the other two are query builders in TypeScript. Both are checked, because "the app constrains it"
 * and "the database constrains it" are different guarantees and this table records which is which.
 */
const REVOKES = [
  { kind: 'ingest', file: '../lib/api-keys.ts', fn: 'revokeApiKey', scope: 'ingest', sql: false },
  {
    kind: 'agent_write',
    file: '../lib/agent-write-keys.ts',
    fn: 'revokeAgentWriteKey',
    scope: 'agent_write',
    sql: false,
  },
  {
    kind: 'share',
    file: '../lib/report-shares.ts',
    fn: 'revokeShareLink',
    scope: 'share',
    sql: false,
  },
] as const

test('every TypeScript revoke constrains its UPDATE to ONE scope', () => {
  for (const revoke of REVOKES) {
    const source = stripComments(read(revoke.file))
    const at = source.indexOf(`export async function ${revoke.fn}`)
    assert.ok(at >= 0, `${revoke.fn} is gone from ${revoke.file} — this guard is pointing at nothing`)
    // The function body, up to the next top-level export. Scoped so a sibling's predicate cannot
    // satisfy this one — which is precisely how the missing `ingest` predicate stayed invisible.
    const next = source.indexOf('\nexport ', at + 1)
    const body = source.slice(at, next === -1 ? source.length : next)

    assert.match(
      body,
      /\.update\(/,
      `${revoke.fn} no longer performs an UPDATE — has the revoke moved to an RPC?`
    )
    assert.ok(
      body.includes(`.eq('scope', '${revoke.scope}')`),
      `${revoke.fn} revokes ANY row in api_keys scoped to the project. A request carrying another ` +
        `kind's row id would kill it, and the audit trail would record the ${revoke.kind} label — ` +
        'an audit label that can be chosen by picking an endpoint is worse than no audit log.'
    )
    // ...and it is scoped to the PROJECT too, which is the tenancy half of the same predicate.
    assert.ok(
      body.includes(".eq('project_id'"),
      `${revoke.fn} is not scoped to the resolved project — a foreign row id would be revocable`
    )
  }
})

test('the two flag revokes constrain their scope in SQL', () => {
  // These run as `SECURITY DEFINER`, so the predicate has to be in the function body rather than in
  // the caller — a TypeScript check would be looking in the wrong place entirely.
  const migrations = [
    {
      fn: 'revoke_flag_read_key',
      scope: 'flag_read',
      file: '../supabase/migrations/20260807110000_flag_read_credentials.sql',
    },
    {
      fn: 'revoke_flag_sync_key',
      scope: 'flag_sync',
      file: '../supabase/migrations/20260810100000_flag_catalog_sync.sql',
    },
  ] as const
  for (const migration of migrations) {
    const sql = read(migration.file)
    // ⚠️ Matched on `FUNCTION <name>(`, with the optional `public.` prefix — one migration writes the
    // schema and the other does not, and the first version of this test looked only for the
    // qualified form and reported a real, correctly-scoped function as missing. A guard that fails
    // on correct code gets weakened rather than obeyed.
    const at = sql.search(new RegExp(`FUNCTION (public\\.)?${migration.fn}\\(`))
    assert.ok(at >= 0, `${migration.fn} is not in ${migration.file}`)
    // To the end of the function body, so a SIBLING function's predicate cannot satisfy this one.
    const end = sql.indexOf('$$;', at)
    const body = sql.slice(at, end === -1 ? at + 2000 : end)
    // Whitespace-insensitive: these files write `scope='flag_read'` and prettier is not applied to
    // SQL, so pinning the spacing would be pinning a formatting choice rather than a predicate.
    assert.match(
      body.replace(/\s+/g, ''),
      new RegExp(`scope='${migration.scope}'`),
      `${migration.fn} does not constrain its UPDATE to scope='${migration.scope}'`
    )
    assert.match(
      body.replace(/\s+/g, ''),
      /project_id=p_project_id/,
      `${migration.fn} is not scoped to the caller's project`
    )
  }
})

test('the merged action routes each kind to its OWN revoke, and never to a generic one', () => {
  // The other half: a scoped lib function protects nothing if the action calls a different one. This
  // is what stops a fifth branch quietly reusing `revokeApiKey` for a kind it does not describe.
  const source = stripComments(read('../app/app/setup/keys/[projectSlug]/actions.ts'))
  const at = source.indexOf('export async function revokeCredentialAction')
  assert.ok(at >= 0, 'revokeCredentialAction is gone')
  const body = source.slice(at)
  for (const fn of ['revokeApiKey', 'revokeFlagReadKey', 'revokeFlagSyncKey', 'revokeAgentWriteKey']) {
    assert.equal(
      body.split(`${fn}(`).length - 1,
      1,
      `${fn} is called ${body.split(`${fn}(`).length - 1} times in revokeCredentialAction — each kind ` +
        'has exactly one revoke, or the dispatch is not what it looks like'
    )
  }
  // And it refuses an unknown kind BEFORE dispatching, rather than falling through to the last
  // branch — the prototype-chain hole this file's sibling test pins from the other side.
  const guardAt = body.indexOf('isCredentialKind(')
  const firstRevokeAt = Math.min(
    ...['revokeApiKey(', 'revokeFlagReadKey(', 'revokeFlagSyncKey(', 'revokeAgentWriteKey('].map((call) => {
      const index = body.indexOf(call)
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    })
  )
  assert.ok(guardAt >= 0, 'the kind is no longer validated against the closed union')
  assert.ok(guardAt < firstRevokeAt, 'a revoke is dispatched before the kind is validated')
})
