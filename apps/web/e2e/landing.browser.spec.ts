import { test, expect } from '@playwright/test'

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

test('the landing renders the v2 narrative', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('nav.gb')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your roadmap has')

  // Both copy-a-prompt blocks are present — the `#try` handoff prompt and the closing decision
  // prompt. These are the page's two "use this without an account" affordances and the only
  // interactive client components on it.
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

  // The interior is byte-identical — the trim touches the ends only. Asserted separately because
  // a handler that collapsed newlines would still pass a naive equality check against a
  // similarly-collapsed `innerText`.
  expect(clipboard.split('\n').length).toBeGreaterThan(5)
  expect(clipboard).toContain('\n\n')
})

// Epic D4, and the finding that proved it needs a spec rather than a convention.
//
// This page renders illustrated agent conversations AND one real read of the demo tenant, in
// deliberately identical chrome. The `SurfaceNote` above each frame is the only thing telling them
// apart. Cross-family review of PR #92 found the hero's note saying merely "In ChatGPT, Claude, or
// your agent" — describing where the conversation happens, never that its lift and confidence
// figures were invented — while the footer's ledger already claimed the hero was labelled as an
// illustration. The page was asserting a label it did not have.
//
// So: every agent window on this page carries a note, and each note commits to real or illustrated.
test('every framed agent window says whether it is real or an illustration', async ({ page }) => {
  await page.goto('/')

  const windows = page.locator('.agent-win')
  const count = await windows.count()
  expect(count, 'the page should render agent windows').toBeGreaterThan(0)

  const notes = await page.locator('.surface-note').allInnerTexts()
  expect(
    notes.length,
    'every framed surface needs a note — an unlabelled frame is the failure this guards'
  ).toBeGreaterThanOrEqual(count)

  for (const note of notes) {
    expect(
      /illustration|example|real read/i.test(note),
      `a surface note must commit to real or illustrated, got: ${note}`
    ).toBe(true)
  }
})

// Every nav link points at a section that exists. A dead in-page anchor is invisible to a
// type-checker, silently does nothing when clicked, and is exactly the kind of rot a redesign
// introduces — the nav was rewritten in the same commit as the section ids it points at.
test('every nav link resolves to a section on the page', async ({ page }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.landing-nav__links a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs.length).toBeGreaterThan(0)

  for (const href of hrefs) {
    expect(href, 'nav links are in-page anchors').toMatch(/^#/)
    await expect(page.locator(href), `${href} has no target on the page`).toHaveCount(1)
  }
})

// The hero's two CTAs are the page's primary actions, and both are in-page anchors rather than
// routes — so nothing type-checks them either.
test('the hero CTAs resolve to sections on the page', async ({ page }) => {
  await page.goto('/')

  const hrefs = await page
    .locator('.hero .hero-cta a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
  expect(hrefs).toEqual(['#connect', '#try'])

  for (const href of hrefs) {
    await expect(page.locator(href), `${href} has no target on the page`).toHaveCount(1)
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

// Story 1.1 (epic D1). The rename is public-surfaces-only, and the ONE deliberate survivor is the
// npm package name in §9 — `@golden-beans/sdk` is the package that actually exists, and
// CODE-QUALITY.md #9 says a public claim must be checkable.
//
// Naming that exception here rather than loosening the matcher is the point: if the package is ever
// republished, this test fails and tells the next person exactly which line to change.
test('the page is called Golden Frijoles, with one named exception', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Golden Frijoles/)
  await expect(page.locator('.brand-lockup__type strong').first()).toHaveText('golden frijoles')

  const body = await page.locator('body').innerText()
  const survivors = body.split('\n').filter((line) => /golden bean/i.test(line))

  for (const line of survivors) {
    expect(
      line.includes('@golden-beans/sdk'),
      `"${line.trim()}" still says Golden Beans and is not the npm package exception`
    ).toBe(true)
  }
})

// Story 1.5 (epic D4). The section number is a drawn disc, not a `①` glyph — and the prop that
// feeds it is typed `number`, so the glyph cannot come back through the front door either.
test('section dividers carry a legible numbered stamp', async ({ page }) => {
  await page.goto('/')

  const stamps = page.locator('.divider__stamp')
  await expect(stamps.first()).toBeVisible()
  expect(await stamps.count()).toBeGreaterThanOrEqual(10)

  await expect(stamps.first()).toHaveText('1')

  const box = await stamps.first().boundingBox()
  expect(box!.width, 'the stamp must be a real target, not a text glyph').toBeGreaterThanOrEqual(24)

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

  // And the selection a real gesture produces still hugs the words rather than running the full
  // width of the viewport. Triple-click is the gesture that reproduced the report.
  await paragraph.click({ clickCount: 3 })
  const widest = await page.evaluate(() => {
    const selection = getSelection()
    if (!selection?.rangeCount) return null
    return Math.max(...[...selection.getRangeAt(0).getClientRects()].map((rect) => rect.width))
  })
  expect(widest, 'a paragraph must actually be selectable by triple-click').not.toBeNull()
  expect(widest!).toBeLessThanOrEqual(390)
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

// Story 2.3 / epic D5. The drills describe a capability whose gates are OFF in production, and the
// section must say so — by READING the flag, not by carrying a sentence someone has to remember to
// update. Both branches are pinned so the honest state cannot quietly disappear, and neither can a
// badge outlive its gate being switched on.
//
// The spec derives each expectation from the same fact the page derives it from rather than
// hardcoding "there is a badge": this suite runs against local, preview and production, where the
// flags differ. A test that assumed one state would have to be edited at launch — and would pass
// for the wrong reason in between.
//
// ── The two cards ride SEPARATE gates, and are therefore checked separately ───────────────────
// `RESILIENCE_SCENARIOS_ENABLED` and `SECURITY_SIMULATIONS_ENABLED` are independent by design: a
// production owner may allow an internal fault drill without authorizing an active security probe
// (`lib/flags.ts`). The first version of this spec probed only the chaos route and then asserted a
// section-wide `count() > 0`, which meant a wrong or missing badge on the SECURITY card passed
// silently — a test that cannot fail for half its subject (CODE-QUALITY.md #5). Caught in
// cross-family review of PR #95.
const DRILL_GATES = [
  { card: 0, name: 'chaos', route: '/api/v1/scenarios/execution' },
  { card: 1, name: 'security', route: '/api/v1/scenarios/security' },
] as const

test('each resilience drill declares whether its own gate is switched on', async ({ page, request }) => {
  await page.goto('/')

  const section = page.locator('#resilience')
  await expect(section).toBeVisible()
  await expect(section.locator('.drill-card')).toHaveCount(DRILL_GATES.length)

  for (const gate of DRILL_GATES) {
    // Each route answers 404 while its own gate is shut and something else once it is open — the
    // same fact its badge reports, obtained independently of the page. The bodies are deliberately
    // empty: a 400 is as good as a 200 here, because both prove the gate let the request through.
    const probe = await request.post(gate.route, { data: {}, failOnStatusCode: false })
    const shut = probe.status() === 404

    const badge = section.locator('.drill-card').nth(gate.card).locator('.drill-card__gate')
    if (shut) {
      await expect(badge, `the ${gate.name} drill is gated and must say so`).toHaveCount(1)
      await expect(badge).toContainText(/not switched on/i)
    } else {
      await expect(
        badge,
        `the ${gate.name} drill is live and must not still claim it is switched off`
      ).toHaveCount(0)
    }
  }
})

// Story 2.2 / epic D6. The infomercial is the one place on this page where invented content is
// allowed, and it is allowed ONLY because it is labelled at the point of the claim. If a future
// edit drops the disclaimer, the page is left with three fabricated testimonials presented as real
// — on a page whose entire argument is that claims should be checkable.
test('every invented thing in the infomercial is labelled as invented', async ({ page }) => {
  await page.goto('/')

  const band = page.locator('#infomercial')
  await expect(band).toBeVisible()

  const text = await band.innerText()
  expect(text, 'the testimonials must disclaim themselves').toMatch(/we wrote these/i)
  expect(text, 'the headline asterisk must resolve').toMatch(/cannot fix your org/i)

  // The struck-through price is a real <s>, not the mockup's literal `~~$999~~` markdown.
  await expect(band.locator('s')).toHaveCount(1)
  expect(text).not.toContain('~~')
})
