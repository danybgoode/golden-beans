// mockups-as-built · Story 3.5 — Activity names who acted, as the approved state draws it.
//
// The approved `ship-activity` state reads *"**Daniel** turned `ml.sync_enabled` off in
// Development"*. The product printed `actor_user_id`, a UUID, because no name existed anywhere.
// Daniel's ruling (2026-09-10): show the NAME when one is set, the EMAIL until then, and let an
// account set its name from the Account menu.
//
// ── Why one test and not three ────────────────────────────────────────────────────────────────
// The name lives on the ONE shared fixture user, and `fullyParallel` runs a file's tests across
// workers. Three tests would set and clear the same name concurrently and read each other's writes
// — a failure would look like a flake rather than a defect. One sequence, and the name is cleared
// in `finally` so no other spec ever sees it.
//
// ── What the fixture guarantees ───────────────────────────────────────────────────────────────
// `seedActivityFixture` writes 28 audit rows with the fixture user as the actor, so page 1 of
// Activity is twelve rows by the one person this test controls — the before/after is unambiguous.

import { test, expect, type Page } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { DISPLAY_NAME_MAX } from '../lib/display-name'

function tenant() {
  const record = readTenantRecord()
  if (!record?.slug) throw new Error('the actor-names spec requires the auth-setup project')
  return { slug: record.slug, userId: record.userId, email: record.email }
}

async function setNameFromAccountMenu(page: Page, name: string) {
  const menu = page.locator('details.ds-shell-account')
  // Open it only if it is closed — clicking the summary of an OPEN `<details>` closes it.
  if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click()
  await menu.getByLabel('Your name').fill(name)
  await menu.getByRole('button', { name: 'Save' }).click()
}

test('Activity names who acted: the email until a name is set, then the name', async ({ page }) => {
  const { slug, userId, email } = tenant()
  const activity = `/app/flag-audit/${slug}`
  const timeline = page.locator('.ds-timeline')
  const name = `Tester ${Date.now().toString(36)}`

  try {
    // ── Before: no name set, so the EMAIL — and never the raw id ────────────────────────────
    await page.goto(activity)
    await expect(timeline, 'the fixture seeded no audit rows, so this test proves nothing').toBeVisible()
    await expect(timeline, 'Activity does not show the email of an actor with no name').toContainText(email)
    // ⚠️ `toContainText` reads RENDERED text, which excludes attributes — so the id kept in each
    // actor's `title` (one hover away, deliberately) does not satisfy this, and a UUID printed in
    // the sentence does. That is exactly the regression this story removes.
    await expect(timeline, 'Activity still prints the raw actor id in the sentence').not.toContainText(userId)
    // ...and the id is still there for whoever needs the exact identity.
    await expect(timeline.locator(`b[title="${userId}"]`).first()).toBeVisible()

    // ── Set a name from the Account menu ─────────────────────────────────────────────────────
    await setNameFromAccountMenu(page, name)
    await expect(page.locator('details.ds-shell-account [role="status"]')).toHaveText('Saved.')

    // ── After: the NAME, in the approved sentence's place ───────────────────────────────────
    await page.goto(activity)
    await expect(timeline, 'Activity did not pick up the name the account set').toContainText(name)
    await expect(timeline, 'the name is set, yet Activity still shows the email').not.toContainText(email)

    // ── A name the rules refuse is refused BESIDE the field, and changes nothing ────────────
    await setNameFromAccountMenu(page, 'x'.repeat(DISPLAY_NAME_MAX + 1))
    await expect(page.locator('details.ds-shell-account [role="alert"]')).toContainText(
      `${DISPLAY_NAME_MAX} characters`
    )
    await page.goto(activity)
    await expect(timeline, 'a refused name still replaced the stored one').toContainText(name)
  } finally {
    // Cleared through the same control a person uses, so the fixture user leaves as it arrived.
    await page.goto(activity)
    await setNameFromAccountMenu(page, '')
    await expect(page.locator('details.ds-shell-account [role="status"]')).toHaveText('Saved.')
  }

  // Cleared means the EMAIL again — "no name" has one representation, and it is not a blank.
  await page.goto(activity)
  await expect(timeline).toContainText(email)
  await expect(timeline).not.toContainText(name)
})
