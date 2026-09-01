// The charting primitives, asserted on a rendered page — design-system-rails · Sprint 5, Story 5.1.
//
// ── Why these assertions and not others ───────────────────────────────────────────────────────
// `design-system/charts/geometry.test.ts` already pins the arithmetic without a browser, and that
// is where the arithmetic belongs. What a unit test structurally cannot see is the half that
// actually goes wrong on a chart:
//
//   · a 4px floor declared in CSS and then overridden by something further down the cascade
//   · a status colour whose accompanying WORD was never rendered
//   · `tabular-nums` promised in a comment and not computed by the browser
//   · a zero-value bar that IS drawn, because the floor gave it four pixels
//
// Each of those is green in every unit test, invisible in a diff, and wrong on screen — which is
// the exact class of defect this epic exists to make impossible.
//
// ⚠️ **`.authed`, not `.browser`** (epic D5-a, sprint L6). The `browser` project runs nowhere, and a
// plain `*.spec.ts` lands in `api`, which has no session and would only ever assert the redirect to
// `/login`. Every new visual row lands in `authed` or it is not in the gate.

import { test, expect, type Page } from '@playwright/test'
import { readTenantRecord, EXPERIMENT_FIXTURE_KEY } from './helpers/authed-fixture'
import * as charts from '@/design-system/charts'
import { MIN_VISIBLE_PX } from '@/design-system/charts/geometry'

const VIEWPORT = { width: 1440, height: 960 }
const SPECIMEN = '/app/design-system#charts'

/** Exactly `'true'`, matching `lib/flags.ts`. A gate that is off must SKIP, not fail. */
function gatesAreLit(): boolean {
  return process.env.CONSOLE_SHELL_ENABLED === 'true'
}

async function openCharts(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT)
  await page.goto(SPECIMEN)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('#charts')).toBeVisible()
}

test.describe('the charting primitives', () => {
  test.skip(
    !gatesAreLit(),
    'the specimen renders inside the console shell; run with CONSOLE_SHELL_ENABLED=true'
  )

  test.beforeEach(async ({ page }) => {
    await openCharts(page)
    await page.locator('#charts').screenshot({ path: 'test-results/console-visual/charts.png' })
  })

  test('every primitive the module exports actually reaches the specimen', async ({ page }) => {
    // The same weld `design-system-specimen.authed.spec.ts` puts on the primitives module. A chart
    // nothing renders is a chart nobody has seen — and every product route that could exercise the
    // populated form of one is empty on the walkthrough tenant (epic D10), so the specimen is the
    // ONLY place several of these are ever drawn.
    const exported = Object.keys(charts).filter((name) => /^[A-Z]/.test(name))
    expect(exported.length, 'the charts module exports no components').toBeGreaterThan(0)

    const section = page.locator('#charts')
    const rendered = {
      StageBars: await section.locator('.ds-chart-bars').count(),
      ComparisonBars: await section.locator('.ds-chart-fill[data-series]').count(),
      SplitBar: await section.locator('.ds-chart-split').count(),
      DayColumns: await section.locator('.ds-chart-cols').count(),
      Plot: await section.locator('.ds-chart-plot').count(),
      Sparkline: await section.locator('.ds-chart-spark').count(),
      SmallMultiple: await section.locator('.ds-chart-small').count(),
      IntervalBar: await section.locator('.ds-chart-interval').count(),
      HeroFigure: -1,
      ChartUnreadable: await section.locator('.ds-chart-unreadable').count(),
    }
    // `HeroFigure` is the one exported component the specimen does not draw: its two states are the
    // page-opening figure and the sentence that replaces it, and both are asserted where they
    // actually live — `/app` and `/app/impact/…` — by `command-center.authed.spec.ts`. Named here
    // rather than silently absent, because "the loop found nothing" and "the loop found everything"
    // must not look the same.
    const missing = exported.filter((name) => rendered[name as keyof typeof rendered] === 0)
    expect(missing, 'these chart primitives are exported and rendered nowhere on the specimen').toEqual([])
    expect(Object.keys(rendered).sort(), 'a chart primitive was added or removed without a row here').toEqual(
      exported.sort()
    )
  })

  test('every stat renders tabular-nums — sprint contract #5', async ({ page }) => {
    // A proportional zero is narrower than a proportional eight, so a column of counts jitters as it
    // updates and two figures stacked above each other do not line up. The contract says every stat;
    // this is what says it in the browser rather than in a comment.
    const measured = await page.locator('#charts').evaluate((section) => {
      const selectors = ['.ds-chart-num', '.ds-chart-small-value b', '.ds-chart-stagenum']
      return selectors.flatMap((selector) =>
        [...section.querySelectorAll(selector)].map((element) => ({
          selector,
          text: (element.textContent ?? '').trim().slice(0, 24),
          variant: getComputedStyle(element).fontVariantNumeric,
        }))
      )
    })
    expect(measured.length, 'no stats rendered at all, so this assertion proved nothing').toBeGreaterThan(5)
    for (const stat of measured) {
      expect(stat.variant, `${stat.selector} "${stat.text}" does not compute tabular-nums`).toContain(
        'tabular-nums'
      )
    }
  })

  test('status is never colour alone — the word and the count are on the page', async ({ page }) => {
    // DD4 is explicit that this is the rule most easily broken and least visible when it is: deutan
    // ΔE between `--green` and `--red` here is 9.9, above the floor but only just, and red/green is
    // the classic colour-vision pair. So the legend is part of the primitive, and this is what says
    // the primitive kept it.
    const legend = page.locator('#charts .ds-chart-legend').first()
    await expect(legend, 'the split bar rendered without its legend').toBeVisible()
    const text = (await legend.innerText()).replace(/\s+/g, ' ')
    expect(text, 'the legend names neither outcome in words').toMatch(/Held\s+[\d,]+/)
    expect(text, 'the legend does not name the failures in words and a count').toMatch(/Failed\s+[\d,]+/)

    // Same rule, the other two-way pair: control and treatment are named, not merely tinted.
    const compare = page.locator('#charts .ds-chart-fill[data-series]').first()
    await expect(compare).toBeVisible()
    const names = await page.locator('#charts .ds-chart-bar-name').allInnerTexts()
    expect(names.join(' | '), 'the comparison arms are distinguished by colour alone').toContain('Control')
    expect(names.join(' | ')).toContain('Treatment')
  })

  test('DD4’s 4px floor is real in the browser, and a zero does NOT get it', async ({ page }) => {
    // The specimen draws 3 failures in 1,843 draws — 0.16%, which is under a pixel on this track.
    const failed = page.locator('#charts .ds-chart-split-part[data-series="failed"]').first()
    await expect(failed, 'the specimen rendered no failure segment to measure').toBeVisible()
    const box = await failed.boundingBox()
    expect(box, 'the failure segment has no box').not.toBeNull()
    expect(
      box!.width,
      `the failure segment is ${box!.width}px — under the ${MIN_VISIBLE_PX}px floor, so three failures read as none`
    ).toBeGreaterThanOrEqual(MIN_VISIBLE_PX)

    // ── The other half of the same rule, and the one a floor alone would break ────────────────
    // A stage whose value is a real zero renders NO fill element. If it rendered one, the floor
    // would give it four pixels and invent exactly the reading the floor exists to prevent.
    const zeroStage = await page
      .locator('#charts .ds-chart-bars')
      .nth(1)
      .evaluate((bars) => {
        const rows = [...bars.children]
        const last = rows[rows.length - 1]
        return {
          label: (last.querySelector('.ds-chart-bar-name')?.textContent ?? '').trim(),
          number: (last.querySelector('.ds-chart-num')?.textContent ?? '').trim(),
          fills: last.querySelectorAll('.ds-chart-fill').length,
        }
      })
    expect(zeroStage.label, 'the second bar set does not end on the zero stage this asserts').toContain(
      'Retained'
    )
    expect(zeroStage.number, 'that stage is not the zero this assertion is about').toContain('0')
    expect(zeroStage.fills, 'a zero-value stage drew a bar, which the 4px floor then made visible').toBe(0)
  })

  test('a series too short to be a line renders a WORD, never a stroke', async ({ page }) => {
    // L2, on screen. Production `attributed_revenue` has exactly one reading; a stroke through it
    // would show a direction nobody measured.
    const smalls = page.locator('#charts .ds-chart-small')
    await expect(smalls, 'the specimen draws no small multiples').not.toHaveCount(0)

    const states = await smalls.evaluateAll((cards) =>
      cards.map((card) => ({
        label: (card.querySelector('.ds-chart-small-label')?.textContent ?? '').trim(),
        paths: card.querySelectorAll('.ds-chart-spark path').length,
        word: (card.querySelector('.ds-chart-unreadable')?.textContent ?? '').trim(),
      }))
    )
    const oneReading = states.find((card) => card.label.includes('one reading'))
    const noReadings = states.find((card) => card.label.includes('with none'))
    expect(oneReading, 'the specimen no longer shows a one-reading series').toBeTruthy()
    expect(noReadings, 'the specimen no longer shows an empty series').toBeTruthy()

    expect(oneReading!.paths, 'a single reading was drawn as a line').toBe(0)
    expect(oneReading!.word, 'a single reading rendered no explanation').toMatch(/not a trend/i)
    expect(noReadings!.paths, 'an empty series was drawn as a line').toBe(0)
    expect(noReadings!.word, 'an empty series rendered no explanation').toMatch(/nothing to plot/i)
  })

  test('an interval that includes no-difference is distinguished by more than colour', async ({ page }) => {
    const intervals = page.locator('#charts .ds-chart-interval')
    await expect(intervals).toHaveCount(2)

    const measured = await intervals.evaluateAll((nodes) =>
      nodes.map((node) => {
        const range = node.querySelector('.ds-chart-interval-range') as HTMLElement
        const zero = node.querySelector('.ds-chart-interval-zero') as HTMLElement
        const track = node.getBoundingClientRect()
        const rangeBox = range.getBoundingClientRect()
        const zeroBox = zero.getBoundingClientRect()
        return {
          crosses: range.dataset.crossesZero,
          borderStyle: getComputedStyle(range).borderTopStyle,
          zeroInsideTrack: zeroBox.left > track.left && zeroBox.right < track.right,
          zeroInsideRange: zeroBox.left >= rangeBox.left - 1 && zeroBox.right <= rangeBox.right + 1,
        }
      })
    )

    const [clear, crossing] = measured
    // Zero is on the track in BOTH cases. That is the whole reason the picture exists: a track that
    // started at the interval's own low bound could not show whether the range includes zero.
    expect(clear.zeroInsideTrack, 'no-difference fell off the track on the clear interval').toBe(true)
    expect(crossing.zeroInsideTrack, 'no-difference fell off the track on the crossing interval').toBe(true)

    expect(clear.crosses, 'the first specimen interval should NOT cross zero').toBe('false')
    expect(crossing.crosses, 'the second specimen interval should cross zero').toBe('true')
    expect(
      clear.zeroInsideRange,
      'the clear interval contains zero — the geometry disagrees with the flag'
    ).toBe(false)
    expect(crossing.zeroInsideRange, 'the crossing interval does not contain zero').toBe(true)

    // ⚠️ The second channel. Colour alone would leave a reader with no way to tell the two apart,
    // and this is the assertion that would go red if the dashed rule were dropped in a tidy-up.
    expect(clear.borderStyle, 'the clear interval should be solid').toBe('solid')
    expect(crossing.borderStyle, 'the crossing interval is distinguished only by its colour').toBe('dashed')
  })

  test('the "no difference" label sits under its own tick, not at the middle of the row', async ({
    page,
  }) => {
    // ⚠️ The defect this closes was found by LOOKING at the rendered specimen, and nothing
    // structural could have caught it: the three key spans rendered, the geometry was right, and the
    // label captioned ninety pixels of empty track. A reader takes the centre of the row for
    // no-difference and misreads the sign of the result.
    const measured = await page.locator('#charts .ds-chart-interval').evaluateAll((nodes) =>
      nodes.map((node) => {
        const track = node.getBoundingClientRect()
        const tick = (node.querySelector('.ds-chart-interval-zero') as HTMLElement).getBoundingClientRect()
        const label = (
          node.parentElement!.querySelector('.ds-chart-interval-origin') as HTMLElement
        ).getBoundingClientRect()
        return {
          tickCentre: tick.left + tick.width / 2,
          labelCentre: label.left + label.width / 2,
          rowCentre: track.left + track.width / 2,
        }
      })
    )
    expect(measured.length, 'no intervals rendered, so this assertion proved nothing').toBe(2)

    // ⚠️ **The precondition, asserted first.** If every specimen interval put zero at the centre,
    // the check below would pass on the broken version too — a guard that cannot fail, which is the
    // exact defect class this epic is named after. At least one of the two must have zero visibly
    // away from the middle for the comparison to mean anything.
    const offCentre = measured.filter((row) => Math.abs(row.tickCentre - row.rowCentre) > 40)
    expect(
      offCentre.length,
      'both specimen intervals put zero at the centre of the row, so this test cannot fail'
    ).toBeGreaterThan(0)

    for (const [index, row] of measured.entries()) {
      const gap = Math.abs(row.labelCentre - row.tickCentre)
      expect(
        gap,
        `interval ${index}: the origin label is ${Math.round(gap)}px from the tick it names`
      ).toBeLessThanOrEqual(2)
    }
  })

  test('the charts section does not make the specimen scroll sideways', async ({ page }) => {
    // Do-not #6, at the section that is most likely to break it: an SVG with a fixed viewBox and a
    // grid of small multiples are the two shapes that overflow a column without anyone noticing.
    const geometry = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      widest: Math.max(
        ...[...document.querySelectorAll('#charts *')].map((element) =>
          Math.round(element.getBoundingClientRect().right)
        )
      ),
    }))
    expect(geometry.scrollWidth, 'the specimen scrolls sideways with the charts on it').toBeLessThanOrEqual(
      geometry.innerWidth
    )
    expect(geometry.widest, 'a chart element reaches past the viewport').toBeLessThanOrEqual(
      geometry.innerWidth
    )
  })
})

// ── The experiments list describes the right VERSION ──────────────────────────────────────────
//
// ⚠️ **Two bugs lived in one line, and only a rendered page could see the second.** First
// `versions.at(-1)` under a comment claiming the array was ascending — `mapExperimentRegistryRows`
// sorts DESCENDING, so it took the OLDEST, and production `miyagisanchez`'s `fundadoras_promise_cta`
// (v1 stopped, v2 draft, v3 decided) would have read "Stopped · v1". Then taking the highest number,
// which put **Draft · v2** on a row whose v1 was RUNNING — hiding a live experiment behind an
// unstarted plan.
//
// `lib/experiment-list-view.test.ts` pins the arithmetic. This pins that the PAGE reads it, against
// a fixture that has two versions — because with one version, first and last are the same element
// and neither bug is observable.
test('the experiments row describes the running version, with a newer draft flagged beside it', async ({
  page,
}) => {
  test.skip(!gatesAreLit(), 'the console renders behind CONSOLE_SHELL_ENABLED')
  const slug = readTenantRecord()?.slug
  test.skip(!slug, 'needs the auth-setup project')

  await page.setViewportSize(VIEWPORT)
  const response = await page.goto(`/app/experiments/${slug}`)
  expect(response?.status(), 'experiments needs EXPERIMENT_GOVERNANCE_ENABLED, which is ON in prod').toBe(200)

  const row = page.locator('main .ds-row').filter({ hasText: EXPERIMENT_FIXTURE_KEY })
  await expect(row).toHaveCount(1)
  const text = (await row.innerText()).replace(/\s+/g, ' ')

  // The fixture is v1 RUNNING + v2 DRAFT. The row must describe v1 — the one with operational state.
  expect(text, `the row reads "${text}" — it must describe the RUNNING v1, not the draft`).toContain('v1')
  expect(text, 'the row must not be described BY the draft').not.toContain('· v2')
  // ...and the draft is flagged beside it, never instead of it — the same treatment a journey row
  // gives "Draft v3 waiting".
  expect(text, 'the newer draft must be flagged on the row').toContain('Draft v2 waiting')
  // The state pill is the RUNNING version's readiness, not the draft's status.
  expect(text).toMatch(/Ready to decide|Still gathering/)
})
