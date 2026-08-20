import { test, expect } from '@playwright/test'
import { METHODOLOGY_CHAPTERS } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 2 QA (sprint-2.md) — the `browser` project (opt-in, NOT the
// blocking gate): what only a rendered page can prove.

// Mockup defect 5: the index cards are `<div onclick>` — unfocusable, unreachable by keyboard,
// announced as nothing by a screen reader. This is the whole reason Story 2.2 requires real
// `next/link` cards instead: `.focus()` puts real keyboard focus on the element (the same place a
// Tab walk would land), and Enter on a focused <a> is native browser activation, not a synthetic
// click this test dispatches itself.
test('an index card is keyboard-reachable and activates on Enter', async ({ page }) => {
  await page.goto('/methodology')

  const firstChapter = METHODOLOGY_CHAPTERS[0]!
  const card = page.locator('.methodology-card').first()
  await expect(card).toBeVisible()

  await card.focus()
  await expect(card).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/methodology/${firstChapter.id}$`))
})

// Reuses the assertion pattern from e2e/landing.browser.spec.ts's "the copy button puts the
// visible prompt on the clipboard, unaltered" — `CopyPromptCard` is the SAME component on this
// route (epic D8: the `agent` work variant IS `CopyPromptCard`, nothing else), so its contract
// does not change by appearing on a different page.
test('CopyPromptCard on a chapter page copies the visible prompt, unaltered', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  // Chapter 1 is the first chapter with an `agent` work block; any chapter with one would do.
  await page.goto(`/methodology/${METHODOLOGY_CHAPTERS[0]!.id}`)

  const card = page.locator('.prompt-card').first()
  await expect(card).toBeVisible()
  const visible = await card.locator('.prompt-copy').innerText()
  expect(visible.trim().length, 'the prompt card should render a non-empty prompt').toBeGreaterThan(0)

  await card.getByRole('button').click()
  await expect(card.getByRole('button')).toContainText('copied')

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(visible.trim())
})
