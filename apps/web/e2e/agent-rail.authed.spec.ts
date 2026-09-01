import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { isAgentRailEnabled } from '../lib/flags'

// app-shell-and-agent-rail · Sprint 2 — the rail's RENDERED behaviour.
//
// The `authed` project is the only harness in this repo with a real session, so it is the only
// place the rail can be seen at all (e2e/agent-rail-dark.spec.ts explains the split). It is opt-in,
// not part of the blocking gate: `npm run test:e2e:authed`.
//
// Everything asserted here is something an API-level check structurally cannot see — a disclosure
// that opens and closes, a sheet that does not overflow a phone, and the D4 copy as it actually
// reaches a reader.

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the agent rail smoke requires the auth-setup project')
  return slug
}

// ── ⚠️ The agent rail does not render on console routes (Daniel, 2026-08-28) ─────────────────
//
// CONSOLE-CONTRACT.md Do-not #4: the rail is in none of the ten approved reference states, and
// inside the console grid it squeezed the content column to 544px against the approved 1180 —
// which is why every table clipped. The epic had left this undecided; it is decided now.
//
// `header !== null` IS the console, and after A19 that is every signed-in /app route, so in
// practice the rail no longer renders anywhere. These specs asserted the opposite on every route,
// and they are the correct place to record what replaced them rather than being deleted quietly:
// a deleted spec leaves no trace of a capability that used to exist.
//
// What the rail carried — the agent's recent activity and its waiting-on-you queue — has a home in
// the approved design: "What changed & why" in the top bar. **That is not built yet.** Until it is,
// this suite is the record that a surface was removed ahead of its replacement, which is the thing
// this epic keeps promising not to do.
test.describe('agent rail', () => {
  test.skip(
    true,
    'the agent rail is not rendered on console routes (Do-not #4). Re-point these at "What changed & why" when that surface lands.'
  )
  test.skip(!isAgentRailEnabled(), 'set AGENT_RAIL_ENABLED=true to smoke the rail')

  test('the rail renders on every /app route and never claims completeness', async ({ page }) => {
    const slug = tenantSlug()

    // ⚠️ `/app/setup/keys`, not `/app/keys` — design-system-rails S4.5 retired the latter into a
    // permanent redirect, and a redirect renders no rail because it renders nothing at all.
    for (const path of ['/app', `/app/setup/keys/${slug}`, `/app/scenarios/${slug}`]) {
      const response = await page.goto(path)
      expect(response?.status(), `${path} should render`).toBe(200)

      const rail = page.locator('.agent-rail')
      await expect(rail, `${path} should carry the rail`).toBeAttached()

      // D4 — the copy IS the acceptance criterion. The heading says "recent", the caveat says
      // "not a complete record", and nothing anywhere promises the ledger this data cannot be.
      await expect(rail).toContainText('Recent activity')
      await expect(rail).toContainText('not a complete record')
      const railText = (await rail.textContent()) ?? ''
      for (const overclaim of ['everything your agent', 'complete history', 'full history', 'all activity']) {
        expect(railText.toLowerCase()).not.toContain(overclaim)
      }

      // D8 — the pending section names what it covers rather than implying it covers every
      // pending agent action.
      await expect(rail).toContainText('Task actions only')
    }
  })

  test('it is a working disclosure on desktop and a sheet that does not overflow a phone', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/app')
    // Kept for the same reason design-system.authed.spec.ts keeps one: the assertions below prove
    // the rail behaves, and the artifact is what lets a human confirm it also LOOKS right.
    await page.screenshot({ path: testInfo.outputPath('rail-desktop.png'), fullPage: true })

    // The rail is `position: fixed`, so nothing in normal flow knows it is there — the page has to
    // reserve the space explicitly. The first version of this CSS reserved the rail's WIDTH but not
    // the gutter it is inset by, and the sidebar sat on top of the project card from ~1080px
    // onward. Geometry an assertion can see, so it stays seen.
    const mainBox = await page.locator('main').boundingBox()
    const railBox = await page.locator('.agent-rail').boundingBox()
    expect(mainBox, 'main should be laid out').not.toBeNull()
    expect(railBox, 'the rail should be laid out').not.toBeNull()
    expect(
      mainBox!.x + mainBox!.width,
      'the page content must end before the rail begins'
    ).toBeLessThanOrEqual(railBox!.x)

    const panel = page.locator('.agent-rail__panel')
    // RailDisclosure opens it once at this width; the body is what actually shows or hides. This is
    // also the precondition for the padding measurement below — the section has to be laid out.
    await expect(panel).toHaveAttribute('open', '')

    // The section-padding regression, made assertable (retro fast-follow). `tokens.css` sets
    // `section { padding: 36px 0 }` for the landing's page bands; inside a 320px rail that was 72px
    // of dead air PER SECTION, which reads as a rendering failure rather than a quiet day. It was
    // found by eye and could have regressed by eye — anything that reintroduces the landing's
    // section padding here now fails.
    const sectionPadding = await page
      .locator('.agent-rail__section')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el)
        return { top: style.paddingTop, bottom: style.paddingBottom }
      })
    expect(sectionPadding, 'rail sections must not inherit the landing band padding').toEqual({
      top: '0px',
      bottom: '0px',
    })

    await panel.locator('summary').click()
    await expect(panel).not.toHaveAttribute('open', '')
    await panel.locator('summary').click()
    await expect(panel).toHaveAttribute('open', '')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app')
    // Server-rendered closed: on a phone an auto-expanded sheet would cover the page it annotates.
    await expect(page.locator('.agent-rail__panel')).not.toHaveAttribute('open', '')
    await page.locator('.agent-rail__panel summary').click()
    await expect(page.locator('.agent-rail__panel')).toHaveAttribute('open', '')
    await page.screenshot({ path: testInfo.outputPath('rail-mobile-open.png') })

    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scrollWidth, 'the open sheet must not produce horizontal scroll').toBeLessThanOrEqual(clientWidth)
  })
})
