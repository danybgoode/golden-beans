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
  // app-component-kit-adoption Sprint 3 — revoking now asks first. This is the one place in that
  // epic where "same behaviour" is deliberately suspended, and only in the direction of adding a
  // confirmation step: the operation itself, and its payload, are unchanged. So this spec gains a
  // click rather than losing an assertion, and it gains one that is worth having — the dialog must
  // name THIS key and say what stops, which is the whole point of the confirmation.
  await keyRow.getByRole('button', { name: 'Revoke' }).click()
  const confirm = page.locator('dialog.confirm-dialog')
  await expect(confirm).toContainText('Revoke catalog sync key backend catalog publisher?')
  await expect(confirm).toContainText('Catalog publishes from backend start failing')
  await confirm.getByRole('button', { name: 'Revoke' }).click()
  await expect(keyRow).toContainText('revoked')
})
