import { expect, test } from '@playwright/test'
import { IMPACT_FEATURE_KEY, readTenantRecord } from './helpers/authed-fixture'
import { assertMobileClean } from './helpers/mobile-heuristics'
import { isConsoleShellEnabled, isFlagConsoleEnabled } from '../lib/flags'

// frijoles-rebrand-closeout · Story 1.4 — the signed-in half of the shared mobile rail.
//
// The anonymous browser project cannot cover these paths: every one redirects to /login and the
// helper would measure that page instead. This file runs only in Playwright's `authed` project,
// after auth-setup has created a disposable owner + tenant and saved a real session.

type AuthedRoute = { label: string; path: (slug: string) => string }

// Always-on owner surfaces only. Flag-gated pages have their own focused authed specs and would
// make this baseline depend on unrelated local gate values. The seeded impact route is included
// because it exercises the densest data layout, not just empty management tables.
const AUTHED_MOBILE_ROUTES: readonly AuthedRoute[] = [
  { label: 'command center', path: () => '/app' },
  { label: 'impact', path: (slug) => `/app/impact/${slug}/${IMPACT_FEATURE_KEY}` },
  { label: 'scenarios', path: (slug) => `/app/scenarios/${slug}` },
  { label: 'API keys', path: (slug) => `/app/keys/${slug}` },
  { label: 'destinations', path: (slug) => `/app/destinations/${slug}` },
  { label: 'share links', path: (slug) => `/app/shares/${slug}` },
  { label: 'agent write keys', path: (slug) => `/app/agent-keys/${slug}` },
  { label: 'onboarding', path: (slug) => `/app/onboarding/${slug}` },
  // flags-console-parity · Sprint 3, Story 3.4 — covering a new route is one array entry, which is
  // the point of this rail.
  //
  // ⚠️ GATED, and the comment that used to sit here was WRONG. It claimed the sweep "reports a clean
  // 404 page rather than a false pass" while the console is dark. There is no such code path: the
  // assertion below is `expect(status).toBe(200)`, so both entries simply FAILED — and because the
  // `authed` project is outside the merge gate, they would have failed silently until someone ran
  // the suite by hand. A comment asserting a behaviour the code does not have, guarding a suite
  // nothing runs, is the worst combination of this repo's two recurring defect classes.
  // (Fresh HIGH-tier reviewer, PR #121.)
  ...(isFlagConsoleEnabled()
    ? ([
        { label: 'flag credentials', path: (slug: string) => `/app/flag-credentials/${slug}` },
        { label: 'flag audit', path: (slug: string) => `/app/flag-audit/${slug}` },
      ] as const)
    : []),
  // console-ia-overhaul · Sprint 2. Same gated-entry shape as the two above, and added because the
  // FIRST render of `Setup › Keys` was broken at both widths and no assertion saw it: a seven-column
  // table between the section rail and the agent rail put "Manage" off the right edge at 1440 and was
  // unreadable at 390. A screenshot caught it; this is what stops it coming back.
  ...(isConsoleShellEnabled()
    ? ([
        { label: 'setup connect', path: (slug: string) => `/app/setup/connect/${slug}` },
        { label: 'setup keys', path: (slug: string) => `/app/setup/keys/${slug}` },
      ] as const)
    : []),
] as const

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the authed mobile sweep requires the auth-setup project')
  return slug
}

for (const target of AUTHED_MOBILE_ROUTES) {
  test(`${target.label} is mobile-clean for a signed-in owner`, async ({ page }) => {
    const path = target.path(tenantSlug())
    const response = await page.goto(path)

    // These assertions come BEFORE the layout helper. A 200 login page is not proof of an authed
    // route, and measuring it would recreate the exact false-green this counterpart exists to stop.
    expect(response?.status(), `${path} did not render`).toBe(200)
    await expect(page, `${path} redirected to login instead of rendering itself`).not.toHaveURL(/\/login/)
    await expect(
      page.locator('.product-shell'),
      `${path} did not render the signed-in product shell`
    ).toBeVisible()

    await assertMobileClean(page, path)
  })
}
