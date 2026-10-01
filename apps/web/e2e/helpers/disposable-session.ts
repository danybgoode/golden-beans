import { expect, type Browser, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { FIXTURE_EMAIL_DOMAIN, FIXTURE_PREFIX } from './fixture-sweep'
import { specWorkspaceId } from './spec-workspace'

// workspaces S2 (fresh reviewer, PR #221) — a signed-in person of the spec's OWN, for authed specs that add projects
// to whoever is signed in. The shared fixture user (auth.setup.ts) is read by every other authed spec in parallel, and
// `/app` renders that user's FIRST project: a spec that hands the shared user a second project changes what the specs
// running beside it see. So these specs sign in their own disposable user through the same real form auth.setup uses.

export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to run this spec')
  return createClient(url, key, { auth: { persistSession: false } })
}

export type DisposableSession = {
  page: Page
  userId: string
  db: SupabaseClient
  /** A project in a NEW workspace, with this person as `role` — the trigger places them inside the workspace. */
  addProject: (
    role: 'owner' | 'member',
    label: string
  ) => Promise<{ id: string; slug: string; workspaceId: string }>
  cleanup: () => Promise<void>
}

/**
 * A fresh auth user, signed in through /login in a context of its own. Create its projects with `addProject` BEFORE
 * the first `/app` visit you assert on — with none, `/app` would provision one.
 */
export async function disposableSession(
  browser: Browser,
  firstProject: 'owner' | 'member' = 'owner'
): Promise<DisposableSession> {
  const db = serviceClient()
  // The fixture shape the teardown's orphan sweep recognises, so a crashed run's user is still removed later.
  const email = `${FIXTURE_PREFIX}+ws-${randomBytes(6).toString('hex')}${FIXTURE_EMAIL_DOMAIN}`
  const password = `pw-${randomBytes(12).toString('hex')}`
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`disposableSession: ${error?.message}`)
  const userId = data.user.id
  const projects: string[] = []
  const workspaces: string[] = []

  const addProject: DisposableSession['addProject'] = async (role, label) => {
    const workspaceId = await specWorkspaceId(db, label)
    workspaces.push(workspaceId)
    const slug = `ws-e2e-${randomBytes(5).toString('hex')}`
    const { data: project, error: projectError } = await db
      .from('projects')
      .insert({ slug, api_key_hash: null, workspace_id: workspaceId })
      .select('id')
      .single()
    if (projectError || !project) throw new Error(`addProject: ${projectError?.message}`)
    projects.push(project.id as string)
    const { error: memberError } = await db
      .from('project_members')
      .insert({ user_id: userId, project_id: project.id, role })
    if (memberError) throw new Error(`addProject member: ${memberError.message}`)
    return { id: project.id as string, slug, workspaceId }
  }

  // One project before signing in, so the login's landing on /app never provisions.
  await addProject(firstProject, 'disposable home')

  // EMPTY storage, explicitly: in the authed project a new context inherits the shared fixture user's signed-in
  // storageState, and /login would bounce straight to /app as THAT user.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 })
  await expect(page).not.toHaveURL(/\/login/)

  return {
    page,
    userId,
    db,
    addProject,
    cleanup: async () => {
      await context.close()
      if (projects.length) {
        await db.from('project_members').delete().in('project_id', projects)
        await db.from('projects').delete().in('id', projects)
      }
      if (workspaces.length) await db.from('workspaces').delete().in('id', workspaces)
      await db.auth.admin.deleteUser(userId)
    },
  }
}
