import { test, expect } from '@playwright/test'
import { isSignalsEnabled } from '../lib/flags'

// signals-loop · Sprint 2, Story 2.2 — the task dashboard's ACCESS boundary.
//
// ── What this file asserts, and what it deliberately does not ────────────────────────────────
// The rendered UI (the queue table, the evidence drawer, the lifecycle buttons) is a `browser`
// project concern and needs a real session. What belongs in the always-on `api` gate is the
// boundary: an anonymous request must not read a tenant's task queue, and a slug must not become
// an existence oracle. Those are the properties whose failure is a security incident rather than a
// cosmetic bug, and they are assertable without a browser.
//
// Stating the split explicitly because LEARNINGS is clear that a spec which LOOKS like it covers
// the surface, but only reaches its edge, is worse than an absent one — the next reader stops there.

test.describe('task dashboard access boundary', () => {
  test('an anonymous request never renders a task queue', async ({ request }) => {
    // The whole point of the dashboard existing is that a human can audit what an agent did. That
    // audit trail must not be world-readable: these tasks carry scrubbed samples of a tenant's own
    // runtime errors.
    const res = await request.get('/app/tasks/golden-beans-demo', { maxRedirects: 0 })

    // Either redirected to login (session-gated) or 404 (dark / no such project). What it must
    // NEVER be is a 200 carrying queue content.
    expect([302, 303, 307, 404]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.text()
      expect(body).not.toContain('most impactful first')
    }
  })

  test('a nonexistent project slug is indistinguishable from an unauthorized one', async ({ request }) => {
    // No existence oracle. If "not yours" and "not there" gave different answers, an unauthenticated
    // caller could enumerate which tenants exist by watching status codes — the same property every
    // other tenant-scoped surface in this codebase holds.
    const real = await request.get('/app/tasks/golden-beans-demo', { maxRedirects: 0 })
    const invented = await request.get('/app/tasks/definitely-not-a-real-project-xyz', {
      maxRedirects: 0,
    })
    expect(invented.status()).toBe(real.status())
  })

  test('the route is absent entirely while the signals seam is dark', async ({ request }) => {
    // Asserted only in the direction the current environment can actually prove, rather than
    // skipped: with the flag OFF the page must 404 (dark means nonexistent, checked before auth).
    // With it ON, the previous two tests carry the boundary. A spec that asserted 404 unconditionally
    // would pass for the wrong reason in a dark environment and fail in a live one.
    test.skip(isSignalsEnabled(), 'seam is enabled in this environment — dark-state is not reachable')

    const res = await request.get('/app/tasks/golden-beans-demo', { maxRedirects: 0 })
    expect(res.status()).toBe(404)
  })
})
