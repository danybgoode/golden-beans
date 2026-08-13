import { expect, type Page } from '@playwright/test'

/**
 * Viewport widths every mobile route is held to.
 *
 * 360 is the narrowest width `references/ux-guidelines.md` names; 390 is the iPhone-class width
 * most visitors actually arrive on.
 */
const MOBILE_WIDTHS = [360, 390] as const

/** The tap-target floor from `references/ux-guidelines.md`, matching WCAG 2.5.5. */
const TAP_TARGET_MIN = 44

/**
 * Assert the shared mobile contract on whatever page is already loaded.
 *
 * This helper declares no tests. Both anonymous and authenticated suites import it, so importing
 * the rule cannot accidentally register the public spec inside the authed project.
 */
export async function assertMobileClean(page: Page, label: string) {
  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })

    const overflow = await page.evaluate(() => {
      const root = document.documentElement
      const offenders = Array.from(document.querySelectorAll('body *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) return false
          if (rect.right <= root.clientWidth + 1 && rect.left >= -1) return false

          // Wide content is allowed when its nearest clipping/scrolling ancestor contains it.
          // Report only boxes that can actually widen the document, not table cells correctly
          // living inside `.data-table__scroll` or another deliberate horizontal rail.
          let ancestor = element.parentElement
          while (ancestor && ancestor !== document.body) {
            const style = getComputedStyle(ancestor)
            if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
              const bounds = ancestor.getBoundingClientRect()
              if (bounds.left >= -1 && bounds.right <= root.clientWidth + 1) return false
            }
            ancestor = ancestor.parentElement
          }
          return true
        })
        .slice(0, 8)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const identity = element.id
            ? `#${element.id}`
            : Array.from(element.classList)
                .slice(0, 2)
                .map((name) => `.${name}`)
                .join('')
          return `<${element.tagName.toLowerCase()}${identity}> ${Math.round(rect.left)}..${Math.round(rect.right)}`
        })

      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders }
    })
    expect(
      overflow.scrollWidth,
      `${label} overflows horizontally at ${width}px; outside boxes: ${overflow.offenders.join(', ') || 'none found'}`
    ).toBeLessThanOrEqual(overflow.clientWidth)

    const undersized = await page.evaluate((min) => {
      // Keep this selector identical to the zero-specificity CSS rail in globals.css. Form
      // controls, buttons and button-styled links are targets; links inside prose are exempt.
      const selector = 'button, summary, select, textarea, [role="button"], input, a.btn'

      const targetOf = (element: Element): Element => {
        if (
          element instanceof HTMLInputElement &&
          (element.type === 'checkbox' || element.type === 'radio')
        ) {
          return element.closest('label') ?? element
        }
        return element
      }

      return Array.from(document.querySelectorAll(selector))
        .map(targetOf)
        .filter((element) => {
          const style = getComputedStyle(element)
          if (style.display === 'none' || style.visibility === 'hidden') return false
          if (element instanceof HTMLInputElement && element.type === 'hidden') return false
          if (element.closest('[aria-hidden="true"]')) return false
          if (element.getAttribute('tabindex') === '-1') return false
          const rect = element.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) return false
          return rect.height < min || rect.width < min
        })
        .map((element) => {
          const rect = element.getBoundingClientRect()
          const text = (element.textContent ?? '').trim().slice(0, 40)
          return `<${element.tagName.toLowerCase()}> "${text}" ${Math.round(rect.width)}x${Math.round(rect.height)}`
        })
    }, TAP_TARGET_MIN)

    expect(undersized, `${label} has tap targets under ${TAP_TARGET_MIN}px at ${width}px`).toEqual([])
  }
}
