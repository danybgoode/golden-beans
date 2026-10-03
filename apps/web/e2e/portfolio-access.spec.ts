import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readWorkspaceProjects } from '../lib/workspace-projects'
import { assemblePortfolio, type PortfolioReaders } from '../lib/portfolio-model'
import { specWorkspaceId } from './helpers/spec-workspace'

// portfolio-view · Sprint 1, Story 1.1 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D1).
//
// The portfolio's rows are exactly what the ONE legal multi-project read returns, against the real database:
//   · the viewer's two projects in workspace W                → two rows (the CONTROL: a pass is not an empty page)
//   · a SIBLING project in W the viewer is not a member of    → never a row (LEARNINGS, board-sinks S4: the mutation
//                                                               that swaps the legal read for "every project in the
//                                                               workspace" must turn this red)
//   · a foreign workspace F the viewer does not belong to     → no rows at all
// `lib/portfolio.ts` is `server-only`, so this drives the two halves it composes — `readWorkspaceProjects` (the read
// behind `getWorkspaceProjects`) and `assemblePortfolio` — and pins the composition itself by its source below. The
// signed-in page, end to end, is `e2e/portfolio.authed.spec.ts` (Sprint 2).

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

async function createUser(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.admin.createUser({
    email: `portfolio-${label}-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  return data.user.id
}

async function createProject(client: SupabaseClient, workspaceId: string, ownerId: string, role = 'owner') {
  const slug = `portfolio-${randomBytes(5).toString('hex')}`
  const { data, error } = await client
    .from('projects')
    .insert({ slug, api_key_hash: null, workspace_id: workspaceId })
    .select('id')
    .single()
  if (error || !data) throw new Error(`project: ${error?.message}`)
  const { error: memberError } = await client
    .from('project_members')
    .insert({ user_id: ownerId, project_id: data.id, role })
  if (memberError) throw new Error(`member: ${memberError.message}`)
  return { id: data.id as string, slug }
}

/** Readers that only record which project ids they were asked about — no data, so only the LIST is under test. */
function recordingReaders(seen: Set<string>): PortfolioReaders {
  const note = async (id: string) => {
    seen.add(id)
    return null
  }
  return {
    loopStage: note,
    outcome: async (p) => {
      seen.add(p.id)
      return { unavailable: false, rows: [], northStar: null }
    },
    experiments: async (id) => {
      seen.add(id)
      return []
    },
    flags: async (id) => {
      seen.add(id)
      return []
    },
    podReport: note,
    roadmap: note,
    epicSpend: () => [],
  }
}

test.describe('portfolio access (1.1) — rows come only from the one legal read', () => {
  // One fixture set per worker, and these tests share it in order.
  test.describe.configure({ mode: 'serial' })
  const client = db()
  let viewer = ''
  let stranger = ''
  let workspace = ''
  let foreign = ''
  const mine: { id: string; slug: string }[] = []
  let sibling = { id: '', slug: '' }
  let foreignProject = { id: '', slug: '' }

  test.beforeAll(async () => {
    viewer = await createUser(client, 'viewer')
    stranger = await createUser(client, 'stranger')
    workspace = await specWorkspaceId(client, 'portfolio')
    foreign = await specWorkspaceId(client, 'portfolio-foreign')
    mine.push(await createProject(client, workspace, viewer, 'owner'))
    mine.push(await createProject(client, workspace, viewer, 'member'))
    // In the viewer's OWN workspace, granted only to someone else.
    sibling = await createProject(client, workspace, stranger)
    foreignProject = await createProject(client, foreign, stranger)
  })

  test.afterAll(async () => {
    const ids = [...mine.map((p) => p.id), sibling.id, foreignProject.id].filter(Boolean)
    await client.from('project_members').delete().in('project_id', ids)
    await client.from('projects').delete().in('id', ids)
    await client.from('workspace_members').delete().in('workspace_id', [workspace, foreign])
    await client.from('workspaces').delete().in('id', [workspace, foreign])
    for (const id of [viewer, stranger].filter(Boolean)) await client.auth.admin.deleteUser(id)
  })

  test('the viewer gets one row per project of theirs in the workspace — and the sibling is never read', async () => {
    // CONTROL: the sibling really is in the same workspace, so only the membership intersection can drop it.
    const { data: inWorkspace } = await client.from('projects').select('id').eq('workspace_id', workspace)
    expect((inWorkspace ?? []).map((r) => r.id).sort()).toEqual([...mine.map((p) => p.id), sibling.id].sort())

    const seen = new Set<string>()
    const rows = await assemblePortfolio(
      await readWorkspaceProjects(client, viewer, workspace),
      recordingReaders(seen)
    )
    expect(rows.map((r) => r.project.slug).sort()).toEqual(mine.map((p) => p.slug).sort())
    expect(rows.map((r) => r.project.role).sort()).toEqual(['member', 'owner'])
    expect([...seen].sort()).toEqual(mine.map((p) => p.id).sort())
    expect(seen.has(sibling.id)).toBe(false)
  })

  test('a workspace the viewer does not belong to yields no rows and reads nothing', async () => {
    const seen = new Set<string>()
    const rows = await assemblePortfolio(
      await readWorkspaceProjects(client, viewer, foreign),
      recordingReaders(seen)
    )
    expect(rows).toEqual([])
    expect(seen.size).toBe(0)
    // CONTROL: the foreign workspace is not empty — its own member gets its row.
    const theirs = await readWorkspaceProjects(client, stranger, foreign)
    expect(theirs.map((p) => p.id)).toEqual([foreignProject.id])
  })

  test('getPortfolio composes exactly those two halves and lists projects nowhere else', () => {
    const source = readFileSync(join(__dirname, '..', 'lib', 'portfolio.ts'), 'utf8')
    expect(source).toContain(
      'return assemblePortfolio(await getWorkspaceProjects(userId, workspaceId), readers)'
    )
    // No reader may list, join or filter by several projects on its own.
    expect(source).not.toMatch(/\.in\(|\.from\(\s*['"`]projects['"`]\s*\)|getUserProjects/)
  })
})
