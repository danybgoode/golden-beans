import { test, expect } from '@playwright/test'
import { readTenantRecord, SCENARIO_FIXTURE_KEY, SCENARIO_UNDISCLOSED_KEY } from './helpers/authed-fixture'

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

test('an owner can stop a running legacy scenario even when its fault cannot be disclosed', async ({
  page,
}) => {
  test.skip(
    process.env.SCENARIO_AUTHORING_ENABLED !== 'true',
    'set SCENARIO_AUTHORING_ENABLED=true to smoke the owner authoring workspace'
  )
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('scenario authoring smoke requires the auth-setup project')
  await page.goto(`/app/scenarios/${slug}`)

  const runRow = page.getByRole('row').filter({ hasText: SCENARIO_UNDISCLOSED_KEY })
  await expect(runRow).toContainText('running')
  await runRow.getByRole('button', { name: 'Stop run' }).click()
  await page.getByLabel('Operation reason').fill('stop a running legacy undisclosed scenario safely')
  await page.getByRole('dialog').getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Scenario run stopped.')).toBeVisible()
  await expect(runRow).toContainText('stopped')
})

test('an owner launches and stops a disclosed synthetic run through the signed-in actions', async ({
  page,
}) => {
  test.skip(
    process.env.SCENARIO_AUTHORING_ENABLED !== 'true',
    'set SCENARIO_AUTHORING_ENABLED=true to smoke the owner authoring workspace'
  )
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('scenario authoring smoke requires the auth-setup project')
  await page.goto(`/app/scenarios/${slug}`)

  const definition = page.locator('article').filter({ hasText: `${SCENARIO_FIXTURE_KEY} v1` })
  await expect(definition.getByText('Payloads:')).toBeVisible()
  await expect(definition.getByText(/delay: 25ms delay/)).toBeVisible()
  await expect(definition.getByText(/source = "internal" → delay/)).toBeVisible()
  await definition.getByRole('button', { name: 'Launch run' }).click()
  await expect(page.getByRole('dialog')).toContainText('3 requests, 2 concurrent')
  await page.getByLabel('Operation reason').fill('exercise the owner launch and stop actions')
  await page.getByRole('dialog').getByRole('button', { name: 'Launch' }).click()
  await expect(page.getByText('Scenario run launched.')).toBeVisible()

  const runRow = page.getByRole('row').filter({ hasText: SCENARIO_FIXTURE_KEY })
  await expect(runRow).toContainText('running')
  await runRow.getByRole('button', { name: 'Stop run' }).click()
  await page.getByLabel('Operation reason').fill('finish the owner browser exercise')
  await page.getByRole('dialog').getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText('Scenario run stopped.')).toBeVisible()
  await expect(runRow).toContainText('stopped')
  await expect(runRow).toContainText('finish the owner browser exercise')
})
