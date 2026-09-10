import { test, expect } from '@playwright/test'
import {
  readTenantRecord,
  SCENARIO_FIXTURE_KEY,
  SCENARIO_TARGET_KEY,
  SCENARIO_UNDISCLOSED_KEY,
} from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the authed scenario smoke requires the auth-setup project')
  return slug
}

test('a project member can inspect the tenant-scoped scenario operating lens', async ({ page }) => {
  const slug = tenantSlug()
  // ⚠️ **Discovered through the SECTION, not through a list on `/app`.** Today used to end in a
  // `<ul>` of every surface; the approved `today` state has none, because the shell's section nav is
  // the navigation (Story 5.2). The property this line defends — a member can find this page without
  // being told the URL — is unchanged, so it is asserted through what a person actually clicks: the
  // Measure tab, and then the rail.
  await page.goto('/app')
  const measure = page.getByRole('link', { name: 'Measure', exact: true })
  await expect(measure).toBeVisible()
  await measure.click()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('link', { name: 'Scenarios & drills' })).toBeVisible()

  const response = await page.goto(`/app/scenarios/${slug}`)
  expect(response?.status()).toBe(200)
  // ⚠️ `Scenarios & drills` — design-system-rails Story 5.6 renamed the page to the word the
  // approved rail and the approved state both use. A "breaker" is the mechanism; a "drill" is the
  // thing you run, and audit §6.4's whole point is that this is a tool rather than a log. The
  // breakers are still here, still named, one keystroke below.
  await expect(page.getByRole('heading', { name: 'Scenarios & drills', exact: true })).toBeVisible()
  // ⚠️ **The operating surface is behind the approved `▸ Run a drill` control now, not a
  // disclosure** (`mockups-as-built` Story 2.2). The disclosure this used to open no longer exists;
  // everything asserted below is unchanged, and opening the dialog is the same one extra step.
  await page.getByRole('button', { name: '▸ Run a drill' }).click()
  await expect(page.getByRole('cell', { name: SCENARIO_TARGET_KEY, exact: true })).toBeVisible()
  await expect(page.getByText(`${SCENARIO_FIXTURE_KEY} v1`, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(`${SCENARIO_UNDISCLOSED_KEY} v1`, { exact: true }).first()).toBeVisible()
  // The breaker record stays with the operating surface: a trip belongs to a POLICY, and
  // `ScenarioDashboardTrip` carries no scenario key to file it under a drill (Story 2.5).
  await expect(page.getByText('No breaker trips recorded.')).toBeVisible()
  await page.keyboard.press('Escape')

  // ⚠️ **The impact evidence moved to the DRILL'S OWN ROW** — Story 2.5, Daniel's ruling of
  // 2026-09-10. It is read-only evidence and no longer sits behind a control that says it authors,
  // so the member's lens reaches it without opening a write surface at all. Asserted here in the
  // same spec that asserts the operating surface, because "a member can inspect the lens" is one
  // claim about two controls now.
  await page.locator('main .ds-listcard').getByRole('button', { name: 'Evidence' }).first().click()
  // ⚠️ Scoped to the OPEN dialog. Every drill row carries its own evidence dialog, and a closed
  // `<dialog>`'s children are still in the document — so an unscoped `getByText` matches one per
  // drill and Playwright's strict mode rejects the ambiguity before it ever checks visibility.
  await expect(
    page.locator('dialog[open]').getByText('No impact snapshots captured for this drill.')
  ).toBeVisible()
})

test('a signed-in user cannot use the scenario lens to confirm a foreign tenant', async ({ page }) => {
  const response = await page.goto('/app/scenarios/not-a-member-project')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /Scenarios & breakers/ })).toHaveCount(0)
})
