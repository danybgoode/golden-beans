import { test, expect, type Page } from '@playwright/test'

// landing-redesign-v2 · Sprint 1, Story 1.2 — the mobile rail's guard.
//
// ── Why this is ONE parameterised spec and not one test per page ──────────────────────────────
// The two checks below already existed, hand-copied, in `landing.browser.spec.ts` — once for `/`
// and once for `/install`. That shape is why coverage stopped at two routes: adding the third
// meant copying a block, so nobody did, and the product grew to 27 route files with two of them
// checked. The ask for this epic was explicitly "heuristics as rails … we can build on top of
// them", so the unit of extension here is a ROW IN AN ARRAY. Covering the next route is one line,
// not one test.
//
// This is the `browser` project (opt-in, not the merge gate) because layout is a rendered fact:
// the `api` project has no layout engine and structurally cannot observe either of these.

/**
 * The public routes this rail sweeps.
 *
 * Public-only on purpose: this project is anonymous by construction (no `storageState`), so a
 * signed-in route would be asserted against its login redirect and the check would silently
 * become "does /login overflow" — a test that passes while measuring the wrong page. The signed-in
 * surfaces belong in an `*.authed.spec.ts` sweep that reuses `assertMobileClean` below; the helper
 * is exported for exactly that.
 */
export const PUBLIC_MOBILE_ROUTES = ['/', '/install', '/login'] as const

/**
 * Viewport widths every route is held to.
 *
 * 360 is the narrowest width `references/ux-guidelines.md` names ("nothing should need a
 * horizontal scrollbar at 360px wide"); 390 is the iPhone-class width most visitors actually
 * arrive on.
 */
const MOBILE_WIDTHS = [360, 390] as const

/** The tap-target floor from `references/ux-guidelines.md`, matching WCAG 2.5.5. */
const TAP_TARGET_MIN = 44

/**
 * Assert the two mobile facts, on whatever page is already loaded.
 *
 * Exported so an authed sweep can hold signed-in routes to the identical bar rather than
 * re-deriving what "mobile-clean" means — two definitions that currently agree is the setup for
 * two definitions that later don't.
 */
export async function assertMobileClean(page: Page, label: string) {
  for (const width of MOBILE_WIDTHS) {
    await page.setViewportSize({ width, height: 844 })

    // Nothing may make the PAGE scroll sideways. Note the rail deliberately does not use
    // `overflow-x: hidden` on the root — that would clamp scrollWidth to clientWidth and make this
    // assertion incapable of failing. See the long comment in globals.css.
    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ])
    expect(scrollWidth, `${label} overflows horizontally at ${width}px`).toBeLessThanOrEqual(clientWidth)

    // Every CONTROL meets the tap-target floor.
    //
    // The selector is deliberately the SAME SET the CSS rail sizes in globals.css — form controls,
    // buttons, and links styled as buttons (`a.btn`). Stating it as one explicit list on both
    // sides is what makes the rail and its guard agree by construction; the earlier draft of this
    // spec inferred the boundary from computed `display`, which would have quietly diverged from
    // the CSS the first time a component chose a different display value for the same intent.
    //
    // A link sitting inline in a sentence is exempt, and that is not a convenience: WCAG 2.5.5
    // excludes inline targets precisely because enlarging one has to change the line box of the
    // prose around it. So prose links and the footer's inline icon links are out of scope here,
    // while the hero's `a.btn` CTA — the target that actually matters on a phone — is in it.
    const undersized = await page.evaluate((min) => {
      const selector = 'button, summary, select, textarea, [role="button"], input, a.btn'

      // A checkbox or radio is never itself the target — its LABEL is, because clicking a label
      // activates its control. So the rect that matters is the label's, and globals.css sizes
      // exactly that. Measuring the 13x13 control instead would report every checkbox on the site
      // as a failure while the rail was working correctly, which is how the first version of this
      // pair disagreed with itself (see the checkbox comment in globals.css).
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
          // Removed from the accessibility tree AND unreachable by keyboard — nobody can target
          // it, so a minimum target size is meaningless. This is not a convenience exemption: the
          // waitlist form's spam honeypot is exactly this (`aria-hidden`, `tabindex="-1"`,
          // parked off-screen at 1x1) and it must stay invisible to humans to keep working.
          if (element.closest('[aria-hidden="true"]')) return false
          if (element.getAttribute('tabindex') === '-1') return false
          const rect = element.getBoundingClientRect()
          // Zero-area elements are not rendered here at all (a collapsed <details> panel, an
          // off-screen sheet); they are not a tap target until they are.
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

for (const route of PUBLIC_MOBILE_ROUTES) {
  test(`${route} is mobile-clean`, async ({ page }) => {
    const response = await page.goto(route)
    expect(response?.status(), `${route} did not render`).toBe(200)
    await assertMobileClean(page, route)
  })
}
