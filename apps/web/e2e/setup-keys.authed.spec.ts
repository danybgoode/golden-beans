// design-system-rails · Sprint 4, Story 4.5 — the merged Keys page, driven for real.
//
// ── Why `.authed.spec.ts` when the sprint doc says `setup-keys.spec.ts` ──────────────────────
// A plain `*.spec.ts` lands in the `api` Playwright project, which has no session. Every route here
// is owner-gated, so an `api` spec would only ever see the redirect to `/login` and would assert the
// gate rather than the page. The `.authed` suffix is what puts it on the rail that signs in through
// the real form. Named as a deviation rather than left for a reviewer to spot the file is not where
// the doc says.
//
// ── What the sprint's QA note asks for, and what each of those is worth ──────────────────────
//   · **a member gets 404** — asserted in `lib/setup-route-guards.test.ts`, NOT here, and that is
//     deliberate. Proving it in a browser needs a SECOND identity, a real member of the same
//     project, and three attempts at driving a second context through the login form hung. A source
//     guard also proves the shape for every route at once and cannot be satisfied accidentally,
//     where a browser test can pass for the wrong reason (a missing route, an expired session, a
//     slug that never existed) — and this repo has shipped exactly that false green before.
//   · **each kind mints and revokes** — here, all four, through the real forms and the real actions.
//   · **the value renders once** — here, and asserted as an ABSENCE afterwards, which is the half
//     that makes the claim mean anything.

import { test, expect, type Page } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { AGENT_KEY_EXPIRY_DAYS, CREDENTIAL_MINT_ORDER, credentialTitle } from '../lib/credential-inventory'

const VIEWPORT = { width: 1440, height: 960 }

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the Setup › Keys smoke requires the auth-setup project')
  return slug
}

/**
 * Mint one credential of `kind` through the real flow, and return its plaintext.
 *
 * Every step is a control a person clicks, because the point of the story is that this page can do
 * the job — a helper that called the server action directly would prove the action works and nothing
 * about the page.
 */
async function mint(page: Page, slug: string, kind: (typeof CREDENTIAL_MINT_ORDER)[number], label: string) {
  await page.goto(`/app/setup/keys/${slug}`)
  await page.getByRole('button', { name: '+ New key' }).click()
  // ⚠️ NOT `exact: true`. The pick button's accessible name is its title AND the sentence under it —
  // "API key Send events into this project, and read its funnels through the SDK." — because the
  // whole card is the control and a screen-reader user picking a JOB needs the job described, not
  // just named. An anchored regex matches the title without hiding the rest.
  await page.getByRole('button', { name: new RegExp(`^${credentialTitle(kind)}\\b`) }).click()

  // The ONE extra question this kind asks — the difference that made merging the four forms the
  // work rather than a formatting exercise.
  if (kind === 'flag_read') await page.getByLabel('Which environment').selectOption('production')
  if (kind === 'flag_sync') await page.getByLabel('Which publisher').fill('frontend')
  if (kind === 'agent_write') {
    await page.getByLabel('When it expires').selectOption(String(AGENT_KEY_EXPIRY_DAYS[1]))
  }

  await page.getByLabel('What to call it').fill(label)
  await page.getByRole('button', { name: new RegExp(`Create the ${credentialTitle(kind)}`, 'i') }).click()

  const reveal = page.getByRole('alert').filter({ hasText: 'Copy this key now' })
  await expect(reveal, `${kind} did not reveal a value`).toBeVisible()
  const plaintext = (await reveal.locator('code').innerText()).trim()
  await reveal.getByRole('button', { name: "I've saved it" }).click()
  await page.waitForLoadState('networkidle')
  return plaintext
}

test.describe('Setup › Keys owns the credential lifecycle', () => {
  test('each of the four kinds mints and revokes, on this page', async ({ page }) => {
    // ⚠️ **The whole story, and it is deliberately not four separate tests.** `fullyParallel: true`
    // runs a file's tests across workers, so four tests would mint four credentials into one tenant
    // concurrently and then race each other's revokes — and a failure would read as a flake rather
    // than as a defect. One test, one sequence, four kinds.
    //
    // Driven from `CREDENTIAL_MINT_ORDER` rather than a list retyped here: a fifth kind added to the
    // closed union appears in this test the moment it exists, instead of being covered by whoever
    // remembers to extend a literal.
    const slug = tenantSlug()
    await page.setViewportSize(VIEWPORT)
    const stamp = Date.now()

    for (const kind of CREDENTIAL_MINT_ORDER) {
      const label = `s4-smoke-${kind}-${stamp}`
      const plaintext = await mint(page, slug, kind, label)

      // A real credential, not an empty string beside a Copy button.
      expect(plaintext, `${kind} revealed an empty value`).not.toBe('')
      expect(plaintext.length, `${kind} revealed a suspiciously short value`).toBeGreaterThan(20)

      // ── It is in the ONE list, and it says what it may do ───────────────────────────────────
      const row = page.getByRole('row').filter({ hasText: label })
      await expect(row, `${kind} minted but is not listed`).toBeVisible()
      await expect(row, `${kind}'s row does not name its kind`).toContainText(credentialTitle(kind))

      // ── The value is NOT recoverable from the table ─────────────────────────────────────────
      // ⚠️ Sprint contract #7, asserted as the absence it actually is. "Shown once" is a claim about
      // what happens AFTER, and a test that only checked the reveal would pass just as happily on a
      // page that also printed the key in every row.
      await expect(
        page.locator('main'),
        `${kind}'s plaintext is readable off the page after the reveal`
      ).not.toContainText(plaintext)
      await page.reload()
      await expect(
        page.locator('main'),
        `${kind}'s plaintext came back on reload — it is being stored and re-served`
      ).not.toContainText(plaintext)

      // ── Revoke, on this page, with a confirmation that names what stops ─────────────────────
      await page
        .getByRole('row')
        .filter({ hasText: label })
        .getByRole('button', { name: `Revoke ${label}` })
        .click()
      const confirm = page.locator('dialog.confirm-dialog')
      await expect(confirm).toContainText(`Revoke ${credentialTitle(kind).toLowerCase()} ${label}?`)
      // Never "Are you sure?" — the consequence sentence is the reason the dialog exists.
      await expect(confirm).not.toContainText('Are you sure')
      await confirm.getByRole('button', { name: 'Revoke' }).click()
      await page.waitForLoadState('networkidle')

      // GONE, not "revoked". The page lists what has access NOW, which is a stronger statement than
      // a status cell: a row that stayed with the wrong word in it would pass a text check.
      await expect(
        page.getByRole('row').filter({ hasText: label }),
        `${kind} was revoked and is still listed`
      ).toHaveCount(0)
    }
  })

  test('the page names what it does NOT list, including the one it cannot show', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/setup/keys/${slug}`)
    const body = page.locator('main')

    // The page's promise is "everything that gives something else access", and connector URLs and
    // share links ARE access — bearer tokens rendering this project's data to whoever holds them.
    // Claiming completeness while omitting live bearer tokens would be worse than scoping the claim.
    await expect(body).toContainText('Not listed here')
    await expect(body.getByRole('link', { name: 'Share links' })).toBeVisible()
    await expect(body.getByRole('link', { name: 'Connector URLs' })).toBeVisible()

    // ⚠️ **D11-3, asserted.** The `flag_admin` entry claimed this kind had "no minting surface and
    // no live rows". Production holds one unrevoked, non-expiring `flag_admin` key on the `miyagi`
    // project — re-queried 2026-08-31 — so the second half was false on the one page whose entire
    // job is an accurate access inventory. The corrected copy says what is true of the KIND: there
    // is no surface here, so this page cannot show you which exist.
    await expect(body).toContainText('Flag admin keys')
    await expect(body, 'the corrected flag_admin claim regressed to "no live rows"').not.toContainText(
      'no live rows'
    )
    // ...and it is NOT a link, because there is nowhere to link to. A link to a page that does not
    // exist is the "a control that goes nowhere" defect this epic exists to remove.
    await expect(body.getByRole('link', { name: 'Flag admin keys' })).toHaveCount(0)
  })

  test('the three retired routes land here, and hold no controls of their own', async ({ page }) => {
    const slug = tenantSlug()
    for (const retired of ['keys', 'agent-keys', 'flag-credentials']) {
      const response = await page.goto(`/app/${retired}/${slug}`)
      expect(response?.status(), `/app/${retired} did not resolve`).toBe(200)
      // Followed the redirect and arrived HERE. Asserted on the URL rather than on the content,
      // because content could match while the address bar still said something else.
      expect(page.url(), `/app/${retired} did not land on Setup › Keys`).toContain(`/app/setup/keys/${slug}`)
      // And there is exactly ONE mint control on the page it landed on — never two surfaces offering
      // to issue a credential, which is the state Story 4.5 exists to end.
      await expect(page.getByRole('button', { name: '+ New key' })).toHaveCount(1)
    }
  })
})
