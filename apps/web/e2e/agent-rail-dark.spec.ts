import { test, expect } from '@playwright/test'
import { isAgentRailEnabled } from '../lib/flags'
import { shouldRenderAgentRail } from '../lib/agent-rail-visibility'

// app-shell-and-agent-rail · Sprint 2, Story 2.2 — the rail's dark path.
//
// ── What this file asserts, and what it CANNOT ────────────────────────────────────────────────
// Stating the split up front, because LEARNINGS is explicit that a spec which looks like it covers
// a surface but only reaches its edge is worse than an absent one: the next reader stops there.
//
// The rail renders on signed-in /app routes only. The always-on `api` project has no session, so it
// cannot reach a render where the flag is the deciding factor: with AGENT_RAIL_ENABLED ON *or* OFF,
// an anonymous request sees no rail — there is no resolved membership to render one for. A spec
// here that asserted "absent while dark" would therefore pass for the wrong reason, and would keep
// passing if the flag were hardwired to true.
//
// So the work is split three ways, deliberately:
//   • the FLAG POLARITY            → apps/web/lib/flags.test.ts (born OFF, exact `=== 'true'`,
//                                     the full near-miss matrix every gate in this repo inherits)
//   • the RENDER DECISION          → apps/web/lib/agent-rail-visibility.test.ts (mutation-checked:
//                                     break the polarity and that file goes red)
//   • the ANONYMOUS BOUNDARY       → here, where it is genuinely reachable and genuinely a security
//                                     property: a tenant's activity trail must never be served to
//                                     someone with no session, whatever the flag says.
//   • the RENDERED behaviour       → e2e/agent-rail.authed.spec.ts (opt-in browser smoke)

// Every marker the rail puts in the DOM. Checked as strings against the response body rather than
// through a parser: this asserts that the bytes never leave the server, which is the actual claim.
const RAIL_MARKERS = ['agent-rail', 'Recent activity', 'Waiting on you']

// The anonymously-reachable /app surfaces. The demo project's dashboards render without a session
// (lib/dashboard-auth.ts' allow-listed carve-out) and they use the same ProductShell the rail lives
// in — which makes them the exact place a rail rendered above the membership check would leak.
const ANONYMOUS_APP_SURFACES = [
  '/app/funnel/golden-beans-demo/setup_guide',
  '/app/impact/golden-beans-demo/setup_guide',
]

test.describe('agent rail — anonymous boundary', () => {
  for (const path of ANONYMOUS_APP_SURFACES) {
    test(`${path} serves no rail to a caller with no session`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 })

      // 200 (the demo carve-out) or a redirect/404 are all acceptable answers. What is not
      // acceptable is a 200 carrying rail markup — that would be one tenant's audit trail on a page
      // a stranger can open.
      if (response.status() !== 200) return

      const body = await response.text()
      for (const marker of RAIL_MARKERS) {
        expect(body, `${path} leaked the rail marker "${marker}" to an anonymous caller`).not.toContain(
          marker
        )
      }
    })
  }

  test('/app itself never renders a rail to an anonymous caller', async ({ request }) => {
    const response = await request.get('/app', { maxRedirects: 0 })
    expect([200, 302, 303, 307]).toContain(response.status())
    if (response.status() !== 200) return
    const body = await response.text()
    for (const marker of RAIL_MARKERS) {
      expect(body).not.toContain(marker)
    }
  })
})

test('the render decision requires BOTH the gate and a resolved membership', () => {
  // Asserted through the same predicate the component calls, in whatever state this environment is
  // actually in — rather than skipped, and rather than asserting a direction the environment cannot
  // prove. This is what makes the file honest in a dark CI and in a live preview alike.
  const enabled = isAgentRailEnabled()

  // No membership resolved ⇒ no rail, in EITHER flag state. This is the condition that makes
  // flipping the switch safe, and the one the anonymous specs above exercise end to end.
  expect(shouldRenderAgentRail({ enabled, projectId: null })).toBe(false)

  // ...and the gate itself, in the direction this environment can prove.
  expect(shouldRenderAgentRail({ enabled: false, projectId: 'resolved-server-side' })).toBe(false)
  expect(shouldRenderAgentRail({ enabled, projectId: 'resolved-server-side' })).toBe(enabled)
})
