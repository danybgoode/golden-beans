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
  const notice = page.getByRole('alert').filter({ hasText: "Copy your new key now" })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: "I've saved it" }).click()
}

function keyRow(page: import('@playwright/test').Page, label: string) {
  return page.getByRole('row').filter({ hasText: label })
}

test('ConfirmDialog names the specific object, traps focus, and cancels without acting', async ({
  page,
}) => {
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

  // Esc dismisses AND does not act — the property the mutation check was run against.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(keyRow(page, label)).toContainText('active')

  // ...and so does the Cancel button, by the same handler.
  await keyRow(page, label).getByRole('button', { name: 'Revoke' }).click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('dialog.confirm-dialog')).toBeHidden()
  await expect(keyRow(page, label)).toContainText('active')

  // Confirming still performs exactly the operation the bare button used to.
  await keyRow(page, label).getByRole('button', { name: 'Revoke' }).click()
  await page.locator('dialog.confirm-dialog').getByRole('button', { name: 'Revoke' }).click()
  await expect(keyRow(page, label)).toContainText('revoked')
})

test('Field announces its error against the control and does not reflow the form', async ({
  page,
}) => {
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
  const submitTop = () =>
    submit.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
  const before = await submitTop()

  const input = page.getByLabel('New key label')
  await expect(input).toHaveAttribute('aria-invalid', 'false')

  await submit.click()

  // The error is associated with the control, not merely near it: aria-describedby must point at
  // the element that now holds the message.
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  const describedBy = await input.getAttribute('aria-describedby')
  expect(describedBy).toBeTruthy()
  const errorId = describedBy!.split(' ').find((id) => id.endsWith('-error'))
  expect(errorId, 'the field must describe itself with an error element').toBeTruthy()
  // An attribute selector rather than `#id`: React's useId emits ids containing characters that
  // are not valid in a bare CSS id selector, and escaping them by hand is a footgun.
  await expect(page.locator(`[id="${errorId}"]`)).toContainText('Give the key a label')

  // ...and nothing moved. The error slot's height is reserved whether or not it has text, so the
  // submit button a cursor is already travelling towards stays where it was.
  expect(await submitTop()).toBeCloseTo(before, 0)
})
