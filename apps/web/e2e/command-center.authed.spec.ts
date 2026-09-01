import { test, expect, type APIRequestContext } from '@playwright/test'
import { Client as PgClient } from 'pg'
import { readTenantRecord } from './helpers/authed-fixture'
import { hashCredential } from '@/lib/credential-hash'
import { requireTestDatabaseUrl } from './helpers/test-db-cleanup'
import { CHROME_BUDGET_PX } from '@/design-system/console-gate-spec'

// app-shell-and-agent-rail · Sprint 3 — Command Center, in a browser, with real numbers in it.
//
// ── design-system-rails · Sprint 5, Story 5.2 — this route is now **Today** (DD1) ──────────────
// Three of this file's assertions described the page that Story 5.2 replaced, and they are rewritten
// rather than deleted, because what each of them was DEFENDING still matters:
//
//   · the funnel on `/app`  → the approved `today` state has no funnel, and the funnel now has a
//     page of its own. **The non-zero check moved with it** rather than being dropped — it is the
//     single most valuable assertion in this file and the reason the file exists.
//   · the `.stat-card` grid → four `.ds-tile`s, one of which renders the honest never-recorded
//     North Star (sprint L1) rather than a number this product cannot produce.
//   · `.command-center__gaps` → still here, still asserted. The approved state has no such block,
//     and it is kept anyway: the Medusa-truth boundary has no other surface, and deleting a
//     capability to satisfy a geometry assertion is not what this story asks for (the same call
//     Sprint 4 recorded for Destinations' delivery logs).
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

  test('Today leads with the four tiles and the three bands, within the chrome budget', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    const response = await page.goto('/app')
    expect(response?.status()).toBe(200)
    // Kept like design-system.authed.spec.ts's: the assertions prove the numbers are right, the
    // artifact is what lets a human confirm the page also reads right.
    await page.screenshot({ path: testInfo.outputPath('today.png'), fullPage: true })

    // ── The four tiles ──────────────────────────────────────────────────────────────────────
    const tiles = page.locator('main .ds-tile')
    await expect(tiles).toHaveCount(4)
    await expect(tiles.nth(0)).toContainText('North Star')
    await expect(tiles.nth(1)).toContainText('On in Production')
    await expect(tiles.nth(2)).toContainText('Needs a decision')

    // ⚠️ **The North Star renders its never-recorded SENTENCE, not a zero** (sprint L1). No code
    // path in this product can produce a North Star reading — `readNorthStar` returns
    // `latestValue: null` unconditionally and there is no table to read a level from — so a number
    // here would be fabricated and a bare `0` would be the honest-looking zero four LEARNINGS
    // entries are about.
    const northStar = tiles.nth(0)
    await expect(northStar.locator('.ds-tile-value')).toHaveCount(0)
    await expect(northStar.locator('.ds-tile-absent')).toContainText('not a reading of zero')

    // ── The three bands, in DD1's order ─────────────────────────────────────────────────────
    const bands = page.locator('main .ds-band')
    await expect(bands).toHaveCount(3)
    await expect(bands.nth(0).locator('.ds-band-title')).toContainText('Waiting on you')
    await expect(bands.nth(1).locator('.ds-band-title')).toContainText('Your agent is working')
    await expect(bands.nth(2).locator('.ds-band-title')).toContainText('What changed')
    // The badge is the honest half of the design's actor treatment: a fact about the BAND, never a
    // per-row claim about whether a holder is a person or an agent (lib/today-bands.ts).
    await expect(bands.nth(0).locator('.ds-band-who')).toHaveText('only you can')
    await expect(bands.nth(1).locator('.ds-band-who')).toHaveText('not you')

    // ── The seeded queue lands in the right bands ───────────────────────────────────────────
    // `auth.setup.ts` seeds one task in each of three states, differing in every field a band
    // reads — so a page rendering one row three times cannot pass this.
    await expect(bands.nth(0).locator('.ds-task')).toHaveCount(1)
    await expect(bands.nth(0)).toContainText('Checkout fails for sellers with no payout account')
    await expect(bands.nth(1).locator('.ds-task')).toHaveCount(1)
    await expect(bands.nth(1)).toContainText('Listing form abandoned at the photo step')
    await expect(bands.nth(2).locator('.ds-task')).toHaveCount(1)
    await expect(bands.nth(2)).toContainText('Duplicate order emails on retry')

    // The kind is a WORD as well as a dot (DD4: status is never colour alone), and the evidence
    // phrase carries the two inputs to the rank rather than an opaque score.
    await expect(bands.nth(0).locator('.ds-task-meta')).toContainText('Error')
    await expect(bands.nth(0).locator('.ds-task-meta')).toContainText('seen 41×')
    await expect(bands.nth(1).locator('.ds-task-meta')).toContainText('Friction')
    // The unheld row says so in words; the held one names its holder and does NOT classify it.
    await expect(bands.nth(0).locator('.ds-task-by')).toContainText('nobody yet')
    await expect(bands.nth(1).locator('.ds-task-by')).toContainText('gb-e2e-agent')

    // ── THE WELD: the tile and the rows beneath it cannot disagree ──────────────────────────
    // Both count the same array through `splitTaskBands`. A headline that contradicts the rows
    // under it is worse than no headline, and this is what would go red if a future edit counted
    // one of them separately.
    const decisionTile = await tiles.nth(2).locator('.ds-tile-value').innerText()
    expect(Number(decisionTile), 'the "needs a decision" tile does not match the band beneath it').toBe(
      await bands.nth(0).locator('.ds-task').count()
    )

    // ── The geometry promise (sprint contract #12, as corrected by L12) ─────────────────────
    //
    // ⚠️ NOT "Today fits one screen". The approved `today` state is **1711px tall** — its height is
    // the number of tasks somebody has, and requiring it to fit would be requiring a property the
    // design does not have. What is asserted is the CHROME: how far down the page the first thing
    // carrying data begins. See `console-gate-spec.ts`' `CHROME_BUDGET_PX`.
    const geometry = await page.evaluate(() => {
      const first = document.querySelector('main .ds-tile')
      return {
        chrome: first ? Math.round(first.getBoundingClientRect().top) : null,
        scrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
      }
    })
    expect(geometry.chrome, 'Today rendered no tiles at all').not.toBeNull()
    expect(
      geometry.chrome!,
      `Today spends ${geometry.chrome}px on chrome before its first tile — the approved design's ` +
        `worst case is ${CHROME_BUDGET_PX}px`
    ).toBeLessThanOrEqual(CHROME_BUDGET_PX)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth)
  })

  test('a real, non-zero funnel reaches the screen with visible drop-off', async ({ page }) => {
    // ⚠️ **This is the assertion this whole file exists for, and it MOVED rather than being
    // deleted.** A dashboard whose correct empty state is indistinguishable from its broken state is
    // the bug class this repo shipped to production once: a query that silently requires a tag the
    // realistic caller has no reason to set returns an honest-looking zero, and a zero pages nobody.
    //
    // Story 5.2 takes the funnel off Today, because the approved `today` state has none and the
    // funnel has a page of its own. So the check follows it to that page, driven by the same real
    // ingest path (`POST /api/v1/track`, AGENTS rule #1) seeded in `beforeAll`.
    const { slug } = tenant()
    await page.setViewportSize({ width: 1440, height: 960 })
    const response = await page.goto(`/app/funnel/${slug}/${FEATURE_KEY}`)
    expect(response?.status()).toBe(200)

    const main = page.locator('main')
    // A deliberately LOPSIDED funnel, 8 → 5 → 2: equal counts would let a bug that renders one
    // number three times pass, and a bug that renders equal-length bars pass with it.
    await expect(main).toContainText(String(TARGETED_USERS))
    await expect(main).toContainText(String(ADOPTED_USERS))
    await expect(main).toContainText(String(RETAINED_USERS))

    // Rendered GEOMETRY, which is the whole reason this is a browser spec and not an API one: the
    // bars must actually get shorter. A funnel drawn with three equal bars is a decoration.
    const widths = await page
      .locator('main .ds-chart-bars .ds-chart-fill')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
    expect(widths, 'the funnel rendered no bars at all').toHaveLength(3)
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(widths[2]).toBeGreaterThan(0)

    // The drop-off is stated, not left to the reader to compute.
    await expect(main).toContainText('did not continue')
  })

  test('it reflows on a phone, keeps focus visible, and says what it does not measure', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app')

    await expect(page.locator('main .ds-tiles')).toBeVisible()

    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scrollWidth, 'Today must not produce horizontal scroll').toBeLessThanOrEqual(clientWidth)

    // ── Keyboard focus stays visible while tabbing (sprint-3.md smoke step 5) ───────────────
    //
    // ⚠️ **Sampled over the first three focusable elements, BEFORE any click.** The previous version
    // pressed Tab once after clicking the disclosure open, and passed only because the old page
    // happened to end in a list of links: with the disclosure last on the page, that Tab left the
    // document entirely and `document.activeElement` was `<body>`, which has no outline. So it went
    // red on a page whose focus rings are all present — a guard failing on correct work, which is
    // how a guard gets weakened until it means nothing.
    //
    // A mouse click also does not match `:focus-visible`, by design, so tabbing from the top is the
    // only way to ask the question the assertion is about.
    for (let step = 0; step < 3; step += 1) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (!element || element === document.body) return null
        const style = getComputedStyle(element)
        return {
          what: `${element.tagName.toLowerCase()}.${element.className || '(no class)'}`,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        }
      })
      expect(focused, `Tab ${step + 1} left the document instead of moving to a control`).not.toBeNull()
      expect(focused!.outlineStyle, `${focused!.what} takes focus with no visible ring`).not.toBe('none')
      expect(parseFloat(focused!.outlineWidth), `${focused!.what}'s focus ring is 0px wide`).toBeGreaterThan(
        0
      )
    }

    // The Medusa-truth boundary, on the front door. "Where is my revenue number?" is answered with
    // the reason it is not measured and the guardrail to fix that — never with a plausible figure.
    //
    // ⚠️ **The approved `today` state has no such block, and it is KEPT.** It has no other surface,
    // and deleting a capability to satisfy a geometry assertion is not what "render from the design
    // system" asks for — the same call Sprint 4 recorded for Destinations' two operational logs.
    const gaps = page.locator('main .ds-gaps')
    await expect(gaps).toBeVisible()
    await gaps.locator('summary').click()
    await expect(gaps).toContainText('Revenue per feature')
    await expect(gaps).toContainText('Medusa-truth boundary')
  })
})
