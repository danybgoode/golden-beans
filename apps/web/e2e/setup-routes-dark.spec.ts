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
// ── ⚠️ THE DARK HALF IS GONE — mockups-as-built Story 3.3 ────────────────────────────────────
// `CONSOLE_SHELL_ENABLED` is deleted from the repository and from every Vercel environment. There
// is no state in which `/app/setup/connect/<slug>` 404s for a flag, so the two gate-conditional
// describes below it are gone with it: a test that asserted the dark contract would now assert the
// opposite of production, and one that skipped in every configuration would be a suite reporting
// green having run nothing.
//
// The file KEEPS ITS NAME and its two unconditional tests, which are the ones that still have a
// subject: Setup › Keys is gated on nothing, and the three retired routes redirect to it. Renaming
// it would move the file for no reason a reader could reconstruct; what it is now is the Setup
// routes' existence contract, and the header says so.

// ⚠️ **Setup › KEYS left this list — design-system-rails S4.5, and it is a behaviour change.**
//
// It was console-gated while it was an additional surface duplicating a list. Story
// 4.5 made it the ONLY place a credential can be minted and retired the three routes it replaced
// into permanent redirects — so a closed gate would leave a project unable to issue any credential
// at all, including the ingest key without which nothing can send an event, and the redirects would
// land on a 404. Dropping the gate was forced by the retirement rather than chosen; the AUTH
// boundary is untouched (`requireProjectOwnership` at the route).
//
// It is not simply deleted from coverage: `the credential surface is gated on NOTHING` below asserts
// the contract that replaced the dark one.
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
  // The claim: Setup › Keys answers whatever the deployment's flags say, because it is the only
  // surface that mints. It was written when `CONSOLE_SHELL_ENABLED` was the flag it had to survive;
  // Story 3.3 deleted that one, and the property is broader than any single flag.
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

test('the two Setup routes exist and require a session — no flag can take them away', async ({ request }) => {
  // ⚠️ **This replaces the dark contract rather than deleting it.** While the console was flagged,
  // the property worth asserting was that a gated route returned a FLAT 404 instead of bouncing to
  // login — 404 says "this does not exist", 307 says "this exists, sign in". With the flag gone the
  // meaningful property is the other one: these routes exist for everybody, and an anonymous caller
  // is sent to login rather than told they do not exist.
  //
  // The nonexistent slug is still here and still matters: the answer must not distinguish a real
  // tenant from an invented one, or the route leaks tenant existence to anonymous callers.
  for (const route of SETUP_ROUTES) {
    const response = await request.get(route, { maxRedirects: 0 })
    expect(
      response.status(),
      `${route} 404'd — nothing gates it any more, so a 404 means it stopped existing`
    ).not.toBe(404)
    expect([302, 307]).toContain(response.status())
    expect(response.headers()['location']).toContain('/login')
  }
})
