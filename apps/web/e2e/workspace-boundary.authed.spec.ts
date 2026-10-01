import { test, expect } from '@playwright/test'
import { disposableSession } from './helpers/disposable-session'

// workspaces · Sprint 2, Story 2.2 — the CONSOLE family of the cross-workspace denial (the CLI and MCP families are
// e2e/workspace-boundary.spec.ts). A browser session cookie is what the console guards read, so this is an `authed`
// spec; CI runs the authed project in its gate.
//
// Signed in as a DISPOSABLE person of its own (helpers/disposable-session.ts), never the shared fixture user: other
// authed specs read that user's `/app` in parallel (fresh reviewer, PR #221).
//
// The person owns TWO projects, each in its own workspace, and is then removed from the second one's workspace.
// Only the workspace check can deny that. Two projects, not one, because with one the switcher renders a label and
// not a link — and a "the link is gone" assertion that could never have found a link proves nothing.

test.describe('S2.2 — console routes re-check the workspace', () => {
  test('a project I own in a workspace I left is a 404 on both console guards, and leaves my switcher', async ({
    browser,
  }) => {
    const session = await disposableSession(browser)
    try {
      const { page, db, userId } = session
      const left = await session.addProject('owner', 'console boundary')

      // CONTROL — inside the workspace: both guards let the owner in, and the switcher offers it.
      for (const path of [`/hub/${left.slug}`, `/app/tasks/${left.slug}`]) {
        const response = await page.goto(path)
        expect(response?.status(), `CONTROL ${path}`).toBe(200)
      }
      await page.goto('/app')
      await expect(page.locator(`.ds-shell-switcher a[href*="${left.slug}"]`)).toHaveCount(1)

      const { error } = await db
        .from('workspace_members')
        .delete()
        .eq('workspace_id', left.workspaceId)
        .eq('user_id', userId)
      if (error) throw new Error(error.message)

      // requireDashboardAccess (/hub) and requireProjectMembership (/app/tasks): "not found", never "forbidden".
      for (const path of [`/hub/${left.slug}`, `/app/tasks/${left.slug}`]) {
        const response = await page.goto(path)
        expect(response?.status(), path).toBe(404)
      }

      // And the switcher no longer offers it — getUserProjects re-checks too (lock D9). With one project left the
      // switcher is a label, so assert on the whole shell, not only on menu links.
      await page.goto('/app')
      // Positive half first: the home project the person still has renders as the single-project label.
      await expect(page.locator('.ds-shell-header [data-project]')).toHaveCount(1)
      await expect(page.locator(`[href*="${left.slug}"], [data-project="${left.slug}"]`)).toHaveCount(0)
    } finally {
      await session.cleanup()
    }
  })
})
