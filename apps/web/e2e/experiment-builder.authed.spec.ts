import { expect, test } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { db, project } from './helpers/experiment-owner-project'
import { cleanupExperimentProjects } from './helpers/test-db-cleanup'

// The builder saves in a project of its OWN (helpers/experiment-owner-project.ts): a save writes
// flag versions and audit reasons, and the shared authed tenant's audit is asserted by a sibling spec.
test.describe('experiment builder', () => {
  test.skip(process.env.EXPERIMENT_BUILDER_ENABLED !== 'true', 'the experiment builder is gated')
  const created: string[] = []
  test.afterAll(async () => {
    await cleanupExperimentProjects(created)
  })

  test('owner can review and save an answers-only draft', async ({ page }) => {
    const tenant = readTenantRecord()
    expect(tenant?.userId, 'authed fixture must record its user').toBeTruthy()
    const fx = await project(db(), tenant!.userId)
    created.push(fx.projectId)
    await page.goto(`/app/experiments/${fx.slug}`)
    await page.getByRole('button', { name: /new experiment|continue new experiment/i }).click()
    const dialog = page.locator('dialog.ds-dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog
        .getByRole('button')
        .filter({ hasText: /What & why|Who's in it|What they see|How you'll know|How long|Review/ })
    ).toHaveCount(6)
    // D10 on EVERY step, not just the first: no text box, no free input, nothing folded away.
    const zeroInputs = async () => {
      await expect(dialog.locator('textarea')).toHaveCount(0)
      await expect(dialog.locator('input:not([type=range])')).toHaveCount(0)
      await expect(dialog.locator('details')).toHaveCount(0)
    }
    await zeroInputs()
    for (const label of ['Continue', 'Continue', 'Continue', 'Continue', 'Review']) {
      await dialog.getByRole('button', { name: label, exact: true }).click()
      await zeroInputs()
    }
    await expect(dialog.locator('.ds-x-big-sentence')).toBeVisible()
    await expect(dialog.locator('.ds-x-check')).toHaveCount(6)
    await dialog.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('saved as a draft')
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
    // Saved, the plan is a row — the header door is a NEW experiment again, not this draft forever.
    await expect(page.getByRole('button', { name: '+ New experiment', exact: true })).toBeVisible()
  })
})
