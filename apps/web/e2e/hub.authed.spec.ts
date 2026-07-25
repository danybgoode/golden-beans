import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// pod-report · Sprint 1 — the SIGNED-IN browser smoke for the hub.
//
// ── What this covers that the api project structurally cannot ─────────────────────────────────
// e2e/hub.spec.ts already asserts the hub's HTML over HTTP, but only for the DEMO tenant, because
// that is the one slug readable without a session (AGENTS rule #2). Everything a real customer
// sees — their own tenant, behind a real login, in a real browser — was previously only checkable
// by hand. That is precisely the "browser smoke owed to the product owner" WAYS-OF-WORKING says a
// browser spec is allowed to replace.
//
// The session comes from auth.setup.ts via storageState: a disposable user provisioned for this
// run, signed in through the REAL login form, and deleted by auth.teardown.ts afterwards.

// ── Read the fixture LAZILY, inside each test — never at module scope ─────────────────────────
// Playwright loads every spec file to COLLECT tests before it runs anything, including the
// auth-setup project that writes this record. A module-scope `readTenantRecord()` therefore always
// sees the file as missing, and a module-scope `test.skip(...)` on that value silently skips the
// entire file — which reports as a green run that asserted nothing. That is exactly the failure
// this rail exists to prevent, and it is how the first version of this file behaved.
//
// Reading at test time also means a missing fixture FAILS loudly rather than skipping: if the
// harness is invoked correctly, the record must exist, and its absence is a real problem to
// surface, not a condition to tiptoe around.
function tenant() {
  const record = readTenantRecord()
  if (!record?.slug) {
    throw new Error(
      'no provisioned tenant record — run `npm run test:e2e:authed` (the `authed` project depends ' +
        'on `auth-setup`, which provisions it). Running the spec file directly skips that step.'
    )
  }
  return record
}

test('a signed-in owner reaches their OWN hub, not just the public demo', async ({ page }) => {
  const res = await page.goto(`/hub/${tenant().slug}`)
  // The api project cannot make this assertion at all: an unauthenticated request to this slug
  // redirects to /login, so 200-here is only reachable with a real session.
  expect(res?.status()).toBe(200)
  await expect(page).not.toHaveURL(/\/login/)

  // Assert the page IDENTIFIES this tenant, without pinning how. The slug is rendered inside a
  // kicker alongside other text ("Roadmap Hub · <slug>"), so an exact-text locator fails on
  // presentation rather than on behaviour — and a spec that breaks when a label is reworded is a
  // spec people learn to edit reflexively instead of read.
  await expect(page.locator('body')).toContainText(tenant().slug!)
})

test('a brand-new tenant sees the deliberate empty state, and it renders as a real page', async ({
  page,
}) => {
  // A freshly provisioned tenant has pushed no roadmap, so this is the one moment the empty state
  // is genuinely reachable end-to-end — artifacts are append-only, so after any push it is gone for
  // that tenant forever. Worth asserting in a browser: "renders as a real page" means the heading
  // is actually visible, not merely present in the HTML string.
  await page.goto(`/hub/${tenant().slug}`)
  const empty = page.getByTestId('hub-empty-state')
  await expect(empty).toBeVisible()
  await expect(empty).toContainText('No roadmap pushed yet')
  // It must tell the reader how to fix it — an empty state that only says "nothing here" is the
  // broken-looking zero this design deliberately avoids.
  await expect(empty).toContainText('roadmap-push.mjs')
})

test('the horizon renders destinations and never claims a destination is lit on an empty roadmap', async ({
  page,
}) => {
  await page.goto(`/hub/${tenant().slug}/horizon`)
  await expect(page).not.toHaveURL(/\/login/)

  // With nothing pushed, the page still shows the DESTINATIONS (the horizon is not a backlog), and
  // none of them may claim ✅ — the poster rule, asserted against rendered pixels rather than a
  // derived object.
  //
  // The branch is resolved by WAITING for either outcome first, never by a bare `isVisible()`.
  // Cross-review caught that: `isVisible()` is an instantaneous probe with none of Playwright's
  // web-first auto-retry, so a few milliseconds of hydration makes it return false, the test falls
  // into the else-branch, and it times out hunting for destination cards that were never going to
  // be there. Racing the two locators gives each branch the full retry budget and makes the choice
  // deterministic.
  const empty = page.getByTestId('hub-empty-state')
  const destinations = page.locator('[data-status]')
  await expect(empty.or(destinations.first())).toBeVisible()

  if ((await empty.count()) > 0) {
    await expect(empty).toContainText('No roadmap pushed yet')
  } else {
    await expect(destinations.first()).toBeVisible()
    await expect(page.locator('[data-status="lit"]')).toHaveCount(0)
  }
})

test('the hub has no horizontal overflow at 390px', async ({ page }) => {
  // A rendered-layout fact no API call can see, matching the existing landing/install browser
  // specs' shape. The hub is the surface Sprint 3 shares with clients and investors, and a
  // sideways-scrolling page on a phone is exactly the impression that costs a deal.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/hub/${tenant().slug}`)

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
})

test('signing out actually ends the session — the hub stops being reachable', async ({ page, context }) => {
  // The other half of authentication, and the half almost never tested: a logout that clears the UI
  // but leaves the session cookie valid looks identical to a real one until someone reopens the
  // tab. Asserted by clearing cookies and re-requesting, which is what a returning visitor's
  // browser effectively does once the session is gone.
  await page.goto(`/hub/${tenant().slug}`)
  await expect(page).not.toHaveURL(/\/login/)

  await context.clearCookies()
  await page.goto(`/hub/${tenant().slug}`)
  await expect(page).toHaveURL(/\/login/)
})
