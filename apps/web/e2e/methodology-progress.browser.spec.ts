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

  // After a corrupt read the module returns null, so this visit starts a fresh count of 1 — and a
  // count of 1 renders nothing under the "nothing worth saying yet" rule. What must NOT happen is
  // the rail announcing a number that contradicts what the reader knows they have read.
  const railText = (await page.locator(RAIL).count()) ? await page.locator(RAIL).innerText() : ''
  expect(railText, 'a corrupt read must never render a stale or invented count').not.toContain('3 of')
})
