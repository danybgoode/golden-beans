import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

test('an owner gets closed authoring choices and live blast-radius validation', async ({ page }) => {
  test.skip(
    process.env.SCENARIO_AUTHORING_ENABLED !== 'true',
    'set SCENARIO_AUTHORING_ENABLED=true to smoke the owner authoring workspace'
  )
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('scenario authoring smoke requires the auth-setup project')
  await page.goto(`/app/scenarios/${slug}`)

  await expect(page.getByRole('heading', { name: 'Define a scenario' })).toBeVisible()
  const cohort = page.getByLabel('Cohort')
  await expect(cohort.locator('option')).toHaveText(['synthetic', 'internal'])
  await expect(cohort.locator('option', { hasText: 'external' })).toHaveCount(0)
  await expect(page.getByLabel('Fault', { exact: true }).locator('option')).toHaveText([
    'none',
    'delay',
    'synthetic_error',
  ])

  await page.getByLabel('Request cap').fill('3')
  await page.getByLabel('Concurrency cap').fill('4')
  await expect(page.getByText('Concurrency cannot exceed the request cap.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save definition' })).toBeDisabled()
})
