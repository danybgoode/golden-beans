import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// mockups-as-built · Sprint 3, Story 3.1 — the North Star surface.
//
// ── What this asserts that the structural gate cannot ─────────────────────────────────────────
// `console-visual.authed.spec.ts` compares this route's block sequence against `measure-north-star`
// and counts the small plots. Three things it cannot see live here:
//
//   1. That Measure OPENS on North Star. That is a property of the section TAB's destination, not
//      of any page's own markup — `getSectionEntryHref` takes the section's first entitled surface,
//      so it is decided by the order of a list in `project-route-inventory.ts`. The unit layer pins
//      the href; only a browser proves the tab a person clicks actually lands there.
//   2. That the three inputs are three SEPARATE plots and not three lines on one chart
//      (`APPROVED.md` DD4). Both render three series; the contract counts `.ds-chart-small`
//      elements, which a single multi-line chart could satisfy with three legend entries.
//   3. That the page says WHEN, including when the answer is "never" — the one sentence the
//      approved state insists on, because the metric is synced in from outside the product.
//
// ⚠️ **The hero is EMPTY by construction and that is the deliverable.** There is no table holding a
// level for the metric itself (`north_star_metrics` registers a key, `input_values` belongs to an
// INPUT), which is why `readNorthStar` returns `latestValue: null` unconditionally. A spec that
// asserted a number here would be asserting one this product cannot produce.

function slug(): string {
  const value = readTenantRecord()?.slug
  if (!value) throw new Error('the North Star spec requires the auth-setup project')
  return value
}

test('Measure opens on North Star — the tab a person clicks lands here', async ({ page }) => {
  await page.goto('/app')
  await page.getByRole('link', { name: 'Measure', exact: true }).click()
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(new RegExp(`/app/north-star/${slug()}$`))
  await expect(page.getByRole('heading', { name: 'North Star', exact: true })).toBeVisible()

  // …and the rail lists it FIRST, which is the same fact from the other side: the rail renders in
  // inventory order and the section's entry is that order's first element.
  const railItems = page.locator('nav.ds-rail-slot ul li')
  await expect(railItems.first()).toContainText('North Star')
  // …and it is marked as where you are. `aria-current` is the cue a screen reader gets, and
  // `ProductShell`'s `railActive` docstring records that twenty of twenty-one routes once shipped
  // without setting it at all.
  await expect(railItems.first().locator('[aria-current="page"]')).toHaveCount(1)
})

test('the leading inputs are three SEPARATE plots, never three lines on one chart', async ({ page }) => {
  await page.goto(`/app/north-star/${slug()}`)
  await page.waitForLoadState('networkidle')

  const smalls = page.locator('main .ds-chart-smalls .ds-chart-small')
  await expect(smalls).toHaveCount(3)

  // ⚠️ **The DD4 assertion, and it is about geometry rather than count.** Three lines on one chart
  // would be three `<path>`s inside ONE `<svg>`; three plots are one `<svg>` each, in three separate
  // boxes on their own row. Asserted by counting the svgs per tile, which a merged chart cannot
  // satisfy however many series it draws.
  for (let index = 0; index < 3; index += 1) {
    const tile = smalls.nth(index)
    // A tile has at most one drawing: a sparkline, or the sentence saying why there is none.
    const drawings = await tile.locator('svg').count()
    expect(drawings, `input tile ${index + 1} draws ${drawings} charts`).toBeLessThanOrEqual(1)
  }

  // …and they sit side by side rather than stacked, which is the other half of "three plots": the
  // approved state draws one row of three. Same top edge is what makes it a row.
  const tops = await smalls.evaluateAll((nodes) =>
    nodes.map((node) => Math.round(node.getBoundingClientRect().top))
  )
  expect(new Set(tops).size, `the three plots are on ${new Set(tops).size} rows, not 1`).toBe(1)
})

test('an input with NO readings says so, rather than drawing a flat line at zero', async ({ page }) => {
  // ⚠️ An empty series is not a zero, and the fixture carries one input with no readings for exactly
  // this reason. A sparkline through no points is not a shape; a "0" is a measurement claim nobody
  // made.
  await page.goto(`/app/north-star/${slug()}`)
  const empty = page.locator('main .ds-chart-small').filter({ hasText: 'Support replies' })
  await expect(empty).toHaveCount(1)
  await expect(empty).toContainText('Nothing recorded yet')
  await expect(empty.locator('svg')).toHaveCount(0)
})

test('the page says WHEN it was last synced, including when the answer is never', async ({ page }) => {
  await page.goto(`/app/north-star/${slug()}`)
  const main = page.locator('main')
  // The metric itself has never been synced on any fixture tenant, and the page must say that rather
  // than leaving the reader to infer it from an empty hero.
  await expect(main).toContainText('never been synced')
  // …and it names the newest reading it DOES have, which is the inputs' freshness said as the
  // inputs' freshness. Claiming the metric was synced would be the one thing this page must not say.
  await expect(main).toContainText('the newest reading across every input is')
})

test('the day-by-day readings are reachable, and NOT behind a disclosure', async ({ page }) => {
  // The capability `app-component-kit-adoption` Story 2.3 built. The approved state draws no table —
  // its inputs are illustrative — so it moves into the modal seam rather than a `<details>`: epic D3
  // says a disclosure is never the answer on a rebuilt surface, and when the two rules conflict the
  // answer is a modal.
  await page.goto(`/app/north-star/${slug()}`)
  await expect(page.locator('main details')).toHaveCount(0)
  await page.getByRole('button', { name: 'Every reading' }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Revenue (fixture)' })).toBeVisible()
  await expect(dialog.locator('table')).not.toHaveCount(0)
})
