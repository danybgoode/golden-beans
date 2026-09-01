import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

test('scenario evidence stays readable while every owner write control is dark', async ({ page }) => {
  test.skip(
    process.env.SCENARIO_AUTHORING_ENABLED === 'true',
    'dedicated dark-path pass requires SCENARIO_AUTHORING_ENABLED=false'
  )
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('scenario authoring dark smoke requires the auth-setup project')
  const response = await page.goto(`/app/scenarios/${slug}`)
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Scenarios & drills', exact: true })).toBeVisible()

  // ⚠️ **The page's ANSWER is readable with every write control dark, and that is now assertable
  // here.** The drill list is the first thing on the page and needs no disclosure — so a member who
  // cannot author anything still sees what held, what failed and what has never been run, which is
  // the property this spec's title claims and the old markup could only imply.
  await expect(page.locator('main .ds-listcard')).toBeVisible()

  // design-system-rails Story 5.6: the operating surface is one keystroke below the answer. The
  // evidence stays READABLE while dark, which is what this spec is for — it is one click further
  // away, not gone.
  await page.locator('main .ds-gaps > summary').click()
  await expect(page.getByRole('heading', { name: 'Canonical product-impact evidence' })).toBeVisible()

  // ...and every write control is still absent, INSIDE the opened disclosure. Asserting this before
  // opening it would have passed for the wrong reason — a control hidden behind a collapsed
  // `<details>` is not a control that does not exist, and this spec's whole subject is the
  // difference.
  await expect(page.getByRole('heading', { name: 'Define a scenario' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Launch run|Stop run|Revoke/ })).toHaveCount(0)
})
