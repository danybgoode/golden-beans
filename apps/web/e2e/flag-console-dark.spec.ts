import { test, expect } from '@playwright/test'
import { isFlagConsoleEnabled } from '../lib/flags'

// flags-console-parity · Sprint 1 Story 1.1 + Sprint 2 Story 2.1 — the console's dark path.
//
// ── What this file asserts, and what it deliberately does NOT ─────────────────────────────────
// Stated up front, because the epic's original QA plan for this spec was WRONG and correcting it is
// half the value here (epic README, Amendment 1).
//
// The plan was: "the gate-off byte-for-byte guarantee for 1.1, mirroring flag-serving-dark.spec.ts".
// That is not buildable. `/app/flags/[projectSlug]` is credential-gated, so the always-on `api`
// project — which has no session — sees a redirect to /login with the console ON *or* OFF. A spec
// asserting "the page renders as it did before" from there would pass for a reason unrelated to the
// flag, and would keep passing if the gate were hardwired to `true`. That is the guard-that-cannot-
// fail class LEARNINGS names, and an absent spec is better than one.
//
// What IS anonymously observable is the PER-FEATURE ROUTE, and only because of how it is written:
// `page.tsx` calls `notFound()` BEFORE `requireProjectMembership()`. So the two flag states produce
// two genuinely different anonymous responses:
//
//   gate OFF → 404            (dark means nonexistent, decided before auth)
//   gate ON  → 302/307 /login (the route exists; you simply are not signed in)
//
// That difference is real, is caused by the flag, and needs no session to see. So the coverage is
// split the way the agent-rail dark spec splits its own:
//   • FLAG POLARITY   → lib/flags.test.ts (born OFF, exact `=== 'true'`, full near-miss matrix)
//   • LIST ARITHMETIC → lib/flag-list-view.test.ts (the whole projection, filters, sorts, paging)
//   • ROUTE DARKNESS  → here, where it is genuinely reachable and genuinely flag-dependent
//   • RENDERED UI     → e2e/flag-rule-builder.authed.spec.ts (opt-in, needs a real session)
//
// ── Why the assertion branches on the live flag rather than skipping ─────────────────────────
// A `test.skip` when the gate is on would mean this file silently asserts nothing in a lit preview,
// which is exactly when someone most wants to know the route behaves. Both directions are real
// properties, so both are asserted, against whatever state this environment is actually in.

// Sprint 3, Story 3.4 — the two routes the console moves controls to. Both check the gate BEFORE
// auth, so an anonymous request sees the flag state directly, exactly like the per-feature route.
// This is the coverage Sprint 1's QA note promised and could not deliver: it had no gate-observable
// surface to point at, and now there are three.
// ⚠️ **THREE routes now — `/app/scheduled` joins them (design-system-rails S4.3).** It is the Ship
// rail's fourth item, built as a designed empty state, and it rides `flag-console` for the same
// reason the other two do: it sits beside Features and Activity, and a rail item that survived a
// console rollback would point at a page rendered by an epic that had been rolled back. Added HERE,
// in the commit that creates the route, rather than left for the sprint that notices — a gated route
// with no dark assertion is a gate nothing can observe.
const MOVED_ROUTES = [
  '/app/flag-credentials/miyagisanchez',
  '/app/flag-audit/miyagisanchez',
  '/app/scheduled/miyagisanchez',
]

const DETAIL_ROUTES = [
  '/app/flags/miyagisanchez/checkout.stripe_enabled',
  // A key that does not exist must behave identically while dark — a 404 that depended on whether
  // the flag existed would leak the registry's contents to an anonymous caller.
  '/app/flags/miyagisanchez/definitely-not-a-real-flag',
  // Percent-encoded, because the key travels through a URL segment and the route decodes it.
  '/app/flags/miyagisanchez/checkout%2Estripe_enabled',
]

test.describe('flag console — the per-feature route follows its gate', () => {
  for (const path of DETAIL_ROUTES) {
    test(`${path} is 404 while dark, and a login redirect once lit`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })

      if (isFlagConsoleEnabled()) {
        // Lit: the route exists, so an anonymous caller is sent to sign in. It must NOT render.
        expect([302, 303, 307]).toContain(response.status())
        expect(response.headers()['location']).toContain('/login')
        return
      }

      // Dark: nonexistent, decided before auth or any project lookup.
      expect(
        response.status(),
        `${path} should 404 while FLAG_CONSOLE_ENABLED is off, not redirect — a redirect would mean the gate is checked after auth`
      ).toBe(404)
    })
  }

  for (const path of MOVED_ROUTES) {
    test(`${path} is 404 while dark, and a login redirect once lit`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })

      if (isFlagConsoleEnabled()) {
        // Lit: the route exists, so an anonymous caller is sent to sign in — never rendered. This
        // holds for BOTH routes even though their auth differs (credentials is owner-only, the
        // audit is member-readable): neither distinction is reachable without a session, and the
        // redirect is what an anonymous caller must always get.
        expect([302, 303, 307]).toContain(response.status())
        expect(response.headers()['location']).toContain('/login')
        return
      }

      expect(
        response.status(),
        `${path} should 404 while FLAG_CONSOLE_ENABLED is off — a redirect would mean the gate is checked after auth, which leaks that the route exists`
      ).toBe(404)
    })
  }

  test('the list page never serves 200 to an anonymous caller, in EITHER flag state', async ({ request }) => {
    // ⚠️ This replaces a spec that could not fail (fresh reviewer, PR #120). Its body was wrapped in
    // `if (response.status() === 200)` and checked that the console's markers were absent — but
    // `/app/flags/[projectSlug]` calls `requireProjectMembership`, which redirects an anonymous
    // caller, and the request sets `maxRedirects: 0`. The status was ALWAYS 302, the block never
    // ran, and the test reported green having asserted nothing. Its own file header said the page
    // was credential-gated; the spec did not act like it.
    //
    // Asserted as the REDIRECT instead, which is the real and reachable property: whatever the flag
    // is doing, a stranger must never receive this tenant's flag list. Unlike the old form it also
    // fails loudly if the route ever starts answering 200 anonymously, which would be a finding in
    // itself. (Same correction the agent-rail dark spec already carries for /app.)
    const response = await request.get('/app/flags/miyagisanchez', { maxRedirects: 0 })
    expect([302, 303, 307]).toContain(response.status())
    expect(response.headers()['location']).toContain('/login')
  })
})
