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
//
// ⚠️⚠️ **EACH ROW DECLARES THE STATUS IT EXPECTS, and that is not bookkeeping.** The first version of
// this list added `/signup` and relaxed the assertion to `[200, 404]` so the share 404 could join.
// `run-local-e2e.mjs` sets `SIGNUP_ENABLED: 'false'` for the `browser` project — so `/signup` **404s
// here**, and the relaxed assertion cheerfully certified the 404 page as "mobile-clean" under a test
// named `/signup is mobile-clean`. A guard measuring a different page than the one it names, added
// while closing a coverage gap, in the epic about guards that cannot fail.
//
// So the expected status is per-route data. A route that answers 404 where 200 was expected FAILS,
// and `/signup` is skipped-with-a-reason when its gate is off rather than silently passing on the
// wrong page — a skip somebody decided, which is not the same thing as a suite that ran.
//
// ⚠️ **HONEST SCOPE: nothing in CI runs this file.** `grep 'project=browser' .github/workflows/ci.yml`
// returns nothing — the epic's own **D5-a** records it ("the `browser` project runs nowhere"), which
// is why `landing.browser.spec.ts` can sit red on `main`. These rows are run by
// `npm run test:e2e:local -- --browser` and by nothing else, so adding them buys a check somebody
// has to choose to run, not a gate. Said here rather than left for a reader to assume the opposite;
// wiring the project into CI is a decision this sprint did not make.
export const PUBLIC_MOBILE_ROUTES = [
  { path: '/', status: 200 },
  { path: '/install', status: 200 },
  { path: '/login', status: 200 },
  // Gate-dependent: 200 with `SIGNUP_ENABLED`, 404 without (`app/signup/page.tsx` calls
  // `notFound()`), so the row says which it needs rather than accepting either.
  { path: '/signup', status: 200, needs: 'SIGNUP_ENABLED' as const },
  { path: '/s/gbs_thistokencannotexistanywhereatall00', status: 404 },
  { path: '/talk', status: 200 },
  { path: '/methodology', status: 200 },
  { path: '/methodology/design-it', status: 200 },
] as const

for (const route of PUBLIC_MOBILE_ROUTES) {
  test(`${route.path} is mobile-clean`, async ({ page }) => {
    // A gated route is SKIPPED with its reason when the gate is off, never measured on the 404 the
    // gate serves. `=== 'true'` exactly, matching `lib/flags.ts` — the string "false" is truthy.
    test.skip(
      'needs' in route && process.env[route.needs] !== 'true',
      `${route.path} needs ${'needs' in route ? route.needs : ''}=true; with the gate off this route ` +
        'is a 404, and asserting mobile-cleanliness on it would measure a page this test does not name'
    )
    const response = await page.goto(route.path)
    // The EXACT status the row declares. The share-link 404 is a designed page (`public-gone`) and
    // must be mobile-clean like any other, so 404 is legitimate — for the row that says so, and only
    // for that row. Accepting either everywhere is what let `/signup` be measured as its own 404.
    expect(response?.status(), `${route.path} did not render as expected`).toBe(route.status)
    await assertMobileClean(page, route.path)
  })
}
