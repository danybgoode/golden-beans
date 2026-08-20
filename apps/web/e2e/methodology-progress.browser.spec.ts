import { test, expect } from '@playwright/test'
import { METHODOLOGY_CHAPTERS } from '@/lib/methodology-chapters'
import { PROGRESS_STORAGE_KEY } from '@/lib/methodology-progress'

// methodology-experience · Sprint 3, Story 3.4 — real progress, or no rail.
//
// The pure rules are unit-tested in `lib/methodology-progress.test.ts`. What can only be observed
// here is the INTEGRATION: that opening a chapter actually writes, that the count survives a
// navigation, and — the one that matters most — that a browser which refuses storage gets no rail
// instead of a wrong number.

const RAIL = '.methodology-progress'

test('the rail counts what the reader has opened, and never double-counts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/bring-an-idea')

  // A first visit shows "1 of 6", not nothing: by the time the effect runs, the reader HAS opened
  // a chapter, and saying so is true and useful to someone returning later. (An earlier draft of
  // this spec asserted no rail here, on the assumption that a first visit is the "nothing opened"
  // state. It is not — that state is only reachable from a surface that opens no chapter, and the
  // module's `null` for it is what keeps a corrupt read from rendering a zero.)
  await expect(page.locator(RAIL)).toContainText(`1 of ${METHODOLOGY_CHAPTERS.length} chapters opened`)

  await page.goto('/methodology/design-it')
  await expect(page.locator(RAIL)).toHaveCount(1)
  await expect(page.locator(RAIL)).toContainText(`2 of ${METHODOLOGY_CHAPTERS.length} chapters opened`)

  await page.goto('/methodology/prove-it')
  await expect(page.locator(RAIL)).toContainText(`3 of ${METHODOLOGY_CHAPTERS.length} chapters opened`)

  // Re-opening one already counted must not inflate it.
  await page.goto('/methodology/design-it')
  await expect(page.locator(RAIL)).toContainText(`3 of ${METHODOLOGY_CHAPTERS.length} chapters opened`)
})

test('the rail claims only what the page can observe, and promises nothing it does not keep', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/bring-an-idea')
  await page.goto('/methodology/design-it')

  const rail = page.locator(RAIL)
  await expect(rail).toHaveCount(1)
  const text = (await rail.innerText()).toLowerCase()

  // The mockup's cut promises must not reappear as copy, and the rail must not claim a chapter was
  // READ — the page's own argument is that reading is not doing.
  expect(text).not.toContain('tried')
  expect(text).not.toContain('produced')
  expect(text).toContain('opened')
  expect(text).toContain('this browser only')

  // `✓` is banned by the drift guard; this asserts the RENDERED page, which the guard cannot see.
  expect(text).not.toContain('✓')
})

// The rail must be VISIBLE on a phone, not merely present.
//
// It was in the DOM with `display: block` on itself — and zero height, because its ancestor track
// was `display: none` below 900px, written when that track was a permanent empty placeholder. The
// `max-width` rules styling the rail for mobile were dead code, and the comment beside them claimed
// "the rail follows the article rather than being hidden": the property the code did not have.
// A count assertion would have passed the whole time; only measuring it catches this
// (Antigravity, round 1 of PR #107).
test('on a phone the rail is visible, not merely present', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/methodology/bring-an-idea')
  await page.goto('/methodology/design-it')

  const rail = page.locator(RAIL)
  await expect(rail).toHaveCount(1)
  await expect(rail).toBeVisible()

  const box = await rail.boundingBox()
  expect(box, 'the rail must have a box on a phone').not.toBeNull()
  expect(box!.height, 'a rail suppressed by an ancestor reports zero height').toBeGreaterThan(20)
  expect(box!.x, 'the rail must keep the article gutter').toBeGreaterThanOrEqual(12)
  expect(box!.x + box!.width, 'the rail must not widen the page').toBeLessThanOrEqual(390)
})

// The rail's margins must actually SWITCH between the one-column and three-track layouts.
//
// The third instance of one cascade defect in this file in a single epic: a `@media (min-width:
// 900px)` override that sits ABOVE its base rule loses on source order and does nothing, because
// media queries add no specificity. Here the phone margins persisted on desktop, pushing the rail
// out of its track. All three instances were found by review, none by the suite — so this asserts
// the computed values on both sides of the breakpoint rather than trusting the rule's existence.
test('the rail switches its margins between the phone and three-track layouts', async ({ page }) => {
  const read = async () =>
    page.evaluate(() => {
      const el = document.querySelector('.methodology-progress')
      if (!el) return null
      const s = getComputedStyle(el)
      return { left: s.marginLeft, right: s.marginRight, bottom: s.marginBottom }
    })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/methodology/bring-an-idea')
  await page.goto('/methodology/design-it')
  const phone = await read()
  expect(phone, 'the rail must render on a phone').not.toBeNull()
  expect(phone!.left, 'on one column the rail carries the article gutter').toBe('18px')
  expect(phone!.bottom, 'and clears the content below it').toBe('34px')

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/prove-it')
  const wide = await read()
  expect(wide, 'the rail must render in the third track').not.toBeNull()
  expect(wide!.left, 'in the third track the aside owns the gutter').toBe('0px')
  expect(wide!.bottom).toBe('0px')
})

// The property the whole module exists for. A reader whose browser refuses storage must get NO
// rail — never "0 of 6", which is a number-shaped lie to someone who may have read all six.
test('a browser that refuses storage gets no rail, not a zero', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => {
    // Both halves throw. Safari in private mode throws on `setItem` while `getItem` succeeds, so a
    // component that only guarded the read would still take the page down for these readers.
    const boom = () => {
      throw new Error('storage disabled')
    }
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom }),
    })
  })

  await page.goto('/methodology/design-it')
  // The page itself must still work — a rail that throws must not take the chapter with it.
  await expect(page.locator('h1')).toHaveText('Design it')
  await expect(page.locator(RAIL), 'no rail is the honest answer when storage is unavailable').toHaveCount(0)
})

test('a corrupt stored value is treated as unknown, not as zero', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/bring-an-idea')

  // Seed real progress, then corrupt it — the case that distinguishes "unknown" from "none".
  await page.evaluate(
    (key) => window.localStorage.setItem(key, JSON.stringify(['bring-an-idea', 'design-it'])),
    PROGRESS_STORAGE_KEY
  )
  await page.goto('/methodology/prove-it')
  await expect(page.locator(RAIL)).toContainText('3 of')

  await page.evaluate((key) => window.localStorage.setItem(key, 'not json at all'), PROGRESS_STORAGE_KEY)
  await page.goto('/methodology/build-it')

  // The visit that DETECTS the corruption says nothing at all. "1 of 6" here would announce a
  // number about data we just admitted we lost, to a reader who may have worked through four
  // chapters — the silent-zero defect wearing a one instead of a zero.
  await expect(page.locator(RAIL), 'the visit that finds a corrupt store must render no rail').toHaveCount(0)

  // ...and the store is REPAIRED, so the next visit is honest about what it can actually observe.
  const repaired = await page.evaluate((key) => window.localStorage.getItem(key), PROGRESS_STORAGE_KEY)
  expect(repaired, 'a corrupt value must not be left in place to suppress the rail forever').toBe(
    JSON.stringify(['build-it'])
  )

  await page.goto('/methodology/prove-it')
  await expect(page.locator(RAIL)).toContainText(`2 of ${METHODOLOGY_CHAPTERS.length} chapters opened`)
})
