import { test, expect } from '@playwright/test'

// The `browser` project — rendered UI an API call cannot see. Opt-in, not the gate.
// TEMPLATE FILL-IN: replace with your first browser-testable story's assertion.
test('home renders its status line', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('status')).toHaveText('The harness is wired.')
})
