import { test, expect, type Page } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// console-ia-overhaul · the VISUAL gate.
//
// ── Why this file exists, in one sentence ────────────────────────────────────────────────────
// Sprints 1 and 2 shipped a correct information architecture and a rejected visual result, and
// nothing in the plan could go red on the way a page looked: every acceptance criterion was
// structural ("the header renders one project switcher and four sections"), and the shipped build
// satisfies all of them while looking like a different product.
//
// The approved design is `design/flags-console-prototype.html`. It is the contract, not
// inspiration. These are the three numbers from `design/CONSOLE-CONTRACT.md` — the cheapest
// assertions that would have caught this on day one.
//
// ⚠️ Two of the three are pure geometry and hold for ANY dataset. The third counts rendered rows,
// so it is only meaningful against the prototype's dataset — which is why this spec SEEDS that
// dataset rather than asserting a number the fixture happens to produce. A row-count assertion
// against arbitrary data is a number that passes for the wrong reason.

const VIEWPORT = { width: 1440, height: 960 }

function tenant() {
  const record = readTenantRecord()
  if (!record?.slug || !record?.projectId) {
    throw new Error('the visual gate needs the auth-setup project')
  }
  return record
}

/**
 * ⚠️ **This gate does NOT seed, and the reason is worth keeping.**
 *
 * The design's claim is "42 features become 2 rows plus one line". Asserting that literally needs
 * the design's dataset, and I tried twice to install it:
 *
 *   1. Seeded 42 flags into the shared fixture tenant. `flag-rule-builder` went red on a rollout
 *      assertion that passes in isolation — 42 extra flags changed the world every other `authed`
 *      spec runs in, and `fullyParallel: true` means cleanup cannot help: another spec reads the
 *      tenant WHILE this one writes to it.
 *   2. Gave the gate its own project. `command-center` and `design-system` went red instead,
 *      because the fixture user then had TWO projects and `/app` lists them.
 *
 * Both are the same mistake: a test that needs a specific world, run against a shared one. The
 * literal "2" is also the PROTOTYPE's data — production is 3 serving / 39 never (A20), so the
 * number was never going to be portable.
 *
 * So the split is by what each layer can actually own:
 *   • the ARITHMETIC — how many rows for a given mix of states, and that grouping never loses or
 *     swallows a row — is unit-tested exhaustively over every combination in
 *     `lib/flag-list-view.test.ts`, where the dataset IS controlled;
 *   • the RENDERING — that the page turns that arithmetic into rows plus at most one summary line,
 *     and that the line stands for everything it hides — is asserted here, on whatever the tenant
 *     holds.
 *
 * What is lost, stated rather than hidden: no single assertion says "42 → 2 + 1" end to end. What
 * is gained is a gate that is true on every tenant instead of one, and does not make three other
 * suites lie.
 */

async function openFeatures(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT)
  await page.goto(`/app/flags/${tenant().slug}?env=production`)
  await page.waitForLoadState('networkidle')
}

// ── Why the three assertions share ONE test ──────────────────────────────────────────────────
// `fullyParallel: true` runs a file's tests across workers, and `beforeAll` fires once per worker —
// so three tests seeded three times concurrently, accumulated 42 flags per run, and raced the
// activations into `flag snapshot version conflict`. Test 3 then "failed" on a seeding error rather
// than on the assertion it exists to make, which is a red test proving nothing.
//
// `mode: 'serial'` fixes the race but SKIPS every test after the first failure — and all three of
// these are expected to fail on the current build, so I would only ever see the first one.
//
// So: one test, one seed, and three `expect.soft` assertions. Soft assertions all report, and the
// test still fails. Each keeps the number it measured in its message, because "the design does not
// scroll" is not an actionable failure and "3695px in a 960px viewport" is.
test.describe('the console matches the approved design', () => {
  test.skip(
    !process.env.FLAG_CONSOLE_ENABLED || !process.env.CONSOLE_SHELL_ENABLED,
    'the visual gate asserts the LIT console; run with both gates on'
  )

  test('Ship › Features at 1440x960 matches the approved prototype', async ({ page }) => {
    await openFeatures(page)

    // Evidence, not decoration: the pair (this shot, the prototype) is how a human checks the two
    // agree, and the numbers below are how CI does. Written to a stable path so the comparison can
    // be regenerated rather than remembered.
    await page.screenshot({ path: 'test-results/console-visual/ship-features.png' })

    const geometry = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      contentWidth: Math.round(document.querySelector('main')?.getBoundingClientRect().width ?? 0),
      contentMaxWidth: getComputedStyle(document.querySelector('main') as Element).maxWidth,
    }))

    // 1. The approved design fits Ship › Features in one screen. A page that scrolls means the
    //    chrome is eating the viewport — 48px headings, three-line rail cards, a list that pages at
    //    25 instead of collapsing.
    expect
      .soft(
        geometry.scrollHeight,
        `[1] the page is ${geometry.scrollHeight}px tall in a ${geometry.innerHeight}px viewport — the approved design does not scroll`
      )
      .toBeLessThanOrEqual(geometry.innerHeight)

    // 2. Counted on the ROWS, not on a rendered string: the design's claim is that 42 features
    //    become two rows plus one line, and a substring check would pass on a page showing all 42.
    // ⚠️ Both locators were too loose on their first run, and each failed for the wrong reason —
    // which is worth recording, because a RED test hides that as effectively as a green one.
    //
    //   • `table tbody tr` matched the dormant disclosure's OWN table as well as the feature list,
    //     so "17 rows" was really 2 feature rows + 15 expanded dormant rows.
    //   • `details summary` matched every disclosure on the page, so "4 summary lines" counted
    //     three unrelated ones.
    //
    // Scoped to the feature list itself, and to a stable hook rather than a tag name. The hook does
    // not exist on the current build, so this reads 0 — an honest red that turns green only when the
    // dormant group is built as the prototype has it: ONE summary row inside the list, not a
    // <details> holding fifteen more rows.
    const featureList = page.locator('[data-feature-list]')
    // `.row` inside the list, not `tbody tr`: the approved design's list is flex rows, not a table.
    // The locator originally assumed a table and read 0 against a correct page — a green-looking
    // hook pointing at markup that no longer exists.
    const featureRows = featureList.locator('.row').filter({ has: page.locator('code') })
    const dormantSummary = page.locator('[data-dormant-summary]')
    const rowCount = await featureRows.count()
    const summaryCount = await dormantSummary.count()

    // The list renders SOMETHING — a page with neither rows nor a summary is a broken page, and an
    // absence assertion alone would pass on one.
    expect(rowCount + summaryCount, '[2] the feature list rendered nothing at all').toBeGreaterThan(0)

    // At most ONE line stands for the dormant group. The approved design collapses 40 into one; two
    // summaries would mean the collapse is running per page again, which is the bug it replaced.
    expect(
      summaryCount,
      `[2] ${summaryCount} dormant summary lines — the design collapses the dormant group into exactly one`
    ).toBeLessThanOrEqual(1)

    // When a summary IS rendered it must be standing for rows that are NOT also listed — otherwise
    // it is decoration above a full list, which is what the page looked like before this epic.
    if (summaryCount === 1) {
      const total = Number(
        (
          await page
            .locator('.stat.all .n')
            .innerText()
            .catch(() => '0')
        ).replace(/\D/g, '')
      )
      expect(
        rowCount,
        `[2] ${rowCount} rows rendered beside a summary claiming to collapse the rest of ${total}`
      ).toBeLessThan(total)
    }

    // 3. Wide content scrolls inside its own container; the PAGE never does.
    expect
      .soft(
        geometry.scrollWidth,
        `[3] the body is ${geometry.scrollWidth}px wide in a ${geometry.innerWidth}px viewport — content is being clipped`
      )
      .toBeLessThanOrEqual(geometry.innerWidth)

    // 3b. ⚠️ **The contract's third number does not reproduce, and this is what it was pointing at.**
    //     CONSOLE-CONTRACT.md predicts `body.scrollWidth > innerWidth` on the shipped build. It is
    //     false at 1440x960: the tables already scroll inside their own `overflow-x: auto`
    //     containers, which is the behaviour the contract's own Do-not #6 asks for. So assertion 3
    //     passes and would have passed on day one — it could not have caught this.
    //
    //     The real defect is one layer up and IS visible in the screenshot: the AgentRail sits
    //     inside the console grid and squeezes the content column to roughly 545px against the
    //     approved 1180. That is why every table clips. Asserting the content width catches it;
    //     asserting page scroll does not.
    //
    //     Do-not #4 calls this "a decision the epic never made" — whether the rail moves out of the
    //     console grid or is not rendered on console routes. This assertion states the requirement
    //     without prejudging which way that decision goes.
    // Two assertions, because the contract's 1180 is a CSS `max-width` and the measured width is a
    // different quantity — it excludes the scrollbar and is bounded by the grid column. Asserting
    // the measurement against 1180 fails on a CORRECT page at 1440 (it renders 1120), which is a
    // gate that cries wolf; asserting only the measurement would miss the cap being deleted.
    expect
      .soft(
        geometry.contentMaxWidth,
        `[3b] the content column's max-width is ${geometry.contentMaxWidth}, and the contract says 1180px`
      )
      .toBe('1180px')
    // And it is not being squeezed. The AgentRail inside the console grid rendered 544px here.
    expect
      .soft(
        geometry.contentWidth,
        `[3b] the content column measures ${geometry.contentWidth}px — squeezed, as it was at 544px with the AgentRail in the grid`
      )
      .toBeGreaterThanOrEqual(1000)
  })
})

test('the feature list survives a 390px phone', async ({ page }) => {
  // ⚠️ **Nothing covered this route at phone width.** `mobile-heuristics.authed.spec.ts`'s
  // `AUTHED_MOBILE_ROUTES` does not include `/app/flags/<slug>`, which is how the console shipped
  // 340px of fixed row columns in a 390px viewport: `.row-main` measured **0** wide, the feature key
  // painted on top of the state pill, and the description vanished. The prototype has a
  // `@media (max-width: 900px)` block; the first port dropped it entirely (fresh reviewer, PR #124).
  //
  // The same blind spot hid the 100vh rail one commit earlier. Two bugs through one gap is a gap
  // worth closing here rather than reporting again.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/app/flags/${tenant().slug}?env=production`)
  await page.waitForLoadState('networkidle')

  const measured = await page.evaluate(() => {
    const row = document.querySelector('[data-feature-list] .row')
    const main = row?.querySelector('.row-main')
    const state = row?.querySelector('.row-state')
    const head = document.querySelector('[data-feature-list] .listhead')
    return {
      hasRow: row !== null,
      mainWidth: main === null || main === undefined ? -1 : Math.round(main.getBoundingClientRect().width),
      // ⚠️ Boxes overlap only if they intersect on BOTH axes. The first version compared x alone
      // and reported a false overlap on a CORRECT page: with `flex-wrap`, the state cell stacks
      // BELOW the feature cell, so its left edge is legitimately far behind the feature's right
      // edge. A guard that fails on correct markup gets "fixed" by weakening it, which is how the
      // real check gets lost.
      overlap: (() => {
        if (!main || !state) return false
        const a = main.getBoundingClientRect()
        const b = state.getBoundingClientRect()
        return a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1
      })(),
      headDisplay: head === null ? 'none' : getComputedStyle(head).display,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })

  test.skip(!measured.hasRow, 'this tenant renders no feature rows')

  // The description column must actually have room — zero width is what the fixed columns caused.
  expect(measured.mainWidth, 'the feature column has no width on a phone').toBeGreaterThan(150)
  // And the key must not be painted over the state pill.
  expect(
    measured.overlap,
    'the feature cell and the state cell overlap — the fixed column widths are still applying'
  ).toBe(false)
  // The column header row labels nothing once cells stack, so the design hides it.
  expect(measured.headDisplay, 'the column headers still render over stacked cells').toBe('none')
  // And the page itself must not scroll sideways.
  expect(measured.bodyScrollWidth).toBeLessThanOrEqual(measured.innerWidth)
})
