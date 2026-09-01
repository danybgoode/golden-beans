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

      /**
       * How big the tap target ACTUALLY is, counting a transparent pseudo-element.
       *
       * ⚠️ **This is the half the heuristic was missing, and it was reporting a correct control as a
       * defect.** Some of this product's controls have ink SMALLER than 44px on purpose — the
       * approved design's three-state switch is `38 × 21`, a number the visual gate asserts, and the
       * row menu is a 26px kebab. Growing them to 44 would break the design; leaving them at 26
       * would break the WCAG 2.5.5 target size. The resolution both use is a transparent, centred
       * `::before` sized 44 × 44: the TARGET is real and the INK is the design's.
       *
       * `getBoundingClientRect()` cannot see that — a pseudo-element has no box in the DOM — so the
       * scan measured the ink and called a correct control undersized. It now asks the style system
       * for the pseudo-element's size and takes the larger of the two, which is what a finger
       * actually gets.
       *
       * Deliberately NOT a blanket exemption for `.ds-switch` and `.ds-kebab` by class name: a class
       * list is a promise that decays the moment somebody removes the pseudo-element, whereas this
       * reads the same computed style the browser hit-tests against.
       */
      /**
       * How big the tap target ACTUALLY is, counting a transparent pseudo-element.
       *
       * ⚠️ **This is the half the heuristic was missing, and it was reporting a correct control as a
       * defect.** Some of this product's controls have ink SMALLER than 44px on purpose — the
       * approved design's three-state switch is `38 × 21`, a number the visual gate asserts, and the
       * row menu is a 26px kebab. Growing them to 44 would break the design; leaving them at 26
       * would break the WCAG 2.5.5 target size. The resolution both use is a transparent `::before`
       * sized 44 × 44, inset to the element's centre and pulled back by half its own size.
       *
       * `getBoundingClientRect()` cannot see that — a pseudo-element has no box in the DOM — so the
       * scan measured the ink and called a correct control undersized.
       *
       * ⚠️ **It RECONSTRUCTS the pseudo's box rather than trusting its declared size**, and three
       * weaker versions of this check are the reason. A pseudo can declare 44 × 44 and still not be
       * the target: laid out in normal flow beside the control, or offset off it entirely. The first
       * version read `width`/`height` alone; the second's two halves disagreed about which case they
       * excluded and admitted an untransformed pseudo; the third compared `top` to the literal `50%`,
       * which `getComputedStyle` resolves to used pixels, so it rejected the markup it was written to
       * accept. **The fourth was mutation-checked**: deleting the `inset` from `.ds-kebab::before`
       * must turn this red, and it does.
       *
       * The property asserted is the one a finger cares about: the pseudo's box covers the element's
       * centre, and is at least `min` on both axes. Both axes come from the SAME pseudo-element — a
       * wide `::after` and a tall `::before` are two half-targets, not one whole one.
       */
      const effectiveSize = (element: Element): { width: number; height: number } => {
        const rect = element.getBoundingClientRect()
        let best = { width: rect.width, height: rect.height }
        for (const pseudo of ['::before', '::after'] as const) {
          const style = getComputedStyle(element, pseudo)
          // `content: none` means the pseudo-element is not generated at all.
          if (style.content === 'none' || style.content === '') continue
          // Only an element the browser actually hit-tests counts. A `pointer-events: none`
          // decoration is paint, not a target.
          if (style.pointerEvents === 'none') continue
          if (style.position !== 'absolute' && style.position !== 'fixed') continue
          const width = Number.parseFloat(style.width)
          const height = Number.parseFloat(style.height)
          const top = Number.parseFloat(style.top)
          const left = Number.parseFloat(style.left)
          if (![width, height, top, left].every((value) => Number.isFinite(value))) continue

          // The transform's translation, read off the computed matrix rather than assumed. A centring
          // `translate(-50%, -50%)` resolves to `matrix(1, 0, 0, 1, -w/2, -h/2)`; `none` means the
          // box sits at its inset origin, which for a 44px target on a 26px control is beside it.
          const matrix = /^matrix\(([^)]+)\)$/.exec(style.transform)
          const parts = matrix === null ? [] : matrix[1].split(',').map((part) => Number.parseFloat(part))
          const translateX = parts.length === 6 && Number.isFinite(parts[4]) ? parts[4] : 0
          const translateY = parts.length === 6 && Number.isFinite(parts[5]) ? parts[5] : 0

          // `top`/`left` are resolved against the offset parent's padding box; for these controls the
          // element IS the offset parent (`position: relative`), so the element's own rect is the
          // origin. An `::before` on a non-relative parent would measure against something further
          // up — which is exactly the case this reconstruction is meant to refuse, and it does,
          // because the box then lands nowhere near the centre.
          const boxLeft = rect.left + left + translateX
          const boxTop = rect.top + top + translateY
          const centreX = rect.left + rect.width / 2
          const centreY = rect.top + rect.height / 2
          const coversCentre =
            boxLeft <= centreX &&
            boxLeft + width >= centreX &&
            boxTop <= centreY &&
            boxTop + height >= centreY
          if (!coversCentre) continue

          if (Math.min(width, height) > Math.min(best.width, best.height)) best = { width, height }
        }
        return best
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
          const size = effectiveSize(element)
          return size.height < min || size.width < min
        })
        .map((element) => {
          const size = effectiveSize(element)
          const text = (element.textContent ?? '').trim().slice(0, 40)
          return `<${element.tagName.toLowerCase()}> "${text}" ${Math.round(size.width)}x${Math.round(size.height)}`
        })
    }, TAP_TARGET_MIN)

    expect(undersized, `${label} has tap targets under ${TAP_TARGET_MIN}px at ${width}px`).toEqual([])
  }
}
