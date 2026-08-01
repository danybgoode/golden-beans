import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag-sync key smoke requires the auth-setup project')
  return slug
}

test('an owner can mint and revoke a separately sourced catalog sync key', async ({ page }) => {
  const slug = tenantSlug()
  await page.goto(`/app/flags/${slug}`)

  await page.getByLabel('Publisher source').fill('backend')
  await page.locator('#flag-sync-label').fill('backend catalog publisher')
  await page.getByRole('button', { name: 'Mint 30-day catalog sync key' }).click()

  const plaintextNotice = page.getByRole('alert').filter({ hasText: 'Copy this catalog sync key now' })
  await expect(plaintextNotice).toBeVisible()
  await expect(plaintextNotice.locator('pre')).not.toBeEmpty()
  await plaintextNotice.getByRole('button', { name: "I've saved it" }).click()

  const syncTable = page.locator('table').filter({ has: page.getByRole('columnheader', { name: 'Source' }) })
  const keyRow = syncTable.getByRole('row', { name: /backend catalog publisher backend/ })
  await expect(keyRow).toBeVisible()
  await keyRow.getByRole('button', { name: 'Revoke' }).click()
  await expect(keyRow).toContainText('revoked')
})
