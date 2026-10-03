import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { readLoopStage, writeLoopStage } from '../lib/loop-stage-store'
import { LOOP_STAGES, loopStageWriteDecision } from '../lib/loop-stage'
import { specWorkspaceId } from './helpers/spec-workspace'

// portfolio-view · Sprint 1, Story 1.3 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D3, D9, D11, C4).
//
// Three things, each against the real database:
//   1. The column takes the three stages and NULL, and REFUSES anything else — by the CHECK, which is proven by the
//      error being 23514 naming `projects_loop_stage_check` (LEARNINGS: check WHAT refused the write, not that
//      something did — a refusal can come from any constraint).
//   2. The write decision on REAL membership rows: owner → ok (200), member → forbidden (403), non-member → not_found
//      (404). The Server Action that wires it to a session is S2's (2.3); its wire is the authed browser spec.
//   3. No credential path can set it: no route under app/api names the column.

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

test.describe('projects.loop_stage (1.3)', () => {
  // One fixture set per worker, and these tests share it in order.
  test.describe.configure({ mode: 'serial' })
  const client = db()
  let workspace = ''
  let projectId = ''
  const users: Record<'owner' | 'member' | 'outsider', string> = { owner: '', member: '', outsider: '' }

  test.beforeAll(async () => {
    for (const label of Object.keys(users) as (keyof typeof users)[]) {
      const { data, error } = await client.auth.admin.createUser({
        email: `loop-${label}-${randomBytes(6).toString('hex')}@example.test`,
        email_confirm: true,
      })
      if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
      users[label] = data.user.id
    }
    workspace = await specWorkspaceId(client, 'loop-stage')
    const { data, error } = await client
      .from('projects')
      .insert({ slug: `loop-${randomBytes(5).toString('hex')}`, api_key_hash: null, workspace_id: workspace })
      .select('id')
      .single()
    if (error || !data) throw new Error(`project: ${error?.message}`)
    projectId = data.id as string
    await client.from('project_members').insert([
      { user_id: users.owner, project_id: projectId, role: 'owner' },
      { user_id: users.member, project_id: projectId, role: 'member' },
    ])
  })

  test.afterAll(async () => {
    await client.from('project_members').delete().eq('project_id', projectId)
    await client.from('projects').delete().eq('id', projectId)
    await client.from('workspace_members').delete().eq('workspace_id', workspace)
    await client.from('workspaces').delete().eq('id', workspace)
    for (const id of Object.values(users).filter(Boolean)) await client.auth.admin.deleteUser(id)
  })

  test('a new project is not placed: the column reads null, never a guessed stage', async () => {
    expect(await readLoopStage(client, projectId)).toBeNull()
  })

  test('each stage writes and reads back; null clears it', async () => {
    for (const stage of LOOP_STAGES) {
      expect(await writeLoopStage(client, projectId, stage)).toBe(true)
      expect(await readLoopStage(client, projectId)).toBe(stage)
    }
    expect(await writeLoopStage(client, projectId, null)).toBe(true)
    expect(await readLoopStage(client, projectId)).toBeNull()
  })

  test('anything else is refused BY THE CHECK — and the stored stage is untouched', async () => {
    expect(await writeLoopStage(client, projectId, 'operate')).toBe(true)
    for (const bad of ['grow', 'Operate', '']) {
      const { error } = await client.from('projects').update({ loop_stage: bad }).eq('id', projectId)
      expect(error?.code, bad).toBe('23514')
      expect(error?.message, bad).toContain('projects_loop_stage_check')
    }
    expect(await readLoopStage(client, projectId)).toBe('operate')
  })

  test('a write to a project that does not exist matches nothing and reports false', async () => {
    expect(await writeLoopStage(client, '00000000-0000-4000-8000-000000000000', 'exit')).toBe(false)
  })

  test('the decision on real membership rows: owner ok (200), member forbidden (403), non-member not_found (404)', async () => {
    const roleOf = async (userId: string) => {
      const { data, error } = await client
        .from('project_members')
        .select('role')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? { role: String(data.role) } : null
    }
    expect(loopStageWriteDecision(await roleOf(users.owner))).toBe('ok')
    expect(loopStageWriteDecision(await roleOf(users.member))).toBe('forbidden')
    expect(loopStageWriteDecision(await roleOf(users.outsider))).toBe('not_found')
  })

  test('no credential path can set it: no API route names the column', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.(ts|tsx)$/.test(name) && /loop_stage|loop-stage/.test(readFileSync(path, 'utf8')))
          offenders.push(path)
      }
    }
    walk(join(__dirname, '..', 'app', 'api'))
    expect(offenders).toEqual([])
  })
})
