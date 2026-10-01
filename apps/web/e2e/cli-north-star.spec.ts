import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// think-skills S3 (D6) — `/api/v1/cli/north-star`, the route `gf north-star set` reads and writes through.
//
// A new door onto an existing write, on an auth boundary, so this spec is about WHO can do WHAT to WHICH project:
// a bad token, a stranger, a member, an owner, and an owner aiming at a project that is not theirs. It also proves
// the write is the SAME write — what the CLI syncs, the ingest-key route reads back.
//
// Not here, and why: the CLI_WRITE_API_ENABLED=false → 404 case. The e2e server runs with the gate ON (it is born
// ON, `cli-api.spec.ts`), and this route enters through `requireCliMember` / `requireCliOwner`, whose gate-first
// order is `lib/cli-auth.ts`'s single seam rather than anything this route decides.

const PROJECT_ONE_KEY = 'local-test-key-do-not-use-in-prod'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

type Seeded = { token: string; cleanup: () => Promise<void> }

async function seedAccount(slug: string, role: 'owner' | 'member'): Promise<Seeded> {
  const client = db()
  const { data: created, error } = await client.auth.admin.createUser({
    email: `cli-north-star-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`could not create a test user: ${error?.message}`)
  const userId = created.user.id
  const { data: project } = await client.from('projects').select('id').eq('slug', slug).single()
  if (!project) throw new Error(`no seeded project ${slug}`)
  // Setup failures THROW: a silently missing membership would make every 404 below pass for the wrong reason.
  const { error: memberError } = await client
    .from('project_members')
    .insert({ user_id: userId, project_id: project.id, role })
  if (memberError) throw new Error(`could not add the test membership: ${memberError.message}`)
  const token = `gf_pat_${randomBytes(32).toString('base64url')}`
  const { error: tokenError } = await client
    .from('cli_tokens')
    .insert({ user_id: userId, token_hash: sha256(token), label: 'spec' })
  if (tokenError) throw new Error(`could not mint the test CLI token: ${tokenError.message}`)
  return {
    token,
    cleanup: async () => {
      await client.from('project_members').delete().eq('user_id', userId)
      await client.auth.admin.deleteUser(userId)
    },
  }
}

const unique = () => randomBytes(4).toString('hex')

function payload(metricKey: string) {
  return {
    metric: { key: metricKey, name: 'Spec North Star', description: 'synced by the CLI route spec' },
    inputs: [{ key: `${metricKey}_input`, name: 'Spec input', valueSource: 'external_push' }],
  }
}

async function sync(request: APIRequestContext, token: string, project: string, body: unknown) {
  const response = await request.post('/api/v1/cli/north-star', {
    headers: { authorization: `Bearer ${token}` },
    data: { project, sync: body },
  })
  return { status: response.status(), body: await response.json() }
}

async function read(request: APIRequestContext, token: string, project: string) {
  const response = await request.get(`/api/v1/cli/north-star?project=${project}`, {
    headers: { authorization: `Bearer ${token}` },
  })
  return { status: response.status(), body: await response.json() }
}

test.describe('the CLI North Star route', () => {
  test('a token that is not a CLI credential is 401 on both verbs', async ({ request }) => {
    const bogus = `gf_pat_${randomBytes(32).toString('base64url')}`
    expect((await read(request, bogus, 'project-one')).status).toBe(401)
    expect((await sync(request, bogus, 'project-one', payload(`spec_ns_${unique()}`))).status).toBe(401)
  })

  test('an owner syncs, and the ingest-key route reads back the same North Star', async ({ request }) => {
    const owner = await seedAccount('project-one', 'owner')
    try {
      const key = `spec_ns_${unique()}`
      const result = await sync(request, owner.token, 'project-one', payload(key))
      expect(result.status).toBe(200)
      expect(result.body).toMatchObject({ ok: true, project: 'project-one', metric: key, inputsSynced: 1 })

      const viaIngestKey = await request.get('/api/v1/north-star', {
        headers: { Authorization: `Bearer ${PROJECT_ONE_KEY}` },
      })
      const metric = (await viaIngestKey.json()).metrics.find((m: { key: string }) => m.key === key)
      expect(metric?.inputs.map((i: { key: string }) => i.key)).toEqual([`${key}_input`])

      const viaCli = await read(request, owner.token, 'project-one')
      expect(viaCli.status).toBe(200)
      expect(viaCli.body.metrics.find((m: { key: string }) => m.key === key)).toBeTruthy()
    } finally {
      await owner.cleanup()
    }
  })

  test('a member can read but not sync — the same 404 a stranger gets', async ({ request }) => {
    const member = await seedAccount('project-one', 'member')
    try {
      expect((await read(request, member.token, 'project-one')).status).toBe(200)
      const key = `spec_ns_${unique()}`
      const refused = await sync(request, member.token, 'project-one', payload(key))
      expect(refused.status).toBe(404)
      expect(refused.body.code).toBe('not_found')
      const after = await read(request, member.token, 'project-one')
      expect(after.body.metrics.find((m: { key: string }) => m.key === key)).toBeUndefined()
    } finally {
      await member.cleanup()
    }
  })

  test("an owner of one project can neither read nor write another's — 404, never 403", async ({
    request,
  }) => {
    const owner = await seedAccount('project-one', 'owner')
    try {
      // The positive anchor: this account CAN reach its own project, so the 404s below are about project-two.
      expect((await read(request, owner.token, 'project-one')).status).toBe(200)
      expect((await read(request, owner.token, 'project-two')).status).toBe(404)
      const key = `spec_ns_${unique()}`
      const crossed = await sync(request, owner.token, 'project-two', payload(key))
      expect(crossed.status).toBe(404)
      const { data } = await db().from('north_star_metrics').select('id').eq('key', key)
      expect(data ?? []).toEqual([])
    } finally {
      await owner.cleanup()
    }
  })

  test('a payload the schema refuses is 400 `invalid` with the schema’s issues, and nothing is written', async ({
    request,
  }) => {
    const owner = await seedAccount('project-one', 'owner')
    try {
      const key = `spec_ns_${unique()}`
      const bad = {
        metric: { key, name: 'Spec' },
        inputs: [{ key: `${key}_input`, name: 'Spec', valueSource: 'telemetry_event' }], // no sourceEvent
      }
      const result = await sync(request, owner.token, 'project-one', bad)
      expect(result.status).toBe(400)
      expect(result.body.code).toBe('invalid')
      expect(result.body.issues?.fieldErrors).toBeTruthy()
      const { data } = await db().from('north_star_metrics').select('id').eq('key', key)
      expect(data ?? []).toEqual([])
    } finally {
      await owner.cleanup()
    }
  })

  test('no project named is 400 `invalid`, before any project is touched', async ({ request }) => {
    const owner = await seedAccount('project-one', 'owner')
    try {
      const response = await request.post('/api/v1/cli/north-star', {
        headers: { authorization: `Bearer ${owner.token}` },
        data: { sync: payload(`spec_ns_${unique()}`) },
      })
      expect(response.status()).toBe(400)
    } finally {
      await owner.cleanup()
    }
  })
})
