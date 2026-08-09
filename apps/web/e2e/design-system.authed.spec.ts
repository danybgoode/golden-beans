import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug() {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the authed design smoke requires the auth-setup project')
  return slug
}

test('signed-in pages inherit the responsive Golden Beans product shell', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const response = await page.goto('/app')
  expect(response?.status()).toBe(200)
  await expect(page).not.toHaveURL(/\/login/)

  await expect(page.locator('.product-shell__header')).toBeVisible()
  await expect(page.locator('.product-shell__header .brand-lockup')).toBeVisible()
  // app-shell-and-agent-rail S1.3 — this used to assert the static "Engine ready" pill. For a
  // signed-in member the same slot now names the project whose sections the nav is showing, which
  // is the whole point of the change: the shell says WHICH tenant you are looking at. "Engine
  // ready" survives for the anonymous demo-project case, where there is no project to name.
  await expect(page.locator('.product-shell__signal')).toContainText(tenantSlug())
  await expect(page.locator('main')).toContainText(tenantSlug())

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

async function issueKey(page: import('@playwright/test').Page, slug: string, label: string) {
  await page.goto(`/app/keys/${slug}`)
  await page.getByLabel('New key label').fill(label)
  await page.getByRole('button', { name: 'Issue key' }).click()
  const notice = page.getByRole('alert').filter({ hasText: 'Copy your new key now' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: "I've saved it" }).click()
}

function keyRow(page: import('@playwright/test').Page, label: string) {
  return page.getByRole('row').filter({ hasText: label })
}

test('ConfirmDialog names the specific object, traps focus, and cancels without acting', async ({ page }) => {
  const slug = tenantSlug()
  const label = `confirm-smoke-${Date.now()}`
  await issueKey(page, slug, label)

  const row = keyRow(page, label)
  await expect(row).toContainText('active')
  await row.getByRole('button', { name: 'Revoke' }).click()

  const dialog = page.locator('dialog.confirm-dialog')
  await expect(dialog).toBeVisible()

  // Story 1.2's headline criterion: the SPECIFIC key, not "Are you sure?".
  await expect(dialog).toContainText(`Revoke key ${label}?`)
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
  const trigger = keyRow(page, label).getByRole('button', { name: 'Revoke' })

  // Esc dismisses AND does not act — the property the mutation check was run against.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(keyRow(page, label)).toContainText('active')
  await expect(trigger).toBeFocused()

  // ...and so does the Cancel button, by the same handler — including the focus restoration.
  await trigger.click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('dialog.confirm-dialog')).toBeHidden()
  await expect(keyRow(page, label)).toContainText('active')
  await expect(trigger).toBeFocused()

  // Confirming still performs exactly the operation the bare button used to.
  await keyRow(page, label).getByRole('button', { name: 'Revoke' }).click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(keyRow(page, label)).toContainText('revoked')
})

test('Field announces its error against the control and does not reflow the form', async ({ page }) => {
  const slug = tenantSlug()
  await page.goto(`/app/keys/${slug}`)

  // FormSection renders a real heading + description rather than a bare input.
  const section = page.locator('.form-section')
  await expect(section.getByRole('heading', { name: 'Issue a key' })).toBeVisible()
  await expect(section).toContainText('shown once')

  await page.evaluate(() => document.fonts.ready)

  const submit = page.getByRole('button', { name: 'Issue key' })
  // DOCUMENT coordinates, not `boundingBox()`. boundingBox() is viewport-relative, and clicking the
  // button scrolls the page — which read as the button moving UP by 25px, i.e. as a reflow no error
  // slot could possibly cause. Adding scrollY measures layout rather than scroll position.
  const submitTop = () => submit.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  const before = await submitTop()

  const input = page.getByLabel('New key label')
  await expect(input).toHaveAttribute('aria-invalid', 'false')

  await submit.click()

  // The error is associated with the control, not merely near it: aria-describedby must point at
  // the element that now holds the message.
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()

  // EVERY id it names must resolve to an element that is actually in the DOM. Cross-review (Agy,
  // PR #82) found `Field` listing its hint id unconditionally, so a field with no hint pointed at
  // an element that was never rendered — a dangling ARIA reference reads to a screen reader as
  // nothing at all, silently. Asserting the general property rather than the one instance means the
  // next describedby id added here cannot reintroduce it.
  const dangling = await page.evaluate(
    (ids: string[]) => ids.filter((id) => !document.getElementById(id)),
    describedBy!.split(' ').filter(Boolean)
  )
  expect(dangling, 'aria-describedby must not name elements that do not exist').toEqual([])
  const errorId = describedBy!.split(' ').find((id) => id.endsWith('-error'))
  expect(errorId, 'the field must describe itself with an error element').toBeTruthy()
  // An attribute selector rather than `#id`: React's useId emits ids containing characters that
  // are not valid in a bare CSS id selector, and escaping them by hand is a footgun.
  await expect(page.locator(`[id="${errorId}"]`)).toContainText('Give the key a label')

  // ...and nothing moved. The error slot's height is reserved whether or not it has text, so the
  // submit button a cursor is already travelling towards stays where it was.
  expect(await submitTop()).toBeCloseTo(before, 0)
})

// ── app-component-kit-adoption · Sprint 2 — the converted routes ────────────────────────────────
//
// Story 2.1 carries a finding from Sprint 1's cross-review (Codex, PR #82): `DataTable` merged with
// no call site and no RENDERED coverage. Its logic was gate-covered by lib/data-table.test.ts, but
// nothing had ever asserted that the sort control, the filter or the empty states reach a screen.
// This is that coverage, on the first of the two founding call sites.

test('DataTable sorts, filters, and tells the two kinds of empty apart', async ({ page }) => {
  const slug = tenantSlug()

  // The FIRST empty state — no rows at all — is asserted on `agent-keys` rather than `keys`,
  // because provisioning issues a project's first API key, so a fresh tenant's key table is never
  // actually empty. It must be the CALLER's sentence: a blank <tbody> or a generic "No results" is
  // the thing this epic exists to remove.
  await page.goto(`/app/agent-keys/${slug}`)
  await expect(page.locator('.data-table__empty')).toContainText('No agent write keys yet')

  await page.goto(`/app/keys/${slug}`)
  const table = page.locator('.data-table')

  // Two rows whose ALPHABETICAL order is the reverse of their creation order, so a passing sort
  // assertion cannot be satisfied by the server's newest-first ordering.
  const stamp = Date.now()
  const first = `zz-first-${stamp}`
  const second = `aa-second-${stamp}`
  await issueKey(page, slug, first)
  await issueKey(page, slug, second)

  const labelCells = () => table.locator('tbody tr td:first-child')
  const header = table.getByRole('button', { name: 'Label' })
  const sortState = () => table.getByRole('columnheader', { name: /Label/ })
  const filter = page.getByLabel('Filter keys')

  // Narrow to just this run's two rows first. The tenant also holds the key provisioning issued,
  // and a sort assertion that has to account for rows it did not create is a spec that breaks for
  // reasons unrelated to sorting. Filtering and sorting compose, which is itself worth exercising.
  await filter.fill(String(stamp))
  await expect(labelCells()).toHaveText([second, first])
  await expect(table.locator('.data-table__count')).toContainText('of')

  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'ascending')
  await expect(labelCells()).toHaveText([second, first])

  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'descending')
  await expect(labelCells()).toHaveText([first, second])

  // The third click returns to the server's order rather than cycling asc/desc forever — the
  // behaviour lib/data-table.ts calls out and the reason `SortState` has a null case.
  await header.click()
  await expect(sortState()).toHaveAttribute('aria-sort', 'none')
  await expect(labelCells()).toHaveText([second, first])

  // Narrowing further still works.
  await filter.fill(`zz-first-${stamp}`)
  await expect(labelCells()).toHaveText([first])

  // ...and a query matching nothing gets the OTHER empty state, naming the query. This is the
  // distinction the component exists to preserve: "you have no keys" and "none of your keys match
  // what you typed" are different facts, and a PM who sees the first when the second is true
  // concludes their credentials are gone.
  await filter.fill('no-such-key-anywhere')
  const emptyCell = table.locator('.data-table__empty')
  await expect(emptyCell).toContainText('Nothing matches')
  await expect(emptyCell).toContainText('no-such-key-anywhere')
  await expect(emptyCell).not.toContainText('No keys yet')

  // Clearing restores every row — both of this run's, plus the provisioned one it was hiding.
  await filter.fill('')
  await expect(labelCells()).toContainText([second, first])
  await expect(table.locator('.data-table__count')).not.toContainText('of')
})

// Story 2.4 — one assertion per converted route. Deliberately thin: the point is that each surface
// now renders THROUGH the kit rather than as bare markup, which is the whole claim of the epic and
// the thing that silently regresses when a later change reverts a route to a hand-rolled table.
// Behaviour parity is proven elsewhere and better — by each route's EXISTING api spec passing
// unchanged (api-keys, destinations, experiments, flag-serving, experiment-decisions, impact).
const CONVERTED_ROUTES: Array<{ name: string; path: (slug: string) => string; expect: string[] }> = [
  { name: 'keys', path: (s) => `/app/keys/${s}`, expect: ['.data-table', '.form-section'] },
  { name: 'agent-keys', path: (s) => `/app/agent-keys/${s}`, expect: ['.data-table', '.form-section'] },
  { name: 'destinations', path: (s) => `/app/destinations/${s}`, expect: ['.data-table', '.form-section'] },
  // Experiments converts its FORM only — its version tables are per-experiment and 1-5 rows each, so
  // DataTable's always-on filter would stack a filter box above every flag on the page. Logged as a
  // D3 finding in sprint-2.md rather than fixed by quietly unfreezing the API mid-sprint.
  { name: 'experiments', path: (s) => `/app/experiments/${s}`, expect: ['.form-section'] },
  { name: 'flags', path: (s) => `/app/flags/${s}`, expect: ['.data-table'] },
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
    if (route.expect.includes('.data-table')) {
      await expect(page.locator('.data-table__filter').first()).toBeVisible()
      await expect(page.locator('.data-table thead th').first()).toBeVisible()
    }
  })
}
