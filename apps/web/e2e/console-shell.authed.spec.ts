import { test, expect } from '@playwright/test'
import { PROJECT_ROUTE_INVENTORY } from '../lib/project-route-inventory'
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
// ⚠️ **THIS HALF RUNS NOWHERE, AND SAYING SO IS THE POINT.**
//
// CI sets `CONSOLE_SHELL_ENABLED: 'true'` on the only server that runs this file (A19 — the console
// ships enabled, so the gate MUST be on or the blocking gate asserts the opposite of production),
// and the dark server's spec list does not include it. `run-local-e2e.mjs --authed` is the lit
// server too. So every test below skips in every runner that exists today.
//
// That is not a reason to delete them — the gate-off branch is real code that a rollback serves —
// but it IS a reason to stop counting them as coverage. Found in Sprint 3 while adding the `.cmdk`
// absence assertion below and checking, for once, whether the thing I had just written would ever
// execute. It would not.
//
// Owed: either boot a gate-off server for this file the way `setup-routes-dark` gets one, or move
// these four assertions to a spec the dark server already runs. Recorded here rather than in a plan
// nobody re-reads, because this is the file whose green will otherwise keep implying they passed.
test.describe('with CONSOLE_SHELL_ENABLED off', () => {
  test.skip(GATE_ON, 'the gate is on for this run')

  test('the gate-off header is the PUBLIC chrome — Connect and Agent notes, and nothing else', async ({
    page,
  }) => {
    // ⚠️ **This assertion was reduced by Story 3.5, and the reduction IS the story.** It used to
    // read "the legacy header is intact — Home, Sections, Connect and Agent notes all render",
    // because Sprints 1 and 2 kept this branch byte-identical for the dark launch. That guarantee
    // is discharged (A19 — the console shipped enabled), and 3.5 deletes the two entries the
    // console replaced.
    //
    // What survives is asserted POSITIVELY as well as negatively, which is the half that matters:
    // `Connect` and `Agent notes` are an anonymous visitor's only route to `/install` and
    // `/llms.txt`, and the original Story 3.5 would have deleted them with "the now-dead gate-off
    // branch" (A16).
    await page.goto('/app')
    await expect(page.getByRole('link', { name: 'Connect', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Agent notes', exact: true })).toBeVisible()

    // Gone, in the ONE state where they used to render: signed in, gate off.
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(0)
    await expect(page.locator('.product-shell__sections')).toHaveCount(0)

    // ...and the logo still goes to /app, which is why deleting `Home` lost a link and not a route.
    await expect(page.locator('.brand-lockup')).toHaveAttribute('href', '/app')
  })

  test('none of the new console chrome exists while the gate is off', async ({ page }) => {
    await page.goto('/app')
    // The things the console adds. All absent, or the gate is not a gate.
    await expect(page.locator('.product-shell__tabs')).toHaveCount(0)
    await expect(page.locator('.console-rail')).toHaveCount(0)
    await expect(page.locator('.product-shell__account')).toHaveCount(0)
    // ⚠️ `.cmdk` is FOURTH, added in Sprint 3. Until now `CommandPalette` returned `null` when
    // closed, so "⌘K does nothing" was the whole of its gate-off contract and there was nothing to
    // see. It renders a visible trigger unconditionally now, mounted inside the console branch — so
    // the absence has to be asserted rather than inferred from the mount point. A search button on
    // the anonymous demo dashboards would be a control with nothing behind it.
    await expect(page.locator('.cmdk')).toHaveCount(0)
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

    // Sprint 2 (A7): `/app/keys` is no longer a NAV entry with the console on — it still works and
    // still holds the minting form, but `Setup › Keys` is the listed destination. So the rail is
    // exercised from the surface that is actually in it.
    await page.goto(`/app/setup/keys/${tenantSlug()}`)
    const rail = page.locator('.console-rail')
    await expect(rail).toHaveCount(1)
    // The rail names what is inside the section, which is the half of the audit's complaint the
    // header does not answer.
    // Located by HREF, not by accessible name. Each rail entry renders its label AND the inventory's
    // one-line description inside the same <a>, so the accessible name is "Keys everything with
    // access to this project" — `{ name: 'Keys', exact: true }` matches nothing, and a non-exact
    // 'Keys' would also match "API keys" and "Agent write keys", which is precisely what this test
    // needs to tell apart. The href is the unambiguous identity.
    const slug = tenantSlug()
    await expect(rail.locator(`a[href="/app/setup/keys/${slug}"]`)).toBeVisible()
    await expect(rail.locator(`a[href="/app/setup/connect/${slug}"]`)).toBeVisible()
    // ...and the three routes it replaces are NOT listed beside it. A7's swap, seen in the browser
    // rather than only in the projection.
    await expect(rail.locator(`a[href="/app/keys/${slug}"]`)).toHaveCount(0)
    await expect(rail.locator(`a[href="/app/agent-keys/${slug}"]`)).toHaveCount(0)
    await expect(rail.locator(`a[href="/app/flag-credentials/${slug}"]`)).toHaveCount(0)
  })

  test('the active rail item differs from an inactive one by MORE than background colour', async ({
    page,
  }) => {
    // ⚠️ **Two of Daniel's five named complaints are "I can't tell where I am".** What shipped
    // painted `background: var(--card-2)` and nothing else — `#2b2318` on the `--roast` `#16120d`
    // ground, a ~5% luminance step. Findable if you know where to look, invisible if you are
    // scanning.
    //
    // ⚠️ **A fill-only assertion would have PASSED on that**, which is why this one counts the cues
    // rather than checking that something changed. Story 3.3 says the active item is a raised card:
    // fill, border, gold icon, full-strength text. At least three of the four must differ, so
    // losing any single cue still fails here rather than in a review three sprints later.
    const slug = tenantSlug()
    await page.goto(`/app/setup/keys/${slug}`)
    const rail = page.locator('.console-rail')

    const active = rail.locator(`a[href="/app/setup/keys/${slug}"]`)
    const inactive = rail.locator(`a[href="/app/setup/connect/${slug}"]`)
    await expect(active).toHaveAttribute('aria-current', 'page')
    await expect(inactive).not.toHaveAttribute('aria-current', 'page')

    const read = (locator: typeof active) =>
      locator.evaluate((node) => {
        const style = getComputedStyle(node)
        const icon = node.querySelector('svg')
        return {
          background: style.backgroundColor,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          color: style.color,
          iconColor: icon ? getComputedStyle(icon).color : null,
        }
      })

    const on = await read(active)
    const off = await read(inactive)

    // The icon is Story 2.4's deliverable finally reaching a product screen: `iconKey` has been a
    // required field on every surface since Sprint 2, and nothing rendered it.
    expect(on.iconColor, 'the active rail item renders no icon').not.toBeNull()
    expect(off.iconColor, 'an inactive rail item renders no icon').not.toBeNull()

    const differences = [
      on.background !== off.background && 'background',
      on.borderColor !== off.borderColor && 'border',
      on.color !== off.color && 'text colour',
      on.iconColor !== off.iconColor && 'icon colour',
    ].filter(Boolean)

    expect(
      differences,
      `the active rail item differs from an inactive one only by ${differences.join(', ') || 'nothing'} ` +
        `— active ${JSON.stringify(on)} vs inactive ${JSON.stringify(off)}. A cue you have to look ` +
        'for is what shipped last time.'
    ).toHaveLength(4)

    // ...and the border is REAL, not a colour change on a zero-width one.
    expect(parseFloat(on.borderWidth), 'the active item has no border to raise it').toBeGreaterThan(0)

    // ⚠️ The inactive items must carry a transparent border of the SAME width, or the active one
    // shifts its neighbours by 2px as it moves. A cue that reflows the list reads as a bug.
    expect(
      off.borderWidth,
      'the inactive rail items have a different border width — the list will shift when the active item moves'
    ).toBe(on.borderWidth)
  })

  test('EVERY rail route marks its OWN item, not merely some item', async ({ page }) => {
    // ⚠️ **The type only catches typos.** `railActive` is now the derived `ProjectRouteSegment`
    // union, so `'taskz'` is a compile error — but `'setup/keys'` on the tasks page is a perfectly
    // valid segment pointing at the WRONG item, and a wrong mark is worse than no mark. Typecheck
    // and both browser suites stayed green through exactly that mutation (fresh reviewer, Major).
    //
    // The previous rail test visited ONE route. One of twenty-one is the ratio this sprint's own
    // commit message calls out as the defect, reproduced in the test written to fix it. This walks
    // every rail destination the fixture tenant can reach.
    const slug = tenantSlug()
    const checked: string[] = []
    const offRail: string[] = []
    const unreachable: string[] = []

    for (const surface of PROJECT_ROUTE_INVENTORY) {
      if (surface.status === 'flow-only') continue
      const href = `/app/${surface.routeSegment}/${slug}`
      const response = await page.goto(href)
      // A gate-closed or owner-only surface is not a failure of this test — but it must be RECORDED,
      // not silently skipped, or a suite that reaches nothing reads exactly like a suite that passes.
      // ⚠️ A 404 on an INVENTORY route is always a defect: the rail lists it, so the rail is
      // offering a destination that does not serve. This used to be swallowed into `unreachable`,
      // which was pushed to and never asserted on — adding `notFound()` to `/app/shares` left the
      // test GREEN while Setup still listed "Share links" pointing at a 404 (fresh reviewer,
      // round 2, mutation-verified). Recording into an array nothing reads IS silently skipping,
      // which is the thing this test's own comment says it must not do.
      expect(
        response?.status() ?? 0,
        `${href} is in the inventory and answers ${response?.status()} — the rail offers it as a place to go`
      ).toBeLessThan(400)
      if (page.url().includes('/login')) {
        unreachable.push(`${surface.routeSegment} (redirected to /login)`)
        continue
      }
      const rail = page.locator('.console-rail')
      if ((await rail.count()) === 0) {
        unreachable.push(`${surface.routeSegment} (no rail)`)
        continue
      }
      const marked = rail.locator('a[aria-current="page"]')
      const count = await marked.count()
      // ⚠️ Whether this route IS a rail destination is decided by the RAIL, not by the inventory.
      // The `legacy-keys` gate (A7) removes `/app/keys`, `/app/agent-keys` and
      // `/app/flag-credentials` from the rail when the console is lit, so those pages correctly mark
      // nothing — my first version of this test demanded a mark from every inventory row and failed
      // on a page that was right. Both branches are asserted, and the second is not a loophole: a
      // page outside the rail marking SOMEBODY ELSE's item is the wrong-mark defect wearing a
      // different hat.
      const listed = (await rail.locator(`a[href="${href}"]`).count()) > 0
      if (listed) {
        expect(count, `${href} is in the rail and marks ${count} items — exactly one must be current`).toBe(1)
        expect(
          await marked.getAttribute('href'),
          `${href} marks the WRONG rail item — a wrong mark sends you somewhere else with confidence, ` +
            'which is worse than marking nothing'
        ).toBe(href)
        checked.push(surface.routeSegment)
      } else {
        expect(
          count,
          `${href} is not a rail destination, yet it marks ${count} rail item(s) — it is claiming to ` +
            'be somewhere it is not'
        ).toBe(0)
        offRail.push(surface.routeSegment)
      }
    }

    // ⚠️ **The floor is the EXACT count, not a lower bound.** It was `> 5` against a real maximum of
    // nine, so three of nine rail destinations could drop out silently and the test would still
    // report success (fresh reviewer, round 2). A floor with that much slack is a floor that admits
    // the defect it is placed against. If a gate closes and the number legitimately changes, this
    // fails and the new number gets written down deliberately.
    expect(
      checked.length,
      `${checked.length} rail routes marked their own item, expected 9. off-rail: ` +
        `${offRail.join(', ') || 'none'}; unreachable: ${unreachable.join(', ') || 'none'}`
    ).toBe(9)

    // ...and the off-rail branch must be exercised too, or a change that quietly drops every route
    // out of the rail would satisfy the loop by never entering the branch that checks anything.
    expect(
      offRail.length,
      'no off-rail route was exercised — the second branch asserted nothing'
    ).toBeGreaterThan(0)
  })

  test('the environment is ONE control that opens, not three stacked links', async ({ page }) => {
    // ⚠️ **Daniel's first named complaint.** `EnvironmentPicker` mapped all three environments into
    // a permanently-expanded `<ul>` of lowercase links, so the rail asked you to pick from a list
    // instead of telling you where you are. A control showing all its options at rest is a filter;
    // one that names the current state and opens on demand is a location.
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    const control = page.locator('.envpick__control')
    await expect(control).toHaveCount(1)

    // CLOSED at rest, and that is the whole finding — asserted as the options being HIDDEN, not as
    // the `open` attribute being absent, because a `<details>` styled open would satisfy the second
    // and fail the first.
    const options = control.locator('.envpick__menu a')
    await expect(options.first()).toBeHidden()

    const summary = control.locator('summary')
    await expect(summary).toBeVisible()
    // Title case: the rail says where you ARE. `production` in lower case reads like a config value.
    await expect(summary).toHaveText(/Production|Preview|Development/)

    await summary.click()
    await expect(options.first()).toBeVisible()
    await expect(options).toHaveCount(3)

    // ⚠️ **Every option is still a real link carrying the environment in the URL** (contract row 8,
    // `console-ia-overhaul` 1.3): a copy-pasted address opens the same environment. This is why the
    // control is a `<details>` and not Sprint 2's `EnvironmentControl` primitive, whose `onOpen`
    // callback would have needed a client island and turned these into state.
    const preview = control.locator('.envpick__menu a', { hasText: 'Preview' })
    // `env`, not `environment` — `buildFlagListQuery` writes the short key, and the DEFAULT
    // environment is omitted from the URL entirely rather than written out. Read from the builder
    // rather than assumed: my first version of this assertion invented `environment=` and failed
    // against correct code, which is a test accusing the product of the test's own mistake.
    const href = await preview.getAttribute('href')
    expect(href, 'the environment options are not links — the environment has left the URL').toContain(
      'env=preview'
    )

    await preview.click()
    await expect(page).toHaveURL(/env=preview/)
    await expect(page.locator('.envpick__control summary')).toHaveText(/Preview/)
  })

  test('⌘K has a VISIBLE affordance in the top bar, and it opens the palette', async ({ page }) => {
    // ⚠️ Story 3.2 asks for "project switcher, `⌘K`, account" in the top bar. There was no `⌘K`
    // anything: the shortcut was keyboard-only on all 21 console routes and `grep '⌘K'` matched a
    // comment. A shortcut with no affordance is undiscoverable — it might as well not ship for
    // anyone who has not read the source (fresh reviewer, Major).
    //
    // Asserted as VISIBLE and as FUNCTIONAL, in the top bar specifically. The previous state
    // satisfied "the palette opens on ⌘K" perfectly well, which is why that assertion did not
    // notice the missing button.
    await page.goto('/app')
    const trigger = page.locator('.product-shell__header .cmdk')
    await expect(trigger).toBeVisible()
    await expect(trigger).toContainText('⌘K')

    // It opens by POINTER, which is the whole point — the keyboard path was never broken.
    await trigger.click()
    await expect(page.locator('.command-palette')).toBeVisible()
    await expect(page.locator('.command-palette [role="option"]').first()).toBeVisible()
  })

  test("the palette's keyboard cursor is PAINTED, not only announced", async ({ page }) => {
    // ⚠️ **This is an ASSERTION, not a repair — the plan asked for the wrong thing.** Story 3.5 says
    // the cursor rule "was written against `li[aria-selected]` after `role='option'` moved onto the
    // anchor, so ↑/↓ moved an announcement a screen reader could hear and a sighted reader could
    // not see". True when it was written; `console-ia-overhaul` Story 3.4 already moved the rule
    // onto the anchor, and `globals.css` paints a `--card` ground plus a 2px gold inset today.
    //
    // What was still missing is this test. `grep aria-selected apps/web/e2e/*.spec.ts` matched only
    // the landing's tabs — so the fix was one selector edit away from silently reverting to the
    // state its own comment describes, with every suite green. A defect that has already happened
    // once, on a rule whose comment explains why it must not happen again, is worth a gate.
    //
    // ⚠️ **The rule that actually paints here is `console.css:1785`, not `globals.css:1354`.** In the
    // console — the only place the palette renders — `.is-console .command-palette__panel
    // a[aria-selected='true']` wins at (0,2,1) and paints `--card-3` with `box-shadow: none`. So the
    // `shadow` half of the predicate below is permanently false in this context, and reverting the
    // `globals.css` rule alone would leave this test green. Both selectors are what matter, and the
    // assertion is written as an OR across background and shadow precisely so it survives either
    // file winning — but the comment pointed at one file and implied it was the one under test
    // (fresh reviewer, Minor). Mutating BOTH selectors back to `li` is what turns this red.
    await page.goto('/app')
    await openPalette(page)
    const options = page.locator('.command-palette [role="option"]')
    await expect(options.first()).toBeVisible()
    expect(await options.count(), 'the palette listed fewer than two options').toBeGreaterThan(1)

    const paint = (index: number) =>
      options.nth(index).evaluate((node) => {
        const style = getComputedStyle(node)
        return {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          selected: node.getAttribute('aria-selected'),
        }
      })

    const firstAtRest = await paint(0)
    const secondAtRest = await paint(1)
    expect(firstAtRest.selected, 'the palette opens with no option selected').toBe('true')

    // The SELECTED row must look different from an unselected one. Asserted as paint — a background
    // or a shadow — never as the attribute, which is the half that never stopped working.
    expect(
      firstAtRest.background !== secondAtRest.background || firstAtRest.shadow !== secondAtRest.shadow,
      `the selected option paints exactly like an unselected one: ${JSON.stringify(firstAtRest)} vs ` +
        `${JSON.stringify(secondAtRest)}. ↑/↓ is moving an announcement a sighted reader cannot see.`
    ).toBe(true)

    // ...and the paint MOVES with the keyboard, rather than being stuck on the first row.
    await page.keyboard.press('ArrowDown')
    const firstAfter = await paint(0)
    const secondAfter = await paint(1)
    expect(secondAfter.selected, 'ArrowDown did not move the selection').toBe('true')
    expect(
      secondAfter.background !== secondAtRest.background || secondAfter.shadow !== secondAtRest.shadow,
      'the second option looks identical before and after the cursor reached it'
    ).toBe(true)
    expect(
      firstAfter.background !== firstAtRest.background || firstAfter.shadow !== firstAtRest.shadow,
      'the first option kept the cursor paint after the cursor left it'
    ).toBe(true)
  })

  test('the palette fetches on FIRST PRESS, not on page load, and not again on reopen', async ({ page }) => {
    // Story 3.5's other acceptance: `0 / 1 / 1` requests (load / first open / reopen), measured last
    // epic. A palette that loads its index with every page would put its cost on every route in the
    // console — the one thing a shared shell must not do.
    // ⚠️ **The first version of this filter matched NOTHING and the test passed vacuously.** It
    // looked for `command-palette` and `/api/palette`; the palette actually fetches
    // `/api/internal/feature-index/<slug>` (`CommandPalette.tsx:102`). So `requests` stayed empty at
    // every stage, `0 === 0` held at each step, and the test reported "0 / 1 / 1 verified" while
    // observing nothing at all — a guard that cannot fail, in the sprint whose review notes keep
    // naming that class (cross-family review, agy).
    //
    // The path is READ from the component rather than guessed a second time, and the floor below is
    // what makes a future rename fail loudly instead of quietly returning to zero.
    const FEATURE_INDEX = '/api/internal/feature-index/'
    const requests: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname.startsWith(FEATURE_INDEX)) requests.push(url.pathname)
    })

    await page.goto('/app')
    await page.waitForLoadState('networkidle')
    expect(requests.length, `the palette fetched ${requests.length} time(s) on page load`).toBe(0)

    await openPalette(page)
    await expect(page.locator('.command-palette [role="option"]').first()).toBeVisible()
    // The feature index arrives after the options render, so wait for the fetch rather than racing it.
    await page.waitForResponse((response) => response.url().includes(FEATURE_INDEX))
    const afterFirstOpen = requests.length

    // ⚠️ THE FLOOR. Without it, "the palette fetched zero times because the filter is wrong" and
    // "the palette correctly fetched once" are the same result, and the reopen check below compares
    // 0 to 0 forever (agy).
    expect(
      afterFirstOpen,
      `opening the palette fetched ${FEATURE_INDEX} ${afterFirstOpen} times — expected exactly 1. ` +
        'Zero means this test is watching a path the palette no longer uses.'
    ).toBe(1)

    await page.keyboard.press('Escape')
    await openPalette(page)
    await expect(page.locator('.command-palette [role="option"]').first()).toBeVisible()
    expect(
      requests.length,
      `reopening fetched again — ${requests.length} total against ${afterFirstOpen} after the first open`
    ).toBe(afterFirstOpen)
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

  // ── console-ia-overhaul · Sprint 3, Story 3.4 — ⌘K indexes feature keys ────────────────────
  test('⌘K finds a FEATURE by its key and opens it', async ({ page }) => {
    const slug = tenantSlug()
    // ⚠️ Started from `/app` deliberately. The index is fetched on FIRST ⌘K from a route handler,
    // not rendered into the page — so this also proves the fetch happens on a page that knows
    // nothing about flags, which is the whole of D7's answer. Command Center makes no registry read.
    await page.goto('/app')
    await openPalette(page)

    // The list is fetched, so the row does not exist on the first frame. Waiting for it IS the
    // assertion that the fetch happened.
    const options = page.locator('.command-palette [role="option"]')
    await page.keyboard.type('gb.e2e.owner')
    await expect(options.first()).toBeVisible({ timeout: 5000 })

    // Labelled by kind — Story 3.4's acceptance. Without it a reader cannot tell "the Flags page"
    // from "a feature called flags".
    await expect(options.first()).toContainText('Feature')
    const key = (await options
      .first()
      .locator('.command-palette__kind')
      .evaluate((el) => {
        return el.parentElement?.textContent?.replace('Feature', '').trim() ?? ''
      })) as string
    expect(key.startsWith('gb.e2e.owner')).toBe(true)

    await page.keyboard.press('Enter')
    // It opens the FEATURE, on the route Story 2.1 built — not the list, and not a URL anybody typed.
    await page.waitForURL(new RegExp(`/app/flags/${slug}/gb.e2e.owner`))
  })

  test('⌘K still finds a SURFACE once features are in the list', async ({ page }) => {
    // The regression this guards is a merge that put 42 features in front of 13 surfaces and left no
    // way to reach a surface by name. Asserted through the browser because the ORDER is decided in
    // the component, which no unit test can reach.
    await page.goto('/app')
    await openPalette(page)
    await page.keyboard.type('Flag audit')
    const options = page.locator('.command-palette [role="option"]')
    await expect(options).toHaveCount(1)
    await expect(options.first()).toContainText('Go to')
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
