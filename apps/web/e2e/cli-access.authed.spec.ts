import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// golden-frijoles-cli · Setup › CLI access — mint a token THROUGH THE PAGE, then USE it.
//
// ── Why this spec exists, and what it replaces ────────────────────────────────────────────────
// The route's manifest row claims no design-system coverage (it has no approved reference state
// yet), so the visual gate never OPENS it — it only checks the route is reachable. That left the
// one surface a person must use before the CLI works at all rendered by no test. CI found the gap
// from the other side: the reachability check failed on #149 because the route had no entry.
//
// It also replaces a smoke that would otherwise be owed to the product owner: "mint a token in the
// console and sign in with it" is proved here end to end — the page mints, the plaintext appears
// once, the API accepts it, revoking it in the page makes the API refuse it.

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the CLI access smoke requires the auth-setup project')
  return slug
}

test('a member mints a CLI token in the console, the API accepts it, and revoking it kills it', async ({
  page,
  request,
}) => {
  const slug = tenantSlug()
  const label = `spec-${Date.now()}`

  await page.goto(`/app/setup/cli/${slug}`)
  await expect(page.getByRole('heading', { name: 'CLI access' })).toBeVisible()
  // The page body is built from the design system even though its row claims no coverage — the
  // claim is withheld because there is no approved picture, not because the page is off-system.
  expect(await page.locator('main [class*="ds-"]').count()).toBeGreaterThan(0)

  // ── Mint ──────────────────────────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: '+ New CLI token' }).click()
  // Scoped to the OPEN dialog: the app shell carries an account "Name" field of its own, and an
  // unscoped label lookup is ambiguous in a way a person looking at the screen never is.
  const wizard = page.locator('dialog[open]')
  await wizard.getByLabel('Name').fill(label)
  await wizard.getByRole('button', { name: 'Mint token' }).click()

  const reveal = page.getByRole('alert').filter({ hasText: 'Your CLI token' })
  await expect(reveal).toBeVisible()
  // The COPY ROW's code — the reveal's prose also has `<code>` tags naming `gf login` and the env var.
  const token = (await reveal.locator('.ds-copyrow code').textContent())?.trim() ?? ''
  expect(token).toMatch(/^gf_pat_/)
  // While the value is on screen, the mint control is gone — a second live credential is the most
  // expensive mistake this page can make.
  await expect(page.getByRole('button', { name: '+ New CLI token' })).toHaveCount(0)

  // ── Use it, against the real API ────────────────────────────────────────────────────────────
  const whoami = await request.get('/api/v1/cli/whoami', { headers: { authorization: `Bearer ${token}` } })
  expect(whoami.status()).toBe(200)
  const body = await whoami.json()
  expect(body.credential.label).toBe(label)
  expect(body.projects.map((project: { slug: string }) => project.slug)).toContain(slug)

  // ── The list, then revoke through the page ──────────────────────────────────────────────────
  await reveal.getByRole('button', { name: 'I have saved it' }).click()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: `Revoke ${label}` }).click()
  const confirm = page.locator('dialog.confirm-dialog')
  await expect(confirm).toContainText(label)
  await confirm.getByRole('button', { name: 'Revoke' }).click()
  // Wait for the PAGE to say it is revoked, not for the network to go quiet. `networkidle` settles
  // before a React transition's server action has necessarily returned, so asking the API straight
  // after it races the revoke itself — and a race that sometimes passes is worse than none.
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()

  // ...and the API refuses it immediately — the liveness predicate is in the database view.
  const after = await request.get('/api/v1/cli/whoami', { headers: { authorization: `Bearer ${token}` } })
  expect(after.status()).toBe(401)
})
