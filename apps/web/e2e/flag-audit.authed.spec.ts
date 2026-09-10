import { test, expect } from '@playwright/test'
import { AUDIT_FIXTURE_ROWS, readTenantRecord } from './helpers/authed-fixture'
import { AUDIT_PAGE_SIZE } from '../lib/audit-page'

// mockups-as-built · Sprint 3, Story 3.2 — Activity paginates, and the page is in the URL.
//
// ── Why a browser spec, when the arithmetic is unit-tested ────────────────────────────────────
// `lib/audit-page.test.ts` puts 148 rows through the slicing and asserts the clamping, the empty
// case and the boundaries — everything that is arithmetic. What it cannot see is whether the PAGE
// uses it: a route that reads `?page` and then renders `registry.audit` unsliced passes every unit
// test in the repository. That gap is this file.
//
// ⚠️ **The `?page` half is the point, not a nicety.** `console-ia-overhaul` Story 1.3 set the rule
// for the environment picker — a copy-pasted link opens the same screen — and a pager built on
// client state would have looked identical on screen and failed the only thing anybody does with a
// deep page, which is send it to somebody.

function slug(): string {
  const value = readTenantRecord()?.slug
  if (!value) throw new Error('the Activity pagination spec requires the auth-setup project')
  return value
}

const activity = (page: number | null) =>
  page === null ? `/app/flag-audit/${slug()}` : `/app/flag-audit/${slug()}?page=${page}`

test('the first page holds exactly one page of entries, out of more than one page', async ({ page }) => {
  await page.goto(activity(null))
  const entries = page.locator('main .ds-tl')
  await expect(entries).toHaveCount(AUDIT_PAGE_SIZE)

  // ⚠️ The count assertion above is only meaningful if there is MORE than a page — otherwise it
  // would pass on an unpaginated list that happens to be short. The pager's own sentence is what
  // says so, and it names the real total.
  const pager = page.locator('main .ds-pager')
  await expect(pager).toBeVisible()
  await expect(pager).toContainText(`1–${AUDIT_PAGE_SIZE} of`)
  expect(AUDIT_FIXTURE_ROWS).toBeGreaterThan(AUDIT_PAGE_SIZE * 2)
})

test('the page is in the URL, so a copy-pasted link opens the same page', async ({ page, context }) => {
  await page.goto(activity(null))
  await page.getByRole('link', { name: 'Older →' }).click()
  await expect(page).toHaveURL(/[?&]page=2\b/)
  const secondPageText = await page.locator('main .ds-listcard').innerText()

  // ⚠️ **A SECOND TAB, not a reload.** A reload can be served from client state that a fresh
  // navigation would not have, which is exactly the failure mode this rule exists to catch. Opening
  // the copied URL in a new page of the same context is what a person pasting a link actually does.
  const pasted = await context.newPage()
  await pasted.goto(page.url())
  await expect(pasted.locator('main .ds-pager')).toContainText('page 2 of')
  expect(await pasted.locator('main .ds-listcard').innerText()).toBe(secondPageText)
  await pasted.close()
})

test('page 2 is neither the first page nor the last, and shares no entry with either', async ({ page }) => {
  const reasonsOn = async (which: number | null) => {
    await page.goto(activity(which))
    return page.locator('main .ds-tl-reason').allInnerTexts()
  }
  const first = await reasonsOn(null)
  const second = await reasonsOn(2)
  const last = await reasonsOn(Math.ceil(AUDIT_FIXTURE_ROWS / AUDIT_PAGE_SIZE))

  expect(second).toHaveLength(AUDIT_PAGE_SIZE)
  // Nothing repeated across pages — the property a walk through the list actually has to have, and
  // the one an off-by-one in the slice breaks while every count stays right.
  for (const entry of second) {
    expect(first, `page 2 repeats an entry from page 1: ${entry}`).not.toContain(entry)
    expect(last, `page 2 repeats an entry from the last page: ${entry}`).not.toContain(entry)
  }
})

test('the first and last pages offer only the direction that exists', async ({ page }) => {
  await page.goto(activity(1))
  await expect(page.getByRole('link', { name: '← Newer' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Older →' })).toHaveCount(1)

  await page.goto(activity(Math.ceil(AUDIT_FIXTURE_ROWS / AUDIT_PAGE_SIZE)))
  await expect(page.getByRole('link', { name: '← Newer' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Older →' })).toHaveCount(0)
})

test('a page past the end shows the LAST page, never an empty one', async ({ page }) => {
  // ⚠️ An empty audit page reads as "nothing happened", which is the one thing an audit must never
  // say by accident. Asserted through the URL a person can actually type.
  await page.goto(activity(9_999))
  await expect(page.locator('main .ds-tl')).not.toHaveCount(0)
  await expect(page.locator('main .ds-pager')).toContainText(
    `page ${Math.ceil(AUDIT_FIXTURE_ROWS / AUDIT_PAGE_SIZE)} of ${Math.ceil(AUDIT_FIXTURE_ROWS / AUDIT_PAGE_SIZE)}`
  )
})
