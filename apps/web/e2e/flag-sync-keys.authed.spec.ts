import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag-sync key smoke requires the auth-setup project')
  return slug
}

/**
 * A catalog sync key, minted and revoked through the surface that owns it.
 *
 * ── The address changed for the third time, and following it is the point ─────────────────────
 * This spec drove the flags page. `flags-console-parity` Sprint 3 moved the controls to
 * `/app/flag-credentials/[slug]` and did not repoint it — `getByLabel('Publisher source')` would
 * have timed out, reading as a flake rather than as "this surface moved", and the credential
 * mint/revoke flow would have had ZERO automated coverage at the moment it became reachable at a new
 * URL. The spec was then made to branch on `FLAG_CONSOLE_ENABLED`, so it followed the move.
 *
 * **`design-system-rails` Story 4.5 moves it again, and removes the branch.** `/app/flag-credentials`
 * is a permanent redirect; every kind of credential is minted and revoked on Setup › Keys, which is
 * not gated on anything. There is one address now, so there is nothing to branch on — and a branch
 * with one live arm is a conditional that reads like a decision while making none.
 *
 * Skipping this instead would be the cheap answer and the wrong one: these controls still exist, they
 * only changed address again. Every property below is unchanged — a real mint, a value shown once, a
 * confirmation that NAMES the key and says what stops working, and a real revoke.
 */
test('an owner can mint and revoke a separately sourced catalog sync key', async ({ page }) => {
  const slug = tenantSlug()
  const label = `backend catalog publisher ${Date.now()}`
  await page.goto(`/app/setup/keys/${slug}`)

  // ── Mint ────────────────────────────────────────────────────────────────────────────────────
  // The picker is a list of JOBS, not of scopes: nobody thinks "I need a flag_sync credential".
  await page.getByRole('button', { name: '+ New key' }).click()
  await page.getByRole('button', { name: 'Catalog sync key' }).click()
  // The one extra input this kind asks for — the whole reason the four forms could not simply be
  // merged, and the reason `CREDENTIAL_MINT_FIELD` exists.
  await page.getByLabel('Which publisher').fill('backend')
  await page.getByLabel('What to call it').fill(label)
  await page.getByRole('button', { name: /Create the catalog sync key/i }).click()

  // ── The value is shown ONCE, on a screen of its own, with a copy button ─────────────────────
  const reveal = page.getByRole('alert').filter({ hasText: 'Copy this key now' })
  await expect(reveal).toBeVisible()
  // A real value, not an empty field beside a Copy button — which would read as "your key is blank".
  await expect(reveal.locator('code')).not.toBeEmpty()
  await expect(reveal.getByRole('button', { name: 'Copy your new key' })).toBeVisible()
  // ⚠️ And the form is GONE while the value is on screen. A form still visible beside a credential
  // invites a second mint, and a second live credential is the most expensive mistake this page can
  // make.
  await expect(page.getByRole('button', { name: /Create the catalog sync key/i })).toHaveCount(0)
  await reveal.getByRole('button', { name: "I've saved it" }).click()
  await page.waitForLoadState('networkidle')

  // ── The row, in the one list ────────────────────────────────────────────────────────────────
  const row = page.getByRole('row').filter({ hasText: label })
  await expect(row).toBeVisible()
  // Its SOURCE is on the row, because "which publisher" is what tells two sync keys apart.
  await expect(row).toContainText('backend')

  // ── Revoke, which asks first ────────────────────────────────────────────────────────────────
  // The dialog must name THIS key and say what stops working — that is the whole point of the
  // confirmation, and a generic "Are you sure?" would satisfy the click and none of the purpose.
  await row.getByRole('button', { name: `Revoke ${label}` }).click()
  const confirm = page.locator('dialog.confirm-dialog')
  await expect(confirm).toContainText(`Revoke catalog sync key ${label}?`)
  await expect(confirm).toContainText('can no longer register feature definitions')
  await confirm.getByRole('button', { name: 'Revoke' }).click()
  await page.waitForLoadState('networkidle')

  // ⚠️ GONE, not "revoked". The merged page lists what has access NOW and drops revoked rows
  // entirely — which is a stronger assertion than a status cell, because a row that stayed with the
  // wrong word in it would still pass a text check.
  await expect(page.getByRole('row').filter({ hasText: label })).toHaveCount(0)
})
