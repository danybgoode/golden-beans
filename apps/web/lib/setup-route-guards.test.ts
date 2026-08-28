// console-ia-overhaul · Sprint 2, Story 2.3 (D5 / A5) — the authorization boundary, at the source.
//
// ── Why a source guard and not a browser test ─────────────────────────────────────────────────
// The property is "a member gets a flat 404 from Setup › Keys, exactly as they do from
// /app/keys today". Proving that in a browser needs a SECOND identity — a real member of the same
// project — and three attempts at driving a second context through the login form hung.
//
// This is the better instrument anyway. A browser test proves one route 404s for one member on one
// run; it can also pass for the wrong reason (a missing route, an expired session, a slug that never
// existed) and this repo has shipped exactly that kind of false green before. A source guard proves
// the shape for EVERY route at once and cannot be satisfied accidentally.
//
// Keyed on the module SPECIFIER and the call, not on formatting: LEARNINGS records that a guard
// keyed on syntax is an allow-list of shapes, and that a renamed binding or a differently-written
// import walks straight past it.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../app/app/${relative}`, import.meta.url)), 'utf8')
}

const OWNER_ONLY = [
  // The merged page, and the three it takes over from. All four must agree, because D5's whole
  // claim is that the boundary moves "tighter or identical, never looser" — and the way to check
  // "identical" is to assert the new route uses the same gate the old ones do.
  'setup/keys/[projectSlug]/page.tsx',
  'keys/[projectSlug]/page.tsx',
  'agent-keys/[projectSlug]/page.tsx',
  'flag-credentials/[projectSlug]/page.tsx',
]

test('every owner-only Setup route calls requireProjectOwnership', () => {
  for (const route of OWNER_ONLY) {
    const code = source(route)
    assert.match(
      code,
      /requireProjectOwnership\(/,
      `${route} does not call requireProjectOwnership — a member could read it`
    )
    assert.match(code, /from '@\/lib\/dashboard-auth'/, `${route} does not import the canonical auth seam`)
  }
})

test('the merged Keys page uses the SAME gate as the three routes it replaces', () => {
  // D5, stated as a comparison rather than as a claim. If a later edit weakened the merged page to
  // `requireProjectMembership`, this goes red — and that is the precise defect D5 forbids, because
  // it would make a page listing every credential in the project readable by any member.
  const gateOf = (route: string) =>
    /requireProjectOwnership\(/.test(source(route)) ? 'ownership' : 'membership'
  const merged = gateOf('setup/keys/[projectSlug]/page.tsx')
  for (const legacy of OWNER_ONLY.slice(1)) {
    assert.equal(
      merged,
      gateOf(legacy),
      `the merged page uses ${merged} while ${legacy} uses ${gateOf(legacy)} — the boundary moved`
    )
  }
})

test('the gate runs BEFORE any credential list is read', () => {
  // Ordering, not just presence. A page that listed keys and then checked ownership would have
  // already done the read — and on a slow render, already spent it. The auth call must come first.
  const code = source('setup/keys/[projectSlug]/page.tsx')
  const gateAt = code.indexOf('requireProjectOwnership(')
  for (const read of ['listProjectKeys', 'listFlagReadKeys', 'listFlagSyncKeys', 'listAgentWriteKeys']) {
    const readAt = code.indexOf(`${read}(`, code.indexOf('export default'))
    assert.ok(readAt > gateAt, `${read} is called before the ownership check`)
  }
})

test('Setup › Connect is MEMBER-readable, and deliberately so', () => {
  // The asymmetry is the design, not an oversight: reading your project's connector URL is how its
  // operators point an agent at their data. Minting one is credential administration, and THAT is
  // owner-gated in the action rather than on the page.
  const page = source('setup/connect/[projectSlug]/page.tsx')
  assert.match(page, /requireProjectMembership\(/)
  assert.doesNotMatch(
    page,
    /requireProjectOwnership\(/,
    'the connector page became owner-only — members can no longer read their own connector URL'
  )
})

test('every connector MUTATION re-asserts ownership itself', () => {
  // The page guard is never the only thing between a member and a mint (A5). A server action is a
  // public HTTP surface reachable by POST whether or not its page rendered, so each action resolves
  // ownership again rather than trusting the page that linked to it.
  const actions = readFileSync(
    fileURLToPath(new URL('../app/app/setup/connect/[projectSlug]/actions.ts', import.meta.url)),
    'utf8'
  )
  const mintAt = actions.indexOf('export async function mintConnectorAction')
  const revokeAt = actions.indexOf('export async function revokeConnectorAction')
  assert.ok(mintAt >= 0 && revokeAt >= 0, 'the connector actions are not where this guard expects')

  for (const [name, from] of [
    ['mintConnectorAction', mintAt],
    ['revokeConnectorAction', revokeAt],
  ] as const) {
    const body = actions.slice(from, from === mintAt ? revokeAt : undefined)
    assert.match(body, /requireProjectOwnership\(/, `${name} does not re-check ownership`)
  }
})

test('minting requires the connector gate; revoking deliberately does not', () => {
  // AGENTS rule #3: the connector's two kill switches are independent, and minting the second must
  // never route around the first — so `mintConnectorAction` refuses while `CONNECTOR_ENABLED` is off.
  //
  // Revoke is the deliberate asymmetry. A kill switch that stops working when the feature is
  // disabled is backwards: if the flag were flipped off mid-incident, an owner must still be able to
  // permanently kill the credential. Separate eligibility to BEGIN from authority to END.
  const actions = readFileSync(
    fileURLToPath(new URL('../app/app/setup/connect/[projectSlug]/actions.ts', import.meta.url)),
    'utf8'
  )
  const revokeAt = actions.indexOf('export async function revokeConnectorAction')
  const mint = actions.slice(actions.indexOf('export async function mintConnectorAction'), revokeAt)
  const revoke = actions.slice(revokeAt)

  // ⚠️ Keyed on the CALL, not the mention. The first version matched `/gatesOpen\(\)/` against the
  // whole function body and failed — on revoke's own comment explaining why it is not gated. Same
  // trap as a substring ban that cannot tell an honest denial from the claim it denies; a guard has
  // to distinguish code from prose about code.
  const callsGate = (body: string) =>
    body
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .some((line) => /closedGate\(\)/.test(line))

  assert.equal(callsGate(mint), true, 'mint does not check the connector gate')
  assert.equal(
    callsGate(revoke),
    false,
    'revoke was gated — an owner must be able to kill a credential even with the feature switched off'
  )
})

// ── The connector race, and the half of it the application CAN close ──────────────────────────
//
// Cross-review (agy, PR #123) raised `mintConnectorToken` as Blocking: it is a check-then-act with
// no unique index behind it, so two concurrent mints both see "none active" and both insert.
//
// The application cannot make that atomic. What it CAN do — and what these assert — is make the
// outcome survivable: every active token is returned and rendered, so a duplicate is visible and
// revocable instead of live and hidden behind a `LIMIT 1`. That distinction is the whole finding;
// two visible URLs is a mess an owner cleans up, one invisible one is a credential nobody can kill.

test('getConnectorStatus returns EVERY active token, never just the newest', () => {
  const lib = readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  const start = lib.indexOf('export async function getConnectorStatus')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.ok(start >= 0, 'getConnectorStatus is not where this guard expects')

  // A `.limit(1)` or `.maybeSingle()` here is the defect: it is what made the older of two live
  // tokens invisible. Keyed on the query builder rather than on the return shape, because the return
  // shape can be widened while the query still fetches one row.
  assert.doesNotMatch(
    body,
    /\.limit\(1\)|\.maybeSingle\(\)/,
    'getConnectorStatus fetches a single row again — a second live token would be invisible'
  )
})

test('a failed read is UNREADABLE, and mint refuses on it rather than creating a second token', () => {
  const lib = readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  const statusStart = lib.indexOf('export async function getConnectorStatus')
  const status = lib.slice(statusStart, lib.indexOf('\n}', statusStart))
  const mintStart = lib.indexOf('export async function mintConnectorToken')
  const mint = lib.slice(mintStart, lib.indexOf('\n}', mintStart))

  // "I could not check" must not read as "there is none": that is what let a transient database
  // error produce a duplicate live credential while the first was merely unread.
  assert.match(status, /state: 'unreadable'/, 'a failed status read no longer reports unreadable')
  // Scoped to the ERROR BLOCK only. The first version sliced from `if (error)` to the end of the
  // function and matched the legitimate `absent` return for a genuinely empty project — a guard that
  // fired on correct code. The block is `if (error) { … }`, and what it returns is the whole claim.
  const errorBlock = status.slice(status.indexOf('if (error)'), status.indexOf('if (!data'))
  assert.match(errorBlock, /state: 'unreadable'/, 'the error path does not report unreadable')
  assert.doesNotMatch(
    errorBlock,
    /state: 'absent'/,
    'a failed read reports absent again — mint would then create a second token'
  )
  assert.match(mint, /state === 'unreadable'/, 'mint no longer refuses on an unreadable state')
})

test('revoke is scoped to the project, not just the row id', () => {
  // pod-report S3's lesson: a mutation that is not discriminator-scoped lets a caller revoke a row
  // they can name while the audit trail records the wrong thing. A token id from another project
  // must match nothing here rather than being revoked under this project's label.
  const lib = readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  const start = lib.indexOf('export async function revokeConnectorToken')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.match(body, /\.eq\('project_id', projectId\)/, 'revoke is not scoped to the project')
  assert.match(body, /\.eq\('id', tokenId\)/, 'revoke does not scope to the row id')
  // ...and it must not resurrect an already-revoked row's timestamp.
  assert.match(body, /\.is\('revoked_at', null\)/, 'revoke can rewrite an already-revoked row')
})

test('the mint path translates the unique-index violation instead of surfacing a raw error', () => {
  // The partial unique index (20260827120000) is what actually prevents two active tokens. When it
  // fires, the loser of the race must get "this project already has an active connector URL" — a
  // sentence naming a state that is now TRUE — rather than a Postgres constraint name.
  //
  // Asserted at the source because reproducing a lost race in a test is not practical: it needs two
  // inserts interleaved inside the window between the pre-check and the write.
  const lib = readFileSync(fileURLToPath(new URL('./connector-tokens.ts', import.meta.url)), 'utf8')
  const start = lib.indexOf('export async function mintConnectorToken')
  const body = lib.slice(start, lib.indexOf('\n}', start))
  assert.match(body, /'23505'/, 'the mint path does not recognise the unique-violation code')
  assert.match(
    body.slice(body.indexOf("'23505'")),
    /reason: 'already-active'/,
    'a lost race reports a raw write failure instead of the state that is now true'
  )
})

test('the migration adds a PARTIAL index, so rotation still works', () => {
  // A plain `UNIQUE (project_id)` would forbid ever minting a second token and break rotation
  // entirely — revocation here is soft, so a rotating project accumulates revoked rows by design.
  // The predicate is the whole correctness argument, and it is worth pinning against a future
  // "simplification" that drops it.
  const migration = readFileSync(
    fileURLToPath(
      new URL('../supabase/migrations/20260827120000_connector_token_uniqueness.sql', import.meta.url)
    ),
    'utf8'
  )
  assert.match(migration, /CREATE UNIQUE INDEX/i)
  assert.match(
    migration,
    /WHERE\s+revoked_at\s+IS\s+NULL/i,
    'the index is not partial — this would forbid rotation, not just duplicates'
  )
  assert.match(migration, /connector_tokens \(project_id\)/i)
})
