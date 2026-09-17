import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// golden-frijoles-cli · Sprint 1 — the CLI-authenticated API, at the HTTP layer.
//
// ── What is asserted here, and why it cannot be asserted anywhere else ────────────────────────
// The unit layer covers the planners, the projection and the CLI itself. What it CANNOT reach is
// the property that actually protects a tenant: that a `cli_tokens` row resolves to a user, that
// membership is then re-checked per project, and that a credential from any OTHER scope is refused.
// That property lives in a route and in a database view, so it is tested through the route.
//
// ── The separation is asserted in BOTH directions ─────────────────────────────────────────────
// A scope filter that quietly matched everything would still pass a one-directional test. So:
//   direction 1 — a CLI token must NOT authorize ingest (/api/v1/track)
//   direction 2 — an INGEST key must NOT authorize the CLI API
// Both below, and both mutation-checked (see sprint-1.md).

const SEEDED_INGEST_KEY = 'local-test-key-do-not-use-in-prod' // project-one's key (supabase/seed.sql)

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newCliToken(): string {
  return `gf_pat_${randomBytes(32).toString('base64url')}`
}

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * A disposable account that owns `project-one`, plus a live CLI token for it.
 *
 * The membership row is what makes this a real test rather than a shaped one: the route resolves
 * the token to a user and then asks `project_members`, exactly as the console does, so a fixture
 * that skipped the membership would be testing a path production never takes.
 */
async function seedTokenOwning(slug: string): Promise<{ token: string; userId: string; cleanup: () => Promise<void> }> {
  const client = db()
  const email = `cli-spec-${randomBytes(6).toString('hex')}@example.test`
  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createError || !created.user) throw new Error(`could not create a test user: ${createError?.message}`)
  const userId = created.user.id

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .single()
  if (projectError || !project) throw new Error(`no seeded project ${slug}`)

  const { error: memberError } = await client
    .from('project_members')
    .insert({ user_id: userId, project_id: project.id, role: 'owner' })
  if (memberError) throw new Error(`could not add membership: ${memberError.message}`)

  const token = newCliToken()
  const { error: tokenError } = await client
    .from('cli_tokens')
    .insert({ user_id: userId, token_hash: sha256(token), label: 'spec' })
  if (tokenError) throw new Error(`could not insert a cli token: ${tokenError.message}`)

  return {
    token,
    userId,
    cleanup: async () => {
      // cli_tokens cascades from auth.users; project_members does not, so it goes first.
      await client.from('project_members').delete().eq('user_id', userId)
      await client.auth.admin.deleteUser(userId)
    },
  }
}

test.describe('the CLI API', () => {
  test('is LIVE, not dark — the gate is born ON (epic D8)', async ({ request }) => {
    // ⚠️ This is the assertion that would have caught "the epic merged and does nothing". A 401 says
    // the route exists and wants a credential; a 404 would say the gate is closed. Every other gate
    // in lib/flags.ts is born dark and this one is deliberately not — so it gets an assertion that
    // fails if someone "fixes" the inconsistency.
    const response = await request.get('/api/v1/cli/whoami')
    expect(response.status(), 'a 404 here means CLI_WRITE_API_ENABLED is off').toBe(401)
  })

  test('no credential, a malformed one and an unknown one are ONE answer', async ({ request }) => {
    // Indistinguishable by design: a caller must not be able to confirm that a stolen token was
    // ever real. The bodies are compared too, not just the statuses — a differing sentence is an
    // oracle just as surely as a differing status.
    const answers = await Promise.all(
      [undefined, 'Bearer not-a-token', `Bearer ${newCliToken()}`].map(async (authorization) => {
        const response = await request.get('/api/v1/cli/whoami', {
          headers: authorization ? { authorization } : {},
        })
        return { status: response.status(), body: await response.json() }
      })
    )
    for (const answer of answers) {
      expect(answer.status).toBe(401)
      expect(answer.body.code).toBe('unauthorized')
      expect(answer.body.error).toBe(answers[0].body.error)
    }
  })

  test('direction 2 — an INGEST key does not authorize the CLI API', async ({ request }) => {
    // `gb_key_…` is a real, live credential for project-one. It resolves nothing here, because
    // `resolveCliToken` reads `active_cli_tokens` and an ingest key is not in that table at all.
    const response = await request.get('/api/v1/cli/whoami', {
      headers: { authorization: `Bearer ${SEEDED_INGEST_KEY}` },
    })
    expect(response.status()).toBe(401)
  })

  test('direction 1 — a CLI token does not authorize ingest', async ({ request }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.post('/api/v1/track', {
        headers: { authorization: `Bearer ${seeded.token}` },
        data: { event: 'cli_spec', userId: 'spec' },
      })
      expect(response.status(), 'a CLI token must never be an ingest credential').toBe(401)
    } finally {
      await seeded.cleanup()
    }
  })

  test('a live token names its account and the projects it reaches', async ({ request }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.get('/api/v1/cli/whoami', {
        headers: { authorization: `Bearer ${seeded.token}` },
      })
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(body.account.userId).toBe(seeded.userId)
      expect(body.projects.map((project: { slug: string }) => project.slug)).toContain('project-one')
      // The credential's label, never the token.
      expect(JSON.stringify(body)).not.toContain(seeded.token)
    } finally {
      await seeded.cleanup()
    }
  })

  test('a REVOKED token stops working immediately, and looks like an unknown one', async ({ request }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      await db().from('cli_tokens').update({ revoked_at: new Date().toISOString() }).eq('token_hash', sha256(seeded.token))
      const response = await request.get('/api/v1/cli/whoami', {
        headers: { authorization: `Bearer ${seeded.token}` },
      })
      // The liveness predicate lives in `active_cli_tokens`, in database time — there is no check in
      // application code that a refactor could drop, which is the whole reason the view exists.
      expect(response.status()).toBe(401)
    } finally {
      await seeded.cleanup()
    }
  })

  test('an EXPIRED token stops working, judged by the database clock', async ({ request }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      await db()
        .from('cli_tokens')
        .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
        .eq('token_hash', sha256(seeded.token))
      const response = await request.get('/api/v1/cli/whoami', {
        headers: { authorization: `Bearer ${seeded.token}` },
      })
      expect(response.status()).toBe(401)
    } finally {
      await seeded.cleanup()
    }
  })

  test('a project this account is not a member of is 404, never 403', async ({ request }) => {
    // "Not yours" and "not there" are one answer (AGENTS #10). A 403 would confirm that a foreign
    // project exists, which is how slug-guessing becomes tenant enumeration.
    const seeded = await seedTokenOwning('project-one')
    try {
      for (const slug of ['project-two', 'definitely-not-a-project']) {
        const response = await request.get(`/api/v1/cli/flags?project=${slug}`, {
          headers: { authorization: `Bearer ${seeded.token}` },
        })
        expect(response.status(), `${slug} should be indistinguishable from a non-existent project`).toBe(404)
      }
    } finally {
      await seeded.cleanup()
    }
  })

  test('reading flags for a project the token DOES reach answers with the three environments', async ({
    request,
  }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.get('/api/v1/cli/flags?project=project-one', {
        headers: { authorization: `Bearer ${seeded.token}` },
      })
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.ok).toBe(true)
      expect(Array.isArray(body.flags)).toBe(true)
      for (const flag of body.flags) {
        expect(flag.environments.map((row: { environment: string }) => row.environment)).toEqual([
          'development',
          'preview',
          'production',
        ])
      }
    } finally {
      await seeded.cleanup()
    }
  })

  test('a malformed flag key is refused BEFORE the lookup, with its own code', async ({ request }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.get('/api/v1/cli/flags?project=project-one&key=NOT%20A%20KEY', {
        headers: { authorization: `Bearer ${seeded.token}` },
      })
      expect(response.status()).toBe(400)
      expect((await response.json()).code).toBe('invalid')
    } finally {
      await seeded.cleanup()
    }
  })

  test('minting a credential is OWNER-only, and a member gets the same 404 a stranger gets', async ({
    request,
  }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      // Demote to member. The route must now refuse exactly as it refuses a non-member.
      const client = db()
      await client.from('project_members').update({ role: 'member' }).eq('user_id', seeded.userId)
      const response = await request.post('/api/v1/cli/keys', {
        headers: { authorization: `Bearer ${seeded.token}` },
        data: { project: 'project-one', type: 'flag_read', label: 'spec', environment: 'development' },
      })
      expect(response.status(), 'a member must not be able to mint a credential').toBe(404)
    } finally {
      await seeded.cleanup()
    }
  })

  test('a flag_read key needs an environment — it is never defaulted', async ({ request }) => {
    // A default here mints a credential pointed somewhere the caller did not choose.
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.post('/api/v1/cli/keys', {
        headers: { authorization: `Bearer ${seeded.token}` },
        data: { project: 'project-one', type: 'flag_read', label: 'spec' },
      })
      expect(response.status()).toBe(400)
      expect((await response.json()).code).toBe('invalid')
    } finally {
      await seeded.cleanup()
    }
  })

  test('an owner mints a flag_read key, gets the plaintext once, and it carries an expiry', async ({
    request,
  }) => {
    const seeded = await seedTokenOwning('project-one')
    try {
      const response = await request.post('/api/v1/cli/keys', {
        headers: { authorization: `Bearer ${seeded.token}` },
        data: { project: 'project-one', type: 'flag_read', label: 'cli spec', environment: 'development' },
      })
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.key).toMatch(/^gb_key_/)
      expect(body.scope).toBe('development')
      // ⚠️ NOT null. The console's mint action applies FLAG_KEY_EXPIRY_DAYS, and that constant exists
      // because a sprint nearly shipped flag credentials that never expire under a comment claiming
      // someone had chosen that. The CLI reads the same constant, so the two cannot drift.
      expect(body.expiresAt).not.toBeNull()
      // Clean up the credential this test minted.
      await db().from('api_keys').delete().eq('id', body.id)
    } finally {
      await seeded.cleanup()
    }
  })
})
