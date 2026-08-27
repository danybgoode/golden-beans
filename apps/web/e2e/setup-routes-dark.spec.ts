import { test, expect } from '@playwright/test'

// console-ia-overhaul · Sprint 2. The two new Setup routes, while the console is dark.
//
// ── This spec moved here from Sprint 1, and the reason is the point ───────────────────────────
// Sprint 1's QA section specced `e2e/console-shell-dark.spec.ts` to assert that these two routes
// 404 while dark. Sprint 1 does not build them — so a 404 from it would have proved only that
// Next.js 404s a path that does not exist, which is a guard that cannot fail. It moves with the
// routes it is about.
//
// ── What the `api` project CAN assert about this epic, and what it cannot ─────────────────────
// Every surface in this epic is credential-gated, so the blocking gate never sees past the login
// redirect. The ONE property it can check without a session is the dark-route contract: the flag
// check runs BEFORE `requireProjectMembership`, so a gated route returns a flat 404 rather than
// bouncing to `/login`. That difference is the whole assertion — 404 says "this does not exist",
// 307 would say "this exists, sign in to see it", and leaking the existence of an unbuilt surface is
// what dark launching is supposed to prevent.
//
// It runs in whichever gate state CI has (`CONSOLE_SHELL_ENABLED` is created disabled everywhere,
// so today that is dark), and it states which state it observed rather than asserting one blindly.

const GATE_ON = process.env.CONSOLE_SHELL_ENABLED === 'true'

const SETUP_ROUTES = [
  '/app/setup/connect/miyagisanchez',
  '/app/setup/keys/miyagisanchez',
  // A slug that does not exist anywhere. While dark it must 404 for the SAME reason as a real one —
  // the gate is checked before any project lookup, so the response cannot distinguish them. If a
  // real slug 404'd and a fake one behaved differently, the gate would be leaking tenant existence.
  '/app/setup/connect/no-such-project-here',
  '/app/setup/keys/no-such-project-here',
]

test.describe('the Setup routes while the console is dark', () => {
  test.skip(GATE_ON, 'CONSOLE_SHELL_ENABLED is on for this run; the dark contract does not apply')

  for (const route of SETUP_ROUTES) {
    test(`${route} is a flat 404, not a login redirect`, async ({ request }) => {
      const response = await request.get(route, { maxRedirects: 0 })
      expect(
        response.status(),
        `${route} should not exist while the console is dark — a 307 would leak that it does`
      ).toBe(404)
    })
  }

  test('the routes they replace are untouched while dark', async ({ request }) => {
    // The other half of the dark contract, and the one that matters more: turning the console off
    // must leave the existing credential surfaces exactly as they were. These are owner-gated, so an
    // anonymous request gets a redirect to /login — which is the pre-epic behaviour and proves the
    // route still exists. A 404 here would mean this epic had removed them.
    for (const route of [
      '/app/keys/miyagisanchez',
      '/app/agent-keys/miyagisanchez',
      '/app/flag-credentials/miyagisanchez',
    ]) {
      const response = await request.get(route, { maxRedirects: 0 })
      expect([307, 302, 404].includes(response.status()), `${route} returned ${response.status()}`).toBe(true)
      // `/app/flag-credentials` rides its own gate (`FLAG_CONSOLE_ENABLED`), so 404 is legitimate
      // there. The two that ride no gate must be redirects — a 404 from them is this epic breaking
      // a surface it promised not to touch.
      if (!route.includes('flag-credentials')) {
        expect(response.status(), `${route} should still exist while dark`).not.toBe(404)
      }
    }
  })
})

test.describe('the Setup routes while the console is lit', () => {
  test.skip(!GATE_ON, 'run with CONSOLE_SHELL_ENABLED=true to exercise the lit contract')

  for (const route of SETUP_ROUTES.slice(0, 2)) {
    test(`${route} exists and requires a session`, async ({ request }) => {
      // Lit, these become ordinary credential-gated routes: an anonymous request is redirected to
      // login rather than 404'd. Asserting the FLIP of the dark contract is what makes the dark
      // assertion meaningful — without this, a 404 could mean "gated" or "never built".
      const response = await request.get(route, { maxRedirects: 0 })
      expect(response.status(), `${route} should redirect an anonymous visitor to login`).not.toBe(404)
    })
  }
})
