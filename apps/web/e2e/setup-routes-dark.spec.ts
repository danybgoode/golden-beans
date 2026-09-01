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

// ⚠️ **Setup › KEYS left this list — design-system-rails S4.5, and it is a behaviour change.**
//
// It was `CONSOLE_SHELL_ENABLED`-gated while it was an additional surface duplicating a list. Story
// 4.5 made it the ONLY place a credential can be minted and retired the three routes it replaced
// into permanent redirects — so a closed gate would leave a project unable to issue any credential
// at all, including the ingest key without which nothing can send an event, and the redirects would
// land on a 404. Dropping the gate was forced by the retirement rather than chosen; the AUTH
// boundary is untouched (`requireProjectOwnership` at the route).
//
// It is not simply deleted from coverage: `the credential surface is gated on NOTHING` below asserts
// the new contract in both gate states, which is the property that replaced the dark one.
const SETUP_ROUTES = [
  '/app/setup/connect/miyagisanchez',
  // A slug that does not exist anywhere. While dark it must 404 for the SAME reason as a real one —
  // the gate is checked before any project lookup, so the response cannot distinguish them. If a
  // real slug 404'd and a fake one behaved differently, the gate would be leaking tenant existence.
  '/app/setup/connect/no-such-project-here',
]

const CREDENTIAL_ROUTE = '/app/setup/keys/miyagisanchez'
const RETIRED_ROUTES = [
  '/app/keys/miyagisanchez',
  '/app/agent-keys/miyagisanchez',
  '/app/flag-credentials/miyagisanchez',
]

test('the credential surface is gated on NOTHING, in whichever state this run is in', async ({ request }) => {
  // ⚠️ Deliberately OUTSIDE both describes, so it runs in every configuration rather than in the one
  // that happens to match. That is the whole claim: Setup › Keys answers regardless of
  // `CONSOLE_SHELL_ENABLED`, because it is the only surface that mints.
  //
  // "Answers" means a login redirect for an anonymous caller — the route exists and is owner-gated.
  // A 404 would mean a gate closed over it, which is the regression this exists to catch.
  const response = await request.get(CREDENTIAL_ROUTE, { maxRedirects: 0 })
  expect(
    response.status(),
    `${CREDENTIAL_ROUTE} 404'd — a gate closed over the only surface that can mint a credential`
  ).not.toBe(404)
  expect([302, 307]).toContain(response.status())
  expect(response.headers()['location']).toContain('/login')
})

test('the three retired routes redirect to it, in whichever state this run is in', async ({ request }) => {
  // The other half, and it also runs unconditionally: a redirect that only worked while a gate was
  // open would strand every bookmark the moment it closed.
  for (const route of RETIRED_ROUTES) {
    const response = await request.get(route, { maxRedirects: 0 })
    expect([307, 308], `${route} returned ${response.status()} rather than a redirect`).toContain(
      response.status()
    )
    expect(response.headers()['location']).toContain('/app/setup/keys/miyagisanchez')
  }
})

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

  // ⚠️ **`the routes they replace are untouched while dark` is RETIRED — S4.5.** It asserted that
  // turning the console off left the three legacy credential surfaces exactly as they were, which was
  // the right contract while they were the fallback. They are permanent redirects now and there is
  // no fallback to preserve: the two unconditional tests above assert what replaced that promise —
  // the redirects work in every gate state, and their destination is gated on nothing.
})

test.describe('the Setup routes while the console is lit', () => {
  test.skip(!GATE_ON, 'run with CONSOLE_SHELL_ENABLED=true to exercise the lit contract')

  for (const route of ['/app/setup/connect/miyagisanchez']) {
    test(`${route} exists and requires a session`, async ({ request }) => {
      // Lit, these become ordinary credential-gated routes: an anonymous request is redirected to
      // login rather than 404'd. Asserting the FLIP of the dark contract is what makes the dark
      // assertion meaningful — without this, a 404 could mean "gated" or "never built".
      const response = await request.get(route, { maxRedirects: 0 })
      expect(response.status(), `${route} should redirect an anonymous visitor to login`).not.toBe(404)
    })
  }
})
