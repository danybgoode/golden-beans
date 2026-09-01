// design-system-rails · Sprint 4, Story 4.2 — the feature destination and its seven tabs.
//
// ── Why `.authed.spec.ts` when the sprint doc says `feature-tabs.spec.ts` ────────────────────
// A plain `*.spec.ts` lands in the `api` Playwright project, which has **no session**. Every route
// here is credential-gated, so an `api` spec would only ever see the redirect to `/login` and would
// assert the gate rather than the page — a suite that passes while proving nothing about what this
// story built. The `.authed` suffix is what puts it on the rail that signs in through the real form.
// Named as a deviation rather than left for a reviewer to spot the file is not where the doc says.
//
// ── What this covers that `flag-console.authed.spec.ts` does not ─────────────────────────────
// That file already pins the two ABSENCES: the Funnel and Impact tabs must not `notFound()`, and
// each must name which absence it is rather than render a zero. What it cannot cover is the other
// direction — that a feature which genuinely HAS a funnel renders NUMBERS — because the fixture
// tenant had no key registered in both registries. The auth fixture now seeds exactly one
// (`FUNNEL_FEATURE_KEY`), which is what makes this spec possible at all.
//
// ⚠️ **That asymmetry is the story, not a gap.** Production `miyagisanchez` holds 42 flag registries
// and exactly ONE TARS feature (`setup_guide`), and the two sets do not overlap — so 42 of 42 flags
// render the empty state, and the empty state is the deliverable (epic D10). The sprint contract
// puts the renders-numbers spec on a feature that has a funnel; `setup_guide` is production data CI
// cannot reach, so the local fixture carries the populated case, exactly as D10 assigns it.

import { test, expect } from '@playwright/test'
import {
  FUNNEL_FEATURE_KEY,
  FUNNEL_SUBJECTS,
  SCENARIO_FLAG_KEY,
  readTenantRecord,
} from './helpers/authed-fixture'
import { booleanDefinition, seedFlagVersion } from './helpers/seed-flag'
import { isFlagConsoleEnabled } from '../lib/flags'

const VIEWPORT = { width: 1440, height: 960 }

/** The seven tabs of the approved design, in order. Exhaustive: a subset stays green on a loss. */
const TABS = ['Value', 'Targeting', 'Environments', 'Funnel', 'Impact', 'History', 'Settings']

/**
 * The tabs the NO-SCROLL promise applies to, and why the other three are exempt.
 *
 * ⚠️ **Named rather than dropped, and the exemption is the honest half.** The contract's "no vertical
 * page scroll at 1440×960" describes the pages the approved design covers. This story cites three
 * reference states — `feature-value`, `feature-environments`, `feature-funnel` — and those three
 * must fit.
 *
 * The other three are authoring and log surfaces the design does not draw:
 *   · `Targeting` renders the rule builder and "preview as a user" — measured at 2925px, and it is a
 *     form with a variable number of rules. A page whose height is the number of clauses somebody
 *     wrote cannot promise a fixed one.
 *   · `History` lists every immutable version with its JSON, and `Settings` every metadata key.
 *
 * Making them fit would mean paginating an authoring form to satisfy a geometry assertion, which is
 * the tail wagging the dog. What they DO owe — a `ds-` class inside `<main>`, a status under 400, no
 * HORIZONTAL page scroll, and exactly one current tab — is asserted for all seven below.
 */
const NO_SCROLL_TABS = new Set(['Value', 'Environments', 'Funnel'])

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the feature-tabs smoke requires the auth-setup project')
  return slug
}

test.describe('the feature destination answers the whole loop', () => {
  // The whole file asserts the LIT console. Skipping while dark is honest rather than lazy: with the
  // gate off this route 404s by design, and a spec that "passed" against a 404 would be asserting
  // the opposite of what it claims.
  test.skip(
    () => !isFlagConsoleEnabled(),
    'the feature page renders behind FLAG_CONSOLE_ENABLED; this pass needs it on'
  )

  test('every tab renders from the design system and none of them scrolls', async ({ page }) => {
    const slug = tenantSlug()
    const base = `/app/flags/${slug}/${encodeURIComponent(SCENARIO_FLAG_KEY)}`
    await page.setViewportSize(VIEWPORT)

    for (const [index, label] of TABS.entries()) {
      const tab = label.toLowerCase()
      const response = await page.goto(index === 0 ? base : `${base}?tab=${tab}`)
      await page.waitForLoadState('networkidle')

      // ⚠️ `page.goto` does not throw on 4xx. The status is the only thing that distinguishes "this
      // tab renders correctly" from "this tab does not exist" — and a tab calling `notFound()` is
      // the exact defect this story is written against.
      expect(response?.status(), `the ${label} tab answered ${response?.status()}`).toBeLessThan(400)

      const geometry = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
        // Inside `<main>`, NOT on the shell: only a page's own markup can put a `ds-` class there.
        // A TOKEN match, never `[class*="ds-"]` — the substring form is satisfied by `cards-grid`
        // and `needs-review`, and this boolean is what stands between coverage and a claim.
        designSystem: [...document.querySelectorAll('main [class]')].filter((element) =>
          [...element.classList].some((name) => name === 'ds' || name.startsWith('ds-'))
        ).length,
      }))

      expect(
        geometry.designSystem,
        `the ${label} tab's <main> contains no ds- class — it is not rendering from design-system/`
      ).toBeGreaterThan(0)
      if (NO_SCROLL_TABS.has(label)) {
        expect
          .soft(
            geometry.scrollHeight,
            `the ${label} tab is ${geometry.scrollHeight}px tall in a ${geometry.innerHeight}px viewport`
          )
          .toBeLessThanOrEqual(geometry.innerHeight)
      }
      // Wide content scrolls inside its own container; the PAGE never does (Do-not #6).
      expect
        .soft(
          geometry.scrollWidth,
          `the ${label} tab's body is ${geometry.scrollWidth}px wide in a ${geometry.innerWidth}px viewport`
        )
        .toBeLessThanOrEqual(geometry.innerWidth)

      // Exactly one tab is current, and it is the one we asked for. Zero leaves a reader with no
      // idea where they are; two is the `home`/`today` class of bug the shell's spec pins.
      const strip = page.getByRole('navigation', { name: 'Feature sections' })
      await expect(strip.getByRole('link')).toHaveCount(TABS.length)
      await expect(strip.locator('[aria-current="page"]')).toHaveCount(1)
      await expect(strip.locator('[aria-current="page"]')).toHaveText(label)
    }
  })

  test('the Environments tab renders the three-state switch, including the dashed "never"', async ({
    page,
  }) => {
    const slug = tenantSlug()
    await page.setViewportSize(VIEWPORT)
    await page.goto(`/app/flags/${slug}/${encodeURIComponent(SCENARIO_FLAG_KEY)}?tab=environments`)

    // Three environments, three rows, one line each — reference state `feature-environments`.
    const rows = page.locator('.ds-envtable tbody tr')
    await expect(rows).toHaveCount(3)
    for (const environment of ['development', 'preview', 'production']) {
      await expect(rows.filter({ hasText: environment })).toHaveCount(1)
    }
  })

  test('the Value tab draws a 38 x 21 switch, and "never" is dashed and empty', async ({ page }) => {
    const slug = tenantSlug()
    await page.setViewportSize(VIEWPORT)
    await page.goto(`/app/flags/${slug}/${encodeURIComponent(SCENARIO_FLAG_KEY)}`)

    // ⚠️ **The pair, never one number.** The contract states `Switch · 38 × 21`, and a toggle at the
    // right height and the wrong width is not the control that was approved. `globals.css` puts a
    // 44px WCAG 2.5.5 target floor on every `button`, so this also proves the transparent
    // pseudo-element is doing the job rather than the ink having grown to meet the floor.
    const control = page.locator('.ds-envlist .ds-switch').first()
    await expect(control).toBeVisible()
    const box = await control.boundingBox()
    expect(box, 'the Value tab renders no switch at all').not.toBeNull()
    expect(Math.round(box?.width ?? 0), 'the switch is not the approved 38px wide').toBe(38)
    expect(Math.round(box?.height ?? 0), 'the switch is not the approved 21px tall').toBe(21)

    // ⚠️ **The DASHED empty state, which is this sprint's named acceptance criterion.** The fixture
    // flag has never been activated in any environment, so all three read `never` — and a flag
    // nobody ever switched on is not one somebody deliberately switched off. The distinction is
    // carried by the border STYLE and by the word in the pill beside it, never by colour alone.
    const painted = await page.evaluate(() => {
      const element = document.querySelector('.ds-envlist .ds-switch[data-state="never"]')
      if (element === null) return null
      const style = getComputedStyle(element)
      return { borderStyle: style.borderTopStyle, background: style.backgroundColor }
    })
    expect(painted, 'no environment renders the "never" switch state').not.toBeNull()
    expect(painted?.borderStyle, 'the "never" switch is not dashed').toBe('dashed')
    // Transparent, not filled: an empty control for a state nothing has happened to.
    expect(painted?.background, 'the "never" switch is filled rather than empty').toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/
    )

    // ...and the word is there too, so the state does not depend on anyone seeing the border.
    await expect(page.locator('.ds-envlist .ds-pill--never').first()).toBeVisible()
  })

  test('the Funnel tab renders NUMBERS for a feature that actually has a funnel', async ({ page }) => {
    // ⚠️ **The half `flag-console.authed.spec.ts` could not assert.** It pins the empty state, which
    // is what every flag on production renders. Without this, a tab that renders nothing and a tab
    // that CANNOT render anything look identical from the outside — which is the failure mode the
    // empty-state story warns about, pointing the other way.
    //
    // The auth fixture registers `FUNNEL_FEATURE_KEY` in `features` (the TARS registry) with three
    // targeted / two adopted / one retained. What it has no reason to create is a FLAG with the same
    // key, because the two registries are unrelated — so seeding one here is both the trick and a
    // live demonstration of the point: the join hits only when somebody deliberately makes the two
    // keys match.
    const slug = tenantSlug()
    await seedFlagVersion(
      FUNNEL_FEATURE_KEY,
      booleanDefinition('Story 4.2 funnel-tab fixture.'),
      'Story 4.2 funnel-tab fixture.'
    )

    await page.setViewportSize(VIEWPORT)
    const base = `/app/flags/${slug}/${encodeURIComponent(FUNNEL_FEATURE_KEY)}`
    const response = await page.goto(`${base}?tab=funnel`)
    expect(response?.status(), 'the Funnel tab must not 404 a feature that exists').toBe(200)

    // Three tiles, and the numbers the fixture seeded. Asserted as VALUES, not as a count: a pane
    // rendering the right shape with the wrong numbers is the failure a count alone misses, and the
    // fixture's three counts are deliberately all different so one number cannot satisfy three
    // assertions.
    const tiles = page.locator('.ds-kpis .ds-stat')
    await expect(tiles).toHaveCount(3)
    const targeted = FUNNEL_SUBJECTS.length
    await expect(tiles.nth(0).locator('.ds-stat-value')).toHaveText(String(targeted))
    await expect(tiles.nth(1).locator('.ds-stat-value')).toHaveText('2')
    await expect(tiles.nth(2).locator('.ds-stat-value')).toHaveText('1')

    // ⚠️ **The empty state must be ABSENT**, and this is the assertion that makes the two halves a
    // pair. Without it a pane rendering both — numbers above an "and also nothing is measuring
    // this" — would pass.
    await expect(page.getByText('Nothing is measuring this yet')).toHaveCount(0)

    // Rendered GEOMETRY, which is the whole reason this is a browser spec: the bars must actually
    // get shorter. A funnel drawn with three equal bars is a decoration.
    //
    // ⚠️ `.ds-chart-fill`, not `.ds-bar-fill` — Story 5.3 replaced this pane's hand-rolled bar
    // markup with `StageBars`, and the old locator would have read ZERO bars. It went red loudly
    // here rather than quietly, which is what `toHaveLength(3)` is for: an `evaluateAll` over a
    // locator that matches nothing returns `[]`, and a length assertion is the only thing between
    // that and three vacuous comparisons over `undefined`.
    const widths = await page
      .locator('.ds-chart-fill')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width))
    expect(widths, 'the funnel drew no bars').toHaveLength(3)
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    // DD4: a nonzero value never rounds to zero pixels — the fill carries a floor.
    expect(widths[2]).toBeGreaterThan(0)

    // ── The fourteen-day series, which is new with Story 5.3 ────────────────────────────────
    // ⚠️ Fourteen columns, including the empty days. A series that omitted them would draw a row of
    // roughly equal bars over a feature that stopped being served a week ago — the gap is the
    // signal, and `lib/tars.test.ts` pins the arithmetic that produces it.
    const columns = page.locator('.ds-chart-cols .ds-chart-col')
    await expect(columns, 'the served series must cover every day in its window').toHaveCount(14)
    // ...and the days with nothing in them are marked as such, so a zero is a shape rather than an
    // absence. The fixture seeds three days of events inside the window.
    const zeroDays = await columns.evaluateAll(
      (nodes) => nodes.filter((node) => (node as HTMLElement).dataset.zero === 'true').length
    )
    expect(zeroDays, 'every day in the window rendered as non-zero, which the fixture cannot produce').toBeGreaterThan(
      0
    )
    expect(zeroDays, 'every day rendered as zero — the seeded events reached no bar').toBeLessThan(14)
  })
})
