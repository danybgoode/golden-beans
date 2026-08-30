// The specimen, asserted — Sprint 2's gate.
//
// This is the screen where the language is approved, so it is also the screen where the language is
// checked. Every assertion here is one a human would otherwise have to make by eye on every PR.

import { test, expect } from '@playwright/test'
import { TYPE, WEIGHT } from '@/design-system/scales'

const VIEWPORT = { width: 1440, height: 960 }
const SPECIMEN = '/app/design-system'

/** Exactly `'true'`, matching `lib/flags.ts`. `CONSOLE_SHELL_ENABLED=false` must SKIP, not fail. */
function gatesAreLit(): boolean {
  return process.env.CONSOLE_SHELL_ENABLED === 'true'
}

test.describe('the design system specimen', () => {
  test.skip(
    !gatesAreLit(),
    'the specimen renders inside the console shell; run with CONSOLE_SHELL_ENABLED=true'
  )

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT)
    await page.goto(SPECIMEN)
    await page.waitForLoadState('networkidle')
  })

  test('every type step renders at the size the scale declares', async ({ page }) => {
    // ⚠️ The scale is the SOURCE — this reads `TYPE` and checks the rendered page against it, rather
    // than hard-coding sizes here. A second list of sizes in a spec is the defect the whole epic is
    // named after: two things that must agree, kept as two things that currently do.
    await expect(page.locator('.ds-specimen')).toBeVisible()

    for (const [name, step] of Object.entries(TYPE)) {
      const sample = page.locator(`.ds-specimen-type--${name}`)
      await expect(sample, `the specimen renders no sample for TYPE.${name}`).toHaveCount(1)
      const size = await sample.evaluate((element) => getComputedStyle(element).fontSize)
      expect(size, `TYPE.${name} should render at ${step.px}px`).toBe(`${step.px}px`)
    }
  })

  test('every weight step renders at the weight the scale declares', async ({ page }) => {
    for (const [name, step] of Object.entries(WEIGHT)) {
      const sample = page.locator(`.ds-specimen-weight--${name}`)
      await expect(sample, `no sample for WEIGHT.${name}`).toHaveCount(1)
      const weight = await sample.evaluate((element) => getComputedStyle(element).fontWeight)
      expect(weight, `WEIGHT.${name} should render at ${step.px}`).toBe(String(step.px))
    }
  })

  test('the dialog opens CENTRED, which is the assertion this product has never had', async ({ page }) => {
    // ⚠️ THE POINT OF THIS TEST. A universal `* { margin: 0 }` reset defeats the UA's `margin: auto`
    // on `dialog:modal`, turning `inset: 0` into the top-left corner — and every confirmation dialog
    // in this product measured `x: 0, y: 0` from the day the component shipped until
    // `console-ia-overhaul` S3.3 found it by opening the page. Nothing asserted WHERE a dialog was;
    // the existing suite asserts modality, the focus trap and focus restoration, and never geometry.
    //
    // The fix has landed, so this cannot go red on `main` — its red comes from a mutation check
    // (delete `margin: auto` from `.ds-dialog`, watch this fail at x:0,y:0), recorded in the PR.
    await page.getByRole('button', { name: 'Open the confirmation dialog' }).click()
    const dialog = page.locator('dialog[data-specimen-dialog]')
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true)

    const box = await dialog.boundingBox()
    expect(box, 'the dialog rendered no box').not.toBeNull()
    if (!box) return

    // Centred, not merely "not at the origin": a dialog pinned to the top-left passes an
    // `x > 0` check the moment anything gives it a margin.
    const centreX = box.x + box.width / 2
    const centreY = box.y + box.height / 2
    expect(Math.abs(centreX - VIEWPORT.width / 2), `dialog centre x is ${centreX}`).toBeLessThan(2)
    expect(Math.abs(centreY - VIEWPORT.height / 2), `dialog centre y is ${centreY}`).toBeLessThan(2)

    // ...and the destructive action is not the one focused on open.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  })

  test('every interactive element shows a visible focus ring, keyboard only', async ({ page }) => {
    // `outline: none` without a replacement is the single most common way a design system locks out
    // keyboard users, and the guidelines name it. Asserted as PAINT — an outline width — not as the
    // presence of a `:focus-visible` rule somewhere in a stylesheet.
    const focusable = page.locator('.ds-specimen button:visible, .ds-specimen a:visible')
    const count = await focusable.count()
    expect(count, 'the specimen rendered nothing focusable').toBeGreaterThan(10)

    let checked = 0
    for (let index = 0; index < Math.min(count, 25); index += 1) {
      const element = focusable.nth(index)
      // Focus through the keyboard path, not `.focus()`: `:focus-visible` is precisely the
      // distinction between the two, and a mouse-focus check would pass on an element that shows
      // no ring to a keyboard user.
      await element.evaluate((node) => (node as HTMLElement).focus({ preventScroll: true }))
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      const outline = await element.evaluate((node) => {
        const style = getComputedStyle(node)
        return { width: style.outlineWidth, style: style.outlineStyle }
      })
      if (outline.style === 'none') continue
      expect(parseFloat(outline.width), 'a focused control has a zero-width outline').toBeGreaterThan(0)
      checked += 1
    }
    expect(checked, 'no focused element reported a painted outline at all').toBeGreaterThan(0)
  })

  test('the specimen fits its viewport and never scrolls sideways', async ({ page }) => {
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(
      geometry.scrollWidth,
      `the specimen is ${geometry.scrollWidth}px wide in a ${geometry.innerWidth}px viewport`
    ).toBeLessThanOrEqual(geometry.innerWidth)

    // Evidence for the human half of the review: the pair (this shot, the approved states) is how
    // the language gets approved or rejected.
    await page.screenshot({ path: 'test-results/design-system/specimen.png', fullPage: true })
  })

  test('the ten states are all reachable, and disabled does not look like unbuilt', async ({ page }) => {
    // ⚠️ The finding this sprint raised (F2.1): the taxonomy has TEN states, and the two the
    // guidelines say "must look different" were about to be built as one. This is what keeps them
    // different — a rendered difference, not a comment claiming there is one.
    const disabled = page.locator('.ds-btn[data-state="disabled"]').first()
    const unbuilt = page.locator('.ds-btn[data-state="unbuilt"]').first()
    await expect(disabled).toHaveCount(1)
    await expect(unbuilt).toHaveCount(1)

    const read = (locator: typeof disabled) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          opacity: style.opacity,
          borderStyle: style.borderTopStyle,
          color: style.color,
          background: style.backgroundColor,
        }
      })

    const [off, notBuilt] = [await read(disabled), await read(unbuilt)]
    expect(
      off.opacity !== notBuilt.opacity ||
        off.borderStyle !== notBuilt.borderStyle ||
        off.color !== notBuilt.color ||
        off.background !== notBuilt.background,
      'disabled and unbuilt render identically — the guidelines say they must look different'
    ).toBe(true)

    // And specifically: unbuilt stays LEGIBLE. The guidelines call it honest marketing that "should
    // read clearly", so dimming it is the one thing it must not do.
    expect(parseFloat(notBuilt.opacity), 'unbuilt is dimmed like a disabled control').toBeGreaterThan(0.9)
    expect(notBuilt.borderStyle, 'unbuilt is not visually distinct by its border').toBe('dashed')
  })
})
