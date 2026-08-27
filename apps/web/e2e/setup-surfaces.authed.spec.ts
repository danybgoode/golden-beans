import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// console-ia-overhaul · Sprint 2. The two Setup surfaces, signed in.
//
// The `api` project can only see the dark 404 (`setup-routes-dark.spec.ts`). Everything the pages
// actually say — the honest connector status, the capability column, the member/owner boundary —
// needs a session, so it lives here.
//
// ⚠️ NOT in the blocking gate. Run with `npm run test:e2e:authed` and
// `CONSOLE_SHELL_ENABLED=true`; the PR body states the run and its result rather than implying CI
// covered it. LEARNINGS: a suite outside the gate decays silently.

const GATE_ON = process.env.CONSOLE_SHELL_ENABLED === 'true'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the Setup surfaces smoke requires the auth-setup project')
  return slug
}

test.describe('Setup surfaces with the console on', () => {
  test.skip(!GATE_ON, 'run with CONSOLE_SHELL_ENABLED=true to exercise these routes')

  test('Connect shows the honest status, and never claims Claude has used it', async ({ page }) => {
    const response = await page.goto(`/app/setup/connect/${tenantSlug()}`)
    expect(response?.status()).toBe(200)

    // The fixture tenant is freshly provisioned and has no connector token, which is also the state
    // `miyagisanchez` is in on production (A10) — so this is the real common case, not an edge.
    await expect(page.getByRole('heading', { name: /Connect your agent/ })).toBeVisible()

    // ── The assertion A10 exists for, and my first version of it was WRONG ──────────────────
    // The page must never CLAIM a last-used time, because nothing in this product records connector
    // reads. My first attempt asserted the page contains no "last used" at all — and it failed on
    // the page's own disclaimer, which says a page claiming "last used" would be guessing. A blunt
    // substring ban cannot tell an honest denial from the claim it denies.
    //
    // So: no last-used CLAIM (the phrase followed by a date or a time), and the disclaimer must be
    // present. The second half matters as much as the first — a page that simply omitted the subject
    // would pass a negative assertion while leaving the reader to assume the URL's existence means
    // it has been used.
    await expect(page.locator('main')).not.toContainText(/last used[^.]*\d/i)
    await expect(page.locator('main')).toContainText(/not that Claude has ever used it/i)
  })

  test('Connect never renders an empty field that looks like a URL', async ({ page }) => {
    await page.goto(`/app/setup/connect/${tenantSlug()}`)
    // With no token there must be NO copy field at all — not one containing an empty string. An
    // empty readonly input beside a Copy button reads as "your URL is blank", which is worse than
    // saying there isn't one.
    const copyField = page.locator('.copy-url input')
    const fieldCount = await copyField.count()
    if (fieldCount > 0) {
      // If a field rendered, the tenant has a token and it must be a real one.
      await expect(copyField.first()).toHaveValue(/^https?:\/\/.+\/api\/v1\/public\/mcp\/c\/gb_connector_/)
    } else {
      // The honest empty state says so in words.
      await expect(page.locator('main')).toContainText(/No connector URL yet|connector is switched off/)
    }
  })

  test('Connect carries no marketing chrome — the reader is already signed in', async ({ page }) => {
    await page.goto(`/app/setup/connect/${tenantSlug()}`)
    // The landing's nav and footer are what `/install` has and this page must not: it is inside the
    // product. Asserted structurally rather than by copy, so a wording change cannot silently pass.
    await expect(page.locator('nav.gb')).toHaveCount(0)
    await expect(page.locator('footer')).toHaveCount(0)
  })

  test('Keys lists every kind in ONE list, with what each may do in plain words', async ({ page }) => {
    const response = await page.goto(`/app/setup/keys/${tenantSlug()}`)
    expect(response?.status()).toBe(200)

    // The fixture provisions one ingest key at signup, so there is at least one row to read.
    await expect(page.getByRole('columnheader', { name: 'What it may do' })).toBeVisible()
    await expect(page.locator('main')).toContainText('Send events into this project')

    // The story's point: an operator must not need to know which subsystem minted a key. A scope
    // identifier leaking into the rendered page would defeat that.
    for (const identifier of ['flag_read', 'flag_sync', 'agent_write', 'ingest']) {
      await expect(page.locator('table')).not.toContainText(identifier)
    }
  })

  test('Keys says what it does NOT list, rather than implying it is complete', async ({ page }) => {
    await page.goto(`/app/setup/keys/${tenantSlug()}`)
    // Share links are access — a bearer token rendering this project's report to whoever holds the
    // URL — and they are managed elsewhere. The page names the omission and points at it.
    // Scoped to `main`: the rail also carries a `Share links` entry, so an unscoped locator matches
    // two elements and fails on strict mode. The rail's copy is not this page's claim.
    const body = page.locator('main')
    await expect(body).toContainText('Not listed here')
    await expect(body.getByRole('link', { name: 'Share links' })).toBeVisible()
  })

  test('an expiry column never renders an empty cell', async ({ page }) => {
    await page.goto(`/app/setup/keys/${tenantSlug()}`)
    // Three of the five live scopes carry no expiry, so blank cells would be the common case — and
    // a blank cell reads as missing data rather than as "never expires".
    const expiryCells = page.locator('table tbody tr td:nth-child(6)')
    const count = await expiryCells.count()
    expect(count, 'no credential rows to check').toBeGreaterThan(0)
    for (let index = 0; index < count; index += 1) {
      const text = (await expiryCells.nth(index).innerText()).trim()
      expect(text, `row ${index} has an empty expiry cell`).not.toBe('')
    }
  })
})

// ── The owner-only boundary is asserted in `lib/setup-route-guards.test.ts`, NOT here ─────────
//
// It needs a SECOND identity — a real member of the same project — and three attempts at driving a
// second browser context through the login form hung on `page.goto('/login')` every time (the first
// context, from `storageState`, works fine; a hand-made one does not, even with `baseURL` passed
// explicitly). That is this repo's escalate-don't-hammer threshold.
//
// The property is asserted at the SOURCE instead, which is stronger than the browser test I was
// trying to write: a browser test proves one route 404s for one member on one run, while the source
// guard proves every owner-only Setup route calls `requireProjectOwnership` before it reads
// anything — and it cannot pass for the wrong reason (a 404 from a missing route, a stale session, a
// slug that never existed). Same shape as this repo's `getSiteUrl` caller registry.
//
// What remains uncovered, stated rather than implied: that the guard actually 404s a live member
// session end-to-end. `requireProjectOwnership` is shared with three routes that have shipped that
// behaviour since multi-tenant-activation, so this is a re-use of a hardened seam rather than a new
// boundary — but the end-to-end proof is Daniel's walkthrough step, and it is flagged as owed.
