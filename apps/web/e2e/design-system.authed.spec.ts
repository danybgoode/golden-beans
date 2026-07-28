import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug() {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the authed design smoke requires the auth-setup project')
  return slug
}

test('signed-in pages inherit the responsive Golden Beans product shell', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.goto('/app')
  expect(response?.status()).toBe(200)
  await expect(page).not.toHaveURL(/\/login/)

  await expect(page.locator('.product-shell__header')).toBeVisible()
  await expect(page.locator('.product-shell__header .brand-lockup')).toBeVisible()
  await expect(page.getByText('Watching growth')).toBeAttached()
  await expect(page.locator('main')).toContainText(tenantSlug())

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  await page.screenshot({ path: testInfo.outputPath('app-mobile.png') })
})
