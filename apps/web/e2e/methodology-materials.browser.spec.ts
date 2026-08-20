import { test, expect, type Page } from '@playwright/test'
import { isOpaque } from './helpers/css-color'

// methodology-experience · Sprint 3, Story 3.3 — the materials pass and its mandatory fallbacks.
//
// ── Why this is measured through CDP and not `emulateMedia` ───────────────────────────────────
// Playwright's `emulateMedia` covers `reducedMotion`, `colorScheme`, `forcedColors` and `contrast`
// — but NOT `prefers-reduced-transparency`, which is the one preference D2 names first. Emulating
// it needs Chrome DevTools Protocol's `Emulation.setEmulatedMedia` with an explicit feature list.
//
// D2's rider says the fallbacks are "verified in a real browser, not inferred from the media
// query". That distinction is the whole point of this file: a `@media (prefers-reduced-transparency)`
// block can be present, correct and completely inert — because the engine does not implement the
// query, because a later rule outranks it, or because the selector does not match the element that
// actually paints. Every assertion below reads a COMPUTED value off the rendered page under the
// preference, and each one first asserts the emulation actually reached the page — an emulation
// that silently did not apply makes every check below it pass vacuously, which is the failure this
// spec exists to prevent.

/** Emulate one media feature through CDP and confirm the page agrees it is active. */
async function emulate(page: Page, feature: string, value: string) {
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: feature, value }] })
  return session
}

async function chromeStyles(page: Page) {
  return page.evaluate(() => {
    const read = (selector: string) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const s = getComputedStyle(el)
      return {
        background: s.backgroundColor,
        backdropFilter: s.backdropFilter || (s as unknown as Record<string, string>).webkitBackdropFilter,
        borderBottomColor: s.borderBottomColor,
      }
    }
    return {
      nav: read('.methodology-chrome .landing-nav'),
      toc: read('.methodology-chrome .methodology-toc'),
    }
  })
}

test('by default the chrome is a translucent material over the article', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/design-it')

  const styles = await chromeStyles(page)
  expect(styles.nav, 'the methodology topbar must exist').not.toBeNull()
  expect(styles.toc, 'the rail must exist at this width').not.toBeNull()

  expect(isOpaque(styles.nav!.background), 'the topbar is a translucent material').toBe(false)
  expect(styles.nav!.backdropFilter, 'the topbar carries a backdrop filter').toContain('blur')
  expect(isOpaque(styles.toc!.background), 'the rail is a translucent material').toBe(false)
  expect(styles.toc!.backdropFilter).toContain('blur')
})

// The rail must sit BELOW the sticky topbar, not under it.
//
// Story 3.1 set the rail's `top: 0` — correct then, because nothing on this page was sticky. This
// story made the topbar sticky, and the rail immediately rendered underneath it with its first
// entry clipped. The offset is now one custom property consumed by both, but CSS cannot read a
// sibling's height, so it is still a written-down number. This measures the two edges on the
// rendered page: if the nav ever outgrows the value, this fails rather than the rail quietly
// sliding back under the bar.
test('the sticky rail clears the sticky topbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/bring-an-idea')
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForFunction(() => window.scrollY > 500)

  const edges = await page.evaluate(() => {
    const nav = document.querySelector('.methodology-chrome .landing-nav')!.getBoundingClientRect()
    const toc = document.querySelector('.methodology-chrome .methodology-toc')!.getBoundingClientRect()
    const firstLink = document
      .querySelector('.methodology-chrome .methodology-toc .methodology-toc__link')!
      .getBoundingClientRect()
    return { navBottom: nav.bottom, tocTop: toc.top, firstLinkTop: firstLink.top, navTop: nav.top }
  })

  expect(edges.navTop, 'the topbar must actually be stuck while scrolled').toBeLessThanOrEqual(1)
  expect(
    edges.tocTop,
    'the rail must start at or below the topbar, not underneath it'
  ).toBeGreaterThanOrEqual(edges.navBottom - 1)
  expect(
    edges.firstLinkTop,
    "the rail's first chapter must not be clipped by the topbar"
  ).toBeGreaterThanOrEqual(edges.navBottom - 1)
})

// The rider, one preference at a time. Each asserts the emulation LANDED before concluding
// anything from what it then measured.
for (const [label, feature] of [
  ['reduced transparency', 'prefers-reduced-transparency'],
  ['increased contrast', 'prefers-contrast'],
] as const) {
  const value = feature === 'prefers-contrast' ? 'more' : 'reduce'

  test(`with ${label} requested, the chrome degrades to an OPAQUE, legible surface`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await emulate(page, feature, value)
    await page.goto('/methodology/design-it')

    const active = await page.evaluate((q) => matchMedia(q).matches, `(${feature}: ${value})`)
    expect(active, `the ${label} emulation must actually reach the page`).toBe(true)

    const styles = await chromeStyles(page)
    expect(isOpaque(styles.nav!.background), `${label}: the topbar must be opaque`).toBe(true)
    expect(styles.nav!.backdropFilter, `${label}: the topbar must drop its blur`).toBe('none')
    expect(isOpaque(styles.toc!.background), `${label}: the rail must be opaque`).toBe(true)
    expect(styles.toc!.backdropFilter, `${label}: the rail must drop its blur`).toBe('none')

    // "Still hierarchical" is half the rider — an opaque bar that dissolves into the article is a
    // different failure from an illegible one. The hairline survives when the material does not.
    expect(
      isOpaque(styles.nav!.borderBottomColor) && styles.nav!.borderBottomColor !== styles.nav!.background,
      `${label}: the chrome must still separate from the article`
    ).toBe(true)
  })
}

test('with reduced motion requested, the chapter does not animate in', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/design-it')

  const motion = await page.evaluate(() => {
    const el = document.querySelector('.methodology-article')!
    const s = getComputedStyle(el)
    return {
      queryMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationName: s.animationName,
      opacity: s.opacity,
    }
  })

  expect(motion.queryMatches, 'the emulation must reach the page').toBe(true)
  expect(motion.animationName, 'the chapter-arrival animation must be off').toBe('none')
  // The specific failure this pins: `animation: … both` applies its `from` state even when the
  // duration is zeroed, so switching the animation off by TOKEN alone would leave a reader with
  // the preference set looking at a chapter stuck at `opacity: 0`.
  expect(Number(motion.opacity), 'the chapter must be visible, not stuck at its from-state').toBe(1)
})

// The circuit breaker's remaining live criterion: `backdrop-filter` over a scrolling article is the
// one thing here with a real cost. Measured on the LONGEST chapter, because that is where a
// compositing cost would actually show.
test('scrolling the longest chapter with the material on does not drop frames', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/methodology/build-it')

  const frames = await page.evaluate(async () => {
    const times: number[] = []
    let last = performance.now()
    let raf = 0
    const tick = () => {
      const now = performance.now()
      times.push(now - last)
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    for (let y = 0; y < 3000; y += 60) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 16))
    }
    cancelAnimationFrame(raf)
    return times.slice(2)
  })

  expect(frames.length, 'the scroll must actually have produced frames to measure').toBeGreaterThan(20)
  const long = frames.filter((f) => f > 50).length
  // A generous bound on purpose: this runs on shared CI hardware and is a smoke test for a
  // pathological compositing cost, not a benchmark. It fails if the material makes scrolling
  // genuinely janky, not if one frame is late.
  expect(
    long / frames.length,
    `${long} of ${frames.length} frames took over 50ms while scrolling the longest chapter`
  ).toBeLessThan(0.25)
})
