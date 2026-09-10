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
  // ⚠️ **Story 2.5 — the evidence opens from the DRILL'S OWN ROW, not from `▸ Run a drill`.**
  // Story 2.2 removed the disclosure and put everything behind the approved authoring control,
  // which satisfied D3 and left this spec's subject — a reader who cannot author — reaching the run
  // history through a button that says it starts something. Daniel ruled the identical case on
  // Destinations as per-row evidence separate from the authoring control (2026-09-09) and extended
  // it here on 2026-09-10.
  //
  // Asserting the ROW's control is what makes this spec's title true rather than nearly true: the
  // evidence is reachable without ever touching a write surface.
  await page.locator('main .ds-listcard').getByRole('button', { name: 'Evidence' }).first().click()
  // ⚠️ Scoped to the OPEN dialog: every drill row carries its own, and a closed `<dialog>`'s
  // children are still in the document.
  const evidence = page.locator('dialog[open]')
  await expect(evidence.getByRole('heading', { name: 'Canonical product-impact evidence' })).toBeVisible()
  await expect(evidence.getByRole('heading', { name: 'Runs' })).toBeVisible()

  // ...and the evidence dialog holds NO control. A read-only surface that grew a mutation would be
  // the split undone.
  await expect(page.getByRole('button', { name: /Launch run|Stop run|Revoke/ })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // ...and every write control is still absent inside the AUTHORING dialog too. Asserting this
  // before opening it would have passed for the wrong reason — a control behind a closed dialog is
  // not a control that does not exist, and this spec's whole subject is the difference.
  await page.getByRole('button', { name: '▸ Run a drill' }).click()
  await expect(page.getByRole('heading', { name: 'Define a scenario' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Launch run|Stop run|Revoke/ })).toHaveCount(0)
})
