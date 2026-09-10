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

  // ⚠️ **The `<details>` is GONE — mockups-as-built Story 2.2.** The authoring surface opens from
  // the approved `▸ Run a drill` control as a modal (epic D8), and this spec kept clicking
  // `main .ds-gaps > summary` for a sprint. It did not go red in CI because CI runs the DARK half
  // of this pair (`SCENARIO_AUTHORING_ENABLED: 'false'`, `ci.yml`) and this test skips there — so
  // the only thing exercising the owner authoring path is `npm run test:e2e:local -- --authed`,
  // and it had been red locally since Story 2.2 merged. A suite outside the gate decays silently.
  await page.getByRole('button', { name: '▸ Run a drill' }).click()
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

  // ⚠️ **Scoped to the workspace, and it has to be.** The page's own list is an ARIA table too, so
  // `getByRole('row')` matches its row for this drill AND the workspace's — two elements, and
  // Playwright's strict mode rejects the ambiguity. Scoping is the right fix rather than loosening
  // the locator: this test is about the workspace's run controls, and the list row deliberately has
  // none.
  // Story 2.2: the operating surface is the `▸ Run a drill` modal, not a disclosure.
  await page.getByRole('button', { name: '▸ Run a drill' }).click()
  const workspace = page.locator('dialog[open] .ds-dialog-body')
  const runRow = workspace.getByRole('row').filter({ hasText: SCENARIO_UNDISCLOSED_KEY })
  await expect(runRow).toContainText('running')
  await runRow.getByRole('button', { name: 'Stop run' }).click()
  await page.getByLabel('Operation reason').fill('stop a running legacy undisclosed scenario safely')
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Stop', exact: true }).click()
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

  // Story 2.2: the operating surface is the `▸ Run a drill` modal, not a disclosure.
  await page.getByRole('button', { name: '▸ Run a drill' }).click()
  const definition = page
    .locator('dialog[open] .ds-dialog-body article')
    .filter({ hasText: `${SCENARIO_FIXTURE_KEY} v1` })
  await expect(definition.getByText('Payloads:')).toBeVisible()
  await expect(definition.getByText(/delay: 25ms delay/)).toBeVisible()
  await expect(definition.getByText(/source = "internal" → delay/)).toBeVisible()
  await definition.getByRole('button', { name: 'Launch run' }).click()
  // ⚠️ **Scoped to `.confirm-dialog`.** Story 2.2 made the authoring surface itself a `<dialog>`, so
  // `getByRole('dialog')` matches BOTH it and the confirmation inside it — and `{ name: 'Stop' }`
  // then also matched the run table's "Stopped" sort control and its "Stop run" button. The
  // confirmation has its own class; using it names the element this assertion is about.
  await expect(page.locator('.confirm-dialog')).toContainText('3 requests, 2 concurrent')
  await page.getByLabel('Operation reason').fill('exercise the owner launch and stop actions')
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Launch', exact: true }).click()
  await expect(page.getByText('Scenario run launched.')).toBeVisible()

  // Scoped to the workspace for the same reason as above: the page's own list is an ARIA table and
  // carries a row for this drill too.
  const runRow = page
    .locator('dialog[open] .ds-dialog-body')
    .getByRole('row')
    .filter({ hasText: SCENARIO_FIXTURE_KEY })
  await expect(runRow).toContainText('running')
  await runRow.getByRole('button', { name: 'Stop run' }).click()
  await page.getByLabel('Operation reason').fill('finish the owner browser exercise')
  await page.locator('.confirm-dialog').getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByText('Scenario run stopped.')).toBeVisible()
  await expect(runRow).toContainText('stopped')
  await expect(runRow).toContainText('finish the owner browser exercise')
})
