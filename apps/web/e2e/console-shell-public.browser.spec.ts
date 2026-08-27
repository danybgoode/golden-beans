import { test, expect } from '@playwright/test'

// console-ia-overhaul · Sprint 1. The PUBLIC half of the shell, asserted anonymously.
//
// ── Why this belongs in the anonymous project ─────────────────────────────────────────────────
// `/app/funnel/golden-beans-demo/<key>` and its impact twin render `ProductShell` with NO session —
// they are the public showcase, allow-listed by `lib/public-demo.ts` (AGENTS rule #2). Every other
// spec for this shell needs credentials, so this is the one surface where the shell's behaviour is
// observable without any.
//
// ── The regression it exists to catch ─────────────────────────────────────────────────────────
// A revision of this epic keyed the console chrome on the env var alone. With the gate on, that gave
// this public page a logo, an EMPTY sections nav, an empty identity slot and a ⌘K palette listing
// nothing — console chrome for a viewer with no session to have surfaces for. Found by the fresh
// reviewer's third pass on PR #122, as a regression this epic introduced rather than inherited.
//
// The console is "an information architecture for the SIGNED-IN console". An anonymous visitor is
// not a degraded signed-in user, so `consoleEnabled` requires a session as well as the gate — and
// this spec is what makes that true in fact rather than in a comment. It asserts the same thing in
// EITHER gate state, which is what lets it survive Story 3.5's flip unchanged.

const DEMO = '/app/funnel/golden-beans-demo/setup_guide'

test('the public demo dashboard renders public chrome, never the signed-in console', async ({ page }) => {
  const response = await page.goto(DEMO)
  expect(response?.status(), 'the demo dashboard must stay anonymously readable').toBe(200)

  // The page itself still works — this is a real dashboard, not a redirect.
  await expect(page.getByRole('heading', { name: /Funnel/i })).toBeVisible()

  // None of the signed-in chrome. Each of these needs a session to mean anything: the tabs list
  // surfaces you are entitled to, the identity slot names your project and your account, and the
  // palette indexes the links the shell resolved for you.
  await expect(page.locator('.product-shell__tabs')).toHaveCount(0)
  await expect(page.locator('.product-shell__identity')).toHaveCount(0)
  await expect(page.locator('.product-shell__account')).toHaveCount(0)
  await expect(page.locator('.console-rail')).toHaveCount(0)

  // And ⌘K does nothing, because there is no palette mounted at all. Asserted after the network
  // settles so this cannot pass merely because the island had not hydrated yet.
  await page.waitForLoadState('networkidle')
  await page.keyboard.press('ControlOrMeta+k')
  await page.waitForTimeout(500)
  await expect(page.locator('.command-palette')).toHaveCount(0)
})
