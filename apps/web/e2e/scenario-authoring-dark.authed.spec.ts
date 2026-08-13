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
  await expect(page.getByRole('heading', { name: `Scenarios & breakers — ${slug}` })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Canonical product-impact evidence' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Define a scenario' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Launch run|Stop run|Revoke/ })).toHaveCount(0)
})
