import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'

// golden-frijoles-cli · Sprint 2 — the write route, against the real control plane.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────────────
// The planners are unit-tested and the CLI's arguments are unit-tested with a stubbed fetch. What
// neither reaches is `lib/cli-flag-write.ts` — the part that decides WHICH version a change is
// computed from, WHETHER a new version is written, and what each environment reports. Review of
// PR #150 found two Blocking defects in exactly that layer, both invisible to every existing test:
// a `set` that re-activated an OLD version, and an `--all-envs` write computed from an unserved
// DRAFT. Both are asserted here, against the RPCs production runs.

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

type Seeded = { token: string; userId: string; projectId: string; cleanup: () => Promise<void> }

async function seedOwner(slug: string, role: 'owner' | 'member' = 'owner'): Promise<Seeded> {
  const client = db()
  const { data: created, error } = await client.auth.admin.createUser({
    email: `cli-write-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  if (error || !created.user) throw new Error(`could not create a test user: ${error?.message}`)
  const userId = created.user.id
  const { data: project } = await client.from('projects').select('id').eq('slug', slug).single()
  if (!project) throw new Error(`no seeded project ${slug}`)
  await client.from('project_members').insert({ user_id: userId, project_id: project.id, role })
  const token = `gf_pat_${randomBytes(32).toString('base64url')}`
  await client.from('cli_tokens').insert({ user_id: userId, token_hash: sha256(token), label: 'spec' })
  return {
    token,
    userId,
    projectId: project.id as string,
    cleanup: async () => {
      await client.from('project_members').delete().eq('user_id', userId)
      await client.auth.admin.deleteUser(userId)
    },
  }
}

/** A fresh flag key per test, so tests never share registry state. */
function freshKey(): string {
  return `spec.cli_${randomBytes(4).toString('hex')}`
}

async function write(request: APIRequestContext, token: string, body: Record<string, unknown>) {
  const response = await request.post('/api/v1/cli/flags/write', {
    headers: { authorization: `Bearer ${token}` },
    data: { project: 'project-one', reason: 'cli write spec', ...body },
  })
  return { status: response.status(), body: await response.json() }
}

test.describe('the CLI write route', () => {
  test('create --kill-switch --all-envs serves TRUE in all three environments', async ({ request }) => {
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      const result = await write(request, owner.token, {
        command: 'create',
        key,
        polarity: 'kill-switch',
        allEnvs: true,
      })
      expect(result.status).toBe(200)
      expect(result.body.outcome).toBe('applied')
      expect(result.body.serving).toBe(true)
      expect(result.body.environments.map((row: { status: string }) => row.status)).toEqual([
        'applied',
        'applied',
        'applied',
      ])
    } finally {
      await owner.cleanup()
    }
  })

  test('re-running an identical create writes NO new version and reports every environment unchanged', async ({
    request,
  }) => {
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      const command = { command: 'create', key, polarity: 'enablement', allEnvs: true }
      const first = await write(request, owner.token, command)
      const second = await write(request, owner.token, command)
      expect(second.body.versionCreated).toBe(false)
      expect(second.body.version).toBe(first.body.version)
      expect(second.body.environments.map((row: { status: string }) => row.status)).toEqual([
        'unchanged',
        'unchanged',
        'unchanged',
      ])
    } finally {
      await owner.cleanup()
    }
  })

  test('⚠️ a set back to an OLD definition writes a NEW version — it never resurrects history', async ({
    request,
  }) => {
    // The Blocking defect in PR #150: with v1=on and v2=off, `set --value true` matched v1 and
    // re-activated it. Only the NEWEST version may be reused.
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      const v1 = await write(request, owner.token, {
        command: 'create',
        key,
        polarity: 'kill-switch',
        environments: ['production'],
      })
      const v2 = await write(request, owner.token, {
        command: 'set',
        key,
        variantKey: 'off',
        environments: ['production'],
      })
      const v3 = await write(request, owner.token, {
        command: 'set',
        key,
        variantKey: 'on',
        environments: ['production'],
      })
      expect(v1.body.version).toBe(1)
      expect(v2.body.version).toBe(2)
      expect(v3.body.versionCreated).toBe(true)
      expect(v3.body.version, 'v1 was re-activated instead of writing v3').toBe(3)
      expect(v3.body.serving).toBe(true)
    } finally {
      await owner.cleanup()
    }
  })

  test('⚠️ a change is computed from the SERVED version, never from an unactivated draft', async ({
    request,
  }) => {
    // The second Blocking defect in PR #150: with preview serving v1, production serving nothing and
    // a newer DRAFT sitting unactivated, a multi-environment write computed from the draft and
    // published it. The draft here carries a distinctive description so its leak would be visible.
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      await write(request, owner.token, {
        command: 'create',
        key,
        polarity: 'kill-switch',
        description: 'served',
        environments: ['preview'],
      })
      // A draft: a new version, NOT activated anywhere, written straight through the RPC the console
      // uses for drafts.
      const { error } = await db().rpc('create_flag_definition_version', {
        p_project_id: owner.projectId,
        p_flag_key: key,
        p_definition: {
          valueType: 'boolean',
          description: 'UNREVIEWED DRAFT',
          defaultVariantKey: 'on',
          variants: [
            { key: 'off', value: false },
            { key: 'on', value: true },
          ],
          rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 5000 }, variantKey: 'on' }],
        },
        p_reason: 'a draft nobody activated',
        p_actor_user_id: owner.userId,
      })
      expect(error).toBeNull()

      const result = await write(request, owner.token, {
        command: 'set',
        key,
        variantKey: 'off',
        environments: ['preview', 'production'],
      })
      expect(result.status).toBe(200)

      const { data } = await db()
        .from('flag_definition_versions')
        .select('definition')
        .eq('id', result.body.versionId)
        .single()
      const definition = data?.definition as { description: string; rules: unknown[] }
      expect(definition.description, 'the unactivated draft leaked into the change').toBe('served')
      expect(definition.rules).toEqual([])
    } finally {
      await owner.cleanup()
    }
  })

  test('kill clears every rule and serves false', async ({ request }) => {
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      await write(request, owner.token, {
        command: 'create',
        key,
        polarity: 'kill-switch',
        environments: ['production'],
      })
      await write(request, owner.token, {
        command: 'rollout',
        key,
        percent: 25,
        environments: ['production'],
      })
      const killed = await write(request, owner.token, { command: 'kill', key, environments: ['production'] })
      expect(killed.body.serving).toBe(false)
      const { data } = await db()
        .from('flag_definition_versions')
        .select('definition')
        .eq('id', killed.body.versionId)
        .single()
      expect((data?.definition as { rules: unknown[] }).rules).toEqual([])
    } finally {
      await owner.cleanup()
    }
  })

  test('environments serving different versions are refused, not flattened', async ({ request }) => {
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      await write(request, owner.token, { command: 'create', key, polarity: 'kill-switch', allEnvs: true })
      await write(request, owner.token, {
        command: 'rollout',
        key,
        percent: 10,
        environments: ['production'],
      })
      const result = await write(request, owner.token, { command: 'kill', key, allEnvs: true })
      expect(result.status).toBe(400)
      expect(result.body.code).toBe('invalid')
    } finally {
      await owner.cleanup()
    }
  })

  test('a MEMBER cannot write, and gets the 404 a stranger gets', async ({ request }) => {
    const member = await seedOwner('project-one', 'member')
    try {
      const result = await write(request, member.token, {
        command: 'create',
        key: freshKey(),
        polarity: 'kill-switch',
        allEnvs: true,
      })
      expect(result.status).toBe(404)
    } finally {
      await member.cleanup()
    }
  })

  test('the audit trail names the acting ACCOUNT and carries the reason', async ({ request }) => {
    const owner = await seedOwner('project-one')
    try {
      const key = freshKey()
      const result = await write(request, owner.token, {
        command: 'create',
        key,
        polarity: 'kill-switch',
        environments: ['production'],
        reason: 'incident 42',
      })
      const { data } = await db()
        .from('flag_lifecycle_audit')
        .select('actor_user_id, reason, action')
        .eq('new_version_id', result.body.versionId)
      expect(data?.length).toBeGreaterThan(0)
      for (const row of data ?? []) {
        expect(row.actor_user_id).toBe(owner.userId)
        expect(row.reason).toBe('incident 42')
      }
    } finally {
      await owner.cleanup()
    }
  })
})
