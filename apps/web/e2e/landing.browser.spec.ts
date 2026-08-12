import { test, expect } from '@playwright/test'

// The landing's rendered-content contract.
//
// ── What moved OUT of this file, and why ──────────────────────────────────────────────────────
// This spec used to hold two hand-copied "no horizontal overflow at 390px" tests, one for `/` and
// one for `/install`. Both now live in `e2e/mobile-heuristics.browser.spec.ts`, which sweeps a
// LIST of routes and also checks the tap-target floor — so coverage went up, not down, and adding
// the next route is a row in an array rather than another copy of the same block. Keeping a third
// copy here would have been a second definition of "mobile-clean" that agrees today.
//
// What is left is the thing only this page can assert: that the v2 narrative actually rendered,
// and that the nav's promises resolve to real anchors.

test('the landing renders the v2 narrative', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('nav.gb')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your roadmap has')

  // Both copy-a-prompt blocks are present — the `#try` handoff prompt and the closing decision
  // prompt. These are the page's two "use this without an account" affordances and the only
  // interactive client components on it.
  await expect(page.locator('.prompt-card')).toHaveCount(2)
})

// Every nav link points at a section that exists. A dead in-page anchor is invisible to a
// type-checker, silently does nothing when clicked, and is exactly the kind of rot a redesign
// introduces — the nav was rewritten in the same commit as the section ids it points at.
test('every nav link resolves to a section on the page', async ({ page }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.landing-nav__links a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs.length).toBeGreaterThan(0)

  for (const href of hrefs) {
    expect(href, 'nav links are in-page anchors').toMatch(/^#/)
    await expect(page.locator(href), `${href} has no target on the page`).toHaveCount(1)
  }
})

// The hero's two CTAs are the page's primary actions, and both are in-page anchors rather than
// routes — so nothing type-checks them either.
test('the hero CTAs resolve to sections on the page', async ({ page }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.hero .hero-cta a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs).toEqual(['#connect', '#try'])

  for (const href of hrefs) {
    await expect(page.locator(href), `${href} has no target on the page`).toHaveCount(1)
  }
})
