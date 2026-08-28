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
  // `response` itself, not `response?.status()` — a null response (a navigation the browser handled
  // without one) would otherwise assert `undefined === 200` and report a confusing mismatch instead
  // of the real problem (cross-review, agy).
  expect(response, 'no navigation response for the demo dashboard').not.toBeNull()
  expect(response!.status(), 'the demo dashboard must stay anonymously readable').toBe(200)

  // The page itself still works — this is a real dashboard, not a redirect.
  await expect(page.getByRole('heading', { name: /Funnel/i })).toBeVisible()

  // ── The POSITIVE half, and it is the half that survives Story 3.5 ───────────────────────────
  // Every other assertion here is an absence, and absences all stay true if the header renders
  // NOTHING. Story 3.5 deletes the signed-in legacy links, and if it takes the public chrome with
  // them this page would render an empty shell while a spec full of `toHaveCount(0)` stayed green.
  // So: a public visitor must still get public navigation. `Connect` and `Agent notes` both point at
  // genuinely public destinations (`/install`, `/llms.txt`), which is why they are the right two to
  // name here (fresh reviewer, PR #122, fourth pass).
  // Asserted on the DESTINATION, not the label. `getByRole('link', { name: 'Connect' })` passes if
  // the href is changed to a dead path, and what Story 3.5 risks is what a public visitor can still
  // REACH. `.product-shell__nav` alone would be weak too — the console branch's tab nav carries that
  // class as well, so only these two links distinguish public chrome from console chrome.
  await expect(page.getByRole('link', { name: 'Connect', exact: true })).toHaveAttribute('href', '/install')
  await expect(page.getByRole('link', { name: 'Agent notes', exact: true })).toHaveAttribute(
    'href',
    '/llms.txt'
  )
  // Present in every state and asserted nowhere until now, so deleting the logo would have passed.
  await expect(page.locator('.brand-lockup')).toHaveCount(1)
  // ⚠️ And it goes to `/app`. Story 3.5 deletes the `Home` link on the strength of this being its
  // duplicate — "it loses a link, not a route" — so the claim is asserted where it is relied on
  // rather than left in the comment that makes it.
  await expect(page.locator('.brand-lockup')).toHaveAttribute('href', '/app')

  // ── What Story 3.5 removed from THIS page ───────────────────────────────────────────────────
  // `Home` did render anonymously — it sat outside the `activeProject` guard — so its deletion is a
  // real change to what a public visitor sees, and this is the assertion that records it. `Sections`
  // never rendered here (it needs a session), which is why its absence is asserted in the authed
  // suite instead: an absence that was already true proves nothing about a deletion.
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0)

  // None of the signed-in chrome. Each of these needs a session to mean anything: the tabs list
  // surfaces you are entitled to, the identity slot names your project and your account, and the
  // palette indexes the links the shell resolved for you.
  //
  // ⚠️ These are the assertions that only DISCRIMINATE with the gate on — see the header note.
  await expect(page.locator('.product-shell__tabs')).toHaveCount(0)
  await expect(page.locator('.product-shell__identity')).toHaveCount(0)
  await expect(page.locator('.product-shell__account')).toHaveCount(0)
  await expect(page.locator('.console-rail')).toHaveCount(0)

  // ── ⌘K does nothing, and proving that needs a HYDRATED page ─────────────────────────────────
  // `networkidle` plus a fixed wait was the first version, and agy was right that it does not
  // establish hydration: if the keydown listener has not attached, the palette cannot open for a
  // reason that has nothing to do with this page being public, and `toHaveCount(0)` passes
  // trivially. That is the same hydration trap the authed spec hit from the other direction — there
  // a press before hydration made a real palette look absent.
  //
  // ⚠️ There is no client island on this page to wait on — and that is a FINDING, not an obstacle.
  // With no session the shell renders no palette, no rail and no agent rail, and the page's own
  // content is server-rendered, so an interactive marker does not exist to poll for. My first
  // attempt waited for a copy button that this page does not have; the spec failed loudly, which is
  // the right behaviour and worth more than the assertion I was trying to write.
  //
  // So the wait is on Next's own client runtime instead — `window.next` exists only once the
  // framework's JS has executed, which is the closest signal available on a page that deliberately
  // ships no interactivity of its own. After that a keypress is meaningful: any listener that WOULD
  // have been attached has been.
  await page.waitForFunction(() => typeof (window as { next?: unknown }).next !== 'undefined', null, {
    timeout: 15_000,
  })

  // The stronger half, and it does not depend on timing at all: the palette is not in the DOM to
  // begin with. `ProductShell` mounts it inside `{header !== null && …}`, so on a public page there
  // is no component to open — the keypress below is belt-and-braces over a structural absence.
  await expect(page.locator('.command-palette')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+k')
  await page.waitForTimeout(300)
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

test('the manifest the public chrome links to actually serves', async ({ page }) => {
  // ⚠️ A16's correction, asserted end to end. Story 3.5 as originally written removed `/llms.txt`'s
  // "human nav link" — which IS `Agent notes`, and lives only in the branch an anonymous visitor
  // gets. Following that sentence literally would have left the public demo dashboards with a route
  // to the manifest that nobody can click, and the obvious repair when this suite went red would
  // have been deleting the assertion that caught it.
  //
  // So the link's DESTINATION is followed, not just read: `/install` and `/llms.txt` both answer.
  for (const path of ['/install', '/llms.txt']) {
    const response = await page.goto(path)
    expect(response?.status(), `${path} must still serve`).toBe(200)
  }
})
