import { test, expect } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import { disposableSession, type DisposableSession } from './helpers/disposable-session'

// portfolio-view · Sprint 2 (Roadmap/02-commercial/portfolio-view — the Architecture lock, D1, D2, D5, D11, D12, C2).
//
// Signed in as a DISPOSABLE person (never the shared fixture user: giving that user a second product in one workspace
// would send every other authed spec's `/app` to the portfolio — LEARNINGS, workspaces 2026-10-01).
//
// The person holds two products in ONE workspace — one as owner, one as member — and that workspace also holds a
// SIBLING product they are NOT a member of. The sibling is the teeth: `getWorkspaceProjects()` is the only thing that
// keeps it off the page, so swapping the legal read for "every project in the workspace" turns this red (LEARNINGS,
// board-sinks S4: mutate the one legal read itself).

type Extra = { projects: string[]; users: string[] }

async function seedTwoProductWorkspace(session: DisposableSession, extra: Extra) {
  const { db, userId } = session
  const { data: home, error } = await db
    .from('project_members')
    .select('projects(id, slug, workspace_id)')
    .eq('user_id', userId)
    .single()
  if (error || !home) throw new Error(`home project: ${error?.message}`)
  const owned = home.projects as unknown as { id: string; slug: string; workspace_id: string }

  const insertProject = async (label: string, memberId: string, role: 'owner' | 'member') => {
    const slug = `pf-${label}-${randomBytes(4).toString('hex')}`
    const { data, error: projectError } = await db
      .from('projects')
      .insert({ slug, api_key_hash: null, workspace_id: owned.workspace_id })
      .select('id')
      .single()
    if (projectError || !data) throw new Error(`project: ${projectError?.message}`)
    extra.projects.push(data.id as string)
    const { error: memberError } = await db
      .from('project_members')
      .insert({ user_id: memberId, project_id: data.id, role })
    if (memberError) throw new Error(`member: ${memberError.message}`)
    return { id: data.id as string, slug }
  }

  const memberOf = await insertProject('member', userId, 'member')
  const { data: stranger, error: strangerError } = await db.auth.admin.createUser({
    email: `pf-stranger-${randomBytes(6).toString('hex')}@example.test`,
    email_confirm: true,
  })
  if (strangerError || !stranger.user) throw new Error(`stranger: ${strangerError?.message}`)
  extra.users.push(stranger.user.id)
  const sibling = await insertProject('sibling', stranger.user.id, 'owner')
  return { owned, memberOf, sibling, workspaceId: owned.workspace_id }
}

async function removeExtra(session: DisposableSession, extra: Extra) {
  const { db } = session
  if (extra.projects.length) {
    await db.from('project_members').delete().in('project_id', extra.projects)
    await db.from('projects').delete().in('id', extra.projects)
  }
  for (const id of extra.users) {
    await db.from('workspace_members').delete().eq('user_id', id)
    await db.auth.admin.deleteUser(id)
  }
}

test('2+ products: bare /app opens on the portfolio — one row per product of mine, the sibling never shown', async ({
  browser,
}) => {
  const session = await disposableSession(browser, 'owner')
  const extra: Extra = { projects: [], users: [] }
  try {
    const { owned, memberOf, sibling } = await seedTwoProductWorkspace(session, extra)
    const { page } = session

    await page.goto('/app')
    await expect(page).toHaveURL(/\/app\/portfolio$/)
    const main = page.locator('main [data-portfolio-state="portfolio"]')
    await expect(page.locator('main h1')).toHaveText('Your workspace')

    // CONTROL first: both of mine are there, so an empty page cannot pass the absence check below.
    await expect(main.locator(`[data-product="${owned.slug}"]`)).toBeVisible()
    await expect(main.locator(`[data-product="${memberOf.slug}"]`)).toBeVisible()
    await expect(main.locator('[data-product]')).toHaveCount(2)
    await expect(main.locator(`[data-product="${sibling.slug}"]`)).toHaveCount(0)
    await expect(main).not.toContainText(sibling.slug)

    // The approved columns, in order.
    await expect(main.locator('.ds-table-head [role="columnheader"]')).toHaveText([
      'Product',
      'Loop',
      'North Star',
      'Funnel',
      'Running',
      'Lead time',
      'Spend vs quote',
    ])
    // How it LOOKS, not only what it says: a row is ONE line of cells side by side, left to right — not a stack. Every
    // cell starts right of the one before it, and all seven cross one horizontal line.
    const row = main.locator('.ds-table-row').first()
    const boxes = await row.locator('[role="cell"]').evaluateAll((cells) =>
      cells.map((cell) => {
        const { left, right, top, bottom } = cell.getBoundingClientRect()
        return { left, right, top, bottom }
      })
    )
    expect(boxes).toHaveLength(7)
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 1)
    expect(Math.max(...boxes.map((b) => b.top))).toBeLessThan(Math.min(...boxes.map((b) => b.bottom)))

    // D2: a fresh project has no North Star, no report, no quotes — each says so in words, never a 0.
    const ownedRow = main.locator('.ds-table-row', { has: page.locator(`[data-product="${owned.slug}"]`) })
    for (const column of ['north-star', 'lead-time', 'spend']) {
      const cell = ownedRow.locator(`[data-cell="${column}"]`)
      await expect(cell).toHaveAttribute('data-cell-tone', 'absent')
      await expect(cell).not.toContainText(/\d/)
    }
    await expect(ownedRow.locator('[data-cell="north-star"]')).toContainText('no North Star set')
    await expect(ownedRow.locator('[data-cell="spend"]')).toContainText('no quotes yet')

    // The switcher's Today link for one product still reaches Today — the redirect is for a bare /app only (C2).
    await page.goto(`/app?project=${owned.slug}`)
    await expect(page).toHaveURL(new RegExp(`/app\\?project=${owned.slug}$`))
    await expect(page.locator('main h1')).toHaveText('Today')
  } finally {
    await removeExtra(session, extra)
    await session.cleanup()
  }
})

test('the loop: an owner places a product from its row; a member sees the stage read-only', async ({
  browser,
}) => {
  const session = await disposableSession(browser, 'owner')
  const extra: Extra = { projects: [], users: [] }
  try {
    const { owned, memberOf } = await seedTwoProductWorkspace(session, extra)
    const { page, db } = session
    await page.goto('/app/portfolio')
    const rowOf = (slug: string) =>
      page.locator('.ds-table-row', { has: page.locator(`[data-product="${slug}"]`) })

    // The approved `portfolio-loop-unbuilt` state: unplaced, with the owner's "Place it".
    const mine = rowOf(owned.slug)
    await expect(mine.locator('[data-loop-stage="unplaced"]')).toContainText('Not placed')
    await expect(mine.getByText('Place it')).toBeVisible()
    // The member's row: the same "Not placed", and no control at all.
    const theirs = rowOf(memberOf.slug)
    await expect(theirs.locator('[data-loop-stage="unplaced"]')).toContainText('Not placed')
    await expect(theirs.locator('form')).toHaveCount(0)
    await expect(theirs.getByText('Place it')).toHaveCount(0)

    await mine.getByText('Place it').click()
    await expect(mine.locator('details')).toHaveAttribute('open', '')
    await mine.getByRole('menuitem', { name: 'Operate' }).click()
    await expect(rowOf(owned.slug).locator('[data-loop-stage="operate"]')).toContainText('Operate')
    // It was WRITTEN — the database holds the owner's choice, nothing inferred it.
    await expect
      .poll(
        async () =>
          (await db.from('projects').select('loop_stage').eq('id', owned.id).single()).data?.loop_stage
      )
      .toBe('operate')
    const { data: memberRow } = await db.from('projects').select('loop_stage').eq('id', memberOf.id).single()
    expect(memberRow?.loop_stage).toBeNull()
  } finally {
    await removeExtra(session, extra)
    await session.cleanup()
  }
})

test('one product: /app is unchanged, and the portfolio is its own empty state', async ({ browser }) => {
  const session = await disposableSession(browser, 'owner')
  try {
    const { page } = session
    await page.goto('/app')
    await expect(page).toHaveURL(/\/app$/)
    await expect(page.locator('main h1')).toHaveText('Today')

    await page.goto('/app/portfolio')
    const main = page.locator('main [data-portfolio-state="empty"]')
    await expect(main).toContainText('Your workspace has one product.')
    await expect(main).toContainText('The portfolio appears when you add a second.')
  } finally {
    await session.cleanup()
  }
})

test('a workspace that is not mine is not found — a real one and a malformed one alike', async ({
  browser,
}) => {
  const session = await disposableSession(browser, 'owner')
  const foreign = await session.db.from('workspaces').insert({ name: 'pf foreign' }).select('id').single()
  try {
    const { page } = session
    for (const id of [foreign.data!.id as string, 'not-a-uuid']) {
      const response = await page.goto(`/app/portfolio?workspace=${id}`)
      expect(response?.status(), id).toBe(404)
    }
  } finally {
    await session.db.from('workspaces').delete().eq('id', foreign.data!.id)
    await session.cleanup()
  }
})
