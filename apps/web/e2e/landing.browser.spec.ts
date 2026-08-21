import { test, expect } from '@playwright/test'
import { LANDING_SECTIONS } from '@/lib/landing-sections'

// The landing's rendered-content contract.
//
// ── What moved OUT of this file, and why ──────────────────────────────────────────────────────
// This spec used to hold two hand-copied "no horizontal overflow at 390px" tests, one for `/` and
// one for `/install`. Both now live in `e2e/mobile-heuristics.browser.spec.ts`, which sweeps a
// LIST of routes and also checks the tap-target floor — so coverage went up, not down, and adding
// the next route is a row in an array rather than another copy of the same block. Keeping a third
// copy here would have been a second definition of "mobile-clean" that agrees today.
//
// What is left is the thing only this page can assert: that the v2 narrative actually rendered,
// and that the nav's promises resolve to real anchors.

test('the landing renders the maker-ops narrative', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('nav.gb')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Make more')

  // TWO copy-a-prompt blocks, and the count changed WITH its reasoning rather than quietly
  // (agentic-pm-public-surface, epic D5). `landing-readability-pass` D1 cut the old §try because
  // two such blocks read as a pattern rather than an invitation — true of two blocks asking the
  // SAME thing. These ask different things at different moments: the hero offers to teach you
  // something, and the closing CTA asks your own agent whether to bother with us at all.
  //
  // A comment justifying the opposite of what the assertion below checks is CODE-QUALITY #3, and
  // it is the kind a reviewer reads as evidence and then stops looking.
  await expect(page.locator('.prompt-card')).toHaveCount(2)
})

// The copy button's actual contract: what lands on the clipboard is what the reader saw.
//
// `CopyPromptCard` copies from its own rendered `<pre>` rather than from the `prompt` prop
// specifically so the two cannot drift — but that guarantee lived only in a comment until
// cross-family review of PR #92 pointed out that the handler also calls `.trim()`, so "identical
// by construction" was an overstatement. This asserts the real property instead of restating the
// claim: surrounding whitespace is normalised, and nothing else is touched — every interior line,
// blank line and character survives the round trip.
test('the copy button puts the visible prompt on the clipboard, unaltered', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')

  const card = page.locator('.prompt-card').first()
  const visible = await card.locator('.prompt-copy').innerText()

  await card.getByRole('button').click()
  await expect(card.getByRole('button')).toContainText('copied')

  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(visible.trim())

  // The interior is byte-identical — the trim touches the ends only. Asserted separately because a
  // handler that collapsed newlines would still pass a naive equality check against a
  // similarly-collapsed `innerText`.
  //
  // Bounds derived from the SURVIVING prompt rather than hardcoded. The old numbers (>5 lines, a
  // blank line) described the retired `#try` handoff prompt; the decision prompt is one paragraph,
  // so they failed against a page that was working correctly. Comparing against what is rendered
  // keeps this a real check on the copy handler without pinning it to one prompt's shape.
  expect(clipboard.split('\n').length).toBe(visible.trim().split('\n').length)
  expect(clipboard.length).toBeGreaterThan(80)
})

// ── The framed-window guard retired with the last framed window (epic A12) ─────────────────────
// This asserted that every `.agent-win` on `/` carried a `SurfaceNote` committing to "real" or
// "illustrated" — the fix for a page that once labelled an invented conversation as though it were
// a live session (PR #92: the hero's note said "In ChatGPT, Claude, or your agent", describing
// where the conversation happens and never that its figures were invented).
//
// Sprint 2 removed the last three frames: the hero's illustrated agent window, §product's app-shell
// picture, and §proof's genuinely-live read. The guard's floor (`count > 0`) therefore FAILED
// rather than passing vacuously, which is the honest outcome and is how this was found.
//
// sprint-2.md predicted it would be "vacuously true of the hero and still meaningful elsewhere".
// There is no elsewhere — checked, not assumed: nothing under `components/landing/` renders
// `AgentWindow` any more. So the guard is deleted rather than floored at zero, for the same reason
// as the numbered-stamp spec (epic A5): a test that cannot fail is worse than no test, because the
// next reader stops there.
//
// It is not obsolete, it is unemployed. If an illustrated frame ever returns to this page, this
// guard returns with it — the failure it prevents is one this page has actually shipped.

test('every nav link resolves to something real', async ({ page, request }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.landing-nav__links a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs.length).toBeGreaterThan(0)

  for (const href of hrefs) {
    // ROOT-RELATIVE fragments (`/#product`), not bare ones. The nav is rendered on `/talk` too, and
    // a bare fragment resolves against whatever page it is on — so `href` is no longer a valid CSS
    // selector and `page.locator(href)` would throw. The id is parsed out and asserted directly.
    //
    // A previous version asserted `toMatch(/^#/)`, which the root-relative fix broke outright.
    // Nothing caught it: the `browser` project is not in the blocking gate, so this file does not
    // run on every PR. Found by Mistral Vibe in round 4 of PR #100 — a reviewer reading the spec
    // noticed what the pipeline could not.
    //
    // ── Renamed from "resolves to a SECTION on the page" (methodology-experience, Story 2.4) ───
    // That name, and the `toBeTruthy()` on the parsed fragment under it, encoded an assumption
    // that stopped being true the moment the nav grew its first ROUTE link (`/methodology`): every
    // entry is an anchor into `/`. The assertion is now on the property both shapes share — a nav
    // link goes somewhere that exists — checked the way each shape can actually be checked. This
    // is the same shape as the hero-CTA spec below, deliberately: two specs asserting "goes
    // somewhere real" should not disagree about what that means.
    const fragment = /#(.+)$/.exec(href)?.[1]

    if (fragment) {
      await expect(page.locator(`#${fragment}`), `#${fragment} has no target on the page`).toHaveCount(1)
      continue
    }

    expect(href, 'a nav link must go somewhere').not.toBe('')
    expect(href, `${href} is neither an anchor nor a root-relative route`).toMatch(/^\//)
    const res = await request.get(href)
    expect(res.status(), `${href} is in the nav but does not resolve`).toBe(200)
  }
})

// landing-maker-ops · Story 4.1 — the hero's two CTAs both resolve to something real.
//
// The mockup pointed every CTA at `href="#start"` with nothing behind it, and the version this
// replaces asserted a hardcoded `['#connect', '#try']`. Neither shape survives a gate flip, so the
// assertion is on the PROPERTY rather than on the strings: an in-page anchor must have a target,
// and a route must answer. `primaryCtaHref` returns `/signup` or `#pricing` depending on
// SIGNUP_ENABLED, and both branches pass this without the spec knowing which one it got.
test('the hero CTAs resolve to something real, under either gate position', async ({ page, request }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.hero .hero-cta a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs.length, 'the hero has two CTAs').toBe(2)

  for (const href of hrefs) {
    expect(href, 'a CTA must go somewhere').not.toBe('')
    expect(href, "the mockup's dead #start anchor must never ship").not.toBe('#start')

    // Three shapes are legitimate and each is checked for what makes it real: a bare fragment must
    // have a target here; a root-relative fragment must have one on `/`; a route must answer. The
    // `startsWith('#')` form this replaces silently passed anything that was not a bare fragment,
    // which after the root-relative fix was ALL of them — a guard that had quietly stopped guarding
    // (CODE-QUALITY #5). Found by Mistral Vibe in round 4 of PR #100.
    const fragment = /#(.+)$/.exec(href)?.[1]
    if (fragment) {
      await expect(page.locator(`#${fragment}`), `#${fragment} has no target on the page`).toHaveCount(1)
    } else {
      const response = await request.get(href)
      expect(response.status(), `${href} must be a route that answers`).toBeLessThan(400)
    }
  }
})

// landing-maker-ops · Story 4.1 — the registry and the page describe each other.
//
// `lib/landing-sections.ts` is the single source of truth for what is on this page, and it has now
// been rewritten twice by a redesign. Both times, the risk was the same: an entry that outlives the
// section it described, or a section that ships without one. Neither is visible to a type-checker,
// and the first is exactly the drift the file exists to prevent.
//
// Every id is also the `id` attribute of exactly one element, so a stale entry fails here rather
// than rotting quietly — and so does a nav or CTA anchor pointing at a section that has gone.
test('every section in the registry is on the page, exactly once', async ({ page }) => {
  await page.goto('/')

  for (const section of LANDING_SECTIONS) {
    await expect(
      page.locator(`#${section.id}`),
      `#${section.id} is in LANDING_SECTIONS but not rendered exactly once`
    ).toHaveCount(1)
  }
})

// ── landing-frijoles-rebrand · Sprint 1 ─────────────────────────────────────────────────────────

// Story 1.3 (epic D2). The defect this pins was LIVE in production: `a:hover` (0,1,1) in
// tokens.css out-specified `.btn-gold` (0,1,0), so hovering an anchor-based gold CTA painted
// `--gold-hot` ink on a `--gold-hot` face and the label — plus the arrow, which strokes
// `currentColor` — disappeared outright.
//
// It asserts the RENDERED result rather than the stylesheet on purpose. A test that reads the rule
// passes happily while some later selector out-specifies it, which is the exact shape of the bug
// it is guarding: nothing here was wrong in isolation.
//
// The threshold is deliberately crude — a real contrast-ratio implementation would be a second
// definition of "legible" to keep in step with whatever the design system decides later. What is
// being caught is total collapse (ink == face), not a subtle regression, so channel distance is
// both sufficient and impossible to argue with.
test('a gold CTA keeps its label while hovered', async ({ page }) => {
  await page.goto('/')

  const cta = page.locator('.hero .hero-cta a.btn-gold').first()
  await expect(cta).toBeVisible()
  await cta.hover()

  const { color, background } = await cta.evaluate((node) => {
    const style = getComputedStyle(node)
    return { color: style.color, background: style.backgroundColor }
  })

  const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
  const [r1, g1, b1] = channels(color)
  const [r2, g2, b2] = channels(background)
  const distance = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)

  expect(
    distance,
    `hovered CTA ink ${color} is indistinguishable from its face ${background}`
  ).toBeGreaterThan(240)
})

// frijoles-rebrand-closeout A4. The two old-name tenant slugs are live DATA identities, not brand
// copy: one owns historical landing telemetry and one owns the synthetic public proof. Strip only
// those exact, enumerated values before checking the rest of the rendered page. A broad matcher or
// a generic hyphen exception would let the old brand creep back in under cover of the slug decision.
test('the page is called Golden Frijoles, with only the named data-slug survivors', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Golden Frijoles/)
  await expect(page.locator('.brand-lockup__type strong').first()).toHaveText('golden frijoles')

  const body = await page.locator('body').innerText()
  const withoutDataSlugs = body.replaceAll('golden-beans-demo', '').replaceAll('golden-beans', '')
  expect(withoutDataSlugs).not.toMatch(/golden[ -]beans/i)
})

// The rebranded package name used to be asserted on `/`, because §sdk printed the install line
// there. That section was cut in the 2026-08-19 readability pass, and the claim it carried is
// still checkable — /install is where the install line has always actually lived, and it is where
// the footer's agent manifest and the closing CTA now send a reader who wants it. Moving the
// assertion rather than deleting it is the point: the section went, the guarantee did not.
test('the install page still carries the rebranded package name', async ({ page }) => {
  await page.goto('/install')

  await expect(page.locator('body')).toContainText('npm install @golden-frijoles/sdk')
})

// frijoles-rebrand-closeout Story 1.3. The paragraph was a mockup ledger, not product copy. Its
// honesty claims already have local guards in this file (surface notes, flag-derived drill badges,
// and the infomercial disclaimer), so deleting it must leave the useful footer rails and no hidden
// second copy. This test was observed red against the shipped pre-closeout page.
test('the footer keeps its useful rails without the mockup footnote ledger', async ({ page }) => {
  await page.goto('/')

  const footer = page.locator('footer.footer')
  await expect(footer.locator('.brand-lockup')).toBeVisible()
  await expect(footer.locator('.footer__agent-manifest')).toBeVisible()
  await expect(footer.locator('.footer__meta')).toHaveCount(0)
  await expect(footer).not.toContainText(/footnote ledger/i)
})

// The prior rebrand missed directly served SVGs because no React component imports them. A source
// sweep found the residue; this request-level check makes the canonical public assets part of the
// rendered contract instead of relying on another one-off grep. It was observed red while these
// Golden Frijoles paths still returned 404.
test('canonical public brand assets use Golden Frijoles names and accessible text', async ({ request }) => {
  const assets = [
    '/brand/golden-frijoles-mark.svg',
    '/brand/golden-frijoles-mark-flat.svg',
    '/brand/golden-frijoles-lockup-dark.svg',
    '/brand/golden-frijoles-lockup-light.svg',
  ]

  for (const path of assets) {
    const response = await request.get(path)
    expect(response.status(), `${path} must be directly servable`).toBe(200)
    const svg = await response.text()
    expect(svg, `${path} still contains old-brand text`).not.toMatch(/Golden Beans/i)
    if (!path.includes('-flat.')) {
      expect(svg, `${path} needs accessible Golden Frijoles text`).toMatch(/Golden Frijoles/i)
    }
  }
})

// Story 1.5 (epic D4). The section number is a drawn disc, not a `①` glyph — and the prop that
// feeds it is typed `number`, so the glyph cannot come back through the front door either.
// ── The numbered-stamp spec retired with the device it measured (epic A5) ──────────────────────
// `SectionDivider` had two call sites — §proof (1) and §pricing (2) — and agentic-pm-public-surface
// Sprint 2 deleted §proof. A lone "1" describes a document nobody can read, so the stamp came off
// §pricing too and the component was deleted.
//
// The test that asserted "at least two visible stamps, the first reading 1" was therefore deleted
// rather than loosened. Relaxing its floor to zero would have left a test that cannot fail, which
// is worse than no test because the next reader stops there (CODE-QUALITY #5). This suite is not in
// the blocking gate, so nothing would have caught it going vacuous.
//
// Its LAST assertion was never about dividers, and it survives below on its own: no enclosed-numeral
// glyph may appear anywhere on the page. That guard came from landing-frijoles-rebrand, where ❶-style
// characters rendered as tofu in the shipped font, and it still has a subject.
test('no enclosed-numeral glyph survives on the landing page', async ({ page }) => {
  await page.goto('/')

  const body = await page.locator('body').innerText()
  expect(body, 'no enclosed-numeral glyph survives on the page').not.toMatch(/[①-⓿]/)
})

// Story 1.4. Selecting a paragraph on a phone used to paint a solid gold brick across the whole
// screen. The geometry is the UA's and cannot be changed from CSS — a selection that includes the
// trailing block break leaves no line terminal, so every line's highlight extends to the containing
// block's content edge, and on a phone that block is the viewport. What was ours is that the fill
// was OPAQUE and inverted the ink, which is what turned a normal extension into a slab.
//
// So the assertion is on the material, and it is exact rather than impressionistic: the ground must
// be translucent, and the ink must NOT be the page ground colour (which is what an inverted
// selection sets it to). Both halves matter — a translucent wash under inverted ink would still
// read as a stamped block.
test('selecting a paragraph is a wash, not a slab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const paragraph = page.locator('.hero-sub').first()
  await paragraph.scrollIntoViewIfNeeded()

  const material = await paragraph.evaluate((node) => {
    const style = getComputedStyle(node, '::selection')
    return { background: style.backgroundColor, color: style.color }
  })

  // `color-mix()` resolves to whichever serialisation the engine prefers, and it is NOT `rgba()`
  // here — Chromium returns `color(srgb 1 0.831373 0.368627 / 0.34)`. So the alpha is read as
  // "whatever follows the slash", in either notation, with the percentage form normalised. An
  // `rgba()`-only regex would have found nothing, defaulted to 1, and failed this test against a
  // fix that works — which is how a guard teaches people to delete it.
  const alphaToken = material.background.match(/\/\s*([\d.]+)(%?)\s*\)/)
  const alpha = alphaToken ? Number(alphaToken[1]) / (alphaToken[2] === '%' ? 100 : 1) : 1
  expect(
    alpha,
    `selection ground ${material.background} must be translucent so the words stay visible under it`
  ).toBeLessThan(1)

  // `--roast` is the page ground. Selection ink landing on it means the old inverted treatment is
  // back, and the extension will read as a filled block again whatever its alpha.
  expect(material.color.replace(/\s/g, '')).not.toBe('rgb(22,18,13)')

  // The gesture that reproduced the report still selects the paragraph. Only that is asserted:
  //
  // ── Why there is NO geometry assertion here ─────────────────────────────────────────────────
  // The obvious one — "the selection rect is not the full viewport width" — cannot fail, and a
  // test that cannot fail is worse than no test because the next reader stops there
  // (CODE-QUALITY.md #5). The extension to the containing block's edge is UA selection painting,
  // it is what the browser is SUPPOSED to do for a non-terminal line, and no CSS turns it off. A
  // `<= 390` bound is satisfied by the broken rendering and the fixed one alike; tightening it to
  // "narrower than the viewport" would fail on any paragraph whose text legitimately fills the
  // line. The material assertions above are the ones with teeth, because the material is the part
  // that was actually ours to get wrong. Written this way after cross-family review of PR #95
  // pointed out that the bound was decorative.
  await paragraph.click({ clickCount: 3 })
  const selected = await page.evaluate(() => getSelection()?.toString().trim() ?? '')
  expect(selected, 'a paragraph must be selectable by triple-click').toContain(
    'Agents can turn your ideas into reality'
  )
})

// ── landing-frijoles-rebrand · Sprint 3 ─────────────────────────────────────────────────────────

// Story 3.1. The product owner's ask was that the site feel smooth rather than jumpy, and the one
// rule that does most of that work is this: hover feedback must not change GEOMETRY. A control that
// grows or shifts under the pointer reflows its neighbours, and on a dense page that reads as the
// layout flinching.
//
// Measured on the RENDERED box rather than by reading the transition list, for the same reason the
// hover-contrast spec is: a `transform` reintroduced by any later rule would still move the box
// while the declared transition looked innocent.
test('hovering a control does not move it or its neighbour', async ({ page }) => {
  await page.goto('/')

  const cta = page.locator('.hero .hero-cta a.btn-gold').first()
  const neighbour = page.locator('.hero .hero-cta a.btn-ghost').first()
  await expect(cta).toBeVisible()

  // ── Scrolled into view BEFORE the baseline is taken ─────────────────────────────────────────
  // `hover()` scrolls its target into view first, and `boundingBox()` is frame-relative — so if
  // the control starts below the fold, the "after" reading differs from the "before" one by the
  // scroll distance and this test reports a 388px jump on a page where nothing moved. It passed
  // for as long as the hero happened to be short enough to fit the CTAs into a 720px-tall default
  // viewport, which is not a property of the thing under test; the hero grew a type size and the
  // spec went red without a hover state changing. Scrolling first removes the coupling, and the
  // assertion below is unchanged.
  await cta.scrollIntoViewIfNeeded()

  const before = { cta: await cta.boundingBox(), neighbour: await neighbour.boundingBox() }
  await cta.hover()
  await page.waitForTimeout(300) // longer than --motion-base, so a transition has finished moving
  const after = { cta: await cta.boundingBox(), neighbour: await neighbour.boundingBox() }

  for (const key of ['cta', 'neighbour'] as const) {
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(
        Math.abs(after[key]![dimension] - before[key]![dimension]),
        `hovering the CTA moved the ${key}'s ${dimension}`
      ).toBeLessThan(0.5)
    }
  }
})

// ── landing-maker-ops · Sprint 4 ───────────────────────────────────────────────────────────────
// The drill-gate contract, re-pointed at the section that now carries it.
//
// This replaces a spec that checked `#resilience`'s two drill cards. That section retired with the
// repositioning, but the PROPERTY it guarded is the one this page most needs: a claim about a
// gated capability must match the gate's actual state, verified by exercising the route rather
// than by reading a flag the test also reads. Deleting the section is not a reason to delete the
// guard — the claim moved, so the guard moves with it.
//
// The two flags are independent by design (`lib/flags.ts`): an owner may allow an internal fault
// drill without authorizing an active security probe. So the page's claim is checked against BOTH
// routes, and it must not say "switched off" while either one answers.
const DRILL_ROUTES = [
  { name: 'chaos', route: '/api/v1/scenarios/execution' },
  { name: 'security', route: '/api/v1/scenarios/security' },
] as const

test("the authority panel's gate claim matches the real route state", async ({ page, request }) => {
  await page.goto('/')

  const panel = page.locator('#authority')
  await expect(panel).toBeVisible()

  // ── A 404 alone does NOT prove "gated" ──────────────────────────────────────────────────────
  // A DELETED route 404s exactly like a gated one, and this test would then read the deletion as
  // "merely switched off" and happily validate the page's "built and deployed" claim. So each
  // probe is paired with a deployment proof: `/api/v1/scenarios/admin` is the ungated sibling in
  // the same route family, and it answers 400/401/405 — anything but 404 — whenever the scenario
  // routes are deployed at all. If that sibling 404s, the assumption under this whole test is
  // gone and the test says so rather than passing. Restored after Codex flagged its loss in round
  // 6 of PR #100; the spec this replaced had the same probe and I dropped it in the rewrite.
  const deploymentProof = await request.post('/api/v1/scenarios/admin', { data: {} })
  expect(
    deploymentProof.status(),
    'the scenario route family must be deployed for a 404 to mean "gated" rather than "gone"'
  ).not.toBe(404)

  const gateStates = await Promise.all(
    DRILL_ROUTES.map(async (drill) => ({
      name: drill.name,
      open: (await request.post(drill.route, { data: {} })).status() !== 404,
    }))
  )
  const anyClosed = gateStates.some((g) => !g.open)

  // ── The claim moved from a sentence to the badge, and so did this assertion ─────────────────
  // The panel used to carry a computed sentence ("…is switched off in this deployment, so this
  // shows the shape rather than a run you could start here today") and this test matched on
  // "switched off". The readability pass cut the sentence; the QUALIFICATION stayed, as the
  // amber `Built, currently gated` badge, which is resolved from the same gate read.
  //
  // So the property is unchanged and still checked against the REAL routes rather than against a
  // flag the test also reads: a closed gate must be labelled on the page, an open one must not be.
  const badge = panel.getByText('Built, currently gated')

  if (anyClosed) {
    await expect(
      badge,
      `a drill gate is closed (${gateStates
        .filter((g) => !g.open)
        .map((g) => g.name)
        .join(', ')}) ` + 'so the panel must be labelled as gated'
    ).toHaveCount(1)
  } else {
    await expect(badge, 'every drill gate is open, so the panel must not claim otherwise').toHaveCount(0)
  }
})

// Story 3.1, and the finding that proved it needed a spec rather than a comment.
//
// The reduced-motion rules were briefly split across TWO `prefers-reduced-motion` blocks, with a
// comment in the second one claiming it had merged into the first. The behaviour happened to be
// correct — but only by luck of which block held which rule, and the next person to extend
// "the" block would have found whichever one they searched to first.
//
// So this asserts the OUTCOME a reader with the preference set actually gets, which is the thing
// that must hold however the stylesheet is organised. Run under Playwright's `reducedMotion`
// emulation rather than by reading the sheet: a rule out-specified by a later one still reads fine.
// ── Every route with motion on it, not just `/` (methodology-experience, Sprint 2) ─────────────
// This covered `/` alone, which was the whole product's motion surface when it was written. The
// methodology routes added transitions of their own (the index cards, the prev-link), and a rule
// that never gets the preference applied to it is a rule nobody has checked.
//
// A row in an array, deliberately the same shape as `PUBLIC_MOBILE_ROUTES` in
// `mobile-heuristics.browser.spec.ts`: covering the next route costs one line, which is what stops
// coverage from stalling at whatever existed the day the spec was written.
//
// Antigravity raised this in round 3 of PR #105 as "the reduced-motion block is no longer the final
// block in the stylesheet". That conclusion is wrong — `globals.css` says in its own comment that
// everything the motion tokens drive is switched off AT THE SOURCE by zeroing the tokens, so a rule
// added later needs no edit there and order does not matter. But the observation underneath it was
// right: this PR added motion, and nothing was asserting the outcome on the routes carrying it.
const MOTION_ROUTES = ['/', '/methodology', '/methodology/design-it'] as const

for (const route of MOTION_ROUTES)
  test(`with reduced motion requested, nothing on ${route} animates, transitions, or smooth-scrolls`, async ({
    page,
  }) => {
    // `page.emulateMedia` rather than `test.use({ reducedMotion })`: the fixture form sets the option
    // on the browser CONTEXT, and this project's context is already built from `devices['Desktop
    // Chrome']` in playwright.config.ts — the override did not reach the page here (observed: the
    // media query stayed false and `scroll-behavior` stayed `smooth`, while the same emulation applied
    // directly returns `auto`). Emulating on the page is unambiguous and asserted below by checking
    // the media query itself, so this can never silently test the wrong mode.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const response = await page.goto(route)
    expect(response?.status(), `${route} did not render`).toBe(200)

    const motion = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      // Every element still carrying motion, by class — the question is "does anything move", not
      // "does this one control move".
      //
      // ── Transitions and animations are counted SEPARATELY, and that is the point ────────────────
      // The first version tested `hasDuration && animationName !== 'none'`, one predicate joined by
      // AND. Every element with a live TRANSITION and no animation — which is every control on this
      // page — has `animationName: 'none'`, so the transition half of the assertion could never fire
      // and the "nothing transitions" guarantee was untested. The spec would have passed with every
      // hover transition intact. Caught in cross-family review of PR #95, and it is the same failure
      // this spec was written to catch one round earlier: a guard that looks like coverage and is not.
      const seconds = (value: string) => value.split(',').map((part) => parseFloat(part) || 0)
      const moving: string[] = []
      for (const node of document.querySelectorAll('*')) {
        const style = getComputedStyle(node)
        const label = `${node.tagName.toLowerCase()}.${(node.className || '').toString().split(' ')[0]}`
        if (seconds(style.transitionDuration).some((d) => d > 0)) moving.push(`${label} (transition)`)
        // An animation only counts when one is actually named — `animation-duration` reports a
        // non-zero default on elements that declare no animation at all.
        if (style.animationName !== 'none' && seconds(style.animationDuration).some((d) => d > 0)) {
          moving.push(`${label} (animation)`)
        }
      }
      return {
        queryMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrollBehavior: root.scrollBehavior,
        motionBase: root.getPropertyValue('--motion-base').trim(),
        motionQuick: root.getPropertyValue('--motion-quick').trim(),
        moving: [...new Set(moving)].slice(0, 10),
      }
    })

    // Asserted FIRST: if the emulation ever stops reaching the page, everything below passes
    // vacuously and this spec becomes the thing it exists to prevent.
    expect(motion.queryMatches, 'the reduced-motion emulation must actually reach the page').toBe(true)
    expect(motion.scrollBehavior, 'smooth scrolling must be off').toBe('auto')
    expect(motion.motionBase, 'the motion tokens are zeroed at the source').toBe('0ms')
    expect(motion.motionQuick).toBe('0ms')
    expect(motion.moving, `${route}: these still animate: ${motion.moving.join(', ')}`).toEqual([])
  })

// ── landing-maker-ops · Sprint 4, Story 4.1 ─────────────────────────────────────────────────────

// Story 2.4's acceptance, as a spec rather than as a promise in a comment.
//
// The mockup's version of this control is four `<button class="opstab">` with a click handler that
// swaps `textContent`: focusable, pressable, and completely silent about what it did. This asserts
// the three things that make it a real tablist rather than four styled divs — the roles, the
// selected state, and keyboard navigation — because all three are invisible to a type-checker and
// all three are what a screen-reader or keyboard user actually depends on.
test('the Ops tabs are a real, keyboard-operable tablist', async ({ page }) => {
  await page.goto('/')

  const tablist = page.locator('[role="tablist"]')
  await expect(tablist).toHaveCount(1)

  const tabs = tablist.getByRole('tab')
  await expect(tabs).toHaveCount(4)

  // Exactly one selected, and it is the only one in the tab order (the roving-tabindex pattern).
  await expect(tablist.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1)
  await expect(tablist.locator('[role="tab"][tabindex="0"]')).toHaveCount(1)

  const first = tabs.nth(0)
  const second = tabs.nth(1)
  await expect(first).toHaveAttribute('aria-selected', 'true')

  // The panel is associated with its tab in BOTH directions. A panel a tab does not point at is a
  // panel an assistive technology cannot follow the tab into.
  const controls = await first.getAttribute('aria-controls')
  await expect(page.locator(`#${controls}`)).toHaveAttribute('role', 'tabpanel')
  await expect(page.locator(`#${controls}`)).toHaveAttribute('aria-labelledby', 'ops-tab-product')

  // Arrow keys move selection — the part the mockup has no equivalent for at all.
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await expect(second).toBeFocused()
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('aria-selected', 'false')

  // End jumps to the last tab, and the panel follows rather than going stale.
  await page.keyboard.press('End')
  await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#ops-panel-fin')).toBeVisible()
})

// Epic D4. FinOps is the one section on this page describing something that does not exist, and the
// whole decision to ship it rested on it being unmistakably labelled. "Unmistakably" means the
// label is on the tab a reader has not opened yet AND inside the panel — not only in the panel,
// which a reader who never clicks the fourth tab will not see.
//
// It also asserts the negative that actually matters: the unbuilt surface must never be sold in the
// same vocabulary as the shipped ones. If someone later gives it a `live` badge, this goes red.
test('the unbuilt FinOps surface is labelled as next wherever it appears', async ({ page }) => {
  await page.goto('/')

  const finTab = page.locator('#ops-tab-fin')
  await expect(finTab.locator('.tag-next')).toHaveCount(1)
  await expect(finTab.locator('.tag-live')).toHaveCount(0)

  await finTab.click()
  const panel = page.locator('#ops-panel-fin')
  await expect(panel.locator('.tag-next')).not.toHaveCount(0)
  await expect(panel.locator('.tag-live')).toHaveCount(0)

  // And the section further down the page, which carries the concept panel.
  const finops = page.locator('#finops')
  await expect(finops.locator('.tag-next')).not.toHaveCount(0)
  await expect(finops.locator('.tag-live')).toHaveCount(0)
  await expect(finops).toContainText(/not built|nothing on this panel is built/i)
})

// ── The anchor contract, for EVERY link on the page ───────────────────────────────────────────
// Three separate review rounds found a dead in-page anchor: the nav's bare fragments on `/talk`
// (round 1), the CTA's gated-off fallback (round 2), and `#try` pointing at a section this epic
// deleted (round 8). Each was fixed individually and the next one was found by a human-tier
// reviewer reading the diff, because the specs only ever checked the nav and the hero.
//
// A dead anchor type-checks, renders, and silently does nothing when clicked — there is no signal
// anywhere except someone noticing. So this checks every one of them, which is the only version of
// this guard that can catch the fourth instance.
test('every in-page anchor on the landing page resolves to a section that exists', async ({ page }) => {
  await page.goto('/')

  const anchors = await page
    .locator('a[href*="#"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

  expect(anchors.length, 'the page should have in-page links').toBeGreaterThan(3)

  const seen = new Set<string>()
  for (const href of anchors) {
    // Only same-page targets. An external URL that happens to contain a fragment is not ours.
    if (/^https?:/.test(href)) continue
    const fragment = /#(.+)$/.exec(href)?.[1]
    if (!fragment) continue
    seen.add(fragment)
    await expect(
      page.locator(`#${fragment}`),
      `${href} points at #${fragment}, which is not on the page`
    ).toHaveCount(1)
  }

  expect(seen.size, 'no in-page anchors were actually checked — this guard would be vacuous').toBeGreaterThan(
    2
  )
})

// The same contract on `/talk`, which is where a BARE fragment actually breaks. A root-relative
// `/#pricing` is correct there (it navigates home and scrolls); a bare `#pricing` is inert. The
// distinction is invisible on `/`, which is exactly why round 1's bug survived.
test('no link on /talk is a bare in-page fragment', async ({ page }) => {
  await page.goto('/talk')

  const bare = await page
    .locator('a[href^="#"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

  expect(bare, 'a bare fragment on /talk resolves against /talk, where these sections do not exist').toEqual(
    []
  )
})

// ── agentic-pm-public-surface · Sprint 2, Story 2.3 ─────────────────────────────────────────────
//
// The nav spec above asserts every link it FINDS resolves. That is necessary and not sufficient
// here: it would pass just as happily if `Product` and `Proof` were still in the nav pointing at
// sections that still existed. What this epic claims is the opposite — that both are GONE — and a
// claim about absence needs its own assertion, because nothing else on the page can fail for it.
test('the retired sections are gone from the page and from the nav', async ({ page }) => {
  await page.goto('/')

  for (const id of ['product', 'proof']) {
    await expect(
      page.locator(`#${id}`),
      `#${id} was retired by this epic but is still on the page`
    ).toHaveCount(0)
  }

  const hrefs = await page
    .locator('.landing-nav__links a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))

  expect(hrefs, 'the nav should be Ops · Pricing · Methodology').toEqual([
    '/#ops',
    '/#pricing',
    '/methodology',
  ])

  // "Product" is RETIRED, not re-pointed at #ops (epic D4): a link labelled Product landing on a
  // section called Ops is a small lie that costs more than the link. Asserted on the label, because
  // the href check above would not notice a renamed link.
  const labels = await page
    .locator('.landing-nav__links a')
    .evaluateAll((links) => links.map((link) => link.textContent?.trim() ?? ''))
  expect(labels).not.toContain('Product')
  expect(labels).not.toContain('Proof')
})

// agentic-pm-public-surface · Sprint 2, Story 2.4 — the copy button's icon does not sit on its label.
//
// This defect was LIVE before this sprint and nobody had seen it: `tokens.css` gives `.btn-mini`
// padding and colour but no layout — no `display`, no `align-items`, no `gap` — so the inline SVG
// and the text node ran together and the glyph overlapped the first letter. It went unnoticed
// because the only prompt card was at the BOTTOM of the page. Story 2.1 put one in the hero.
//
// No existing assertion could have caught it. "The element exists", "the clipboard round-trips" and
// "no horizontal overflow" are all true of the broken rendering. It was found by taking a
// screenshot and looking at it, and it is pinned here as GEOMETRY so that specific regression
// cannot return (LEARNINGS, 2026-08-07 — assertions cover the properties you thought to name).
test('the copy button lays out its icon beside its label, not on top of it', async ({ page }) => {
  await page.goto('/')

  const buttons = page.locator('.prompt-card .btn-mini')
  const count = await buttons.count()
  expect(count, 'the page should render at least one copy-prompt button').toBeGreaterThan(0)

  for (let i = 0; i < count; i++) {
    // Measured against the LABEL, not against the button's own right edge. The first version of
    // this guard compared the icon to the button box and could not fail: a button is wide enough
    // that there is always room to its right, whether or not the glyph is sitting on the "c" of
    // "copy". It passed happily with the fix reverted. Caught by mutation-checking it, which is the
    // only thing that ever catches this (CODE-QUALITY #5b).
    //
    // The label is a bare text node with no element to locate, so its rectangle comes from a Range.
    const boxes = await buttons.nth(i).evaluate((el) => {
      const svg = el.querySelector('svg')
      const text = [...el.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0
      )
      if (!svg || !text) return null
      const range = document.createRange()
      range.selectNodeContents(text)
      const icon = svg.getBoundingClientRect()
      const label = range.getBoundingClientRect()
      return { iconRight: icon.right, labelLeft: label.left, labelWidth: label.width }
    })

    expect(boxes, 'the copy button should have both an icon and a text label').not.toBeNull()
    expect(boxes!.labelWidth, 'the label should render').toBeGreaterThan(0)
    expect(
      boxes!.labelLeft - boxes!.iconRight,
      'the icon overlaps its label — .btn-mini lost the flex layout globals.css gives it'
    ).toBeGreaterThan(0)
  }
})
