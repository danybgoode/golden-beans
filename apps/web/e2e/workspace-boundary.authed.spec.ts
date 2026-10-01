import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readTenantRecord } from './helpers/authed-fixture'
import { specWorkspaceId } from './helpers/spec-workspace'

// workspaces · Sprint 2, Story 2.2 — the CONSOLE family of the cross-workspace denial (the CLI and MCP families are
// e2e/workspace-boundary.spec.ts). A browser session cookie is what the console guards read, so this is an `authed`
// spec, signed in as the disposable fixture user; CI runs the authed project in its gate.
//
// Same state as the api spec, for the same reason: the signed-in person OWNS the project and is then removed from its
// workspace. Only the workspace check can deny that. The CONTROL is asserted first.

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

test.describe('S2.2 — console routes re-check the workspace', () => {
  test('a project I own in a workspace I left is a 404 on both console guards, and leaves my switcher', async ({
    page,
  }) => {
    const tenant = readTenantRecord()
    if (!tenant) throw new Error('auth.setup has not run — no signed-in fixture user')
    const client = db()

    const workspaceId = await specWorkspaceId(client, 'console boundary')
    const slug = `ws-console-${randomBytes(5).toString('hex')}`
    const { data: project, error } = await client
      .from('projects')
      .insert({ slug, api_key_hash: null, workspace_id: workspaceId })
      .select('id')
      .single()
    if (error || !project) throw new Error(`project: ${error?.message}`)

    try {
      await client
        .from('project_members')
        .insert({ user_id: tenant.userId, project_id: project.id, role: 'owner' })

      // CONTROL — inside the workspace, both guards let the owner in.
      for (const path of [`/hub/${slug}`, `/app/tasks/${slug}`]) {
        const response = await page.goto(path)
        expect(response?.status(), `CONTROL ${path}`).toBe(200)
      }

      await client
        .from('workspace_members')
        .delete()
        .eq('workspace_id', workspaceId)
        .eq('user_id', tenant.userId)

      // requireDashboardAccess (/hub) and requireProjectMembership (/app/tasks): "not found", never "forbidden".
      for (const path of [`/hub/${slug}`, `/app/tasks/${slug}`]) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(404)
      }

      // And the switcher no longer offers it — getUserProjects re-checks too (lock D9).
      await page.goto('/app')
      await expect(page.locator(`a[href*="${slug}"]`)).toHaveCount(0)
    } finally {
      await client.from('project_members').delete().eq('project_id', project.id)
      await client.from('projects').delete().eq('id', project.id)
      await client.from('workspaces').delete().eq('id', workspaceId)
    }
  })
})
