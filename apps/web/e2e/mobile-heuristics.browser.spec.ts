import { test, expect } from '@playwright/test'
import { assertMobileClean } from './helpers/mobile-heuristics'

export { assertMobileClean } from './helpers/mobile-heuristics'

// landing-redesign-v2 · Sprint 1, Story 1.2 — the mobile rail's guard.
//
// ── Why this is ONE parameterised spec and not one test per page ──────────────────────────────
// The two checks below already existed, hand-copied, in `landing.browser.spec.ts` — once for `/`
// and once for `/install`. That shape is why coverage stopped at two routes: adding the third
// meant copying a block, so nobody did, and the product grew to 27 route files with two of them
// checked. The ask for this epic was explicitly "heuristics as rails … we can build on top of
// them", so the unit of extension here is a ROW IN AN ARRAY. Covering the next route is one line,
// not one test.
//
// This is the `browser` project (opt-in, not the merge gate) because layout is a rendered fact:
// the `api` project has no layout engine and structurally cannot observe either of these.

/**
 * The public routes this rail sweeps.
 *
 * Public-only on purpose: this project is anonymous by construction (no `storageState`), so a
 * signed-in route would be asserted against its login redirect and the check would silently
 * become "does /login overflow" — a test that passes while measuring the wrong page. The signed-in
 * surfaces belong in an `*.authed.spec.ts` sweep that reuses `assertMobileClean` below; the helper
 * is exported for exactly that.
 */
// `/talk` joins the sweep with landing-maker-ops: it is a new public route, and it is the one most
// likely to blow the mobile budget because it embeds a third-party iframe whose contents this
// repo does not control. Adding a row here is the whole cost of covering it — which is the point
// of the list existing rather than each spec re-deriving "mobile-clean".
export const PUBLIC_MOBILE_ROUTES = ['/', '/install', '/login', '/talk'] as const

for (const route of PUBLIC_MOBILE_ROUTES) {
  test(`${route} is mobile-clean`, async ({ page }) => {
    const response = await page.goto(route)
    expect(response?.status(), `${route} did not render`).toBe(200)
    await assertMobileClean(page, route)
  })
}
