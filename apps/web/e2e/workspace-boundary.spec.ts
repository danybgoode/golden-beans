import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { readUserWorkspaces, readWorkspaceProjects } from '../lib/workspace-projects'
import { specWorkspaceId } from './helpers/spec-workspace'

// workspaces · Sprint 2, Stories 2.1 + 2.2 (Roadmap/02-commercial/workspaces — the Architecture lock, D6, D9, D10).
//
// ── The state every denial here is built on, and why ────────────────────────────────────────────────────────────
// A person who OWNS a project (a real `project_members` row) whose workspace they are NOT a member of. Nothing but the
// workspace check can deny that person: they pass every project-level check there is. A spec that denied a plain
// non-member would prove nothing about this epic — it was already denied before it (sprint-2 build contract, "Teeth").
//
// Each test asserts the CONTROL first — the same person, the same project, inside the workspace, ALLOWED — so a pass
// cannot come from some other refusal (a dead route, a gate that is off, an unrelated 404).
//
// The console family is the authed spec `console-shell.authed.spec.ts` (it needs a browser session cookie); CI runs
// the authed project in the gate.

const WRITE_TOOLS = ['create_flag', 'kill_flag', 'rollout_flag', 'set_flag']

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

type Seeded = {
  userId: string
  pat: string
  projectId: string
  slug: string
  workspaceId: string
  connector: string
  /** Remove the person from the project's workspace — the one state only the workspace check denies. */
  leaveWorkspace: () => Promise<void>
  cleanup: () => Promise<void>
}

/** A person who OWNS a project in its own fixture workspace, holding a CLI token, with a connector token on the project. */
async function seedOwner(): Promise<Seeded> {
  const client = db()
  const { data: created, error: userError } = await client.auth.admin.createUser({
    email: `ws-boundary-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  if (userError || !created.user) throw new Error(`createUser: ${userError?.message}`)
  const userId = created.user.id

  const workspaceId = await specWorkspaceId(client, 'boundary')
  const slug = `ws-boundary-${randomBytes(5).toString('hex')}`
  const { data: project, error: projectError } = await client
    .from('projects')
    .insert({ slug, api_key_hash: null, workspace_id: workspaceId })
    .select('id')
    .single()
  if (projectError || !project) throw new Error(`project: ${projectError?.message}`)

  // The trigger `project_members_join_workspace` places the owner inside the workspace — the CONTROL state.
  const { error: memberError } = await client
    .from('project_members')
    .insert({ user_id: userId, project_id: project.id, role: 'owner' })
  if (memberError) throw new Error(`member: ${memberError.message}`)

  const pat = `gf_pat_${randomBytes(32).toString('base64url')}`
  await client.from('cli_tokens').insert({ user_id: userId, token_hash: sha256(pat), label: 'boundary spec' })
  const connector = `gb_connector_${randomBytes(24).toString('base64url')}`
  await client.from('connector_tokens').insert({ project_id: project.id, token: connector })

  return {
    userId,
    pat,
    projectId: project.id as string,
    slug,
    workspaceId,
    connector,
    leaveWorkspace: async () => {
      const { error } = await client
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
      if (error) throw new Error(`leaveWorkspace: ${error.message}`)
      // The project membership is untouched — that is the point.
      const { data } = await client
        .from('project_members')
        .select('role')
        .eq('user_id', userId)
        .eq('project_id', project.id)
        .single()
      expect(data?.role).toBe('owner')
    },
    cleanup: async () => {
      await client.from('connector_tokens').delete().eq('project_id', project.id)
      await client.from('projects').delete().eq('id', project.id)
      await client.from('workspaces').delete().eq('id', workspaceId)
      await client.auth.admin.deleteUser(userId)
    },
  }
}

async function mcpToolNames(request: APIRequestContext, connector: string, pat: string) {
  const response = await request.post(`/api/v1/public/mcp/c/${connector}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      authorization: `Bearer ${pat}`,
    },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  if (response.status() === 404) return null
  const body = await response.json()
  return (body.result.tools as Array<{ name: string }>).map((tool) => tool.name)
}

test.describe('S2.1 — getWorkspaceProjects, the one legal multi-project read', () => {
  test('my workspace answers with my projects; a workspace I am not in answers with NOTHING — even one I hold a project in', async () => {
    const client = db()
    const mine = await seedOwner()
    const theirs = await seedOwner()
    try {
      expect(await readWorkspaceProjects(client, mine.userId, mine.workspaceId)).toEqual([
        { id: mine.projectId, slug: mine.slug, role: 'owner' },
      ])

      // Asking for someone else's workspace by id: no rows, never theirs.
      expect(await readWorkspaceProjects(client, mine.userId, theirs.workspaceId)).toEqual([])

      // Holding a project row inside their workspace without belonging to it is still nothing.
      await client
        .from('project_members')
        .insert({ user_id: mine.userId, project_id: theirs.projectId, role: 'owner' })
      await client
        .from('workspace_members')
        .delete()
        .eq('workspace_id', theirs.workspaceId)
        .eq('user_id', mine.userId)
      expect(await readWorkspaceProjects(client, mine.userId, theirs.workspaceId)).toEqual([])
    } finally {
      await client.from('project_members').delete().eq('user_id', mine.userId)
      await mine.cleanup()
      await theirs.cleanup()
    }
  })

  test('getUserWorkspaces lists the workspaces I belong to, with my role in each', async () => {
    const client = db()
    const seeded = await seedOwner()
    try {
      expect(await readUserWorkspaces(client, seeded.userId)).toEqual([
        { id: seeded.workspaceId, name: 'boundary fixtures', role: 'member' },
      ])
    } finally {
      await seeded.cleanup()
    }
  })
})

test.describe('S2.2 — every access path re-checks the workspace', () => {
  test('CLI (PAT): a project in a workspace I left is a 404 — on the project route AND missing from `gf projects`', async ({
    request,
  }) => {
    const seeded = await seedOwner()
    const auth = { authorization: `Bearer ${seeded.pat}` }
    try {
      const allowed = await request.get(`/api/v1/cli/flags?project=${seeded.slug}`, { headers: auth })
      expect(allowed.status(), 'CONTROL: the owner, inside the workspace').toBe(200)

      await seeded.leaveWorkspace()

      const denied = await request.get(`/api/v1/cli/flags?project=${seeded.slug}`, { headers: auth })
      expect(denied.status()).toBe(404)
      expect((await denied.json()).code).toBe('not_found')

      const listed = await request.get('/api/v1/cli/projects', { headers: auth })
      expect(listed.status()).toBe(200)
      const slugs = ((await listed.json()).projects as Array<{ slug: string }>).map((project) => project.slug)
      expect(slugs).not.toContain(seeded.slug)
    } finally {
      await seeded.cleanup()
    }
  })

  test('MCP connector: a PAT owner whose workspace it is not gets NO write tools (lock D10)', async ({
    request,
  }) => {
    const seeded = await seedOwner()
    try {
      const before = await mcpToolNames(request, seeded.connector, seeded.pat)
      test.skip(before === null, 'CONNECTOR_ENABLED is off on this server — CI runs it on')
      for (const tool of WRITE_TOOLS) expect(before, `CONTROL: ${tool} for the owner`).toContain(tool)

      await seeded.leaveWorkspace()

      const after = await mcpToolNames(request, seeded.connector, seeded.pat)
      for (const tool of WRITE_TOOLS) expect(after).not.toContain(tool)
      // The connector token itself is project-scoped and unchanged: the READ tools still answer (lock D10).
      expect(after?.length ?? 0).toBeGreaterThan(0)
    } finally {
      await seeded.cleanup()
    }
  })
})
