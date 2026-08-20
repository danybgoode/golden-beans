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

    const chapters = page.locator('#methodology .field-guide__chapters li')
    await expect(chapters, 'the field guide previews six chapters').toHaveCount(6)

    // Read each row's own text rather than the list's, so a title that has collapsed to nothing —
    // clipped, wrapped away, or rendered as a stray number with no words — fails here instead of
    // passing because its neighbours' text made the container look full.
    for (const [index, title] of CHAPTERS.entries()) {
      const row = chapters.nth(index)
      await expect(row).toBeVisible()
      await expect(row).toContainText(title)
    }

    // The phase labels are the grouping, and there are three of them. If a group ever renders with
    // no chapters under it the count above would still pass, so the groups are counted too.
    await expect(page.locator('#methodology .field-guide__phase')).toHaveText([
      'Consider',
      'Operate',
      'Exit',
    ])
  })
}
