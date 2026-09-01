import { test, expect } from '@playwright/test'
import { IMPACT_FEATURE_KEY, IMPACT_SERIES, readTenantRecord } from './helpers/authed-fixture'
import { isFlagConsoleEnabled } from '../lib/flags'

function tenantSlug() {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the authed design smoke requires the auth-setup project')
  return slug
}

test('signed-in pages inherit the responsive Golden Frijoles product shell', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.goto('/app')
  expect(response?.status()).toBe(200)
  await expect(page).not.toHaveURL(/\/login/)

  await expect(page.locator('.ds-shell-header')).toBeVisible()
  await expect(page.locator('.ds-shell-header .brand-lockup')).toBeVisible()
  // app-shell-and-agent-rail S1.3 — this used to assert the static "Engine ready" pill. For a
  // signed-in member the same slot now names the project whose sections the nav is showing, which
  // is the whole point of the change: the shell says WHICH tenant you are looking at. "Engine
  // ready" survives for the anonymous demo-project case, where there is no project to name.
  await expect(page.locator('.ds-shell-signal')).toContainText(tenantSlug())
  // ⚠️ **The slug is in the CHROME and no longer in `<main>` — design-system-rails Story 5.2.** The
  // shell's switcher names the tenant two inches above the page, and Today's own body repeating it
  // was the same fact twice (the reason `console-ia-overhaul` swept it out of twelve `h1`s). What
  // this line was defending — the page names which tenant you are looking at — is asserted one
  // element up, and the body now has to render its own content instead.
  await expect(page.locator('main .ds-tiles')).toBeVisible()

  const [scrollWidth, clientWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ])
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

  await page.screenshot({ path: testInfo.outputPath('app-mobile.png') })
})

// ── app-component-kit-adoption · Sprint 1 — the three primitives ────────────────────────────────
//
// These are BROWSER assertions and they live here rather than in an api spec because the things
// they check do not exist at the API level: whether focus can leave a dialog, whether pressing Esc
// performed a mutation, whether an error message moved the submit button. D9 records that this file
// is NOT part of the merge gate (playwright.config.ts excludes *.authed.spec.ts from the `api`
// project) — it is the opt-in authed rail, run with `npm run test:e2e:authed`, and per
// WAYS-OF-WORKING it DISCHARGES a browser smoke that would otherwise be owed to the product owner.
//
// The gate-covered half of Sprint 1 is `apps/web/lib/data-table.test.ts` (sort/filter as pure
// functions, in `npm run test:unit`).

/**
 * Issue an API key through the REAL mint flow.
 *
 * ⚠️ **Re-pointed at Setup › Keys — design-system-rails S4.5.** `/app/keys` is a permanent redirect
 * now; the form it held moved, and so did the words. What this helper is FOR is unchanged: these
 * tests are about `ConfirmDialog` — whether focus can leave a dialog, whether pressing Esc performed
 * a mutation — and they need a real, revocable row to act on. The route that provides one moved.
 */
async function issueKey(page: import('@playwright/test').Page, slug: string, label: string) {
  await page.goto(`/app/setup/keys/${slug}`)
  await page.getByRole('button', { name: '+ New key' }).click()
  // Step one is a list of JOBS, not of scopes. "API key" is the one every project needs first.
  await page.getByRole('button', { name: 'API key' }).click()
  await page.getByLabel('What to call it').fill(label)
  await page.getByRole('button', { name: /Create the api key/i }).click()
  const notice = page.getByRole('alert').filter({ hasText: 'Copy this key now' })
  await expect(notice).toBeVisible()
  // The reveal replaces the form and reloads on dismissal, which is what puts the new row on screen.
  await notice.getByRole('button', { name: "I've saved it" }).click()
  await page.waitForLoadState('networkidle')
}

function keyRow(page: import('@playwright/test').Page, label: string) {
  return page.getByRole('row').filter({ hasText: label })
}

test('ConfirmDialog names the specific object, traps focus, and cancels without acting', async ({ page }) => {
  const slug = tenantSlug()
  const label = `confirm-smoke-${Date.now()}`
  await issueKey(page, slug, label)

  // ⚠️ There is no "active" cell any more — design-system-rails S4.5. The merged page lists what
  // has access NOW and drops revoked rows entirely, so PRESENCE is the status. Asserting the word
  // would be asserting a column the design does not have.
  const row = keyRow(page, label)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: `Revoke ${label}` }).click()

  const dialog = page.locator('dialog.confirm-dialog')
  await expect(dialog).toBeVisible()

  // Story 1.2's headline criterion: the SPECIFIC key, not "Are you sure?".
  await expect(dialog).toContainText(`Revoke api key ${label}?`)
  await expect(dialog).not.toContainText('Are you sure')
  // Story 3.3 lands the consequence copy everywhere; the prop is required from Sprint 1, so there
  // is a real sentence here from the first call site.
  await expect(dialog.locator('.confirm-dialog__consequence')).toContainText('401')

  // The destructive control is NOT the one focused on open. A modal that opens with the
  // irreversible button under the return key is a one-keystroke accident.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()

  // The dialog is genuinely modal, which is what makes the page behind it inert. Asserted directly
  // rather than inferred, because every keyboard guarantee below is a consequence of it.
  await expect(dialog).toHaveJSProperty('open', true)
  expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(true)

  // ── Focus stays in the dialog. Ten tabs is several times its focusable count. ────────────────
  // The property asserted is "focus never reaches an interactive element behind the dialog", NOT
  // "activeElement is always a descendant". Those differ, and the difference cost a debugging pass
  // worth recording: Chromium's tab cycle inside a modal dialog passes through the DOCUMENT — the
  // observed cycle is Cancel → Confirm → <body> → Cancel → …. That `<body>` step is the wrap point,
  // not an escape; nothing behind the dialog is reachable from it, and the next Tab re-enters. A
  // spec that banned it would have failed a component that is behaving correctly.
  const visited: string[] = []
  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('Tab')
    const where = await page.evaluate(() => {
      const active = document.activeElement
      if (!active || active === document.body) return 'body'
      return active.closest('dialog.confirm-dialog') ? 'dialog' : `ESCAPED:${active.tagName}`
    })
    visited.push(where)
  }
  expect(visited.filter((where) => where.startsWith('ESCAPED'))).toEqual([])
  // ...and focus genuinely cycles back in, rather than being lost on the document for good.
  expect(visited.filter((where) => where === 'dialog').length).toBeGreaterThan(4)

  // Focus comes BACK to the control that opened the dialog. This is the finding cross-review
  // caught (Agy, Blocking): the first version unmounted the <dialog> when `open` went false, so
  // native close() never ran, the browser never restored focus, and a keyboard user was left on
  // <body> with no way back to the row they were operating on. The trap spec above could not see
  // it — it only looked at focus while the dialog was OPEN.
  const trigger = keyRow(page, label).getByRole('button', { name: `Revoke ${label}` })

  // Esc dismisses AND does not act — the property the mutation check was run against. "Did not act"
  // is now "the row is still there", which is a stronger reading than the old "the cell still says
  // active": a revoke that succeeded would remove it.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(keyRow(page, label)).toBeVisible()
  await expect(trigger).toBeFocused()

  // ...and so does the Cancel button, by the same handler — including the focus restoration.
  await trigger.click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('dialog.confirm-dialog')).toBeHidden()
  await expect(keyRow(page, label)).toBeVisible()
  await expect(trigger).toBeFocused()

  // Confirming still performs exactly the operation the bare button used to. The page reloads and
  // the row is GONE — "Revoked keys are not listed at all" is the page's own claim, asserted here.
  await trigger.click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Revoke' }).click()
  await page.waitForLoadState('networkidle')
  await expect(keyRow(page, label)).toHaveCount(0)
})

test('a field announces its error against the control and does not reflow the form', async ({ page }) => {
  // ⚠️ **MOVED from `components/ui/FormSection` to `design-system/primitives` — Story 4.5.** The
  // only route that exercised the kit's `Field` error path was `/app/keys`, which is now a redirect:
  // its label validation moved onto the merged Setup › Keys mint form, and that form renders the
  // design system's own field.
  //
  // The PROPERTIES are unchanged, deliberately. Both were bought by cross-review on the kit's
  // version and neither is re-derivable from a rewrite: the message must be ASSOCIATED with the
  // control (not merely near it), every id `aria-describedby` names must exist, and the submit
  // button must not move when the message appears.
  const slug = tenantSlug()
  await page.goto(`/app/setup/keys/${slug}`)
  await page.getByRole('button', { name: '+ New key' }).click()
  await page.getByRole('button', { name: 'API key' }).click()

  await page.evaluate(() => document.fonts.ready)

  const submit = page.getByRole('button', { name: /Create the api key/i })
  // DOCUMENT coordinates, not `boundingBox()`. boundingBox() is viewport-relative, and clicking the
  // button scrolls the page — which reads as the button moving UP, i.e. as a reflow no error slot
  // could possibly cause. Adding scrollY measures layout rather than scroll position.
  const submitTop = () => submit.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  const before = await submitTop()

  const input = page.getByLabel('What to call it')
  await expect(input).toHaveAttribute('aria-invalid', 'false')

  await submit.click()

  // The error is associated with the control, not merely near it: `aria-describedby` must point at
  // the element that now holds the message.
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()

  // EVERY id it names must resolve to an element that is actually in the DOM. The kit's version
  // listed its hint id unconditionally, so a field with no hint pointed at an element that was never
  // rendered — a dangling ARIA reference reads to a screen reader as nothing at all, silently.
  // Asserting the general property rather than the one instance means the next id added here cannot
  // reintroduce it.
  const dangling = await page.evaluate(
    (ids: string[]) => ids.filter((id) => !document.getElementById(id)),
    describedBy!.split(' ').filter(Boolean)
  )
  expect(dangling, 'aria-describedby must not name elements that do not exist').toEqual([])
  const errorId = describedBy!.split(' ').find((id) => id.endsWith('-error'))
  expect(errorId, 'the field must describe itself with an error element').toBeTruthy()
  await expect(page.locator(`[id="${errorId}"]`)).toContainText('Give the key a label')

  // ...and nothing moved. The error slot's height is reserved whether or not it has text, so the
  // submit button a cursor is already travelling towards stays where it was.
  expect(await submitTop()).toBeCloseTo(before, 0)

  // ⚠️ And no MINT happened. A validation test that only checked the message would pass just as
  // happily on a form that showed the error AND created the credential — which on this page means a
  // live key nobody asked for and nobody has seen.
  await expect(page.getByRole('alert').filter({ hasText: 'Copy this key now' })).toHaveCount(0)
})

// ── app-component-kit-adoption · Sprint 2 — the converted routes ────────────────────────────────
//
// Story 2.1 carries a finding from Sprint 1's cross-review (Codex, PR #82): `DataTable` merged with
// no call site and no RENDERED coverage. Its logic was gate-covered by lib/data-table.test.ts, but
// nothing had ever asserted that the sort control, the filter or the empty states reach a screen.
// This is that coverage, on the first of the two founding call sites.

test('DataTable sorts, filters, and tells the two kinds of empty apart', async ({ page }) => {
  // ⚠️ **RE-POINTED, not relaxed — design-system-rails S4.5.** This ran against `/app/keys` and
  // `/app/agent-keys`, creating two rows through their mint forms. Both routes are redirects now,
  // and Setup › Keys renders the design system's list rather than a `DataTable` — it has no filter
  // box and no sortable header, by design.
  //
  // The subject is the KIT COMPONENT, not those routes, so the test follows the kit to call sites
  // that still have one. It is a fixture-stable pair rather than rows this spec creates:
  //   · `/app/destinations` — a fresh tenant has none, which is the "you have no rows" empty state;
  //   · `/app/impact/<slug>/<IMPACT_FEATURE_KEY>` — `auth.setup.ts` seeds a real daily series, so
  //     sorting and filtering have something to act on with no mutation at all.
  //
  // ⚠️ Stated so the next reader is not surprised: this test moves again as the epic converts each
  // route, and **Sprint 6 retires it with the kit**. Deleting it now would be the repair LEARNINGS
  // warns about — the obvious fix for a guard that fails is to drop it, and then the guard is gone
  // while the component it covers is still shipping.
  const slug = tenantSlug()

  // The FIRST empty state — no rows at all. It must be the CALLER's sentence: a blank <tbody> or a
  // generic "No results" is the thing that epic existed to remove.
  await page.goto(`/app/destinations/${slug}`)
  // ⚠️ The DESIGN SYSTEM's empty state, not the kit's — design-system-rails S4.6 rebuilt this page.
  // The property is unchanged and is the reason this line exists: it must be the CALLER's sentence.
  // A blank list or a generic "No results" is the thing the component kit was built to remove, and
  // the design system inherits the rule rather than restarting it.
  await expect(page.locator('.ds-empty').first()).toContainText('No destinations yet')

  await page.goto(`/app/impact/${slug}/${IMPACT_FEATURE_KEY}`)
  // ⚠️ **Behind a disclosure since design-system-rails Story 5.3.** The approved `measure-north-star`
  // state leads with the small multiples, and the day-by-day table — with its sort and its filter,
  // which `app-component-kit-adoption` Story 2.3 built — is one keystroke below them rather than
  // deleted. Opening it here is the only change: everything this test asserts about the table is
  // unchanged, which is the point.
  await page.locator('.ds-gaps > summary').first().click()
  const table = page.locator('.data-table')
  const dateCells = () => table.locator('tbody tr td:first-child')
  const header = table.getByRole('button', { name: 'Date' })
  const sortState = () => table.getByRole('columnheader', { name: /Date/ })
  const filter = page.getByLabel('Filter days')

  // The fixture's own series, in the order the page received it — derived from the fixture rather
  // than typed, so a change to the seed cannot leave this asserting a stale list.
  const dates = IMPACT_SERIES.map((point) => point.occurredOn)
  expect(dates.length, 'the impact fixture seeds no series; this test would assert nothing').toBeGreaterThan(
    1
  )
  await expect(dateCells()).toHaveCount(dates.length)

  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'ascending')
  await expect(dateCells()).toHaveText([...dates].sort())

  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'descending')
  await expect(dateCells()).toHaveText([...dates].sort().reverse())

  // The third click returns to the server's order rather than cycling asc/desc forever — the
  // behaviour `lib/data-table.ts` calls out, and the reason `SortState` has a null case.
  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'none')
  await expect(dateCells()).toHaveText(dates)

  // Filtering narrows to one row, and composes with the ordering above.
  await filter.fill(dates[0])
  await expect(dateCells()).toHaveText([dates[0]])
  await expect(table.locator('.data-table__count')).toContainText('of')

  // ...and a query matching nothing gets the OTHER empty state, naming the query. This is the
  // distinction the component exists to preserve: "there is no data" and "none of it matches what
  // you typed" are different facts, and a reader who sees the first when the second is true
  // concludes their numbers are gone.
  await filter.fill('no-such-day-anywhere')
  const emptyCell = table.locator('.data-table__empty')
  await expect(emptyCell).toContainText('Nothing matches')
  await expect(emptyCell).toContainText('no-such-day-anywhere')
  await expect(emptyCell).not.toContainText('No data yet')

  // Clearing restores every row.
  await filter.fill('')
  await expect(dateCells()).toHaveCount(dates.length)
})

// Story 2.4 — one assertion per converted route. Deliberately thin: the point is that each surface
// now renders THROUGH the kit rather than as bare markup, which is the whole claim of the epic and
// the thing that silently regresses when a later change reverts a route to a hand-rolled table.
// Behaviour parity is proven elsewhere and better — by each route's EXISTING api spec passing
// unchanged (api-keys, destinations, experiments, flag-serving, experiment-decisions, impact).
const CONVERTED_ROUTES: Array<{
  name: string
  path: (slug: string) => string
  expect: string[]
  /** Reuses `.data-table`'s look WITHOUT being a `DataTable` — see the flags entry below. */
  skipFilter?: boolean
}> = [
  // ⚠️ **`keys` and `agent-keys` are RE-POINTED, not deleted — design-system-rails S4.5.**
  //
  // Both routes are permanent redirects now: minting and revoking moved onto Setup › Keys, which
  // renders from `apps/web/design-system/` and holds no `.data-table` or `.form-section` at all.
  // Deleting the entries is the repair LEARNINGS warns about — the obvious fix for a guard that
  // fails is to remove it, and then the guard added to catch drift is the thing that got dropped.
  //
  // So the entry keeps its force and changes its target, exactly as the flags entry below did: the
  // route must still render through a NAMED visual system, and for this one that system is the
  // design contract rather than the generic kit. Ad-hoc markup still fails.
  {
    name: 'setup keys',
    path: (s) => `/app/setup/keys/${s}`,
    expect: ['.ds-listcard', '.ds-page-head'],
    skipFilter: true,
  },
  // ⚠️ Re-pointed with S4.6, same rule as `setup keys` above: the route must render through a NAMED
  // visual system, and for a console route that system is the design contract. `.data-table` is
  // still on this page — the delivery log behind its disclosure is a `DataTable` — but asserting it
  // would let the PAGE revert to bare markup while the log alone kept this green.
  {
    name: 'destinations',
    path: (s) => `/app/destinations/${s}`,
    expect: ['.ds-listcard', '.ds-page-head', '.ds-answer'],
    skipFilter: true,
  },
  {
    name: 'share links',
    path: (s) => `/app/shares/${s}`,
    expect: ['.ds-page-head', '.ds-answer'],
    skipFilter: true,
  },
  // Experiments converts its FORM only — its version tables are per-experiment and 1-5 rows each, so
  // DataTable's always-on filter would stack a filter box above every flag on the page. Logged as a
  // D3 finding in sprint-2.md rather than fixed by quietly unfreezing the API mid-sprint.
  //
  // ⚠️ **`.ds-listcard` now, not `.form-section` — design-system-rails Story 5.4.** The page LEADS
  // with the approved list; the authoring form (with its `.form-section`) is complete and one
  // keystroke below it, behind a disclosure. Asserting the form was asserting what the page opened
  // with, and what it opens with changed.
  { name: 'experiments', path: (s) => `/app/experiments/${s}`, expect: ['.ds-listcard', '.ds-page-head'] },
  // flags-console-parity · the flags page now depends on the console gate, and BOTH states are
  // covered rather than one being dropped:
  //   DARK — the legacy tables are `DataTable` islands, filter box and all.
  //   LIT  — the feature list REUSES `.data-table`'s visual language without being a `DataTable`
  //          (epic D4): its search/sort/filters are URL-driven, so they survive a refresh and can be
  //          shared, which client state cannot do. So `.data-table__filter` is legitimately absent
  //          there, and asserting it would demand the client filter D4 exists to refuse.
  // The credentials route is the LIT home of the real DataTable islands, so the kit's filter/sort
  // affordances are still asserted somewhere — just where they actually live now.
  ...(isFlagConsoleEnabled()
    ? [
        {
          // ⚠️ **Re-pointed, not relaxed** (console-ia-overhaul, 2026-08-28).
          //
          // This asserted `.data-table`. The flags console's list is no longer a table: the
          // APPROVED design (`design/flags-console-prototype.html`, binding per
          // `design/CONSOLE-CONTRACT.md`) renders flex rows in a `.listcard`, with a `.summary`
          // strip above it.
          //
          // The temptation was to delete the entry, which is exactly the repair LEARNINGS warns
          // about — the obvious fix for a guard that fails is to remove the assertion, and then the
          // guard that was added to catch drift is the thing that got dropped. So it keeps its
          // force and changes its target: this route must still render through a NAMED visual
          // system, and for console routes that system is the design contract rather than the
          // generic kit. Ad-hoc markup still fails.
          name: 'flags (console)',
          path: (s: string) => `/app/flags/${s}`,
          expect: ['.ds-listcard', '.ds-summary'],
          skipFilter: true,
        },
        // ⚠️ `flag credentials` is GONE and `flag audit` is RE-POINTED — design-system-rails S4.5
        // and S4.3. The credentials route is a redirect (its rows live on Setup › Keys, covered
        // above); the audit is a timeline rather than a `DataTable`, because the approved
        // `ship-activity` state says in its own copy that it is "written as sentences, not as rows
        // of a table nobody reads".
        {
          name: 'flag audit',
          path: (s: string) => `/app/flag-audit/${s}`,
          expect: ['.ds-timeline', '.ds-page-head'],
          skipFilter: true,
        },
      ]
    : [{ name: 'flags', path: (s: string) => `/app/flags/${s}`, expect: ['.data-table'] }]),
  // The sixth route. It needs a feature with a linked input and a recorded series, so auth.setup.ts
  // now seeds one (cross-review, Agy, PR #83 — the fixture provisioned a bare tenant and the page
  // 500s without data). Worth closing rather than deferring: `impact.spec.ts` does NOT cover this,
  // because for a signed-in member it only asserts the /login redirect, never the rendered page.
  // ⚠️ **`.ds-chart-small`, not `.stat-card` — design-system-rails Story 5.3.** The headline figures
  // are a small multiple per input now (DD4: one plot each, never one chart with several lines), and
  // the `.data-table` moved behind a disclosure rather than being deleted — so it is not visible on
  // load and is covered by its own test above, which opens it.
  {
    name: 'impact',
    path: (s) => `/app/impact/${s}/${IMPACT_FEATURE_KEY}`,
    expect: ['.ds-chart-small', '.ds-page-head'],
    skipFilter: true,
  },
]

for (const route of CONVERTED_ROUTES) {
  test(`${route.name} renders through the component kit`, async ({ page }) => {
    const response = await page.goto(route.path(tenantSlug()))
    // A named failure rather than a bare status assertion. `/app/experiments` 404s when
    // EXPERIMENT_GOVERNANCE_ENABLED is unset — it is ON in production, so a local run without it
    // would otherwise report a conversion regression that is really a missing env var. Stated, not
    // skipped: a silently skipped route reads exactly like a covered one.
    expect(
      response?.status(),
      `${route.name} did not render. If this is 404, check the route's gate is enabled on the ` +
        `server under test (EXPERIMENT_GOVERNANCE_ENABLED for experiments) — it is ON in production.`
    ).toBe(200)
    for (const selector of route.expect) {
      await expect(page.locator(selector).first()).toBeVisible()
    }
    // Every converted table carries its sort/filter affordances, not just the class name.
    if (route.expect.includes('.data-table') && !route.skipFilter) {
      await expect(page.locator('.data-table__filter').first()).toBeVisible()
      await expect(page.locator('.data-table thead th').first()).toBeVisible()
    }
  })
}

test('impact renders its headline figures as a small multiple, and never as an invented zero', async ({
  page,
}) => {
  // ⚠️ **This asserted `.stat-card` until design-system-rails Story 5.3**, and the property it
  // defends is unchanged: the figures on this page are the seeded ones, computed, and an absent
  // reading never renders as a zero. What changed is the shape — one small multiple per input, which
  // is what DD4 asks for and what the approved `measure-north-star` state draws.
  const response = await page.goto(`/app/impact/${tenantSlug()}/${IMPACT_FEATURE_KEY}`)
  expect(response?.status()).toBe(200)

  const multiples = page.locator('.ds-chart-small')
  await expect(multiples).toHaveCount(1)

  // "Latest" is the LAST point because both paths that build the series sort ascending; if that ever
  // stops being true this assertion is what notices.
  const latest = IMPACT_SERIES[IMPACT_SERIES.length - 1]
  const total = IMPACT_SERIES.reduce((sum, point) => sum + point.value, 0)
  await expect(multiples.first().locator('.ds-chart-small-value b')).toHaveText(String(latest.value))

  // ⚠️ The figure is a LEVEL, not a sum — and the two must not be confused, which is exactly what a
  // substring match over the card would allow. The total is a different quantity and lives with the
  // readings it is a total OF.
  expect(
    total,
    'the fixture total and its latest reading are equal, so this cannot distinguish them'
  ).not.toBe(latest.value)
  await expect(multiples.first()).not.toContainText(String(total))

  // Not in an unreadable state — these are real readings, and the primitive marks the difference in
  // the DOM rather than only in the copy.
  await expect(multiples.first().locator('.ds-chart-unreadable')).toHaveCount(0)
  // ...and three readings IS a line, so it is drawn.
  await expect(multiples.first().locator('.ds-chart-spark path')).toHaveCount(1)

  // The series is still a TABLE, one keystroke below. Story 2.3 built it deliberately and Story 5.3
  // kept it: a sparkline is a shape, and somebody reconciling a figure against their own system
  // needs the numbers. A future change that deletes it must delete this line to do so.
  await page.locator('.ds-gaps > summary').first().click()
  await expect(page.locator('.data-table tbody tr')).toHaveCount(IMPACT_SERIES.length)
  // The two figures the small multiple does not carry are stated above the table, so nothing was
  // lost in the move.
  await expect(page.locator('.ds-gaps .ds-hint').first()).toContainText(String(total))
})

// ── app-component-kit-adoption · Sprint 3 — confirm every destructive action ─────────────────────

test('cancelling a confirmation performs no network call at all', async ({ page }) => {
  const slug = tenantSlug()
  const label = `cancel-nonet-${Date.now()}`
  await issueKey(page, slug, label)

  // Watching the WIRE, not the outcome. Story 3.2's acceptance is "cancelling performs no network
  // call", and asserting the row still reads "active" is weaker than that sounds: it would also
  // pass if the revoke fired and merely failed. Counting POSTs is the actual property. Server
  // actions post back to the page's own URL, so any mutation attempt shows up here.
  let posts = 0
  const countPosts = (request: import('@playwright/test').Request) => {
    if (request.method() === 'POST') posts += 1
  }

  const trigger = keyRow(page, label).getByRole('button', { name: `Revoke ${label}` })
  await trigger.click()
  await expect(page.locator('dialog.confirm-dialog')).toBeVisible()

  page.on('request', countPosts)
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.confirm-dialog')).toBeHidden()

  await trigger.click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('dialog.confirm-dialog')).toBeHidden()

  // Give anything in flight a chance to appear before concluding nothing was sent.
  await page.waitForTimeout(500)
  page.off('request', countPosts)
  expect(posts, 'dismissing a confirmation must not talk to the server').toBe(0)
  // ⚠️ **PRESENCE, not the word "active" — design-system-rails S4.5.** The merged page lists what has
  // access NOW and drops revoked rows entirely, so there is no status cell to read. That is a
  // stronger reading of "cancelling did not act": a revoke that succeeded would have removed the row.
  await expect(keyRow(page, label)).toBeVisible()

  // ...and confirming does exactly what the bare button used to. The page reloads and the row goes.
  await trigger.click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Revoke' }).click()
  await page.waitForLoadState('networkidle')
  await expect(keyRow(page, label)).toHaveCount(0)
})

test('destinations Remove confirms through ONE dialog — the two-click pattern is gone', async ({ page }) => {
  const slug = tenantSlug()
  const name = `dest-confirm-${Date.now()}`

  await page.goto(`/app/destinations/${slug}`)
  // ⚠️ The create form is behind `+ New destination` — design-system-rails S4.6. The approved state
  // opens on the answer line and the list, not on an empty form, which is also what lets the page
  // fit at 1440×960.
  await page.getByRole('button', { name: '+ New destination' }).click()
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Webhook URL').fill(`https://example.invalid/hooks/${name}`)
  await page.getByRole('button', { name: 'Create the destination' }).click()
  const secretNotice = page.getByRole('alert').filter({ hasText: 'Copy this signing secret now' })
  await expect(secretNotice).toBeVisible()
  await secretNotice.getByRole('button', { name: "I've saved it" }).click()

  // Scoped to the DESTINATIONS list specifically. `page.getByRole('row')` spans the delivery and
  // attempt logs too, and both name a destination — so an unscoped filter matches more than once the
  // moment a delivery exists. The logs are inside `<details>` now and closed by default, which
  // narrows it but does not make it safe: `getByRole` still sees a closed disclosure's contents in
  // the DOM, and relying on that would be relying on a default.
  const table = page.locator('.ds-listcard').filter({ hasText: name }).first()
  const row = table.getByRole('row').filter({ hasText: name })
  await expect(row).toBeVisible()

  // The corrected D5: the product ships ONE confirmation pattern. The bespoke two-click affordance
  // that used to live here is gone, and this assertion is what stops it coming back.
  await expect(page.getByText('Click again to confirm')).toHaveCount(0)

  await row.getByRole('button', { name: 'Remove' }).click()
  const dialog = page.locator('dialog.confirm-dialog')
  await expect(dialog).toContainText(`Remove destination ${name}?`)
  // Story 3.3 — a consequence, not a restatement of the verb.
  await expect(dialog).toContainText('never be re-enabled')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(row).toBeVisible()

  // Rotate is confirmed too, and says something DIFFERENT — it reads as routine beside Remove and
  // is not: the old secret stops verifying immediately.
  await row.getByRole('button', { name: 'Rotate secret' }).click()
  await expect(dialog).toContainText(`Rotate the signing secret for ${name}?`)
  await expect(dialog).toContainText('stops verifying')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await row.getByRole('button', { name: 'Remove' }).click()
  await dialog.getByRole('button', { name: 'Remove' }).click()
  await expect(table.getByRole('row').filter({ hasText: name })).toHaveCount(0)
})
