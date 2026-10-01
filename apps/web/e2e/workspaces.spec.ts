import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { claimWorkspace, releaseWorkspace, workspaceNameFor } from '../lib/workspace-tenancy'

// workspaces · Sprint 1 (Roadmap/02-commercial/workspaces — the Architecture lock, D2–D4).
//
//   S1.1  the tables refuse anon and authenticated, and the backfill function refuses them at the FUNCTION level
//   S1.2  the backfill rule, every branch, through the one place it lives (backfill_project_workspaces)
//   S1.2  a credential minted before the backfill still authenticates after it
//   S1.3  provisioning's claim / release, including the failure path
//
// ⚠️ The backfill tests only work while `projects.workspace_id` is NULLABLE — they insert the pre-migration shape.
// Migration B (Sprint 2) makes it NOT NULL and drops the function, and deletes that describe block with it.

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

const suffix = () => randomBytes(5).toString('hex')

type Fixture = { users: string[]; projects: string[] }

async function createUser(client: SupabaseClient, fixture: Fixture, metadata?: Record<string, unknown>) {
  const email = `ws-${suffix()}@example.test`
  const { data, error } = await client.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  fixture.users.push(data.user.id)
  return { id: data.user.id, email }
}

/** A project in the PRE-backfill shape: no workspace. */
async function createProject(client: SupabaseClient, fixture: Fixture, createdBy: string | null = null) {
  const slug = `ws-spec-${suffix()}`
  const { data, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: null, created_by: createdBy })
    .select('id, slug')
    .single()
  if (error || !data) throw new Error(`createProject: ${error?.message}`)
  fixture.projects.push(data.id as string)
  return { id: data.id as string, slug: data.slug as string }
}

async function addMember(
  client: SupabaseClient,
  userId: string,
  projectId: string,
  role: 'owner' | 'member',
  createdAt?: string
) {
  const { error } = await client
    .from('project_members')
    .insert({ user_id: userId, project_id: projectId, role, ...(createdAt ? { created_at: createdAt } : {}) })
  if (error) throw new Error(`addMember: ${error.message}`)
}

async function workspaceOf(client: SupabaseClient, projectId: string) {
  const { data } = await client.from('projects').select('workspace_id').eq('id', projectId).single()
  const workspaceId = (data?.workspace_id as string | null) ?? null
  if (!workspaceId) return null
  const { data: workspace } = await client
    .from('workspaces')
    .select('id, name, created_by')
    .eq('id', workspaceId)
    .single()
  const { data: members } = await client
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
  return {
    id: workspace!.id as string,
    name: workspace!.name as string,
    createdBy: workspace!.created_by as string | null,
    members: Object.fromEntries((members ?? []).map((m) => [m.user_id as string, m.role as string])),
  }
}

async function cleanup(client: SupabaseClient, fixture: Fixture) {
  if (fixture.projects.length) {
    await client.from('api_keys').delete().in('project_id', fixture.projects)
    await client.from('connector_tokens').delete().in('project_id', fixture.projects)
    await client.from('projects').delete().in('id', fixture.projects)
  }
  if (fixture.users.length) {
    await client.from('workspaces').delete().in('created_by', fixture.users)
    for (const id of fixture.users) await client.auth.admin.deleteUser(id)
  }
}

const backfill = (client: SupabaseClient, ids: string[]) =>
  client.rpc('backfill_project_workspaces', { p_project_ids: ids })

test.describe('S1.1 — the workspace tables are service-role only', () => {
  test('anon and authenticated are REFUSED on both tables, and on the backfill function itself', async () => {
    const url = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    test.skip(!url || !anonKey, 'needs SUPABASE_ANON_KEY to exercise the anon and authenticated roles')
    const service = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const password = `pw-${suffix()}-${suffix()}`
      const email = `ws-auth-${suffix()}@example.test`
      const { data: created } = await service.auth.admin.createUser({ email, password, email_confirm: true })
      fixture.users.push(created.user!.id)

      const anon = createClient(url!, anonKey!, { auth: { persistSession: false } })
      const authed = createClient(url!, anonKey!, { auth: { persistSession: false } })
      const { error: signInError } = await authed.auth.signInWithPassword({ email, password })
      expect(signInError).toBeNull()

      for (const [label, client] of [
        ['anon', anon],
        ['authenticated', authed],
      ] as const) {
        for (const relation of ['workspaces', 'workspace_members']) {
          const { error } = await client.from(relation).select('*').limit(1)
          // A REFUSAL, not an empty list: RLS alone would answer [] — the REVOKE is what makes it 42501.
          expect(error?.code, `${label} reading ${relation}`).toBe('42501')
        }
        const { error } = await client.rpc('backfill_project_workspaces', { p_project_ids: [] })
        // Function-level, never an error from INSIDE the body (which would mean EXECUTE leaked and it ran) — LEARNINGS,
        // "DROP FUNCTION + CREATE silently restores PUBLIC EXECUTE".
        expect(
          error?.code === 'PGRST202' || (error?.code === '42501' && /function/i.test(error.message)),
          `${label} calling backfill_project_workspaces: ${error?.code} ${error?.message}`
        ).toBe(true)
      }
    } finally {
      await cleanup(service, fixture)
    }
  })

  test('workspace_members.role accepts only owner | member', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const user = await createUser(client, fixture)
      const { data: workspace } = await client
        .from('workspaces')
        .insert({ name: 'role check', created_by: user.id })
        .select('id')
        .single()
      const { error } = await client
        .from('workspace_members')
        .insert({ workspace_id: workspace!.id, user_id: user.id, role: 'admin' })
      expect(error?.code).toBe('23514')
    } finally {
      await cleanup(client, fixture)
    }
  })
})

test.describe('S1.2 — the backfill rule (backfill_project_workspaces, lock D3)', () => {
  test('a self-serve project joins its CREATOR’s workspace, named for them', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const ada = await createUser(client, fixture, { display_name: 'Ada' })
      const project = await createProject(client, fixture, ada.id)
      await addMember(client, ada.id, project.id, 'owner')

      const { error } = await backfill(client, [project.id])
      expect(error).toBeNull()

      const workspace = await workspaceOf(client, project.id)
      expect(workspace?.createdBy).toBe(ada.id)
      expect(workspace?.name).toBe("Ada's products")
      expect(workspace?.members).toEqual({ [ada.id]: 'owner' })
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('with no creator, the EARLIEST owner wins — one workspace for a two-owner project, the rest become members', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const later = await createUser(client, fixture)
      const earlier = await createUser(client, fixture)
      const reader = await createUser(client, fixture)
      const project = await createProject(client, fixture)
      // Inserted in the OPPOSITE order to their created_at, so insertion order cannot pass for the rule.
      await addMember(client, later.id, project.id, 'owner', '2026-07-21T10:00:00Z')
      await addMember(client, earlier.id, project.id, 'owner', '2026-07-21T09:00:00Z')
      await addMember(client, reader.id, project.id, 'member', '2026-07-20T09:00:00Z')

      expect((await backfill(client, [project.id])).error).toBeNull()

      const workspace = await workspaceOf(client, project.id)
      expect(workspace?.createdBy).toBe(earlier.id)
      // The email's local part, because this person has no display name — "miyagi's products" in production.
      expect(workspace?.name).toBe(workspaceNameFor(null, earlier.email))
      // EVERY project member is inside the boundary, or Sprint 2's re-check would lock the non-owners out.
      expect(workspace?.members).toEqual({
        [earlier.id]: 'owner',
        [later.id]: 'member',
        [reader.id]: 'member',
      })
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('one workspace per person: their second project joins the first one’s workspace', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const owner = await createUser(client, fixture)
      const first = await createProject(client, fixture)
      const second = await createProject(client, fixture)
      await addMember(client, owner.id, first.id, 'owner')
      await addMember(client, owner.id, second.id, 'owner')

      expect((await backfill(client, [first.id, second.id])).error).toBeNull()

      const a = await workspaceOf(client, first.id)
      const b = await workspaceOf(client, second.id)
      expect(a?.id).toBeTruthy()
      expect(b?.id).toBe(a?.id)
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('a project with NO creator and NO owner aborts the whole call — nothing is assigned', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const owner = await createUser(client, fixture)
      const assignable = await createProject(client, fixture)
      await addMember(client, owner.id, assignable.id, 'owner')
      const orphan = await createProject(client, fixture)

      const { error } = await backfill(client, [assignable.id, orphan.id])
      expect(error?.message).toContain(orphan.slug)

      // All-or-nothing: the assignable project rolled back with it, and no workspace was left behind.
      expect(await workspaceOf(client, assignable.id)).toBeNull()
      const { data: leftovers } = await client.from('workspaces').select('id').eq('created_by', owner.id)
      expect(leftovers).toEqual([])
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('a credential minted BEFORE the backfill still authenticates after it — ingest key and connector token', async ({
    request,
  }) => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const owner = await createUser(client, fixture)
      const project = await createProject(client, fixture)
      await addMember(client, owner.id, project.id, 'owner')
      const plaintextKey = `gb_key_${randomBytes(24).toString('hex')}`
      await client.from('api_keys').insert({
        project_id: project.id,
        key_hash: createHash('sha256').update(plaintextKey).digest('hex'),
        label: 'pre-backfill',
      })
      const connector = `gb_connector_${randomBytes(24).toString('base64url')}`
      await client.from('connector_tokens').insert({ project_id: project.id, token: connector })

      expect((await backfill(client, [project.id])).error).toBeNull()
      expect((await workspaceOf(client, project.id))?.id).toBeTruthy()

      const ingest = await request.post('/api/v1/track', {
        headers: { Authorization: `Bearer ${plaintextKey}` },
        data: { userId: 'u1', event: 'workspace_backfill_check' },
      })
      expect(ingest.status()).toBe(201)

      const mcp = await request.post(`/api/v1/public/mcp/c/${connector}`, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      })
      test.skip(mcp.status() === 404, 'CONNECTOR_ENABLED is off on this server — CI runs it on')
      expect(mcp.status()).toBe(200)
      expect(((await mcp.json()).result.tools as unknown[]).length).toBeGreaterThan(0)
    } finally {
      await client.from('events').delete().in('project_id', fixture.projects)
      await cleanup(client, fixture)
    }
  })
})

test.describe('S1.3 — provisioning claims a workspace (lib/workspace-tenancy.ts)', () => {
  test('a first claim creates the workspace with its claimant as owner; a second claim reuses it', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const user = await createUser(client, fixture)
      const first = await claimWorkspace(client, user.id, workspaceNameFor('Grace', user.email))
      expect(first).toMatchObject({ ok: true, created: true })
      if (!first.ok) return

      const second = await claimWorkspace(client, user.id, 'ignored on reuse')
      expect(second).toEqual({ ok: true, workspaceId: first.workspaceId, created: false })

      const { data: workspace } = await client
        .from('workspaces')
        .select('name')
        .eq('id', first.workspaceId)
        .single()
      expect(workspace?.name).toBe("Grace's products")
      const { data: members } = await client
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', first.workspaceId)
      expect(members).toEqual([{ user_id: user.id, role: 'owner' }])
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('two concurrent claims for one person converge on ONE workspace, and only one of them created it', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const user = await createUser(client, fixture)
      const claims = await Promise.all([
        claimWorkspace(client, user.id, 'race'),
        claimWorkspace(client, user.id, 'race'),
      ])
      const ok = claims.filter((claim) => claim.ok)
      expect(ok).toHaveLength(2)
      expect(new Set(ok.map((claim) => claim.workspaceId)).size).toBe(1)
      expect(ok.filter((claim) => claim.created)).toHaveLength(1)
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('the FAILURE path: a claim this provision created is released, with its membership', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const user = await createUser(client, fixture)
      const claim = await claimWorkspace(client, user.id, 'doomed')
      expect(claim).toMatchObject({ ok: true, created: true })
      if (!claim.ok) return

      // The way a real provision fails after its claim: the project insert is refused (here, a taken slug).
      const taken = await createProject(client, fixture)
      const { error: insertError } = await client
        .from('projects')
        .insert({ slug: taken.slug, created_by: user.id, workspace_id: claim.workspaceId })
      expect(insertError?.code).toBe('23505')

      expect(await releaseWorkspace(client, claim)).toBeNull()
      const { data: workspaces } = await client.from('workspaces').select('id').eq('id', claim.workspaceId)
      expect(workspaces).toEqual([])
      const { data: members } = await client
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', claim.workspaceId)
      expect(members).toEqual([])
    } finally {
      await cleanup(client, fixture)
    }
  })

  test('a release never deletes a workspace it did not create, nor one that holds a project', async () => {
    const client = db()
    const fixture: Fixture = { users: [], projects: [] }
    try {
      const user = await createUser(client, fixture)
      const original = await claimWorkspace(client, user.id, 'kept')
      if (!original.ok) throw new Error('claim failed')

      // A retry's claim REUSES it, and that retry failing must not take the person's tenant with it.
      const retry = await claimWorkspace(client, user.id, 'kept')
      if (!retry.ok) throw new Error('claim failed')
      expect(await releaseWorkspace(client, retry)).toBeNull()
      const afterRetry = await client.from('workspaces').select('id').eq('id', original.workspaceId)
      expect(afterRetry.data).toHaveLength(1)

      // And even the creating claim cannot delete it once a project lives there — ON DELETE RESTRICT.
      const project = await createProject(client, fixture)
      await client.from('projects').update({ workspace_id: original.workspaceId }).eq('id', project.id)
      expect(await releaseWorkspace(client, original)).toBeNull()
      const afterRelease = await client.from('workspaces').select('id').eq('id', original.workspaceId)
      expect(afterRelease.data).toHaveLength(1)
    } finally {
      await cleanup(client, fixture)
    }
  })
})
