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

  test('a dark console leaks no console markup to an anonymous caller', async ({ request }) => {
    test.skip(isFlagConsoleEnabled(), 'the dark-body assertion requires FLAG_CONSOLE_ENABLED to be off')
    // The list lives on the credential-gated page, so this cannot assert the list is absent for a
    // signed-in user — see the header. What it CAN assert is that none of the console's strings
    // reach someone with no session at all, whatever the flag says.
    const response = await request.get('/app/flags/miyagisanchez', { maxRedirects: 0 })
    if (response.status() === 200) {
      const body = await response.text()
      for (const marker of ['Never turned on here', 'flag-console-environment', 'Features in ']) {
        expect(body, `anonymous caller saw the console marker "${marker}"`).not.toContain(marker)
      }
    }
  })
})
