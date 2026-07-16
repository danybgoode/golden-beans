import { test, expect } from '@playwright/test'

// Story 1.1 (commercial-shell/sprint-1.md) — "mobile-clean (no horizontal overflow)" is a
// rendered-layout fact the `api` project's request fixture structurally can't see (no browser,
// no layout engine). First spec in the `browser` project (opt-in, not part of the CI gate — see
// e2e/README.md); full visual/brand review stays the manual smoke owed to Daniel.
test('landing renders without horizontal overflow at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.locator('nav.gb')).toBeVisible()
  await expect(page.locator('h1')).toBeVisible()

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})
