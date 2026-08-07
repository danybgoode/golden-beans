import { test, expect, type APIRequestContext } from '@playwright/test'
import { Client as PgClient } from 'pg'
import { readTenantRecord } from './helpers/authed-fixture'
import { hashCredential } from '@/lib/credential-hash'
import { requireTestDatabaseUrl } from './helpers/test-db-cleanup'

// app-shell-and-agent-rail · Sprint 3 — Command Center, in a browser, with real numbers in it.
//
// ── Why this spec insists on a NON-ZERO number ────────────────────────────────────────────────
// sprint-3.md calls this "not optional", and it is the single most valuable check in the sprint. A
// dashboard whose correct empty state is indistinguishable from its broken state is the bug class
// this repo shipped to production once: a query that silently requires a tag the realistic caller
// has no reason to set returns an honest-looking zero, and a zero pages nobody.
//
// A spec that only opened /app on a brand-new tenant would see the empty state, pass, and prove
// nothing — the funnel could be completely broken and it would still be green. So this drives real
// events through the REAL ingest path (`POST /api/v1/track`, the same wire contract the SDK sends,
// AGENTS rule #1) and then asserts a specific non-zero figure reaches the screen.

const FEATURE_KEY = 'command_center_smoke'
const TARGET_EVENT = 'cc_smoke_targeted'
const ADOPTED_EVENT = 'cc_smoke_adopted'
const RETAINED_EVENT = 'cc_smoke_retained'

const TARGETED_USERS = 8
const ADOPTED_USERS = 5
const RETAINED_USERS = 2

function tenant(): { projectId: string; slug: string } {
  const record = readTenantRecord()
  if (!record?.projectId || !record.slug) {
    throw new Error('the command-center smoke requires the auth-setup project')
  }
  return { projectId: record.projectId, slug: record.slug }
}

/**
 * Mint an ingest key for the fixture tenant directly.
 *
 * The auth fixture provisions a first key but hands it to the browser as a one-time cookie, not to
 * the spec — so this mints its own rather than scraping one out of the UI. The KEY is a fixture; the
 * ingest path it is used against is the real one, which is the part that matters.
 */
async function mintIngestKey(pg: PgClient, projectId: string): Promise<string> {
  const key = `gb_key_${crypto.randomUUID().replaceAll('-', '')}`
  await pg.query(
    `INSERT INTO public.api_keys (project_id, key_hash, label, scope)
     VALUES ($1, $2, 'command-center smoke', 'ingest')`,
    [projectId, hashCredential(key)]
  )
  return key
}

async function post(request: APIRequestContext, path: string, key: string, body: unknown) {
  const response = await request.post(path, {
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    data: body,
  })
  if (!response.ok()) {
    throw new Error(`${path} → ${response.status()} ${await response.text()}`)
  }
  return response
}

test.describe('command center', () => {
  // Serial: both tests read the same seeded funnel, and the seeding is done once in beforeAll.
  test.describe.configure({ mode: 'serial' })

  // Null until `connect()` actually succeeds. Assigning the instance before connecting meant a failed
  // connection left `afterAll` calling `.query()` on a dead client, so the teardown threw and buried
  // the real failure underneath it (cross-review round 2, Agy on PR #73).
  let pg: PgClient | null = null

  test.beforeAll(async ({ playwright }) => {
    const { projectId, slug } = tenant()
    const client = new PgClient({ connectionString: requireTestDatabaseUrl() })
    await client.connect()
    pg = client

    const key = await mintIngestKey(pg, projectId)
    const request = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    })

    await post(request, '/api/v1/features/sync', key, {
      features: [
        {
          key: FEATURE_KEY,
          enabled: true,
          targetEvent: TARGET_EVENT,
          adoptedEvent: ADOPTED_EVENT,
          retainedEvent: RETAINED_EVENT,
          retentionDays: 7,
          description: 'Command Center smoke funnel (app-shell-and-agent-rail S3).',
        },
      ],
    })

    // A deliberately LOPSIDED funnel: 8 → 5 → 2. Equal counts would let a bug that renders the same
    // number three times pass, and a bug that renders equal-height bars pass with it.
    const send = (event: string, users: number) =>
      Promise.all(
        Array.from({ length: users }, (_, i) =>
          post(request, '/api/v1/track', key, {
            userId: `cc-smoke-user-${i}`,
            event,
            featureId: FEATURE_KEY,
          })
        )
      )

    await send(TARGET_EVENT, TARGETED_USERS)
    await send(ADOPTED_EVENT, ADOPTED_USERS)
    await send(RETAINED_EVENT, RETAINED_USERS)
    await request.dispose()

    // Sanity: the seed must actually be in the tenant we are about to look at. Without this, a
    // mis-scoped insert would surface as an empty dashboard and read as a UI bug.
    const seeded = await client.query('SELECT count(*)::int AS n FROM public.events WHERE project_id = $1', [
      projectId,
    ])
    expect(seeded.rows[0].n, `events must exist for ${slug}`).toBeGreaterThanOrEqual(
      TARGETED_USERS + ADOPTED_USERS + RETAINED_USERS
    )
  })

  test.afterAll(async () => {
    if (!pg) return
    const { projectId } = tenant()
    // auth.teardown deletes the project (and everything cascading from it) afterwards; this only
    // removes the key this spec minted, so a failure here cannot leave a live credential behind.
    await pg.query(`DELETE FROM public.api_keys WHERE project_id = $1 AND label = 'command-center smoke'`, [
      projectId,
    ])
    await pg.end()
  })

  test('a real, non-zero funnel reaches the screen as bars with visible drop-off', async ({
    page,
  }, testInfo) => {
    const { slug } = tenant()
    const response = await page.goto('/app')
    expect(response?.status()).toBe(200)
    // Kept like design-system.authed.spec.ts's: the assertions prove the numbers are right, the
    // artifact is what lets a human confirm the page also reads right.
    await page.screenshot({ path: testInfo.outputPath('command-center.png'), fullPage: true })

    const center = page.locator('.command-center')
    await expect(center).toBeVisible()
    // Story 3.3 — no bare <ul> of slugs. The page leads with the numbers.
    await expect(center.locator('.command-center__stats')).toBeVisible()

    // THE non-zero check — scoped to the stat card, not to the whole Command Center.
    //
    // It used to assert `center` contained "63%", which the funnel's own "63% of previous" label
    // ALSO satisfies (fresh-reviewer finding). So the comment's claim — that a broken read could not
    // pass this line — was false: with `rateFigure` returning null the card renders its caveat
    // sentence and the assertion still passed on the drop-off label two elements away.
    const adoption = center.locator('.stat-card', { hasText: `Adoption · ${FEATURE_KEY}` })
    await expect(adoption).toBeVisible()
    await expect(adoption.locator('.stat-card__value')).toHaveText('63%')
    // ...and the card is NOT in its unreadable state, which is the other way this could go wrong.
    await expect(adoption).not.toHaveAttribute('data-unreadable', 'true')

    const bars = page.locator('.funnel-bars .bar')
    await expect(bars).toHaveCount(3)
    await expect(bars.nth(0)).toContainText(`Targeted · ${TARGETED_USERS}`)
    await expect(bars.nth(1)).toContainText(`Adopted · ${ADOPTED_USERS}`)
    await expect(bars.nth(2)).toContainText(`Retained · ${RETAINED_USERS}`)

    // Rendered GEOMETRY, which is the whole reason this is a browser spec and not an API one: the
    // bars must actually get shorter. A funnel drawn with three equal bars is a decoration.
    const heights = await page
      .locator('.funnel-bars .bar > div')
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height))
    expect(heights).toHaveLength(3)
    expect(heights[0]).toBeGreaterThan(heights[1])
    expect(heights[1]).toBeGreaterThan(heights[2])
    expect(heights[2]).toBeGreaterThan(0)

    // The drop-off is labelled, not left to the reader to compute.
    await expect(bars.nth(1)).toContainText('63% of previous')
    await expect(bars.nth(2)).toContainText('40% of previous')

    // The numbers must agree with the surface they summarise (sprint-3.md smoke step 2).
    const funnelPage = await page.goto(`/app/funnel/${slug}/${FEATURE_KEY}`)
    expect(funnelPage?.status()).toBe(200)
    await expect(page.locator('main')).toContainText(String(TARGETED_USERS))
    await expect(page.locator('main')).toContainText(String(ADOPTED_USERS))
  })

  test('it reflows on a phone, keeps focus visible, and says what it does not measure', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app')

    await expect(page.locator('.command-center')).toBeVisible()

    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scrollWidth, 'Command Center must not produce horizontal scroll').toBeLessThanOrEqual(clientWidth)

    // The Medusa-truth boundary, on the front door. "Where is my revenue number?" is answered with
    // the reason it is not measured and the guardrail to fix that — never with a plausible figure.
    const gaps = page.locator('.command-center__gaps')
    await expect(gaps).toBeVisible()
    await gaps.locator('summary').click()
    await expect(gaps).toContainText('Revenue per feature')
    await expect(gaps).toContainText('Medusa-truth boundary')

    // Keyboard focus stays visible while tabbing (sprint-3.md smoke step 5).
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const el = document.activeElement
      return el ? getComputedStyle(el).outlineStyle : 'none'
    })
    expect(outline).not.toBe('none')
  })
})
