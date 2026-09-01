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
// `/methodology` and one chapter join with methodology-experience Sprint 2. Two rows, because the
// index and a chapter are different layouts with different failure modes — a card grid that can
// overflow, and a long article whose lists and work cards can. `design-it` is the chapter chosen
// deliberately: it carries the longest list in the guide (nine definition lines, several of which
// wrap) plus a `CopyPromptCard`, so it is the one most likely to blow the budget.
// ── design-system-rails · Sprint 6 (fresh reviewer, Minor) ───────────────────────────────────
// `/signup` and the share 404 join the sweep because Sprint 6 put all five public routes on ONE new
// frame, and only two of them were swept. The bar it introduces — brand, a scope label, a spacer and
// up to two actions in a 54px row — has no `flex-wrap` and its nav is `flex: none`, which is the
// exact shape of the overflow defect this epic has already paid for twice (the `⌘K` button pushing
// the account menu off a 360px screen, and an unbounded project slug doing the same).
//
// ⚠️ **`/s/<a token that cannot exist>` is the 404, and that is deliberate**: `not-found.tsx` renders
// the same public frame plus the widest button row on any door (two side-by-side actions), it needs
// no fixture, and it is the one public page a stranger is most likely to open on a phone — a link
// forwarded to them that has stopped working.
//
// The four `/hub` routes are NOT here: they need a session, so they belong in the authed sweep, and
// `mobile-heuristics.authed.spec.ts` is where that lives. Named rather than omitted.
export const PUBLIC_MOBILE_ROUTES = [
  '/',
  '/install',
  '/login',
  '/signup',
  '/s/gbs_thistokencannotexistanywhereatall00',
  '/talk',
  '/methodology',
  '/methodology/design-it',
] as const

for (const route of PUBLIC_MOBILE_ROUTES) {
  test(`${route} is mobile-clean`, async ({ page }) => {
    const response = await page.goto(route)
    // ⚠️ 200 OR 404. The share-link 404 is a DESIGNED page (`public-gone`) and must be mobile-clean
    // like any other; asserting 200 would have forced it out of the sweep, and asserting nothing
    // would let a route that 500s pass as "mobile-clean" because a blank page never overflows.
    expect([200, 404], `${route} did not render`).toContain(response?.status())
    await assertMobileClean(page, route)
  })
}
