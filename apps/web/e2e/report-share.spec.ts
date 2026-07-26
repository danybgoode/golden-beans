import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// pod-report · Sprint 3, Story 3.1 — scoped share links.
//
// Story 3.1's acceptance, spec'd against a REAL foreign tenant and a REAL revoked row rather than a
// hand-built stub (the growth-engine-v1 S4 lesson: a check written by the same session that built
// the feature tends to share its assumptions, so use the least convenient input available).
//
// ── The one spec here that would matter most if it broke ──────────────────────────────────────
// "a share token cannot ingest". Share links are rows in the SAME api_keys table as ingest
// credentials (migration 20260803100000) and they travel in URLs, so the whole design rests on a
// share token being useless against the API. That property is enforced by the `active_ingest_keys`
// view's own definition, not by application code — this spec is what proves the view is actually
// what lib/auth.ts reads.

const LOCAL_ONLY = 'local-test-key-do-not-use-in-prod'

function dbClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Mirrors lib/credential-hash.ts. Duplicated because that module's callers are `server-only`. */
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex')
const newToken = () => `gbs_${randomBytes(32).toString('base64url')}`

async function projectIdForKey(key: string): Promise<string> {
  const { data, error } = await dbClient().from('api_keys').select('project_id').eq('key_hash', hash(key)).single()
  if (error || !data) throw new Error(`fixture key not found: ${error?.message}`)
  return data.project_id as string
}

/** Mint a share row directly. The dashboard action is owner-gated; this spec is about the ROUTE. */
async function mintShare(
  projectId: string,
  lens: 'team' | 'client' | 'investor',
  over: Record<string, unknown> = {},
): Promise<{ token: string; id: string }> {
  const token = newToken()
  const { data, error } = await dbClient()
    .from('api_keys')
    .insert({
      project_id: projectId,
      key_hash: hash(token),
      label: 'spec share',
      scope: 'share',
      share_lens: lens,
      ...over,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not mint share: ${error?.message}`)
  return { token, id: data.id as string }
}

// ── Whether the SERVER has the gate on — probed, not read from this process's env ──────────────
// The first version read `process.env.REPORT_SHARES_ENABLED` in the TEST process. That is a different
// process from the server under test, and the two can disagree: running `npx playwright test`
// directly against an ON server (without exporting the var) made the gate-OFF spec run its
// dark-default assertion against a live route and fail with a confusing 200. CI exports it to both,
// so CI was fine — which is exactly the kind of coupling that only breaks for whoever runs the suite
// by hand next.
//
// Probing the running server removes the coupling: mint a real token, ask for it once, let the status
// code answer. 404 while the gate is off, 200 while it is on — the very behaviour the specs below are
// about, so there is no third thing to keep in sync.
let sharesEnabledCache: boolean | null = null
async function serverSharesEnabled(request: APIRequestContext): Promise<boolean> {
  if (sharesEnabledCache !== null) return sharesEnabledCache
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token, id } = await mintShare(projectId, 'team', { label: 'spec gate probe' })
  try {
    sharesEnabledCache = (await request.get(`/s/${token}`)).status() === 200
    return sharesEnabledCache
  } finally {
    // Revoked either way — a spec must not leave a live share credential behind.
    await dbClient().from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  }
}

// ── The property the whole design rests on ────────────────────────────────────────────────────

test('a share token is USELESS as an API credential, however valid it is as a link', async ({ request }) => {
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token } = await mintShare(projectId, 'team')

  // Every authed surface, not just one. A scope filter that was applied on the hot ingest path but
  // forgotten on a read route would be exactly the "harden one instance, miss its sibling"
  // inconsistency a later review round finds (Roadmap/LEARNINGS.md).
  for (const [method, path] of [
    ['post', '/api/v1/track'],
    ['post', '/api/v1/features/sync'],
    ['post', '/api/v1/reports/pod/push'],
    ['get', '/api/v1/north-star'],
  ] as const) {
    const res =
      method === 'post'
        ? await request.post(path, { headers: { Authorization: `Bearer ${token}` }, data: {} })
        : await request.get(path, { headers: { Authorization: `Bearer ${token}` } })

    expect(res.status(), `${method.toUpperCase()} ${path} accepted a share token`).toBe(401)
  }
})

test('the ingest view is what auth reads — an ingest key still works, so the 401 above is about SCOPE', async ({
  request,
}) => {
  // Without this, the test above would pass just as happily against a totally broken auth layer that
  // 401s everything. The pair is the assertion; neither half is meaningful alone.
  const res = await request.post('/api/v1/track', {
    headers: { Authorization: `Bearer ${LOCAL_ONLY}` },
    data: { event: 'share_spec_probe', userId: `spec-${randomBytes(4).toString('hex')}` },
  })
  expect(res.status()).toBeLessThan(400)
})

// ── The route ─────────────────────────────────────────────────────────────────────────────────

test('an invented token is 404 — never an oracle', async ({ request }) => {
  const res = await request.get(`/s/${newToken()}`)
  expect(res.status()).toBe(404)
})

test('a malformed token is 404, indistinguishable from a well-formed wrong guess', async ({ request }) => {
  for (const bad of ['nonsense', 'gbs_', 'gbs_tooshort', '../../etc/passwd']) {
    const res = await request.get(`/s/${encodeURIComponent(bad)}`)
    expect(res.status(), `token ${bad}`).toBe(404)
  }
})

test('while the gate is OFF, a PERFECTLY VALID token is still 404', async ({ request }) => {
  test.skip(
    await serverSharesEnabled(request),
    'the server under test has the gate ON; dark-default is asserted when it is off',
  )
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token } = await mintShare(projectId, 'investor')
  const res = await request.get(`/s/${token}`)
  // The kill switch has to beat a valid credential or it is not a kill switch (AGENTS rule #3's
  // two-independent-gates shape, applied to this surface).
  expect(res.status()).toBe(404)
})

test('a live token renders, and a REVOKED one dies immediately with no deploy', async ({ request }) => {
  test.skip(!(await serverSharesEnabled(request)), 'the server under test has the gate OFF')
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token, id } = await mintShare(projectId, 'client')

  const live = await request.get(`/s/${token}`)
  expect(live.status()).toBe(200)
  const html = await live.text()
  // Both the human-readable label and the machine-readable attribute. The label alone was the first
  // version of this assertion and it failed against a correct page: React's SSR inserts a `<!-- -->`
  // separator between adjacent text children, so `{lens} lens` rendered as `client<!-- --> lens`.
  // The attribute is immune to that class of markup detail; the label is what a human would check.
  expect(html).toContain('data-share-lens="client"')
  expect(html).toContain('client lens')

  // Revocation goes through the SAME column the ingest keys use — one revoke path, one thing to get
  // right (lib/api-keys.ts → revokeApiKey).
  const { error } = await dbClient()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  expect(error).toBeNull()

  const dead = await request.get(`/s/${token}`)
  // 404 and not 401, deliberately: a 401 would confirm the token was real once, telling whoever
  // holds a leaked link that they had something valid — an oracle handed to the person just cut off.
  // Same doctrine as lib/dashboard-auth.ts's 404-never-403 for a foreign project. Recorded as a
  // dated amendment in sprint-3.md, which the acceptance line ("revoked → 401") predates.
  expect(dead.status()).toBe(404)
})

test('an EXPIRED token is dead without anyone revoking it', async ({ request }) => {
  test.skip(!(await serverSharesEnabled(request)), 'the server under test has the gate OFF')
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token } = await mintShare(projectId, 'investor', {
    expires_at: new Date(Date.now() - 60_000).toISOString(),
  })
  const res = await request.get(`/s/${token}`)
  expect(res.status()).toBe(404)
})

test('the lens comes from the ROW: two tokens on one project render different pages', async ({ request }) => {
  test.skip(!(await serverSharesEnabled(request)), 'the server under test has the gate OFF')
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const team = await mintShare(projectId, 'team')
  const investor = await mintShare(projectId, 'investor')

  const teamHtml = await (await request.get(`/s/${team.token}`)).text()
  const investorHtml = await (await request.get(`/s/${investor.token}`)).text()

  expect(teamHtml).toContain('data-share-lens="team"')
  expect(investorHtml).toContain('data-share-lens="investor"')

  // And the URL cannot move you between them. `?lens=` is not a parameter this route reads — the
  // assertion is that adding it changes nothing, which is the observable form of "the lens has
  // nowhere else to come from".
  const escalated = await (await request.get(`/s/${investor.token}?lens=team`)).text()
  expect(escalated).toContain('data-share-lens="investor"')
  expect(escalated).not.toContain('data-share-lens="team"')
})

test('a token cannot be pointed at a project it was not minted for', async ({ request }) => {
  test.skip(!(await serverSharesEnabled(request)), 'the server under test has the gate OFF')
  // There is no project segment in the URL at all, so this asserts the shape rather than a filter:
  // the ONLY thing a caller supplies is the token, and the tenant is read from its row. A path that
  // accepted a slug would need a guard; this one has nothing to guard.
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token } = await mintShare(projectId, 'team')
  const res = await request.get(`/s/${token}`)
  expect(res.status()).toBe(200)
  expect(new URL(res.url()).pathname).toBe(`/s/${token}`)
})

// ── Cross-review round 5, Codex (the second model family) — one Blocking, two Should-fix ───────
// Four rounds by another family read this same surface and found none of these. Cross-family review
// is a floor on high-risk work, not a formality (Roadmap/LEARNINGS.md).

test('a lensless share row is REJECTED by the database, not merely ignored by the app', async () => {
  // The migration's original CHECK evaluated to NULL for `scope='share', share_lens=NULL`, and
  // PostgreSQL ACCEPTS a CHECK that returns NULL — only an explicit FALSE rejects. So a claim written
  // in a migration comment ("neither can exist for application code to interpret") was false, and the
  // app happened to fail closed for unrelated reasons. Verified against production before the fix:
  // the row was accepted. Now it is not.
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { error } = await dbClient()
    .from('api_keys')
    .insert({
      project_id: projectId,
      key_hash: hash(newToken()),
      label: 'spec lensless share',
      scope: 'share',
      share_lens: null,
    })
  expect(error, 'a share row with no lens must violate a CHECK').not.toBeNull()
  expect(error!.message).toMatch(/share_lens|check/i)
})

test('an ingest row cannot be UPDATEd into a share row without gaining a lens', async () => {
  // The INSERT path was the obvious hole; the UPDATE path is the one a CHECK has to cover too,
  // because nothing else prevents flipping `scope` on an existing credential.
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { data: ingest } = await dbClient()
    .from('api_keys')
    .select('id')
    .eq('project_id', projectId)
    .eq('scope', 'ingest')
    .is('revoked_at', null)
    .limit(1)
    .single()

  const { error } = await dbClient().from('api_keys').update({ scope: 'share' }).eq('id', ingest!.id)
  expect(error, 'flipping scope without a lens must be rejected').not.toBeNull()
})

test('a valid share row still inserts — the constraint rejects the hole, not the feature', async () => {
  // The complement, and the one that catches an over-tight constraint. A guard that blocks the real
  // path is a different outage with the same root cause.
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { token } = await mintShare(projectId, 'investor')
  expect(token).toMatch(/^gbs_/)
})

test('the share revoke touches ONLY share rows, so the audit trail cannot be mislabelled', async () => {
  // revokeShareAction called the generic revokeApiKey, so a forged request carrying an INGEST key's
  // id revoked that key while the audit row said `report_share_revoked`. An incident responder
  // searching `api_key_revoked` for "why did ingest stop?" would find nothing. The privilege boundary
  // held (an owner may revoke their own keys); the TRAIL did not.
  //
  // Asserted at the data layer, which is where the predicate lives — the Server Action itself needs a
  // session this spec has no way to forge.
  const projectId = await projectIdForKey(LOCAL_ONLY)
  const { data: ingest } = await dbClient()
    .from('api_keys')
    .select('id')
    .eq('project_id', projectId)
    .eq('scope', 'ingest')
    .is('revoked_at', null)
    .limit(1)
    .single()

  // Exactly the UPDATE lib/report-shares.ts's revokeShareLink issues, including the scope predicate.
  const { data: touched } = await dbClient()
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', ingest!.id)
    .eq('project_id', projectId)
    .eq('scope', 'share')
    .is('revoked_at', null)
    .select('id')

  expect(touched ?? [], 'the share revoke must not reach an ingest key').toHaveLength(0)

  // And the ingest key is still live — proving the no-op was the predicate, not a failed statement.
  const { data: still } = await dbClient()
    .from('api_keys')
    .select('revoked_at')
    .eq('id', ingest!.id)
    .single()
  expect(still!.revoked_at).toBeNull()
})

test('a share token keeps following its tenant across a rename (does NOT reproduce the race — see note)', async ({ request }) => {
  test.skip(!(await serverSharesEnabled(request)), 'the server under test has the gate OFF')

  // ── What this spec does and does NOT prove — corrected after mutation-checking it ─────────────
  // It was written to pin cross-review round 5's Blocking finding (the share route re-resolving its
  // tenant from the mutable slug). Mutation check: re-introducing the exact bug, rebuilding, and
  // re-running this spec — IT STILL PASSED. So it does not pin that finding, and saying it did would
  // be the "a spec that passes is not a spec that can fail" trap this repo has a LEARNINGS entry for.
  //
  // WHY it cannot: `active_share_links` returns `projects.slug` through a live JOIN, so every request
  // re-reads the tenant's CURRENT slug. After a rename, the vulnerable code looked up A's new slug and
  // correctly found A. The real exposure is a TOCTOU window INSIDE one request — between the token
  // resolution and the second `projects` read — which is milliseconds wide and not reachable from an
  // HTTP-level test. Carrying the credential's project_id closes the window by construction (and
  // deletes a redundant query); that is the argument for the fix, not this test.
  //
  // Kept because it still asserts something real and regression-worthy: a live token survives a
  // tenant rename and keeps rendering its own tenant. A future refactor that cached or stored the
  // slug at mint time, instead of resolving the tenant per request, would break exactly this.
  const db = dbClient()
  const suffix = randomBytes(4).toString('hex')
  const slugA = `spec-tenant-a-${suffix}`
  const slugB = `spec-tenant-b-${suffix}`

  const { data: a } = await db.from('projects').insert({ slug: slugA }).select('id').single()
  const { data: b } = await db.from('projects').insert({ slug: slugB }).select('id').single()
  const projectA = a!.id as string
  const projectB = b!.id as string

  try {
    // Each tenant gets a DISTINCT pod_report artifact, so "which tenant am I looking at?" is
    // observable in the rendered HTML rather than inferred.
    for (const [id, marker] of [
      [projectA, `MARKER-A-${suffix}`],
      [projectB, `MARKER-B-${suffix}`],
    ] as const) {
      const { error } = await db.rpc('push_report_artifact', {
        p_project_id: id,
        p_kind: 'pod_report',
        p_schema_version: 1,
        p_payload: { delivery: { notInstrumented: [] }, caveats: [marker] },
        p_generated_at: new Date().toISOString(),
        p_source_commit: null,
        p_source_ref: null,
      })
      expect(error).toBeNull()
    }

    const { token } = await mintShare(projectA, 'team')

    const before = await request.get(`/s/${token}`)
    expect(before.status()).toBe(200)
    expect(await before.text()).toContain(`MARKER-A-${suffix}`)

    // The reassignment. Free A's slug first, then give it to B — exactly the two-step a rename is.
    expect((await db.from('projects').update({ slug: `${slugA}-renamed` }).eq('id', projectA)).error).toBeNull()
    expect((await db.from('projects').update({ slug: slugA }).eq('id', projectB)).error).toBeNull()

    const after = await request.get(`/s/${token}`)
    expect(after.status()).toBe(200)
    const html = await after.text()
    expect(html, 'the token must still render the tenant it was minted for').toContain(`MARKER-A-${suffix}`)
    expect(html, 'and never the tenant that inherited its old slug').not.toContain(`MARKER-B-${suffix}`)
  } finally {
    // Disposable fixtures, removed whichever way the assertions went. api_keys and report_artifacts
    // both cascade from projects.
    await db.from('projects').delete().in('id', [projectA, projectB])
  }
})
