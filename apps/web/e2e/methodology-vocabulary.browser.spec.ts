import { test, expect } from '@playwright/test'

// methodology-experience · Sprint 1 QA — the rendered half of Stories 1.1 and 1.3.
//
// ── What this does NOT do, deliberately ───────────────────────────────────────────────────────
// It does not assert "no horizontal scroll at 390px". `/` is already a row in
// `mobile-heuristics.browser.spec.ts`'s `PUBLIC_MOBILE_ROUTES`, which sweeps it at 360 AND 390 for
// overflow and tap targets against the same rail every other public route is held to. A second
// copy here would be a second implementation of one rule — the class `assertMobileClean` was
// extracted to end (landing-redesign-v2 S1.2) — and it would be the copy that silently stops
// matching the rail when the rail moves.
//
// What is left is what the API spec structurally cannot see: whether six chapter titles laid out
// as a contents page still RENDER as six items on a phone. The pill band this replaced was three
// short words; the list that replaced it carries "Decide what happens next", and the failure mode
// of a narrow kraft card is a title that wraps into the next one or clips. Assertions cover the
// properties you thought to name — but "all six are visible and none is empty" is nameable, and it
// is the one the layout can actually break.

const LOOP_MOVES = ['Consider', 'Operate', 'Exit']
const CHAPTERS = [
  'Bring an idea',
  'Design it',
  'Place the Bet',
  'Build it',
  'Prove it',
  'Decide what happens next',
]

for (const [label, viewport] of [
  ['desktop', { width: 1280, height: 900 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`§loop renders three moves and §methodology six chapters at ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const response = await page.goto('/')
    expect(response?.status(), 'the landing did not render').toBe(200)

    const moves = page.locator('#loop .maker-flow__item h3')
    await expect(moves, 'the maker loop is three moves').toHaveCount(3)
    await expect(moves).toHaveText(LOOP_MOVES)

    // ── The loop's items fill their card ────────────────────────────────────────────────────
    // `.maker-flow` is a grid, and its desktop rule used to name a track count — `repeat(5, 1fr)`,
    // written when the loop had five steps. Story 1.1 made it three, and the three items kept 60%
    // of the row while the remaining 40% of the card stayed empty with a border ending in the
    // middle of nothing. Every assertion above passed: the markup was right, there were three
    // items, and the text matched. A count is not a layout (LEARNINGS: a full green gate does not
    // see layout — someone has to open the page).
    //
    // The CSS fix derives the track count from the item count, so the mismatch is now
    // unrepresentable. This is the assertion that says so out loud: whatever the loop's length, its
    // last item reaches the end of the card it sits in.
    const flow = page.locator('#loop .maker-flow')
    const flowBox = await flow.boundingBox()
    const lastItem = page.locator('#loop .maker-flow__item').last()
    const lastBox = await lastItem.boundingBox()
    expect(flowBox, 'the loop list must be laid out before it can be measured').not.toBeNull()
    expect(lastBox, 'the loop list has items but the last one has no box').not.toBeNull()

    if (viewport.width >= 900) {
      // Above the 900px breakpoint the moves are columns, so "fills the card" is a horizontal
      // claim. Below it they stack, and the vertical equivalent is what the mobile rail already
      // covers — re-asserting it here would be a second copy of that rule.
      expect(
        flowBox!.x + flowBox!.width - (lastBox!.x + lastBox!.width),
        'the loop leaves dead space to the right of its last move — the grid has more tracks than items'
      ).toBeLessThanOrEqual(2)
    }

    const chapters = page.locator('#methodology .field-guide__chapters li')
    await expect(chapters, 'the field guide previews six chapters').toHaveCount(6)

    // Read each row's own text rather than the list's, so a title that has collapsed to nothing
    // fails here instead of passing because its neighbours' text made the container look full.
    //
    // `toBeVisible()` alone does NOT establish that a row is un-clipped — an element inside an
    // `overflow: hidden` box that has been squeezed to a sliver is still "visible" to Playwright.
    // Codex made that point in round 1 of PR #104, and the honest answer to a disputed property is
    // to make the property real rather than to soften the sentence describing it (LEARNINGS). So
    // the geometry is measured: every row has a real line of height, and every row sits inside the
    // kraft card that contains it. That is what "the six titles still render on a phone" means.
    const card = page.locator('#methodology .field-guide')
    const cardBox = await card.boundingBox()
    expect(cardBox, 'the field-guide card must be laid out before its rows can be measured').not.toBeNull()

    for (const [index, title] of CHAPTERS.entries()) {
      const row = chapters.nth(index)
      await expect(row).toBeVisible()
      await expect(row).toContainText(title)

      const box = await row.boundingBox()
      expect(box, `chapter ${index + 1} has no box at all`).not.toBeNull()
      // One line of the 15px type this list is set in. A row squeezed below that is clipped,
      // whatever `toBeVisible()` reports.
      expect(box!.height, `"${title}" is squeezed below one line of text`).toBeGreaterThanOrEqual(15)
      expect(box!.width, `"${title}" has no width`).toBeGreaterThan(0)
      expect(box!.x, `"${title}" starts outside the card`).toBeGreaterThanOrEqual(cardBox!.x - 1)
      expect(box!.x + box!.width, `"${title}" runs past the right edge of the card`).toBeLessThanOrEqual(
        cardBox!.x + cardBox!.width + 1
      )
    }

    // The phase labels are the grouping, and there are three of them. If a group ever renders with
    // no chapters under it the count above would still pass, so the groups are counted too.
    await expect(page.locator('#methodology .field-guide__phase')).toHaveText(['Consider', 'Operate', 'Exit'])
  })
}
