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

test.describe('agent rail', () => {
  // Skipped rather than inverted when the gate is off, because with AGENT_RAIL_ENABLED unset there
  // is nothing to smoke — and a skip that says why is more honest than a test that asserts absence
  // and reads as coverage of the rail.
  test.skip(!isAgentRailEnabled(), 'set AGENT_RAIL_ENABLED=true to smoke the rail')

  test('the rail renders on every /app route and never claims completeness', async ({ page }) => {
    const slug = tenantSlug()

    for (const path of ['/app', `/app/keys/${slug}`, `/app/scenarios/${slug}`]) {
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
    // RailDisclosure opens it once at this width; the body is what actually shows or hides.
    await expect(panel).toHaveAttribute('open', '')
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
