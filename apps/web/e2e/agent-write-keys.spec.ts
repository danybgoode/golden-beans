import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// signals-loop · Sprint 3, Story 3.1 — the `agent_write` credential scope.
//
// The acceptance this pins is a SEPARATION, and a separation has two directions. Asserting only one
// of them is how a scope filter that quietly matches everything passes review: if the write lookup
// forgot its scope predicate, "an agent_write key is refused by ingest" would still be green.
//
//   direction 1 — an `agent_write` key must NOT authorize ingest (/api/v1/track)
//   direction 2 — an `ingest` key must NOT authorize a write (resolveAgentWriteKey)
//
// Both are asserted below, and both were mutation-checked (see the sprint doc): each direction was
// individually broken, observed red, and reverted. A spec that cannot fail is worse than an absent
// one because the next reader stops there (Roadmap/LEARNINGS.md).
//
// Direction 2 is asserted against the resolution VIEW rather than through an HTTP route, and that is
// a deliberate, stated limitation rather than an oversight. The write TOOLS are Story 3.2 and are
// gated dark; an HTTP-level assertion here would be unreachable-by-construction — the exact failure
// multi-tenant-activation S1 shipped four passing specs into (they asserted a fallback path in both
// directions because the guard sat behind a precondition the harness never satisfied). The view is
// where the property actually lives, so the view is what is tested. Story 3.2 adds the HTTP layer.

const SEEDED_INGEST_KEY = 'local-test-key-do-not-use-in-prod' // project-one's key (supabase/seed.sql)

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newPlaintextKey(): string {
  return `gb_key_${randomBytes(24).toString('base64url')}`
}

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

async function projectIdBySlug(client: ReturnType<typeof db>, slug: string): Promise<string> {
  const { data, error } = await client.from('projects').select('id').eq('slug', slug).single()
  if (error || !data) throw new Error(`Could not resolve ${slug}: ${error?.message}`)
  return data.id as string
}

/** Mint an agent_write row directly, at the same authority the app itself uses. */
async function mintAgentWriteRow(
  client: ReturnType<typeof db>,
  projectId: string,
  overrides: Record<string, unknown> = {}
): Promise<{ plaintext: string; id: string }> {
  const plaintext = newPlaintextKey()
  const { data, error } = await client
    .from('api_keys')
    .insert({
      project_id: projectId,
      key_hash: sha256(plaintext),
      label: 'agent-write-spec',
      scope: 'agent_write',
      ...overrides,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not mint agent_write row: ${error?.message}`)
  return { plaintext, id: data.id as string }
}

async function track(request: import('@playwright/test').APIRequestContext, key: string) {
  return request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${key}` },
    data: { userId: 'u-agent-write-spec', event: 'agent_write_spec_event' },
  })
}

/** Does this credential resolve as a WRITE key? Reads the view the resolver reads. */
async function resolvesAsWriteKey(client: ReturnType<typeof db>, plaintext: string): Promise<boolean> {
  const { data, error } = await client
    .from('active_agent_write_keys')
    .select('id')
    .eq('key_hash', sha256(plaintext))
    .maybeSingle()
  if (error) throw new Error(`view query failed: ${error.message}`)
  return data !== null
}

// ── Direction 1: an agent_write key is not an ingest key ────────────────────────────────────────

test('an agent_write key is REJECTED by /api/v1/track', async ({ request }) => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { plaintext } = await mintAgentWriteRow(client, projectId)

  // 401, not 403 and not 500: `active_ingest_keys` simply does not contain the row, so the ingest
  // path sees an unknown credential. A 500 here would mean the scope reached application code and
  // something branched on it.
  const res = await track(request, plaintext)
  expect(res.status()).toBe(401)
})

test('an ordinary ingest key still authorizes /api/v1/track (the separation broke nothing)', async ({
  request,
}) => {
  // The control. Without it, a change that broke ALL ingest would make the test above pass.
  const res = await track(request, SEEDED_INGEST_KEY)
  expect(res.status()).toBe(201)
})

// ── Direction 2: an ingest key is not a write key ───────────────────────────────────────────────

test('an INGEST key does not resolve as an agent_write key', async () => {
  const client = db()
  expect(await resolvesAsWriteKey(client, SEEDED_INGEST_KEY)).toBe(false)
})

test('a SHARE token does not resolve as an agent_write key', async () => {
  // The third credential kind in this table. A share token is the most dangerous of the three to
  // confuse with a write key: it is pasted into Slack threads and lives in browser history.
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const plaintext = newPlaintextKey()
  const { error } = await client.from('api_keys').insert({
    project_id: projectId,
    key_hash: sha256(plaintext),
    label: 'share-vs-write-spec',
    scope: 'share',
    share_lens: 'team',
  })
  expect(error).toBeNull()

  expect(await resolvesAsWriteKey(client, plaintext)).toBe(false)
})

test('a live agent_write key DOES resolve (the control for direction 2)', async () => {
  // Without this, a resolver that returned false for everything would pass all three above.
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { plaintext } = await mintAgentWriteRow(client, projectId)
  expect(await resolvesAsWriteKey(client, plaintext)).toBe(true)
})

// ── Lifecycle: revocation and expiry are enforced in the view, in database time ─────────────────

test('a REVOKED agent_write key stops resolving immediately, no cache window', async () => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { plaintext, id } = await mintAgentWriteRow(client, projectId)

  expect(await resolvesAsWriteKey(client, plaintext)).toBe(true)

  const { error } = await client
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  expect(error).toBeNull()

  expect(await resolvesAsWriteKey(client, plaintext)).toBe(false)
})

test('an EXPIRED agent_write key does not resolve, and expiry is judged in DATABASE time', async () => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  // Expired one hour ago. The comparison lives in the view (`expires_at > now()`), so this holds
  // regardless of the Node process's clock — the property active_share_links was created to fix.
  const { plaintext } = await mintAgentWriteRow(client, projectId, {
    expires_at: new Date(Date.now() - 3_600_000).toISOString(),
  })
  expect(await resolvesAsWriteKey(client, plaintext)).toBe(false)
})

test('a FUTURE-dated expiry still resolves (expiry is not treated as "any expiry means dead")', async () => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { plaintext } = await mintAgentWriteRow(client, projectId, {
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  })
  expect(await resolvesAsWriteKey(client, plaintext)).toBe(true)
})

// ── The database-level invariants, asserted by ATTEMPTING the write they forbid ─────────────────
// Roadmap/LEARNINGS.md, twice over: a CHECK that evaluates to NULL is a suggestion PostgreSQL
// accepts, and a migration COMMENT asserting an invariant was believed through four review rounds
// while the invariant did not hold. So these attempt the insert rather than reading the constraint.

test('the DB rejects a scope=agent_write row that carries a share_lens', async () => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { error } = await client.from('api_keys').insert({
    project_id: projectId,
    key_hash: sha256(newPlaintextKey()),
    label: 'lens-on-write-key',
    scope: 'agent_write',
    share_lens: 'team',
  })
  expect(error).not.toBeNull()
  expect(error?.message ?? '').toMatch(/share_lens_check|violates check constraint/i)
})

test('the DB rejects flipping an existing agent_write row to carry a lens (the UPDATE path)', async () => {
  // The INSERT path is not the only way in. pod-report S3 found exactly this gap: nothing else
  // prevented an `UPDATE … SET scope=…` from producing the row the INSERT check forbade.
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { id } = await mintAgentWriteRow(client, projectId)

  const { error } = await client.from('api_keys').update({ share_lens: 'investor' }).eq('id', id)
  expect(error).not.toBeNull()
  expect(error?.message ?? '').toMatch(/share_lens_check|violates check constraint/i)
})

test('the DB still rejects an unknown scope (the constraint was rewritten, not loosened)', async () => {
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { error } = await client.from('api_keys').insert({
    project_id: projectId,
    key_hash: sha256(newPlaintextKey()),
    label: 'wildcard-scope',
    scope: 'wildcard',
  })
  expect(error).not.toBeNull()
  expect(error?.message ?? '').toMatch(/scope_check|violates check constraint/i)
})

test('the DB still rejects a lensless share row (the IS TRUE wrapper survived the rewrite)', async () => {
  // 20260803130000 exists because the unwrapped predicate evaluated to NULL for this row, and
  // PostgreSQL ACCEPTS a CHECK that evaluates to NULL. Adding a third arm without the wrapper would
  // have silently reopened it, so this is re-asserted after the rewrite rather than assumed.
  const client = db()
  const projectId = await projectIdBySlug(client, 'project-one')
  const { error } = await client.from('api_keys').insert({
    project_id: projectId,
    key_hash: sha256(newPlaintextKey()),
    label: 'lensless-share',
    scope: 'share',
  })
  expect(error).not.toBeNull()
  expect(error?.message ?? '').toMatch(/share_lens_check|violates check constraint/i)
})

// ── Cross-project: the two-credential rule's whole point ────────────────────────────────────────

test('a write key resolves to ITS OWN project, never another', async () => {
  const client = db()
  const projectOne = await projectIdBySlug(client, 'project-one')
  const { plaintext } = await mintAgentWriteRow(client, projectOne)

  const { data, error } = await client
    .from('active_agent_write_keys')
    .select('project_id')
    .eq('key_hash', sha256(plaintext))
    .maybeSingle()
  expect(error).toBeNull()
  expect(data?.project_id).toBe(projectOne)
})
