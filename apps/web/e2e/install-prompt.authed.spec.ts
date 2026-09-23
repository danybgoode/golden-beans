import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { INSTALL_PROMPT } from '@/lib/install-prompt'

// golden-frijoles-plugin · Sprint 3, Story 3.3 — the third of the three install-prompt surfaces:
// the signed-in onboarding page (`/app/onboarding/[projectSlug]`). It needs a real session, so it
// runs in the `authed` browser project (same fixture `mobile-heuristics.authed.spec.ts` and
// `console-visual.authed.spec.ts` already use), not the plain `api` project — see
// `install-prompt.spec.ts` for the two unauthed surfaces.

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the install-prompt authed spec requires the auth-setup project')
  return slug
}

test('the signed-in onboarding page serves INSTALL_PROMPT verbatim', async ({ page }) => {
  const path = `/app/onboarding/${tenantSlug()}`
  const response = await page.goto(path)

  // Same "a 200 is not proof of an authed route" discipline as the mobile sweep: a login-page 200
  // would otherwise pass this trivially by containing nothing of interest.
  expect(response?.status(), `${path} did not render`).toBe(200)
  await expect(page, `${path} redirected to login instead of rendering itself`).not.toHaveURL(/\/login/)

  const card = page.locator('.prompt-card')
  await expect(card, `${path} does not render a CopyPromptCard`).toBeVisible()
  const visible = await card.locator('.prompt-copy').innerText()
  expect(visible.trim(), `${path}'s prompt card does not carry the install prompt verbatim`).toBe(
    INSTALL_PROMPT
  )
})
