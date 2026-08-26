import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { isFlagConsoleEnabled } from '../lib/flags'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag-sync key smoke requires the auth-setup project')
  return slug
}

/**
 * Where the catalog sync controls live, which depends on the gate.
 *
 * ── Why this FOLLOWS the move instead of skipping ─────────────────────────────────────────────
 * flags-console-parity Sprint 3 moved the mint/revoke controls to `/app/flag-credentials/[slug]`
 * when `FLAG_CONSOLE_ENABLED` is on. This spec drove them on the flags page, and Sprint 3 did not
 * repoint it — so with the gate on `getByLabel('Publisher source')` would have timed out, reading
 * as a flake rather than as "this surface moved", and the credential mint/revoke flow would have
 * had ZERO automated coverage at exactly the moment it became reachable at a new URL. Found by the
 * fresh HIGH-tier reviewer on PR #121; it is the FOURTH time in this epic that something was nearly
 * lost because its replacement landed elsewhere.
 *
 * Skipping it (as Sprint 2 did for the three rule-builder suites) would have been the cheap answer
 * and the wrong one here: those suites drive a surface that is being RETIRED, whereas these controls
 * still exist — they only changed address. Every selector below is unchanged on the new route, so
 * following the URL keeps the assertions honest in both states rather than trading one for the other.
 */
function credentialsPath(slug: string): string {
  return isFlagConsoleEnabled() ? `/app/flag-credentials/${slug}` : `/app/flags/${slug}`
}

test('an owner can mint and revoke a separately sourced catalog sync key', async ({ page }) => {
  const slug = tenantSlug()
  await page.goto(credentialsPath(slug))

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
