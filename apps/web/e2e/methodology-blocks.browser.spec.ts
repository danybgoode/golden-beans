import { test, expect, type Page } from '@playwright/test'
import { contrastRatio, parseCssColor } from './helpers/css-color'
import { METHODOLOGY_CHAPTERS, WORK_LABELS, type WorkVariant } from '@/lib/methodology-chapters'

// methodology-experience · Sprint 3, Story 3.2 — the work-block family as primitives.
//
// The `browser` project, because every property this spec checks is a rendered fact: a computed
// background, a computed border, a computed text colour against the surface actually painted
// behind it. The `api` project has no layout or paint engine and structurally cannot see any of
// this (same reasoning as `e2e/methodology-shell.browser.spec.ts`'s header note).
//
// ── The variant list comes from the module, not from this file ─────────────────────────────────
// `Object.keys(WORK_LABELS)` rather than a hardcoded `['do', 'agent', 'look', 'yours', 'learned']`
// — a sixth variant added to the taxonomy (or one renamed) should make this spec cover it or fail
// loudly, not silently keep checking a stale list.
const WORK_VARIANTS = Object.keys(WORK_LABELS) as WorkVariant[]

/**
 * The first chapter whose `blocks[]` contains a work block of the given variant, so this spec
 * exercises the real content module (D5 — the module is the SSOT) instead of a synthetic fixture.
 *
 * Asserts a match before returning: CODE-QUALITY's rule for extractors applies to test helpers as
 * much as app code — an extractor that silently returns nothing for a variant would make the
 * later loop iterate zero times for it, and a suite with one fewer iteration than intended still
 * reports green.
 */
function firstChapterWithVariant(variant: WorkVariant): string {
  const chapter = METHODOLOGY_CHAPTERS.find((entry) =>
    entry.blocks.some((block) => block.kind === 'work' && block.variant === variant)
  )
  if (!chapter) {
    throw new Error(`no chapter contains a '${variant}' work block — this spec has nothing to exercise`)
  }
  return chapter.id
}

/**
 * The variant's own visible card — not always `.work--{variant}` itself. The `agent` arm renders
 * `CopyPromptCard` and owns no chrome of its own (D8, and `.work--agent`'s CSS sets
 * `background: none; border: none`), so the surface a reader actually sees is `.prompt-card`
 * nested inside it. Every other variant paints directly on `.work--{variant}`.
 */
function surfaceLocator(page: Page, variant: WorkVariant) {
  const wrapper = page.locator(`.work--${variant}`).first()
  return variant === 'agent' ? wrapper.locator('.prompt-card') : wrapper
}

/**
 * The variant's own body-text nodes — the elements `:where(.work) :where(p, li)` colours `--dim`
 * for every non-agent variant, and `CopyPromptCard`'s own `.prompt-copy` for `agent`. Not the
 * `.work__label` kicker or a `.methodology-lead-line` — those are call-outs, not body prose, and
 * the acceptance is specifically about body text against its own card.
 */
function bodyTextLocator(page: Page, variant: WorkVariant) {
  if (variant === 'agent') return page.locator('.work--agent .prompt-copy')
  return page.locator(`.work--${variant}`).first().locator('p:not(.methodology-lead-line), li')
}

async function gotoVariant(page: Page, variant: WorkVariant) {
  await page.goto(`/methodology/${firstChapterWithVariant(variant)}`)
}

// ── WCAG contrast, computed from REAL rendered colours ──────────────────────────────────────────
// The ratio itself comes from `helpers/css-color.ts`, which is unit-tested and understands all
// three serialisations `getComputedStyle` can return — including `color(srgb …)`, which is what
// every tinted work-card background (`do`, `look`) computes to because it is a `color-mix()`.
// This file used to carry its own parser; two specs having two of them is how one of them ends up
// wrong, and the copy in the materials spec was wrong in a way that passed (PR #107, round 2).

/**
 * Walks up from an element to the nearest ancestor (inclusive) that actually PAINTS a background —
 * the card the text sits on, which is not necessarily its own parent.
 *
 * "Painted" is decided by ALPHA, not by matching strings. An earlier version compared against
 * `'transparent'` and `'rgba(0, 0, 0, 0)'` literally, which misses every other zero-alpha
 * spelling — `rgba(255, 255, 255, 0)`, `color(srgb 1 1 1 / 0)`, the space-separated forms — and
 * would then measure contrast against a surface that paints NOTHING, reporting a ratio for a
 * colour the reader never sees (Antigravity, round 4 of PR #107).
 *
 * The walk happens in Node rather than in the page so it can use the shared, tested parser instead
 * of a second copy shipped into `evaluate`.
 */
async function ownBackgroundColor(locator: ReturnType<Page['locator']>) {
  const chain: string[] = await locator.evaluate((el) => {
    const backgrounds: string[] = []
    let node: Element | null = el
    while (node) {
      backgrounds.push(getComputedStyle(node).backgroundColor)
      node = node.parentElement
    }
    return backgrounds
  })

  for (const background of chain) {
    if (parseCssColor(background).a > 0) return background
  }
  throw new Error('no ancestor painted a background — walked off the document')
}

test.describe('the work-block family renders as distinct primitives', () => {
  test('each variant paints a visually distinct surface (background + top border)', async ({ page }) => {
    const surfaces: {
      variant: WorkVariant
      background: string
      borderColor: string
      borderStyle: string
      borderWidth: string
    }[] = []

    for (const variant of WORK_VARIANTS) {
      await gotoVariant(page, variant)
      const surface = surfaceLocator(page, variant)
      await expect(surface, `'${variant}' must render its card`).toHaveCount(1)

      const style = await surface.evaluate((el) => {
        const computed = getComputedStyle(el)
        return {
          background: computed.backgroundColor,
          borderColor: computed.borderTopColor,
          borderStyle: computed.borderTopStyle,
          borderWidth: computed.borderTopWidth,
        }
      })
      surfaces.push({ variant, ...style })
    }

    // Matched something for every variant before concluding anything from the set — an empty loop
    // above would otherwise satisfy every assertion below vacuously.
    expect(surfaces).toHaveLength(WORK_VARIANTS.length)

    for (let i = 0; i < surfaces.length; i += 1) {
      for (let j = i + 1; j < surfaces.length; j += 1) {
        const a = surfaces[i]
        const b = surfaces[j]
        const identical =
          a.background === b.background &&
          a.borderColor === b.borderColor &&
          a.borderStyle === b.borderStyle &&
          a.borderWidth === b.borderWidth
        expect(identical, `'${a.variant}' and '${b.variant}' must not render an identical surface`).toBe(
          false
        )
      }
    }
  })

  // The point of Story 3.2, not a nice-to-have: every variant's own body text must clear 4.5:1
  // against the background actually painted behind it. Written so a variant restyled into an
  // unreadable combination (a darker tint, a lighter — or wrong-family — text colour) fails this,
  // rather than merely failing to match a hardcoded expected-colour string.
  test('every variant clears 4.5:1 body-text contrast against its own card background', async ({ page }) => {
    const measured: { variant: WorkVariant; ratio: number }[] = []

    for (const variant of WORK_VARIANTS) {
      await gotoVariant(page, variant)
      const textNodes = bodyTextLocator(page, variant)
      const count = await textNodes.count()
      expect(
        count,
        `'${variant}' must render at least one body-text node to measure contrast on`
      ).toBeGreaterThan(0)

      for (let i = 0; i < count; i += 1) {
        const node = textNodes.nth(i)
        const color = await node.evaluate((el) => getComputedStyle(el).color)
        const background = await ownBackgroundColor(node)
        const ratio = contrastRatio(color, background)
        measured.push({ variant, ratio })
        expect(
          ratio,
          `'${variant}' body text vs its own card background must clear 4.5:1 (measured ${ratio.toFixed(2)}:1)`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }

    expect(
      measured.length,
      'the loop above must have measured at least one node per variant'
    ).toBeGreaterThanOrEqual(WORK_VARIANTS.length)
  })
})

// D8: the `agent` variant IS `CopyPromptCard`, and nothing else — no wrapper text, no second
// copy-to-clipboard implementation. `e2e/landing.browser.spec.ts` already asserts the clipboard
// round trip for `CopyPromptCard` itself; this spec's job is only that the methodology page reaches
// that same component rather than a lookalike.
test('the agent variant renders CopyPromptCard, and only CopyPromptCard', async ({ page }) => {
  await gotoVariant(page, 'agent')

  const wrapper = page.locator('.work--agent').first()
  await expect(wrapper.locator('.prompt-card'), 'the agent card must be CopyPromptCard').toHaveCount(1)

  // The generic branch (`work__label` + body blocks) is what every OTHER variant renders. If the
  // agent arm ever fell back to it — or grew a second label alongside the card — this would catch
  // it; today's render path (MethodologyBlocks.tsx) makes it impossible by construction, which is
  // exactly the property worth pinning rather than trusting the source read.
  await expect(wrapper.locator('.work__label')).toHaveCount(0)

  // One copy control, not two: a second hand-rolled "copy" button anywhere in the card would be
  // the second implementation D8 forbids.
  const copyButtons = wrapper.locator('button', { hasText: /copy/i })
  await expect(copyButtons).toHaveCount(1)
})
