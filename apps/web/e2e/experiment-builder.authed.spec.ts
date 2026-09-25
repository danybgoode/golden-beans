import { expect, test } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

test.describe('experiment builder', () => {
  test.skip(process.env.EXPERIMENT_BUILDER_ENABLED !== 'true', 'the experiment builder is gated')

  test('owner can review and save an answers-only draft', async ({ page }) => {
    const tenant = readTenantRecord()
    expect(tenant?.slug, 'authed fixture must provide a project slug').toBeTruthy()
    await page.goto(`/app/experiments/${tenant!.slug}`)
    await page.getByRole('button', { name: /new experiment|continue new experiment/i }).click()
    const dialog = page.locator('dialog.ds-dialog')
    await expect(dialog).toBeVisible()
    await expect(
      dialog
        .getByRole('button')
        .filter({ hasText: /What & why|Who's in it|What they see|How you'll know|How long|Review/ })
    ).toHaveCount(6)
    await expect(dialog.locator('textarea')).toHaveCount(0)
    await expect(dialog.locator('input:not([type=range])')).toHaveCount(0)
    await expect(dialog.locator('details')).toHaveCount(0)
    for (const label of ['Continue', 'Continue', 'Continue', 'Continue', 'Review'])
      await dialog.getByRole('button', { name: label, exact: true }).click()
    await expect(dialog.locator('.ds-x-big-sentence')).toBeVisible()
    await expect(dialog.locator('.ds-x-check')).toHaveCount(6)
    await dialog.getByRole('button', { name: 'Save draft', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('saved as a draft')
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible()
  })
})
