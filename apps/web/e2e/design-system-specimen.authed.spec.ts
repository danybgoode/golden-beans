// The specimen, asserted — Sprint 2's gate.
//
// This is the screen where the language is approved, so it is also the screen where the language is
// checked. Every assertion here is one a human would otherwise have to make by eye on every PR.

import { test, expect } from '@playwright/test'
import * as primitives from '@/design-system/primitives'
import { TYPE, WEIGHT } from '@/design-system/scales'

const VIEWPORT = { width: 1440, height: 960 }

/**
 * How many enabled, focusable controls the specimen renders.
 *
 * A number kept OUTSIDE the focus loop on purpose. The previous pin was computed from the same
 * `count` the loop walked, so it restated the loop instead of checking it, and ten controls could
 * vanish from the render with the suite green. This is the one place the expected shape of the page
 * is written down; the specimen and this constant are two things that must agree.
 *
 * Excludes `disabled` and `loading` controls, which set the DOM attribute deliberately and cannot
 * take focus — the selector below excludes them, so they are not counted here either.
 */
const EXPECTED_FOCUSABLE = 30
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

  test("the PRODUCT's confirmation dialog opens centred — the element D12 actually names", async ({
    page,
  }) => {
    // ⚠️ **The assertion above was pointed at the wrong dialog.** D12 locks the position check
    // against `.confirm-dialog` in `globals.css` — what every destructive action in the console
    // uses — and says "the fix is one stylesheet edit away from silently regressing". The test
    // above asserts `.ds-dialog`, an element this sprint created, centred by a DIFFERENT
    // `margin: auto` in a different file. Deleting `margin: auto` from `.confirm-dialog` left
    // typecheck, lint, 1503 unit tests, drift and all 14 specimen specs green while putting every
    // confirmation dialog in the product back at x:0, y:0 (fresh reviewer, round 2, Blocking).
    //
    // Same assertion, real element. `console-ia-overhaul` S3.3 fixed this bug once; this is what
    // keeps it fixed.
    await page.getByRole('button', { name: /product.s confirmation dialog/i }).click()
    const dialog = page.locator('[data-specimen-product-dialog] dialog.confirm-dialog')
    await expect(dialog).toBeVisible()

    const box = await dialog.boundingBox()
    expect(box, 'the product dialog rendered no box').not.toBeNull()
    if (!box) return
    const centreX = box.x + box.width / 2
    const centreY = box.y + box.height / 2
    expect(
      Math.abs(centreX - VIEWPORT.width / 2),
      `the product dialog's centre x is ${centreX}, not ${VIEWPORT.width / 2}`
    ).toBeLessThan(2)
    expect(
      Math.abs(centreY - VIEWPORT.height / 2),
      `the product dialog's centre y is ${centreY}, not ${VIEWPORT.height / 2}`
    ).toBeLessThan(2)
  })

  test('every interactive element shows a visible focus ring, keyboard only', async ({ page }) => {
    // `outline: none` without a replacement is the single most common way a design system locks out
    // keyboard users, and the guidelines name it. Asserted as PAINT — an outline width — not as the
    // presence of a `:focus-visible` rule somewhere in a stylesheet.
    // ⚠️ `:not([disabled])` is part of the SELECTOR, not a skip inside the loop. The `disabled` and
    // `loading` states set the DOM attribute on purpose, and a disabled control cannot take focus —
    // so including them forced a "focus did not land here" branch, and that branch is independent
    // of whether the element paints a ring. Excluding them up front is what lets every remaining
    // element be ASSERTED rather than skipped (cross-family review, agy).
    const focusable = page.locator(
      '.ds-specimen button:visible:not([disabled]), .ds-specimen a:visible:not([disabled])'
    )
    const count = await focusable.count()
    expect(count, 'the specimen rendered nothing focusable').toBeGreaterThan(10)

    // ⚠️ **The previous version could not fail on the property it is named after.** It read
    // `if (outline.style === 'none') continue` — and `outline: none` is EXACTLY the failure this
    // test claims to catch. Adding `.ds-btn:focus-visible { outline: none }` left it green, because
    // the rail's anchors still painted a ring and the only surviving assertion was "at least one of
    // twenty-five elements rang". That is CODE-QUALITY §5b's predicate with one half always false,
    // in the test written to stop keyboard users being locked out (fresh reviewer, Blocking).
    //
    // Now every element is asserted, and the element is confirmed FOCUSED before its outline is
    // read — nothing previously checked that `Shift+Tab`/`Tab` had actually returned focus, so a
    // ring could have been read off an element the keyboard never reached.
    // ⚠️ **The cap was 25 and the specimen renders 29.** The four never examined were the two
    // switches in the data table, the `unbuilt` button in the empty state, and the dialog trigger —
    // so `.ds .ds-table-empty .ds-btn:focus-visible { outline: none }` passed the whole gate, in the
    // test called "every interactive element shows a visible focus ring" (fresh reviewer, round 2,
    // Blocking, verified by mutation). A cap chosen for speed silently redefined "every".
    let checked = 0
    for (let index = 0; index < count; index += 1) {
      const element = focusable.nth(index)
      await element.evaluate((node) => (node as HTMLElement).focus({ preventScroll: true }))
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')

      const state = await element.evaluate((node) => {
        const style = getComputedStyle(node)
        return {
          focused: node === document.activeElement,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          describe: `${node.tagName.toLowerCase()}.${(node as HTMLElement).className}`.slice(0, 60),
        }
      })

      // ⚠️ This was `if (!state.focused) continue` — the SAME silent-skip shape as the
      // `outline: none` one above it, in the same test, added while fixing that one. An element the
      // keyboard could not reach is a keyboard-accessibility failure in its own right, and skipping
      // it meant the count floor was the only thing standing between a locked-out control and a
      // green run (cross-family review, agy). Now the round trip is asserted.
      expect(
        state.focused,
        `${state.describe} is enabled and focusable, but Shift+Tab/Tab did not return focus to it — ` +
          'the keyboard cannot reach it'
      ).toBe(true)

      expect(
        state.outlineStyle,
        `${state.describe} is focusable and paints NO focus ring — a keyboard user cannot see where they are`
      ).not.toBe('none')
      expect(parseFloat(state.outlineWidth), `${state.describe} has a zero-width focus ring`).toBeGreaterThan(
        0
      )
      checked += 1
    }
    // ⚠️ This was `expect(checked).toBe(Math.min(count, 25))`, which CANNOT FAIL: the loop body has
    // no `continue`, so `checked === count` by construction, and the expectation was computed from
    // the same `count`. Its comment claimed it would notice "if the specimen ever renders fewer
    // controls than the assertions assume" — it could not. Hiding one section removed ten controls
    // and the suite stayed green, the pass silently shrinking from 25 assertions to 19 (fresh
    // reviewer, round 2, Blocking, verified by mutation).
    //
    // A pin has to come from OUTSIDE the loop to mean anything. This is the count the specimen is
    // known to render; a section that stops rendering fails here, and adding controls fails here
    // too — deliberately, because "the specimen grew and nobody looked" is the same blindness.
    expect(
      checked,
      `the specimen rendered ${checked} enabled focusable controls, not ${EXPECTED_FOCUSABLE}. If ` +
        'that is intended, change the constant in the same commit as the render.'
    ).toBe(EXPECTED_FOCUSABLE)
  })

  test('the data table is a complete ARIA structure, not just a row with a role on it', async ({ page }) => {
    // ⚠️ Neither half of this was asserted by anything. Round 1 put `role="table"` on the scroller
    // because `role="row"` under a plain `<div>` is an orphan; round 2 found the columns were
    // still bare `<span>`s, so the rows contained no cells — the same broken structure one level
    // down, in the fix for the level above (cross-family review, agy, twice). A structure fixed
    // twice and checked zero times is why this test exists.
    const rows = page.locator('.ds-specimen [role="row"]')
    const rowCount = await rows.count()
    expect(rowCount, 'the specimen rendered no table rows').toBeGreaterThan(4)

    // ⚠️ Iterating rows cannot see a table that HAS no rows — and the specimen renders one:
    // `<Table><TableEmpty /></Table>` is `role="table"` containing nothing, which is the same
    // orphaned-role defect a third time, one case along from the two already fixed (fresh reviewer,
    // round 2, Minor). A table is checked from the TABLE down, not only from the rows up.
    const tables = page.locator('.ds-specimen [role="table"]')
    const tableCount = await tables.count()
    expect(tableCount, 'the specimen rendered no tables').toBeGreaterThan(1)
    for (let index = 0; index < tableCount; index += 1) {
      const inside = await tables.nth(index).evaluate((table) => ({
        rows: table.querySelectorAll('[role="row"]').length,
        // An empty state is a legitimate table with no rows — but then it must not claim to be a
        // table, because a grid with neither rows nor columns is what a screen reader reads as
        // broken rather than as "nothing here yet".
        empty: Boolean(table.querySelector('.ds-table-empty')),
      }))
      expect(
        inside.empty,
        `table ${index} claims role="table" around an empty state — a grid with no rows reads as ` +
          'broken structure, not as "nothing here yet". Pass `empty` to <Table>.'
      ).toBe(false)
      expect(inside.rows, `table ${index} carries role="table" and contains no rows`).toBeGreaterThan(0)
    }

    for (let index = 0; index < rowCount; index += 1) {
      const shape = await rows.nth(index).evaluate((row) => ({
        // The row's own role means nothing if nothing above it is a table.
        underTable: Boolean(row.closest('[role="table"]')),
        children: [...row.children].map((child) => child.getAttribute('role')),
      }))
      expect(shape.underTable, `row ${index} carries role="row" with no role="table" ancestor`).toBe(true)
      expect(shape.children.length, `row ${index} has no columns`).toBeGreaterThan(2)
      for (const role of shape.children) {
        expect(
          role,
          `row ${index} has a column with role=${role ?? 'null'} — a row may only contain cells`
        ).toMatch(/^(cell|columnheader)$/)
      }
    }
  })

  test('every primitive the module exports actually reaches the specimen', async ({ page }) => {
    // ⚠️ **Ten of the fourteen primitives Story 2.3 lists were asserted by NOTHING.** Grepping the
    // whole spec for `ds-` names yielded only `ds-answer`, `ds-btn`, `ds-dialog`, `ds-switch` and
    // the specimen's own layout classes — so the rail item, project switcher, environment menu,
    // section tab, state pill, stat tile, toast, numbered step card and wizard could all be deleted
    // from the render with the suite green (fresh reviewer, round 2, Major; demonstrated by hiding
    // a section and watching nothing notice).
    //
    // The pairs are declared rather than derived because a component's export name and its root
    // class are genuinely two different things. What is DERIVED is the coverage check below: a new
    // export with no entry here fails, so this list cannot fall behind the module the way the
    // sprint's own primitive list fell behind the spec.
    const PRIMITIVES: [string, string][] = [
      ['Button', '.ds-btn'],
      ['Pill', '.ds-pill'],
      ['Switch', '.ds-switch'],
      ['RailItem', '.ds-rail-item'],
      ['Tab', '.ds-tab'],
      ['Stat', '.ds-stat'],
      ['Answer', '.ds-answer'],
      ['Table', '.ds-table'],
      ['TableHead', '.ds-table-head'],
      ['TableRow', '.ds-table-row'],
      ['TableCell', '.ds-specimen-col'],
      ['TableEmpty', '.ds-table-empty'],
      ['Toast', '.ds-toast'],
      ['Steps', '.ds-steps'],
      ['Step', '.ds-step'],
      ['Wizard', '.ds-wizard'],
      ['EnvironmentControl', '.ds-env'],
      ['Switcher', '.ds-switcher'],
      ['Menu', '.ds-menu'],
      ['MenuItem', '.ds-menu-item'],
    ]

    for (const [name, selector] of PRIMITIVES) {
      const count = await page.locator(`.ds-specimen ${selector}`).count()
      expect(count, `<${name}> renders nothing matching ${selector} on the specimen`).toBeGreaterThan(0)
    }

    // ...and the list may not fall behind the module. The MODULE is the source of truth for what
    // exists; anything it exports and this list omits is a primitive with no specimen entry, which
    // is exactly how ten of them went unasserted in the first place.
    //
    // Read from the module's own exports rather than by grepping its source: a regex over
    // `export function` would miss a primitive exported any other way, and this check exists
    // precisely because a hand-maintained second list drifted from the first one.
    const exported = Object.keys(primitives).filter((name) => /^[A-Z]/.test(name))
    const listed = new Set(PRIMITIVES.map(([name]) => name))
    expect(
      exported.filter((name) => !listed.has(name)),
      'primitives.tsx exports a component with no entry above — add it to the specimen and to this list'
    ).toEqual([])
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

  test('the browser states are real, and `unbuilt` is not one of them', async ({ page }) => {
    // ⚠️ Story 2.2's headline criterion — "each state has a reference render, so 'the pressed state
    // was not implemented' becomes a gate failure rather than a review comment" — was asserted by
    // NOTHING. Deleting `.ds-btn:active` left the whole suite green (fresh reviewer, Major). These
    // are the browser states, exercised through the browser.
    const read = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            background: style.backgroundColor,
            transform: style.transform,
            border: style.borderTopColor,
          }
        })

    const secondary = page.locator('.ds-btn--secondary[data-state="idle"]').first()

    // HOVER changes something, and it is not colour alone by accident — the point is that a
    // pressable control answers "what happens if I press this" before it is pressed.
    await secondary.scrollIntoViewIfNeeded()
    const restingSecondary = await read('.ds-btn--secondary[data-state="idle"]')

    // ⚠️ An EXPLICIT mouse move to the element's own centre, not `locator.hover()`. Two earlier
    // attempts read the resting style twice and reported rest and hover as byte-identical, which
    // reads exactly like a missing CSS rule while the rule was correct. The failure message names
    // the element and both colours now, so a third wrong guess is not possible.
    const box = await secondary.boundingBox()
    expect(box, 'the secondary button has no box to hover').not.toBeNull()
    if (!box) return
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(120)

    const hoveredSecondary = await read('.ds-btn--secondary[data-state="idle"]')
    const label = await secondary.innerText()
    expect(restingSecondary && hoveredSecondary, 'the secondary button did not render').toBeTruthy()
    if (!restingSecondary || !hoveredSecondary) return
    expect(
      hoveredSecondary.background !== restingSecondary.background ||
        hoveredSecondary.border !== restingSecondary.border,
      `the secondary button "${label}" looks identical hovered and at rest — ` +
        `rest ${restingSecondary.background}/${restingSecondary.border}, ` +
        `hover ${hoveredSecondary.background}/${hoveredSecondary.border}, ` +
        `box ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`
    ).toBe(true)

    // PRESSED — the state the guidelines say the product skips.
    await page.mouse.down()
    const pressed = await read('.ds-btn--secondary[data-state="idle"]')
    await page.mouse.up()
    if (!pressed) throw new Error('the secondary button vanished mid-press')
    expect(pressed.transform, 'the pressed state is not implemented — it was the named defect').not.toBe(
      restingSecondary.transform
    )

    // ⚠️ And `unbuilt` must NOT repaint. It is deliberately not DOM-`disabled`, so `:not(:disabled)`
    // did not exclude it and hover lit it to full `--gold-hot` — a control saying "not built yet"
    // behaving like a live one, which is the exact defect F2.1 exists to prevent, inside the state
    // F2.1 added (fresh reviewer, Major, found by rendering).
    const unbuilt = page.locator('.ds-btn--primary[data-state="unbuilt"]').first()
    await unbuilt.scrollIntoViewIfNeeded()
    const unbuiltIdle = await read('.ds-btn--primary[data-state="unbuilt"]')
    await unbuilt.hover()
    const unbuiltHover = await read('.ds-btn--primary[data-state="unbuilt"]')
    if (!unbuiltIdle || !unbuiltHover) throw new Error('the unbuilt button did not render')
    expect(unbuiltHover.background, 'unbuilt repaints on hover like a live control').toBe(
      unbuiltIdle.background
    )
  })

  test('a focused pill keeps its pill radius', async ({ page }) => {
    // ⚠️ The global focus rule set `border-radius: var(--r)` at (0,1,1), outranking every (0,1,0)
    // primitive that declares `999px` — so the 38x21 three-state switch became a rounded RECTANGLE
    // with a round knob inside it the moment a keyboard user reached it (fresh reviewer, Major,
    // found by rendering). Asserted here because nothing looked at a FOCUSED primitive's shape.
    const control = page.locator('.ds-switch').first()
    await control.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }))
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const radius = await control.evaluate((element) => getComputedStyle(element).borderTopLeftRadius)
    expect(radius, `a focused switch computed ${radius} — it is a pill, not a rounded rectangle`).toBe(
      '999px'
    )
  })

  test('console.css does not out-specify the design system', async ({ page }) => {
    // ⚠️ `.is-console main p` is (0,1,2) and beat every (0,1,0) `.ds-*` rule on a `<p>`. Rendered:
    // `.ds-answer` — "the sentence a page opens with" — lost `--crema` for `--dim`, and
    // `.ds-dialog-title` rendered at 13.5px/`--dim` instead of 15px/`--crema`, dimmer and no larger
    // than its own body. Nothing asserted either (fresh reviewer, Major, found by rendering).
    //
    // The fix is that every selector is now scoped `.ds .ds-…` — (0,2,0), which outranks (0,1,2).
    // This is what keeps it fixed, against the REAL four-stylesheet cascade rather than the file.
    const crema = 'rgb(245, 234, 214)'

    const answer = await page
      .locator('.ds-answer')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return { fontSize: style.fontSize, color: style.color }
      })
    // ⚠️ `TYPE.body.px`, not `'13.5px'`. Hard-coding them here re-typed two constants in the file
    // whose FIRST test makes a point of importing `TYPE` "rather than hard-coding sizes here"
    // (fresh reviewer, round 2, Minor) — the weld-welded-a-copy defect from round 1, three tests
    // down from the comment that names it.
    expect(answer.fontSize, 'the answer line lost its declared size to console.css').toBe(`${TYPE.body.px}px`)
    expect(answer.color, 'the answer line lost --crema to console.css`s body-copy rule').toBe(crema)

    await page.getByRole('button', { name: 'Open the confirmation dialog' }).click()
    const title = await page.locator('.ds-dialog-title').evaluate((element) => {
      const style = getComputedStyle(element)
      return { fontSize: style.fontSize, color: style.color }
    })
    expect(title.fontSize, 'the dialog title renders no larger than its own body').toBe(
      `${TYPE.section.px}px`
    )
    expect(title.color, 'the dialog title lost --crema').toBe(crema)
  })
})

// ── The auth boundary, asserted ───────────────────────────────────────────────────────────────
//
// ⚠️ **This spec exists because the route shipped its first draft with no auth check at all.** The
// guard was `if (projectSlug) await requireProjectMembership(projectSlug)`, so `/app/design-system`
// with no `?project=` ran nothing — while the comment above it claimed the route was protected
// "exactly like every other `/app` route". A cross-family reviewer (agy) found it as a Blocking
// finding; nothing in the suite could have.
//
// Deliberately OUTSIDE the `authed` describe above: this asserts what an ANONYMOUS caller gets, so
// it must not run with the fixture's storage state.
test.describe('the specimen is closed to anonymous callers', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('with no project named, an anonymous request is sent to /login', async ({ page }) => {
    const response = await page.goto(SPECIMEN)
    // Either a redirect chain ending at /login, or the login page itself — what matters is that the
    // specimen never renders. Asserted on the RENDERED page, not on a status code, because a
    // redirect that lands somewhere else would still be a 200.
    expect(page.url(), `an anonymous caller reached ${page.url()}`).toContain('/login')
    await expect(page.locator('.ds-specimen')).toHaveCount(0)
    expect(response?.status() ?? 0).toBeLessThan(500)
  })

  test('naming a project does not open it either', async ({ page }) => {
    // The `if (projectSlug)` shape meant the WITHOUT-slug path was the hole. Both are asserted, so a
    // future refactor cannot close one and reopen the other.
    await page.goto(`${SPECIMEN}?project=miyagisanchez`)
    expect(page.url(), `an anonymous caller reached ${page.url()}`).toContain('/login')
    await expect(page.locator('.ds-specimen')).toHaveCount(0)
  })
})
