// flags-console-parity · Sprint 3, Story 3.4 — the console's RENDERED surfaces, signed in.
//
// ── What this covers that nothing else could ──────────────────────────────────────────────────
// `flag-console-dark.spec.ts` proves the GATE: 404 dark, login redirect lit. It cannot prove the
// pages render, because the `api` project has no session and every one of these routes is
// credential-gated — it only ever sees the redirect.
//
// So this is the other half, and it was owed: Sprint 3 shipped two new routes and a rewritten list
// with no automated assertion that any of them render at all. The epic's own review found the same
// shape of hole twice (a spec left pointing at a moved surface, and three suites skipped rather than
// ported), which is the argument for writing this before the flip rather than after.
//
// Opt-in, like every `*.authed.spec.ts`: it needs a real session and a real Supabase, so it is
// outside the merge gate by design. Run it deliberately — `npm run test:e2e:authed`.

import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { isFlagConsoleEnabled } from '../lib/flags'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag console smoke requires the auth-setup project')
  return slug
}

test.describe('the flag console, signed in', () => {
  // The whole file asserts the LIT surfaces. Skipping while dark is honest rather than lazy: with
  // the gate off these routes 404 by design, and a spec that "passed" against a 404 would be
  // asserting the opposite of what it claims.
  test.skip(
    () => !isFlagConsoleEnabled(),
    'the console renders behind FLAG_CONSOLE_ENABLED; this pass needs it on'
  )

  test('the feature list renders, and its filters live in the URL', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // The list itself — a real table, not the article stack it replaced.
    await expect(page.getByRole('table').filter({ hasText: 'Features in' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Feature' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'State' })).toBeVisible()

    // Story 1.4: the environment selector, and the sentence that says what the list reports on.
    await expect(page.getByText('What this list reports is what')).toBeVisible()

    // Story 1.3's actual promise — a filtered view is an ADDRESS. Asserted by navigating to one
    // directly rather than by clicking, because "survives a refresh and a paste into another
    // session" is the property, and clicking would prove only that the click worked.
    await page.goto(`/app/flags/${slug}?env=development&sort=state`)
    await expect(page.getByRole('table').filter({ hasText: 'Features in development' })).toBeVisible()
  })

  test('an unknown parameter is dropped rather than echoed back into the page', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}?sort=%3Cimg%3E&evil=%3Cscript%3E`)

    // The allow-list, asserted where it matters: in the rendered HTML, not in a unit test over the
    // parser. An unrecognised sort falls back rather than reaching a link on the page.
    const html = await page.content()
    expect(html).not.toContain('evil=')
    expect(html).not.toContain('<script>alert')
    await expect(page.getByRole('table').filter({ hasText: 'Features in' })).toBeVisible()
  })

  test('the credentials route renders both key kinds for an owner', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flag-credentials/${slug}`)

    await expect(page.getByRole('heading', { name: `Flag credentials — ${slug}` })).toBeVisible()
    // Both tables and both minting forms — the four things Story 3.1 moved.
    await expect(page.getByRole('table').filter({ hasText: 'Snapshot keys' })).toBeVisible()
    await expect(page.getByRole('table').filter({ hasText: 'Catalog sync keys' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mint 30-day snapshot key' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mint 30-day catalog sync key' })).toBeVisible()
  })

  test('the audit route renders, and reads its actions as sentences', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flag-audit/${slug}`)

    await expect(page.getByRole('heading', { name: `Flag audit — ${slug}` })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'What changed' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Feature' })).toBeVisible()

    // D7 on the surface that most tempted the storage vocabulary: the audit stores
    // `definition_created` / `activated` / `deactivated` and must never render them.
    const body = await page.locator('main').innerText()
    for (const stored of ['definition_created', 'activated', 'deactivated']) {
      expect(body, `the audit rendered the stored value "${stored}" instead of a sentence`).not.toContain(
        stored
      )
    }
  })

  test('a feature has its own address, with the three tabs', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // Click through from the list, which is Story 2.1's promise — the row IS the way in.
    const firstFeature = page.getByRole('table').filter({ hasText: 'Features in' }).getByRole('link').first()
    const key = (await firstFeature.innerText()).trim()
    test.skip(key === '', 'this tenant has no flag definitions yet')
    await firstFeature.click()

    await expect(page.getByRole('heading', { name: key })).toBeVisible()
    for (const tab of ['Value', 'History', 'Settings']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible()
    }

    // Each environment named with its state — the epic's outcome test in miniature, and the reason
    // "never turned on here" exists as a distinct state at all.
    for (const environment of ['development', 'preview', 'production']) {
      await expect(page.getByText(environment, { exact: true }).first()).toBeVisible()
    }
  })

  test('the flags page no longer carries the credential forms once the console owns them', async ({
    page,
  }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // The move, asserted from the side that LOST them. Both are gate-conditional, so with the
    // console on they must be absent here and present on their own route — never in both places,
    // and never in neither.
    await expect(page.getByRole('button', { name: 'Mint 30-day snapshot key' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Lifecycle audit' })).toHaveCount(0)

    // ...and the authoring form STAYS, which is the near-miss Story 3.3 caught: it shared a JSX
    // block with the credential forms, so gating them hid it too — leaving no way to create a flag.
    await expect(page.getByRole('button', { name: 'Create immutable version' })).toBeVisible()
  })
})
