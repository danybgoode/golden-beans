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
// not a degraded signed-in user, so the shell resolves no console header without a session — and
// this spec is what makes that true in fact rather than in a comment.
//
// ⚠️ **ONLY THE GATE-ON RUN CAN CATCH THE REGRESSION, and that is not the default run.**
// `playwright.config.ts` sets no `CONSOLE_SHELL_ENABLED` and the gate is born unset, so a plain
// `npm run test:e2e:browser` exercises this gate-OFF — where no console chrome renders anyway and
// every absence assertion below passes against the PRE-FIX code too. The `Expected: 0, Received: 1`
// that proved this spec has teeth came from a `CONSOLE_SHELL_ENABLED=true` run.
//
// Saying so matters more than it looks: an earlier version of this comment called running in either
// state a STRENGTH, which reads as coverage and is the opposite. `GATE_ON` below marks which
// assertions are load-bearing, the same way `console-shell.authed.spec.ts` does for itself.
// After Story 3.5 flips the gate in production, the discriminating run becomes the default one.

const DEMO = '/app/funnel/golden-beans-demo/setup_guide'
const GATE_ON = process.env.CONSOLE_SHELL_ENABLED === 'true'

test('the public demo dashboard renders public chrome, never the signed-in console', async ({ page }) => {
  const response = await page.goto(DEMO)
  expect(response?.status(), 'the demo dashboard must stay anonymously readable').toBe(200)

  // The page itself still works — this is a real dashboard, not a redirect.
  await expect(page.getByRole('heading', { name: /Funnel/i })).toBeVisible()

  // ── The POSITIVE half, and it is the half that survives Story 3.5 ───────────────────────────
  // Every other assertion here is an absence, and absences all stay true if the header renders
  // NOTHING. Story 3.5 deletes the signed-in legacy links, and if it takes the public chrome with
  // them this page would render an empty shell while a spec full of `toHaveCount(0)` stayed green.
  // So: a public visitor must still get public navigation. `Connect` and `Agent notes` both point at
  // genuinely public destinations (`/install`, `/llms.txt`), which is why they are the right two to
  // name here (fresh reviewer, PR #122, fourth pass).
  await expect(page.locator('.product-shell__nav')).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Connect', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Agent notes', exact: true })).toHaveCount(1)

  // None of the signed-in chrome. Each of these needs a session to mean anything: the tabs list
  // surfaces you are entitled to, the identity slot names your project and your account, and the
  // palette indexes the links the shell resolved for you.
  //
  // ⚠️ These are the assertions that only DISCRIMINATE with the gate on — see the header note.
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

  // Named in the run output, so a green result cannot be mistaken for the discriminating one.
  if (!GATE_ON) {
    test.info().annotations.push({
      type: 'note',
      description:
        'CONSOLE_SHELL_ENABLED is unset for this run: the absence assertions above hold trivially. ' +
        'Re-run with CONSOLE_SHELL_ENABLED=true to exercise the regression this spec guards.',
    })
  }
})
