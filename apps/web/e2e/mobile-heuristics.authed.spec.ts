import { expect, test } from '@playwright/test'
import { IMPACT_FEATURE_KEY, readTenantRecord } from './helpers/authed-fixture'
import { assertMobileClean } from './helpers/mobile-heuristics'
import { isConsoleShellEnabled, isFlagConsoleEnabled } from '../lib/flags'

// frijoles-rebrand-closeout · Story 1.4 — the signed-in half of the shared mobile rail.
//
// The anonymous browser project cannot cover these paths: every one redirects to /login and the
// helper would measure that page instead. This file runs only in Playwright's `authed` project,
// after auth-setup has created a disposable owner + tenant and saved a real session.

/**
 * ⚠️ `frame` exists because **the hub does not render `.ds-shell`** — design-system-rails Sprint 6.
 *
 * Its four routes are wrapped by `design-system/Frame`'s `hub` variant (`.ds-public--hub`), not by
 * `ProductShell`. Until this field existed they could be in NEITHER sweep: the public one is
 * anonymous and they need a session, and this one asserted a shell they do not have. The browser
 * sweep's own header claimed they "belong in the authed sweep, and `mobile-heuristics.authed.spec.ts`
 * is where that lives" — a statement about coverage that did not exist (fresh reviewer, round 7).
 *
 * The assertion is kept per-route rather than dropped: "a 200 is not proof of an authed route" is
 * what stops this suite measuring a login page, and each frame has its own proof-of-arrival.
 */
type AuthedRoute = { label: string; path: (slug: string) => string; frame?: '.ds-shell' | '.ds-public--hub' }

// Always-on owner surfaces only. Flag-gated pages have their own focused authed specs and would
// make this baseline depend on unrelated local gate values. The seeded impact route is included
// because it exercises the densest data layout, not just empty management tables.
const AUTHED_MOBILE_ROUTES: readonly AuthedRoute[] = [
  { label: 'command center', path: () => '/app' },
  { label: 'impact', path: (slug) => `/app/impact/${slug}/${IMPACT_FEATURE_KEY}` },
  { label: 'scenarios', path: (slug) => `/app/scenarios/${slug}` },
  // ⚠️ `API keys` and `agent write keys` are GONE — design-system-rails S4.5 retired both routes
  // into permanent redirects. They are not simply dropped: `setup keys` below is where all four
  // kinds live now, it is in this sweep unconditionally, and it is the route whose FIRST render was
  // broken at both widths with no assertion watching.
  { label: 'destinations', path: (slug) => `/app/destinations/${slug}` },
  { label: 'share links', path: (slug) => `/app/shares/${slug}` },
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
        // `flag credentials` left with its route (S4.5). `scheduled` joined with S4.3 — a new route
        // covered by one array entry, which is the point of this rail.
        { label: 'flag audit', path: (slug: string) => `/app/flag-audit/${slug}` },
        { label: 'scheduled changes', path: (slug: string) => `/app/scheduled/${slug}` },
      ] as const)
    : []),
  // console-ia-overhaul · Sprint 2. Same gated-entry shape as the two above, and added because the
  // FIRST render of `Setup › Keys` was broken at both widths and no assertion saw it: a seven-column
  // table between the section rail and the agent rail put "Manage" off the right edge at 1440 and was
  // unreadable at 390. A screenshot caught it; this is what stops it coming back.
  // ⚠️ `setup keys` moved OUT of this conditional — S4.5 dropped its console gate, because it is now
  // the only surface that mints and a closed gate would leave a project unable to issue a credential.
  { label: 'setup keys', path: (slug) => `/app/setup/keys/${slug}` },
  ...(isConsoleShellEnabled()
    ? ([{ label: 'setup connect', path: (slug: string) => `/app/setup/connect/${slug}` }] as const)
    : []),
  // ── design-system-rails · Sprint 6 — the hub's four routes ───────────────────────────────────
  // They render `Frame`'s `hub` variant, whose bar is a 54px non-wrapping flex row carrying the
  // brand, the project scope, a spacer and a `nowrap` action — the exact shape of the two overflow
  // defects this epic has already paid for. The tenant slug is the pressure: the fixture's is
  // `gb-e2e-authed-<timestamp>-<pid>`, far longer than `miyagisanchez`, which is what makes this
  // sweep worth more than a look at a real tenant.
  //
  // ⚠️ `/hub/[…]/epic/[epicSlug]` is NOT here: it needs an epic slug that exists in a pushed roadmap
  // artifact, and the fixture tenant has none — the route would 404 and the sweep would measure a
  // 404 under a name that says otherwise, which is the defect the public sweep just fixed. Named
  // rather than omitted; the other three cover the frame it shares.
  { label: 'hub roadmap', path: (slug) => `/hub/${slug}`, frame: '.ds-public--hub' },
  { label: 'hub horizon', path: (slug) => `/hub/${slug}/horizon`, frame: '.ds-public--hub' },
  { label: 'hub report', path: (slug) => `/hub/${slug}/report`, frame: '.ds-public--hub' },
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
      page.locator(target.frame ?? '.ds-shell'),
      `${path} did not render ${target.frame === '.ds-public--hub' ? 'the hub frame' : 'the signed-in product shell'}`
    ).toBeVisible()

    await assertMobileClean(page, path)
  })
}
