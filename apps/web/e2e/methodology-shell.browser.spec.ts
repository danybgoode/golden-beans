import { test, expect } from '@playwright/test'
import { METHODOLOGY_CHAPTERS, METHODOLOGY_PHASES, chaptersInPhase } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 3, Story 3.1 — the reading shell.
//
// The `browser` project, because every property here is a rendered fact: which column something is
// in, whether it sticks, whether it is reachable on a phone. The `api` project has no layout engine
// and structurally cannot observe any of it.
//
// Two of these exist because the gate was GREEN while the feature was missing. The shell's grid
// landed in an earlier `@media (min-width: 900px)` block ~2000 lines above the base rule, so at
// equal specificity the one-column base won on order and the page rendered with no rail at all; and
// the phase headings kept the base rule's `display: none`, so the rail rendered six chapters with
// no grouping — the one thing this story is named for. Both were found by opening the page. The
// assertions below are those two defects converted into geometry, so neither can return quietly.

const WIDE = { width: 1280, height: 1000 }
const PHONE = { width: 390, height: 844 }

test('at wide widths the rail, the article and the reserved column are three separate tracks', async ({
  page,
}) => {
  await page.setViewportSize(WIDE)
  await page.goto('/methodology/design-it')

  const toc = page.locator('.methodology-toc')
  const article = page.locator('.methodology-article')
  await expect(toc).toBeVisible()

  const tocBox = await toc.boundingBox()
  const articleBox = await article.boundingBox()
  expect(tocBox, 'the rail must be laid out').not.toBeNull()
  expect(articleBox, 'the article must be laid out').not.toBeNull()

  // The defect this pins: with the grid not applied, the rail rendered as a full-width strip ABOVE
  // the article. Side-by-side is the whole claim of a three-column shell, so it is asserted
  // directly rather than inferred from a class being present.
  expect(tocBox!.x + tocBox!.width, 'the rail must sit beside the article, not above it').toBeLessThanOrEqual(
    articleBox!.x + 1
  )
  expect(articleBox!.width, 'the article must keep a real reading measure').toBeLessThanOrEqual(760)
})

test('the rail is grouped by phase, and every group carries its own chapters', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await page.goto('/methodology/design-it')

  // The second defect: the headings existed in the DOM and were `display: none`, so a count of
  // elements would have passed. Visibility is the assertion.
  const headings = page.locator('.methodology-toc__phase')
  await expect(headings).toHaveCount(METHODOLOGY_PHASES.length)
  await expect(headings).toHaveText(METHODOLOGY_PHASES.map((phase) => phase.title))
  for (let index = 0; index < METHODOLOGY_PHASES.length; index += 1) {
    await expect(headings.nth(index)).toBeVisible()
  }

  // Derived from the module on both sides — a hardcoded expectation here would be a second list.
  for (const [index, phase] of METHODOLOGY_PHASES.entries()) {
    const group = page.locator('.methodology-toc__group').nth(index)
    await expect(group.locator('.methodology-toc__link')).toHaveText(
      chaptersInPhase(phase.id).map((chapter) => new RegExp(chapter.title))
    )
  }
})

// Mockup defect 4, stated as a property. Its `openChapter(1); showHome();` runs on load and leaves
// chapter 1 marked active regardless of what the reader is looking at, because the state lived in a
// click handler. Here the URL is the only input, so this is checked by ARRIVING at each chapter
// directly — the case a click-handler implementation always gets wrong.
test('the active chapter follows the route, on arrival, for every chapter', async ({ page }) => {
  await page.setViewportSize(WIDE)

  for (const chapter of METHODOLOGY_CHAPTERS) {
    await page.goto(`/methodology/${chapter.id}`)

    const current = page.locator('.methodology-toc__link[aria-current="page"]')
    await expect(current, `${chapter.id} must mark exactly one entry current`).toHaveCount(1)
    await expect(current).toContainText(chapter.title)
    // The visual half and the semantic half must agree — one without the other is half a fix.
    await expect(current).toHaveClass(/is-current/)
  }
})

test('the rail is keyboard-operable and navigates', async ({ page }) => {
  await page.setViewportSize(WIDE)
  await page.goto('/methodology/bring-an-idea')

  const target = page.locator('.methodology-toc__link', { hasText: 'Prove it' })
  await target.focus()
  await expect(target).toBeFocused()

  // A visible focus indicator, from the site-wide focus rail rather than a bespoke one here.
  const outline = await target.evaluate((el) => {
    const style = getComputedStyle(el)
    return { width: style.outlineWidth, style: style.outlineStyle }
  })
  expect(
    parseFloat(outline.width) > 0 && outline.style !== 'none',
    'a focused rail entry must show a focus ring'
  ).toBe(true)

  await page.keyboard.press('Enter')
  await page.waitForURL('**/methodology/prove-it')
  await expect(page.locator('h1')).toHaveText('Prove it')
})

// The mockup sets `display: none` on the whole TOC under 700px, stranding a phone reader inside a
// chapter with no way sideways except the back button. This is the assertion that keeps that from
// being re-introduced as a "tidy" mobile fix.
test('on a phone the rail is still there, still reachable, and still navigates', async ({ page }) => {
  await page.setViewportSize(PHONE)
  await page.goto('/methodology/design-it')

  const toc = page.locator('.methodology-toc')
  await expect(toc, 'the rail must never be display:none on a phone').toBeVisible()

  const links = toc.locator('.methodology-toc__link')
  await expect(links).toHaveCount(METHODOLOGY_CHAPTERS.length)

  // Every chapter must be REACHABLE, not merely present: the strip scrolls horizontally, so an
  // entry off-screen is fine, but one that cannot be scrolled to is not.
  const reachable = await toc.evaluate((rail) => {
    const items = [...rail.querySelectorAll('.methodology-toc__link')]
    return items.every((item) => {
      const box = item.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && item.scrollWidth > 0
    })
  })
  expect(reachable, 'every chapter entry must have a real box on the strip').toBe(true)

  // The strip's horizontal scroll must be CONTAINED — the page itself must not scroll sideways.
  // `/methodology/design-it` is also a row in PUBLIC_MOBILE_ROUTES, which sweeps this at 360 and
  // 390; this asserts the rail specifically, since the rail is what introduces the overflow.
  const contained = await toc.evaluate((rail) => {
    const style = getComputedStyle(rail)
    const box = rail.getBoundingClientRect()
    return {
      scrolls: ['auto', 'scroll'].includes(style.overflowX),
      withinViewport: box.left >= -1 && box.right <= document.documentElement.clientWidth + 1,
    }
  })
  expect(contained.scrolls, 'the strip must own its horizontal scroll').toBe(true)
  expect(contained.withinViewport, 'the strip must not widen the page').toBe(true)

  await links.filter({ hasText: 'Prove it' }).first().click()
  await page.waitForURL('**/methodology/prove-it')
})
