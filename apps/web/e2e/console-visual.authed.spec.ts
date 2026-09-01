import { test, expect, type Page } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { ROUTE_MANIFEST, liveRows } from '@/design-system/route-manifest'
// ⚠️ IMPORTED, not declared here. These two arrays used to live in this file, and
// `console-spec.test.ts` checked a hand-retyped COPY of them against the regenerated contract —
// so the weld checked itself, and the gate kept a deferred row pointing at `78`, the number D8
// disproved. One implementation, two consumers (CODE-QUALITY #2).
import { CHROME_BUDGET_PX, MEASURED_SPEC, DEFERRED_SPEC_ROWS } from '@/design-system/console-gate-spec'

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

// ── ✅ CI RUNS THIS FILE, and has since `console-ia-overhaul` Story 3.3 ──────────────────────
//
// ⚠️ **This block used to open "NOTHING IN CI RUNS THIS FILE", and it was false for an entire
// epic.** `ci.yml`'s `e2e` job runs precisely this one spec — `--project=authed
// apps/web/e2e/console-visual.authed.spec.ts` — with all thirteen gate env vars mirrored, under a
// step whose own comment reads *"Story 3.3 landed; the gate is green; this is the step that was
// promised."* Story 1.6 rewrote this file and left the paragraph above it describing the world
// before that step existed.
//
// That is `CODE-QUALITY.md` #3 — a comment asserting a property the code does not have — sitting at
// the top of the epic's flagship guard, telling every reader that the guard does not run. Found by
// the fresh reviewer on PR #128. Corrected rather than deleted, because the reason it was written
// is still worth knowing: the file was deliberately NOT wired in at first, since assertion [1] was
// red until Story 3.3 deleted the JSON authoring stack, and wiring it earlier would have made CI
// permanently red. The replacement landed with the deletion, and so did the gate.

/**
 * ⚠️ **Exactly `'true'`, matching `lib/flags.ts`.** The first version skipped on truthiness, so
 * `FLAG_CONSOLE_ENABLED=false` did NOT skip — the string "false" is truthy — while the app read it
 * as off and served the legacy render. The suite then failed hard against markup it never claims to
 * describe (fresh reviewer, round 2).
 */
function gatesAreLit(): boolean {
  return process.env.CONSOLE_SHELL_ENABLED === 'true' && process.env.FLAG_CONSOLE_ENABLED === 'true'
}

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
    !gatesAreLit(),
    'the visual gate asserts the LIT console; run with CONSOLE_SHELL_ENABLED=true and FLAG_CONSOLE_ENABLED=true'
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
    //
    // ⚠️ **This one SURVIVES the L12 correction, and the distinction is the point.** Sprint 5
    // replaced the GENERIC per-route no-scroll assertion with a chrome budget, because eleven of the
    // thirty approved states scroll and the rule was asserting a property the design does not have.
    // `ship-features` is not one of them: it measures exactly 960 in `MEASURED-SPEC.md`'s chrome
    // table, and it fits *because of the dormant collapse* — forty features become one summary line.
    // Fitting one screen is that page's actual design promise, so it keeps its own assertion.
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
    // `.ds-row` inside the list, not `tbody tr`: the approved design's list is flex rows, not a
    // table. The locator originally assumed a table and read 0 against a correct page — a
    // green-looking hook pointing at markup that no longer exists.
    // ⚠️ `.row` → `.ds-row` with Story 4.1: the page body renders from `apps/web/design-system/` now,
    // and `.row` no longer exists on it. A locator left behind would read 0 and — because assertion
    // [2] only checks the SUM of rows and summaries is above zero — would have gone red loudly here
    // rather than quietly, which is the one thing that made this safe to move.
    const featureRows = featureList.locator('.ds-row').filter({ has: page.locator('code') })
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

    // ⚠️ **On the current fixture `summaryCount` is 0, and both assertions above pass vacuously.**
    // The tenant is all-dormant, so `groupDormantFlagRows` declines to group and
    // `[data-dormant-summary]` never renders on any input. An earlier PR comment of mine reported
    // "1 dormant summary line ✅" — that was measured during a run when my own seeding had polluted
    // the shared fixture, and it is not reproducible (fresh reviewer, round 4, N4).
    //
    // Left as-is rather than forced: seeding this tenant to produce a summary is exactly what broke
    // three other suites two rounds ago. The collapse is pinned at production's real shape in
    // `lib/flag-list-view.test.ts`, where the dataset is controlled. Stated so nobody reads a green
    // [2] as proof the collapse renders.
    //
    // When a summary IS rendered it must be standing for rows that are NOT also listed — otherwise
    // it is decoration above a full list, which is what the page looked like before this epic.
    if (summaryCount === 1) {
      const total = Number(
        (
          await page
            .locator('.ds-stat--all .ds-stat-value')
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
  // ⚠️ **This test sat outside the describe's skip and went red whenever the console gate is off.**
  // Without `.is-console` the console stylesheet does not apply, so the legacy render tripped the
  // overlap check — a false red whose obvious repair is to weaken the assertion (fresh reviewer,
  // round 2).
  //
  // An earlier version of this note said the gate is "off in prod until Story 3.5". That was D4,
  // and **A19 overruled it in this same PR's epic README** — the console ships ENABLED. The stale
  // sentence is exactly the drift A19 exists to prevent (fresh reviewer, round 3, N8).
  test.skip(!gatesAreLit(), 'the phone contract is about the LIT console; run with both gates on')
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
    // ⚠️ `ds-` since Story 4.1 — this page body renders from `apps/web/design-system/` now. Every
    // one of these four returning null would make the measurements below `-1`/`none`, which the
    // assertions read as failures rather than as skips; that is what made the rename safe.
    const row = document.querySelector('[data-feature-list] .ds-row')
    const main = row?.querySelector('.ds-row-main')
    const state = row?.querySelector('.ds-row-state')
    const head = document.querySelector('[data-feature-list] .ds-listhead')
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
      // The header row must be out of the VISUAL flow and still in the ACCESSIBILITY tree — those
      // are two different questions, and `display: none` answers both with "gone".
      headBox: head === null ? null : Math.round(head.getBoundingClientRect().height),
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
  // ⚠️ **Hidden from the EYE, kept for the SCREEN READER — and both halves are asserted.**
  // The design hides the header row once the cells stack, because a header row over stacked cells
  // labels nothing visually. It used to be `display: none`, which also deleted it from the
  // accessibility tree (measured: 3 `columnheader` nodes at 1440, 0 at 390) — and the list is an
  // ARIA table, so those nodes are what associate a cell with its column at ANY width.
  //
  // Asserting only "it is not visible" would pass on the version that threw the semantics away, and
  // asserting only "the roles exist" would pass on a header row painted over the rows. Both.
  expect(measured.headBox, 'the column header row still takes visual space on a phone').toBeLessThan(2)
  // ⚠️ **`getByRole`, not `querySelectorAll('[role=…]')`.** The first version of this assertion
  // counted DOM nodes, and `display: none` removes an element from the ACCESSIBILITY TREE while
  // leaving it in the DOM — so it passed against the very build it was written to reject. Caught by
  // mutation-checking it, which is the only reason it is not still in this file looking like
  // coverage. Playwright's role engine excludes hidden elements, so this asks the question the
  // assertion is actually about.
  // ⚠️ Compared against the DESKTOP count, never against a literal. The number depends on the
  // viewer — an owner gets a fourth column (`On / off`) — so hardcoding it made this fail on a
  // correct page for an owner, which is how a guard gets "fixed" by being weakened. The property is
  // that hiding the row visually does not change the SEMANTIC column set, and that is what a
  // comparison says.
  const headersOnAPhone = await page.locator('[data-feature-list]').getByRole('columnheader').count()
  await page.setViewportSize(VIEWPORT)
  await page.waitForTimeout(100)
  const headersOnDesktop = await page.locator('[data-feature-list]').getByRole('columnheader').count()
  expect(headersOnDesktop, 'the list rendered no column headers at all').toBeGreaterThan(0)
  expect(
    headersOnAPhone,
    'the column headers left the accessibility tree on a phone — `display: none` deletes them from it'
  ).toBe(headersOnDesktop)
  // And the page itself must not scroll sideways.
  expect(measured.bodyScrollWidth).toBeLessThanOrEqual(measured.innerWidth)
})

// ── The measured spec, asserted instead of described ──────────────────────────────────────────
//
// `CONSOLE-CONTRACT.md` §"How the gate works" specifies three layers: the three numbers above, a
// computed-style table over every row of the measured spec, and a screenshot diff. Only the first
// existed, so the spec table — feature row h78, pill h26, stat number 26/600 mono, rail item h36 —
// was enforced by PROSE, which is the failure mode the contract was written to end (fresh reviewer,
// round 2, S8).
//
// This is layer 2. Every number below is quoted from the contract's table, and each row names the
// element it measures so a failure says which line of the design was broken.
//
// ⚠️ Layer 3 (the screenshot diff against `render-reference.mjs`) is NOT built. Stated rather than
// implied: it needs a committed baseline per reference state, and a baseline that drifts from the
// design is worse than none. The style table catches what it was for — sizes, weights and box
// heights — and the pair of screenshots in the PR is the human check meanwhile.

// ── The FEATURE page, which the gate did not look at until Story 3.2 ─────────────────────────
//
// ⚠️ A22 makes the design binding for **every signed-in route**, and this gate covered exactly one:
// Ship › Features. The feature's own page is the second-most-visited surface in the console (every
// row on that list leads here), it was still rendering the pre-contract shape — a 48px `h1`, a
// `Panel` stack, tag-styled tabs — and nothing could go red about it. Story 3.2 rebuilt it and this
// is the assertion that keeps it rebuilt.
//
// Deliberately the SAME two properties as the list's, not a second full spec table: the h1 shape and
// the no-scroll promise are what the contract's Do-not list is mostly about, and a page-specific
// table would drift from the one above rather than extend it.
test('the feature page matches the contract too', async ({ page }) => {
  test.skip(!gatesAreLit(), 'the feature page renders behind both gates; run with both on')

  await page.setViewportSize(VIEWPORT)
  await page.goto(`/app/flags/${tenant().slug}?env=production`)
  await page.waitForLoadState('networkidle')

  // Reached by CLICKING, not by constructing a URL — which is the epic's outcome test in miniature
  // and also means this cannot pass against a key that no longer exists.
  const firstFeature = page.locator('[data-feature-list] .ds-row-key').first()
  test.skip((await firstFeature.count()) === 0, 'this tenant renders no feature rows')
  await firstFeature.click()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'test-results/console-visual/feature.png' })

  const measured = await page.evaluate(() => {
    const h1 = document.querySelector('main h1')
    const style = h1 === null ? null : getComputedStyle(h1)
    return {
      hasH1: h1 !== null,
      fontSize: style?.fontSize ?? '',
      fontWeight: style?.fontWeight ?? '',
      lines: h1 === null ? 0 : h1.getClientRects().length,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      tabs: document.querySelectorAll('.ds-tabs--panel .ds-tab').length,
      current: document.querySelectorAll('.ds-tabs--panel .ds-tab[aria-current="page"]').length,
    }
  })

  expect(measured.hasH1, 'the feature page has no h1').toBe(true)
  expect.soft(measured.fontSize, '[spec] feature page h1 font-size').toBe('23px')
  expect.soft(measured.fontWeight, '[spec] feature page h1 font-weight').toBe('700')
  // Do-not #1 is about the CONSEQUENCE, not the number: at 48px a real tenant's key wrapped to four
  // lines and spent ~200px before any content. One line is the property that was lost.
  expect.soft(measured.lines, '[spec] the feature page h1 wraps to more than one line').toBe(1)
  expect
    .soft(
      measured.scrollHeight,
      `[1] the feature page is ${measured.scrollHeight}px tall in a ${measured.innerHeight}px viewport`
    )
    .toBeLessThanOrEqual(measured.innerHeight)
  // Seven tabs, exactly one current. Zero would leave a reader with no idea where they are; two is
  // the `home`/`today` class of bug the shell's own spec pins one level up.
  //
  // ⚠️ **SIX → SEVEN with Story 4.2.** `Environments` used to render as a table ABOVE the strip,
  // recorded there as a deliberate deviation from the approved design. The deviation is withdrawn:
  // the design has it as a tab, this sprint's acceptance cites `feature-environments` by name, and
  // an always-on table made every other tab pay ~150px it did not ask for on the one page whose
  // contract says it must not scroll.
  //
  // ⚠️ Counted on `.ds-tab[aria-current]`, not on `[role="tab"]`. These are LINKS — activating one
  // navigates — so promising a tablist widget with no arrow-key handling behind it would be an ARIA
  // claim the page cannot keep.
  expect.soft(measured.tabs, '[spec] the feature page renders seven tabs').toBe(7)
  expect.soft(measured.current, '[spec] exactly one tab is current').toBe(1)
})

test('the deferred spec rows are named, so the gate does not look complete', () => {
  // This test exists to make the omission visible in the suite's own output rather than in a
  // comment nobody runs. It cannot fail; that is deliberate and stated — its job is to print.
  // ⚠️ 6 → 5. Story 3.3 built the switch, so its row moved into MEASURED_SPEC above. This number is
  // deliberately a hard-coded literal rather than derived: a count that updates itself would let a
  // row be dropped silently, and the point of this test is that dropping one is a decision.
  // 5 → 4: Story 3.2 BUILT the second tier, so its deferral ("not built") is closed. ⚠️ It was
  // closed late and by a reviewer, not by me: agy raised the contradiction and I dismissed it with a
  // count of "three entries" taken from a `head`-truncated grep. There are five. A correct finding
  // shut down with a fabricated number is worse than the contradiction it was reporting (fresh
  // reviewer, Major).
  // 4 → 3: Story 4.1 closed `feature row` by clamping the never-state detail to one line, so that
  // row moved into MEASURED_SPEC. `dormant summary row` deliberately did NOT move with it — its 2px
  // is body copy wrapping, and sweeping it up would have been a claim nothing measured.
  expect(DEFERRED_SPEC_ROWS.length, 'update this count when a deferred row is closed or found').toBe(3)
  const today = new Date().toISOString().slice(0, 10)
  for (const row of DEFERRED_SPEC_ROWS) {
    expect(row.why.length, `${row.what} is deferred without a reason`).toBeGreaterThan(20)
    // ── The half that was missing, and the reason five rows shipped and never left ────────────
    // A reason explains why a row is short TODAY. An owner and a date are what make it stop being
    // short. Without them "deferred" is "exempt" with better manners.
    expect(row.owner.length, `${row.what} is deferred with no owner`).toBeGreaterThan(0)
    expect(row.until, `${row.what}'s decay date is not a date`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(
      row.until >= today,
      `${row.what}'s deferral expired on ${row.until} — close it, or re-decide it with ${row.owner}`
    ).toBe(true)
  }
})

// ── design-system-rails · Story 1.6 (epic D5) — the gate is DRIVEN BY THE MANIFEST ────────────
//
// Until now this file asserted ONE hand-written route. The manifest knows all 27, which routes have
// an approved reference state, and which claim to render from `apps/web/design-system/` — so the
// gate reads that instead of a list somebody remembers to extend.
//
// ⚠️ **An empty loop is the failure mode this whole epic is about**, so it cannot happen quietly:
// the routes this suite hands to a sibling spec are PINNED by name in `EXPECTED_SKIPS`, and every
// other claimed route is opened. In Sprint 1 nothing claims the design system, so the loop is empty
// — deliberately and visibly, and a row that claims coverage it has not earned fails here rather
// than inflating a percentage.
//
// An earlier version asserted a count against `coverage()`, which was the same predicate over the
// same rows and could not fail; the comment that described it survived two rounds after the code it
// described had gone (fresh reviewer, rounds 1 and 2).

/**
 * How to reach each manifest row in a browser.
 *
 * A row whose route has a second dynamic segment cannot be built from a slug alone — a feature key,
 * a journey key, a share token. Those return `null` and name the dedicated test that covers them,
 * because a generic loop that silently skipped them would report coverage for routes it never
 * opened. `every manifest row has a way to be reached` asserts this map covers every row, so a new
 * route cannot enter the manifest without someone deciding how the gate opens it.
 */
/**
 * Routes this suite deliberately does NOT open, because their URL needs a key or a token it must not
 * invent. Pinned rather than counted — see the assertion at the end of the loop.
 */
const EXPECTED_SKIPS = [
  '/app/flags/[projectSlug]/[flagKey]',
  '/app/experiments/[projectSlug]/[experimentKey]',
  '/app/journeys/[projectSlug]/[journeyKey]',
  '/app/funnel/[projectSlug]/[featureKey]',
  '/app/impact/[projectSlug]/[featureKey]',
  '/hub/[projectSlug]/epic/[epicSlug]',
  '/s/[token]',
]

const REACHABLE: Record<string, ((slug: string) => string) | { coveredBy: string }> = {
  '/app': () => '/app',
  '/app/tasks/[projectSlug]': (slug) => `/app/tasks/${slug}`,
  '/app/journeys/[projectSlug]': (slug) => `/app/journeys/${slug}`,
  '/app/scenarios/[projectSlug]': (slug) => `/app/scenarios/${slug}`,
  '/app/flags/[projectSlug]': (slug) => `/app/flags/${slug}?env=production`,
  '/app/experiments/[projectSlug]': (slug) => `/app/experiments/${slug}`,
  '/app/scheduled/[projectSlug]': (slug) => `/app/scheduled/${slug}`,
  '/app/flag-audit/[projectSlug]': (slug) => `/app/flag-audit/${slug}`,
  '/app/setup/connect/[projectSlug]': (slug) => `/app/setup/connect/${slug}`,
  '/app/setup/keys/[projectSlug]': (slug) => `/app/setup/keys/${slug}`,
  '/app/destinations/[projectSlug]': (slug) => `/app/destinations/${slug}`,
  '/app/shares/[projectSlug]': (slug) => `/app/shares/${slug}`,
  '/app/onboarding/[projectSlug]': (slug) => `/app/onboarding/${slug}`,
  // ⚠️ The three retired routes. They still need an entry — `every manifest row has a way to be
  // reached` demands one for every row, and their rows stay in the manifest so `retiresIn: 4` can
  // take them out of the denominator. They are never OPENED, though: `every route claiming the
  // design system renders from it` iterates `liveRows(6)`, which excludes them, and they claim
  // nothing anyway. A redirect has no design to assert.
  '/app/keys/[projectSlug]': { coveredBy: 'e2e/app-auth.spec.ts — retired, asserted as a redirect' },
  '/app/flag-credentials/[projectSlug]': {
    coveredBy: 'e2e/app-auth.spec.ts — retired, asserted as a redirect',
  },
  '/app/agent-keys/[projectSlug]': {
    coveredBy: 'e2e/app-auth.spec.ts — retired, asserted as a redirect',
  },
  '/login': () => '/login',
  '/signup': () => '/signup',
  '/install': () => '/install',
  '/talk': () => '/talk',
  '/hub/[projectSlug]': (slug) => `/hub/${slug}`,
  '/hub/[projectSlug]/horizon': (slug) => `/hub/${slug}/horizon`,
  '/hub/[projectSlug]/report': (slug) => `/hub/${slug}/report`,
  // Reached by clicking, or by a key/token this suite must not invent.
  '/app/flags/[projectSlug]/[flagKey]': { coveredBy: 'e2e/feature-tabs.authed.spec.ts (all seven tabs)' },
  '/app/experiments/[projectSlug]/[experimentKey]': { coveredBy: 'e2e/experiment-governance.spec.ts' },
  '/app/journeys/[projectSlug]/[journeyKey]': { coveredBy: 'e2e/journey-management.spec.ts' },
  '/app/funnel/[projectSlug]/[featureKey]': { coveredBy: 'e2e/funnel.spec.ts' },
  '/app/impact/[projectSlug]/[featureKey]': { coveredBy: 'e2e/impact.spec.ts' },
  '/hub/[projectSlug]/epic/[epicSlug]': { coveredBy: 'e2e/hub.authed.spec.ts' },
  '/s/[token]': { coveredBy: 'e2e/report-share.spec.ts' },
}

/**
 * The tenant slug, narrowed.
 *
 * `tenant()` already throws when the fixture is missing, but its record's `slug` is typed
 * `string | null`, so the compiler cannot see that. A helper that throws is how the guarantee
 * reaches the type system — `slug!` would assert it instead, and an assertion is a claim rather
 * than a check.
 */
function tenantSlug(): string {
  const { slug } = tenant()
  if (!slug) throw new Error('the visual gate needs the auth-setup project')
  return slug
}

test('every manifest row has a way to be reached', () => {
  // No browser, no gates — a pure consistency check, so it runs even when the suite skips. A route
  // that enters the manifest without an entry here would be counted and never opened.
  for (const row of ROUTE_MANIFEST) {
    expect(
      REACHABLE[row.route],
      `${row.route} is in the manifest with no way for the gate to open it`
    ).toBeDefined()
  }
  for (const route of Object.keys(REACHABLE)) {
    // ⚠️ `.toBe(true)`, NOT `.toBeDefined()`. The first version of this line asserted
    // `expect(someBooleanExpression).toBeDefined()` — and `false` IS defined, so a stale entry
    // passed. **A guard that cannot fail, in the file whose entire subject is guards that cannot
    // fail.** Found by re-reading my own diff for the class this epic exists to kill; it is the
    // same shape as `querySelectorAll('[role="columnheader"]')` passing under `display: none`.
    expect(
      ROUTE_MANIFEST.some((row) => row.route === route),
      `${route} has a reachability entry but is not in the manifest — a stale entry reads as coverage`
    ).toBe(true)
  }
})

test('every route claiming the design system renders from it', async ({ page }) => {
  test.skip(!gatesAreLit(), 'the visual gate asserts the LIT console; run with both gates on')

  // `liveRows()`, not the whole manifest: a RETIRED route that still carried the flag would
  // otherwise be opened by a gate that no longer covers it (fresh reviewer, round 2). Not reachable
  // today; a property is cheaper than remembering it stays unreachable.
  const claimed = liveRows(6).filter((row) => row.rendersFromDesignSystem)
  const claimedRoutes = new Set(claimed.map((row) => row.route))

  // ⚠️ **The previous "empty-loop guard" was near-tautological** (fresh reviewer, Major). It
  // compared `claimed.length` against `coverage(6).rendersFromDesignSystem` — the same predicate
  // applied to almost the same rows — so it could differ only in one exotic case, and its comment
  // claimed it "pins that a ZERO here is a deliberate zero rather than a loop that quietly found
  // nothing". It could not distinguish those two at all.
  //
  // What actually distinguishes them is counting what the loop REALLY DID, against an expectation
  // derived independently of the loop. So: `visited` is incremented inside the body, `skipped`
  // counts the rows this suite structurally cannot open, and the two are asserted to account for
  // every claimed row afterwards. A zero is then a zero somebody can read.
  let visited = 0
  const skipped: string[] = []

  await page.setViewportSize(VIEWPORT)
  for (const row of claimed) {
    const reach = REACHABLE[row.route]
    // ⚠️ A `{ coveredBy }` row is NOT silently continued past (fresh reviewer, Major). It is a route
    // whose URL needs a key or a token this suite must not invent — a feature key, a journey key, a
    // share token — so a sibling spec covers it. The `REACHABLE` docblock promised exactly this and
    // the code just skipped, which meant a row could claim coverage and never be opened by anything.
    // Now the skips are counted, named in the failure message, and reconciled below.
    if (typeof reach !== 'function') {
      skipped.push(`${row.route} → ${reach.coveredBy}`)
      continue
    }
    visited += 1
    const response = await page.goto(reach(tenantSlug()))
    await page.waitForLoadState('networkidle')

    // ⚠️ `page.goto` does not throw on 4xx/5xx. Today the ds-class assertion happens to catch a 404,
    // but from Sprint 6 the design system's Frame wraps the error pages too — so a 404 would render
    // a short `<main class="ds-…">`, fit the viewport, and pass all three soft assertions while
    // counting toward coverage (fresh reviewer, round 2). The status is the only thing that
    // distinguishes "this route renders correctly" from "this route does not exist".
    expect.soft(response?.status() ?? 0, `[${row.route}] answered ${response?.status()}`).toBeLessThan(400)

    const geometry = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      // ⚠️ Inside `<main>`, NOT on the shell. Sprint 3 wraps all 21 console routes in the design
      // system's frame in one commit; if this looked at the wrapper, coverage would leap to 21 while
      // twenty-one page BODIES were still the old design. Only a page's own markup can put a
      // `ds-`-prefixed class inside its main element.
      //
      // ⚠️ TOKEN match, not `[class*="ds-"]`. The substring form is satisfied by `cards-grid`,
      // `needs-review`, `fields-row` and even `not-ds-x`, while its comment claimed to be testing a
      // PREFIX (fresh reviewer, Major). No collision exists in `apps/web` today, so it was latent —
      // but this single boolean is what stands between the coverage number and a claim, and a
      // latent false positive on the number a whole epic is measured by is not a nit.
      designSystemClasses: [...document.querySelectorAll('main [class]')].filter((element) =>
        [...element.classList].some((name) => name === 'ds' || name.startsWith('ds-'))
      ).length,
      // How far down the page the first element carrying DATA begins — the CHROME, measured. The
      // list is the product's content vocabulary, the counterpart of the prototype's in
      // `measure-contract.mjs`. `null` when a page renders none, which is reported rather than
      // scored: a route with no content element is a finding, not a zero.
      chrome: (() => {
        const first = document.querySelector(
          'main .ds-tile, main .ds-listcard, main .ds-tasklist, main .ds-chart, main .ds-card, ' +
            'main .ds-empty, main .ds-band-empty, main .ds-table, main .ds-timeline, main .ds-field, ' +
            'main .ds-summary, main .ds-kpis, main .ds-envtable, main .ds-picklist, main .ds-matrix'
        )
        return first ? Math.round(first.getBoundingClientRect().top) : null
      })(),
    }))

    expect
      .soft(
        geometry.designSystemClasses,
        `[${row.route}] claims to render from design-system/ and its <main> contains no ds- class`
      )
      .toBeGreaterThan(0)

    // ⚠️ **THE CHROME BUDGET REPLACED A NO-SCROLL ASSERTION THAT WAS GREEN FOR THE WRONG REASON.**
    //
    // This used to require every covered route to fit 1440x960, citing "a page that scrolls means
    // the chrome is eating the viewport". Measured against the approved design (`MEASURED-SPEC.md`,
    // the chrome table), ELEVEN of the thirty approved states scroll — `today` is 1711px,
    // `experiment-blocked` 1625px, and `ship-activity` 1274px while the route built from it passed
    // this line. It was asserting a property the design does not have, and passing because the
    // fixture tenant is thin. In the epic named after guards that cannot go red, that is the finding
    // rather than the inconvenience.
    //
    // Every defect the old assertion NAMES is about chrome — a 48px h1 wrapping to four lines, a
    // three-line rail card, a summary strip that eats the screen — and none is about row count. So
    // the budget is the chrome, and `CHROME_BUDGET_PX` is the approved design's own maximum,
    // welded to the regenerated table by `console-spec.test.ts`.
    expect
      .soft(geometry.chrome, `[${row.route}] renders no content element at all inside <main>`)
      .not.toBeNull()
    if (geometry.chrome !== null) {
      expect
        .soft(
          geometry.chrome,
          `[${row.route}] spends ${geometry.chrome}px on chrome before its first content — the ` +
            `approved design's worst case is ${CHROME_BUDGET_PX}px`
        )
        .toBeLessThanOrEqual(CHROME_BUDGET_PX)
    }

    // Horizontal scroll stays an absolute: wide content scrolls inside its OWN container, and the
    // page never does. That one IS a property of the approved design, at every state.
    expect
      .soft(
        geometry.scrollWidth,
        `[${row.route}] body is ${geometry.scrollWidth}px wide in a ${geometry.innerWidth}px viewport — content is clipped`
      )
      .toBeLessThanOrEqual(geometry.innerWidth)
  }

  // ⚠️ **The skip list is PINNED, because counting it cannot fail.** The previous version asserted
  // `visited + skipped.length === claimed.length` — which holds by construction at every exit of a
  // loop whose only two branches increment one or push to the other, and whose bound IS
  // `claimed.length`. That was a tautology replacing a tautology (fresh reviewer, rounds 1 and 2),
  // under a comment claiming it counted "against an expectation derived independently of the loop".
  //
  // This can fail: it names which routes are expected to be covered elsewhere. A row that quietly
  // becomes unreachable, or a `coveredBy` entry that quietly disappears, changes this list.
  expect(
    skipped.map((line) => line.split(' → ')[0]).sort(),
    'the set of routes this suite hands to a sibling spec changed'
  ).toEqual(EXPECTED_SKIPS.filter((route) => claimedRoutes.has(route)).sort())

  // ...and the skips are REPORTED, not swallowed. A route counted in coverage and opened by nothing
  // is the shape of the last epic's five deferred rows.
  if (skipped.length > 0) {
    console.log(`[visual gate] ${visited} route(s) opened here; ${skipped.length} covered elsewhere:`)
    for (const line of skipped) console.log(`  · ${line}`)
  }
})

test('every row of the measured spec matches the built stylesheet', async ({ page }) => {
  test.skip(!gatesAreLit(), 'the measured spec describes the LIT console; run with both gates on')

  await page.setViewportSize(VIEWPORT)
  await page.goto(`/app/flags/${tenant().slug}?env=production`)
  await page.waitForLoadState('networkidle')

  const measured = await page.evaluate(
    (rows) => {
      return rows.map((row) => {
        const element = document.querySelector(row.selector)
        if (element === null) return { what: row.what, missing: true }
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return {
          what: row.what,
          missing: false,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          fontFamily: style.fontFamily,
          height: Math.round(box.height),
          width: Math.round(box.width),
        }
      })
    },
    MEASURED_SPEC.map(({ what, selector }) => ({ what, selector }))
  )

  for (const [index, spec] of MEASURED_SPEC.entries()) {
    const got = measured[index]
    // A missing element is reported, never skipped: "the selector found nothing" and "the value is
    // right" must not look the same from the outside.
    expect.soft(got.missing, `[spec] ${spec.what} (${spec.selector}) did not render`).toBe(false)
    if (got.missing) continue

    if (spec.fontSize !== undefined) {
      expect.soft(got.fontSize, `[spec] ${spec.what} font-size`).toBe(spec.fontSize)
    }
    if (spec.fontWeight !== undefined) {
      expect.soft(got.fontWeight, `[spec] ${spec.what} font-weight`).toBe(spec.fontWeight)
    }
    if (spec.fontFamily !== undefined) {
      expect.soft(got.fontFamily, `[spec] ${spec.what} font-family`).toMatch(spec.fontFamily)
    }
    if (spec.height !== undefined) {
      const slack = spec.tolerance ?? 1
      expect
        .soft(
          Math.abs((got.height ?? 0) - spec.height),
          `[spec] ${spec.what} height is ${got.height}px, contract says ${spec.height}px`
        )
        .toBeLessThanOrEqual(slack)
    }
    // ⚠️ `width` was in `SpecRow` and MEASURED here and never asserted — a field that looks like
    // coverage and is not, which is this file's own subject. The switch is the first row to use it,
    // and the contract states it as a PAIR (38 × 21): a toggle at the right height and the wrong
    // width is not the control that was approved.
    if (spec.width !== undefined) {
      const slack = spec.tolerance ?? 1
      expect
        .soft(
          Math.abs((got.width ?? 0) - spec.width),
          `[spec] ${spec.what} width is ${got.width}px, contract says ${spec.width}px`
        )
        .toBeLessThanOrEqual(slack)
    }
  }
})
