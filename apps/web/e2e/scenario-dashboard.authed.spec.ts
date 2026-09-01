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
  // The operating surface moved behind a disclosure so the page opens on its answer. Everything
  // below is unchanged — opening it is the only new step.
  await page.locator('main .ds-gaps > summary').click()
  await expect(page.getByRole('cell', { name: SCENARIO_TARGET_KEY, exact: true })).toBeVisible()
  await expect(page.getByText(`${SCENARIO_FIXTURE_KEY} v1`, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(`${SCENARIO_UNDISCLOSED_KEY} v1`, { exact: true }).first()).toBeVisible()
  await expect(page.getByText('No impact snapshots captured.')).toBeVisible()
  await expect(page.getByText('No breaker trips recorded.')).toBeVisible()
})

test('a signed-in user cannot use the scenario lens to confirm a foreign tenant', async ({ page }) => {
  const response = await page.goto('/app/scenarios/not-a-member-project')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: /Scenarios & breakers/ })).toHaveCount(0)
})
