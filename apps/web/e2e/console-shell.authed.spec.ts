import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'

// console-ia-overhaul · Sprint 1. The signed-in shell, in a real browser.
//
// ── Why these assertions are HERE and not in the blocking `api` gate ──────────────────────────
// Every surface this sprint touches is credential-gated, so the `api` project only ever observes
// `/app` redirecting to `/login` — identical with `CONSOLE_SHELL_ENABLED` on or off.
// `flags-console-parity` Sprint 1 corrected exactly this mistake: a spec asserting "the header
// renders as it does today" from the api project is a guard that cannot fail.
//
// So the arithmetic is unit-tested in `lib/console-shell.ts` + `lib/console-palette.ts`, and what
// is left over — that the markup actually renders, that ⌘K actually navigates, and that the error
// boundary actually catches — is here. The boundary in particular has NO unit coverage and can have
// none: `node --test` cannot load `.tsx` and this repo has no component-test rail (probed, not
// assumed), so a browser is the only place its behaviour is observable at all.
//
// ── This project is NOT in the blocking gate, so it must be run ON PURPOSE ────────────────────
// `npm run test:e2e:authed`. LEARNINGS records that a suite outside the gate decays silently — a
// deletion-heavy epic invalidated five specs nobody ran for three review rounds. Sprint 1's PR body
// states the run and its result rather than implying CI covered it.

const GATE_ON = process.env.CONSOLE_SHELL_ENABLED === 'true'

// ⚠️ ⌘K is bound by a `useEffect`, so it does NOTHING until the island hydrates — and a keypress,
// unlike an assertion, is not retried by Playwright. Pressing once right after `goto` is a race:
// it passed three runs in a row and then a screenshot taken the same way caught the page with no
// palette on it, which is how this was found. Polling the press makes the spec test the palette
// rather than the hydration speed of the machine it runs on.
//
// Not a defect in the product: a person cannot out-type hydration on a page they just opened. It is
// a defect in a spec that would otherwise fail on a slow CI box and be dismissed as flake.
async function openPalette(page: import('@playwright/test').Page) {
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+k')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
}

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the console shell smoke requires the auth-setup project')
  return slug
}

// ── The gate-OFF half. Runs whenever the flag is not exactly 'true'. ──────────────────────────
//
// This is the half that protects D4, and it is the one a spec CAN make honestly: the legacy header
// is byte-identical markup, so its four links either render or they do not.
test.describe('with CONSOLE_SHELL_ENABLED off', () => {
  test.skip(GATE_ON, 'the gate is on for this run')

  test('the legacy header is intact — Home, Sections, Connect and Agent notes all render', async ({
    page,
  }) => {
    await page.goto('/app')
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Connect', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agent notes', exact: true })).toBeVisible()
    await expect(page.locator('.product-shell__sections summary')).toBeVisible()
  })

  test('none of the new console chrome exists while the gate is off', async ({ page }) => {
    await page.goto('/app')
    // The three things Sprint 1 adds. All absent, or the dark launch is not dark.
    await expect(page.locator('.product-shell__tabs')).toHaveCount(0)
    await expect(page.locator('.console-rail')).toHaveCount(0)
    await expect(page.locator('.product-shell__account')).toHaveCount(0)
  })

  test('⌘K does nothing at all while the gate is off', async ({ page }) => {
    await page.goto('/app')
    // Deliberately NOT polled, and deliberately given time to hydrate first: this asserts an
    // ABSENCE, so the danger is passing because the island had not loaded yet rather than because
    // it is not there. Waiting for the network to settle removes that reading.
    await page.waitForLoadState('networkidle')
    await page.keyboard.press('ControlOrMeta+k')
    await page.waitForTimeout(500)
    await expect(page.locator('.command-palette')).toHaveCount(0)
  })

  test('/app still carries its own sign-out while the header has no account menu', async ({ page }) => {
    // The MOVE, checked from the side that must not lose the control. Sign-out exists exactly once
    // in either gate state — never twice, and never zero.
    await page.goto('/app')
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(1)
  })
})

// ── The gate-ON half. ──────────────────────────────────────────────────────────────────────────
test.describe('with CONSOLE_SHELL_ENABLED on', () => {
  test.skip(!GATE_ON, 'run with CONSOLE_SHELL_ENABLED=true to exercise the new shell')

  test('the header shows the four destinations and none of the legacy links', async ({ page }) => {
    await page.goto('/app')

    const tabs = page.locator('.product-shell__tabs a')
    // The tenant the fixture provisions is an OWNER of a fresh project, so on a local run with every
    // gate open it entitles all four. Asserted by NAME rather than by count: a count passes when the
    // wrong four render.
    await expect(tabs.filter({ hasText: 'Today' })).toHaveCount(1)
    await expect(tabs.filter({ hasText: 'Setup' })).toHaveCount(1)

    // Absent, not merely unstyled. Story 1.3's acceptance names all four.
    //
    // ⚠️ `Sections` is deliberately NOT in this loop. It is a <summary> inside <details>, never an
    // <a>, so `getByRole('link', { name: 'Sections' })` is 0 in BOTH gate states — a guard that
    // passes even if the legacy disclosure were rendered in the console branch too. Caught by the
    // fresh reviewer on PR #122, who named the exact undetected mutation. It gets the locator the
    // gate-off half of this file already uses.
    for (const gone of ['Home', 'Connect', 'Agent notes']) {
      await expect(page.getByRole('link', { name: gone, exact: true })).toHaveCount(0)
    }
    await expect(page.locator('.product-shell__sections')).toHaveCount(0)
  })

  test('exactly one tab is marked current, and it is the one for the page you are on', async ({ page }) => {
    await page.goto('/app')
    // /app declares `section="home"`, which marks the Today tab (A11 — they are one destination).
    const current = page.locator('.product-shell__tabs a[aria-current="page"]')
    await expect(current).toHaveCount(1)
    await expect(current).toHaveText('Today')

    await page.goto(`/app/keys/${tenantSlug()}`)
    const onSetup = page.locator('.product-shell__tabs a[aria-current="page"]')
    await expect(onSetup).toHaveCount(1)
    await expect(onSetup).toHaveText('Setup')
  })

  test('Today renders full width with no rail; Setup renders one', async ({ page }) => {
    await page.goto('/app')
    await expect(page.locator('.console-rail')).toHaveCount(0)

    await page.goto(`/app/keys/${tenantSlug()}`)
    const rail = page.locator('.console-rail')
    await expect(rail).toHaveCount(1)
    // The rail names what is inside the section, which is the half of the audit's complaint the
    // header does not answer.
    await expect(rail.getByRole('link', { name: 'API keys' })).toBeVisible()
  })

  test('⌘K opens, filters, and ↵ navigates — no URL typed anywhere', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto('/app')

    await openPalette(page)
    const palette = page.locator('.command-palette')

    await page.keyboard.type('dest')
    const options = palette.locator('[role="option"]')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toContainText('Destinations')
    // The row states its section, which is what makes the list readable at 13 entries.
    await expect(options.first()).toContainText('Setup')

    await page.keyboard.press('Enter')
    await page.waitForURL(`**/app/destinations/${slug}`)
    expect(new URL(page.url()).pathname).toBe(`/app/destinations/${slug}`)
  })

  test('the palette hugs its contents rather than filling the viewport', async ({ page }) => {
    // A geometry assertion, because this is what the other palette specs cannot see: "visible" and
    // "one option matched" are both true of a panel ten times taller than its rows. The first build
    // of this shipped `align-items: stretch` (the flex default), so five short rows sat at the top
    // of a 600px slab of empty card — caught by opening a screenshot, not by the suite.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/app')
    await openPalette(page)
    await page.keyboard.type('se')
    const options = page.locator('.command-palette [role="option"]')
    await expect(options.first()).toBeVisible()

    const panel = await page.locator('.command-palette__panel').boundingBox()
    const last = await options.last().boundingBox()
    const input = await page.locator('.command-palette__input').boundingBox()
    if (!panel || !last || !input) throw new Error('the palette did not render a measurable box')

    // The panel may not extend more than a comfortable padding past its last row. Compared against
    // the CONTENT, never against a fixed pixel height — a magic number would encode this viewport.
    const slackBelowLastRow = panel.y + panel.height - (last.y + last.height)
    expect(slackBelowLastRow).toBeLessThan(48)
    // ...and it must still be tall enough to hold what it has, or the fix would have overshot into
    // clipping the list. Both directions, so neither can be satisfied by collapsing the panel.
    expect(panel.height).toBeGreaterThan(input.height + last.height)
  })

  test('⌘K says so when nothing matches, rather than showing an empty list', async ({ page }) => {
    await page.goto('/app')
    await openPalette(page)
    await page.keyboard.type('zzzz-no-such-surface')
    await expect(page.locator('.command-palette [role="option"]')).toHaveCount(0)
    await expect(page.locator('.command-palette__empty')).toBeVisible()
  })

  test('↓ on an empty result set does not break the page — the keystroke that would throw', async ({
    page,
  }) => {
    // `movePaletteCursor` is total over an empty list, and this is that unit assertion's real-world
    // counterpart: NaN reaching a `[]` lookup inside the shell would take down every signed-in
    // route, so it is worth one keystroke to watch it not happen.
    await page.goto('/app')
    await openPalette(page)
    await page.keyboard.type('zzzz-no-such-surface')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.command-palette')).toBeVisible()
    await expect(page.locator('.product-shell__tabs')).toBeVisible()
  })

  test('Esc closes the palette and leaves the page behind it', async ({ page }) => {
    await page.goto('/app')
    await openPalette(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('.command-palette')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Command center' })).toBeVisible()
  })

  test('the account menu holds the sign-out, and /app no longer renders a second one', async ({ page }) => {
    await page.goto('/app')
    const account = page.locator('.product-shell__account')
    await expect(account).toHaveCount(1)

    // ⚠️ The disclosure is CLOSED on load, so the button inside it is hidden to the accessibility
    // tree until it is opened. That is correct for a menu and it is also why this test opens it
    // explicitly: the first version of this spec asserted the count on a freshly-loaded page and
    // found ZERO, which reads exactly like "sign-out was deleted". Distinguishing "behind one
    // click" from "gone" is the whole job here, because /app stops rendering its own copy the
    // moment this gate opens.
    await account.getByRole('group').or(account.locator('summary')).first().click()
    await expect(account.getByRole('button', { name: 'Sign out' })).toBeVisible()

    // Exactly one in the whole page, in either gate state. The gate-off half above asserts the same
    // number from the other side — together they make this a MOVE rather than a deletion plus an
    // addition, which is the property that matters and the one a single-sided test would miss.
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(1)
    // The address is there too, so the menu answers "who am I signed in as" as well as "get me out".
    await expect(account.locator('p')).toContainText('@')
  })
})

// ── The zero-project session — OWED, and here is exactly what is and is not covered ───────────
//
// The fresh reviewer's S2 asked for an end-to-end guard on the state the original Blocking defect
// lived in: gate ON, a signed-in user with no project, exactly one sign-out control. It is not in
// this file, and that is a stated gap rather than an oversight.
//
// **What WAS verified, by hand, on 2026-08-27.** A version of this spec that removed the shared
// fixture's `project_members` row caught the defect: with `shell-nav.ts`'s zero-project branch
// reverted to its original `return EMPTY`, it failed with `Expected: 1, Received: 0` — the bug,
// observed. Restored, it passed. So the guard works; what follows is why it could not ship.
//
// **Why the shared-fixture form cannot ship.** Playwright runs spec FILES in parallel. For the few
// hundred milliseconds that row was missing, every other authed spec was pointed at a tenant with no
// member — and `flag-rule-builder.authed.spec.ts` went red in the full run while passing alone. That
// is the classic shared-fixture pollution tell, and a guard that breaks other tests is worse than no
// guard.
//
// **Why the isolated form is not here yet.** Creating a second auth user and driving the real login
// form in a hand-made `browser.newContext()` hung repeatedly (it does not inherit the project's
// `use` options; passing `baseURL` explicitly did not resolve it). Four attempts is this repo's
// escalate-don't-hammer threshold, so it stops here rather than absorbing more of the sprint.
//
// **What holds the property in the meantime, and it is not nothing.** The class is closed by
// construction rather than by observation: `shellRendersAccountMenu` is ONE predicate, the shell
// renders the menu when it is true and `/app` renders its line when it is false, and exactly one of
// those branches is taken for every input because they are complements of the same boolean.
//
// Its two inputs (`consoleEnabled`, `userEmail`) are independent of the arguments either caller
// passes — and what closes THAT is the parameter TYPE, which has no place to put a header, not a
// test. An earlier version of this comment said "pinned by lib/console-shell.test.ts"; the test it
// named could not fail and has been deleted (fresh reviewer, PR #122, third pass). Naming the wrong
// guarantor is the same defect as claiming coverage that does not exist, one level up.
//
// **What is therefore still uncovered:** that both call sites actually ASK that predicate. A future
// edit re-introducing a separate condition on either side would not be caught by any test here.
