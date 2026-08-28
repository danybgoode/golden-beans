// flags-console-parity · Sprint 3, Story 3.4 — the console's RENDERED surfaces, signed in.
//
// ── What this covers that nothing else could ──────────────────────────────────────────────────
// `flag-console-dark.spec.ts` proves the GATE: 404 dark, login redirect lit. It cannot prove the
// pages render, because the `api` project has no session and every one of these routes is
// credential-gated — it only ever sees the redirect.
//
// So this is the other half, and it was owed: Sprint 3 shipped two new routes and a rewritten list
// with no automated assertion that any of them render at all. The epic's own review found the same
// shape of hole twice (a spec left pointing at a moved surface, and three suites skipped rather than
// ported), which is the argument for writing this before the flip rather than after.
//
// Opt-in, like every `*.authed.spec.ts`: it needs a real session and a real Supabase, so it is
// outside the merge gate by design. Run it deliberately — `npm run test:e2e:authed`.

import { test, expect } from '@playwright/test'
import { readTenantRecord } from './helpers/authed-fixture'
import { isFlagConsoleEnabled } from '../lib/flags'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag console smoke requires the auth-setup project')
  return slug
}

test.describe('the flag console, signed in', () => {
  // The whole file asserts the LIT surfaces. Skipping while dark is honest rather than lazy: with
  // the gate off these routes 404 by design, and a spec that "passed" against a 404 would be
  // asserting the opposite of what it claims.
  test.skip(
    () => !isFlagConsoleEnabled(),
    'the console renders behind FLAG_CONSOLE_ENABLED; this pass needs it on'
  )

  test('the feature list renders, and its filters live in the URL', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // ⚠️ The list is no longer a <table>. The approved design (console-ia-overhaul) renders flex
    // rows, so `getByRole('table')` asserted markup that no longer exists — and would have kept
    // failing on a correct page. Pinned on the list's own hook and its rendered column labels.
    await expect(page.locator('[data-feature-list]')).toBeVisible()
    await expect(page.locator('.listhead')).toContainText('Feature')
    await expect(page.locator('.listhead')).toContainText('State in')

    // Story 1.4: the environment selector — now in the RAIL, not as chips in the page body
    // (CONSOLE-CONTRACT.md Do-not #5; Story 1.4 asked for this and it never landed).
    await expect(page.locator('.console-rail .envpick')).toBeVisible()
    await expect(page.locator('.console-rail .envpick')).toContainText('production')

    // The sentence that says what the list reports on. It used to read "WHAT THIS LIST REPORTS IS
    // WHAT PRODUCTION IS SERVING" in uppercase mono — a column-label style used as body copy
    // (Do-not #3). The approved design replaces it with the answer line, which says the same thing
    // and also names WHICH features are serving.
    // Asserted on the SHAPE, not the word "serving": this fixture tenant has nothing switched on,
    // where the correct sentence is "Nothing is on in production — …". The first version demanded
    // "serving" and failed on a correct page, which is the same mistake as the broken stem it was
    // meant to guard — assuming every project has something on.
    await expect(page.locator('.answer')).toContainText('production')
    await expect(page.locator('.answer')).toContainText(/\.$/)

    // Story 1.3's actual promise — a filtered view is an ADDRESS. Asserted by navigating to one
    // directly rather than by clicking, because "survives a refresh and a paste into another
    // session" is the property, and clicking would prove only that the click worked.
    await page.goto(`/app/flags/${slug}?env=development&sort=state`)
    await expect(page.locator('[data-feature-list] .listhead')).toContainText('State in development')
  })

  test('an unknown parameter is dropped rather than echoed back into the page', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}?sort=%3Cimg%3E&evil=%3Cscript%3E`)

    // ── Asserted on the LINKS the page builds, not on the whole document ──────────────────────
    // The first version checked `page.content()` for 'evil=' and failed on a CORRECT build: Next's
    // RSC payload embeds the request URL in a <script> on every page, so the raw parameter is in the
    // document no matter what the app does. That is framework plumbing, not an echo — the property
    // that actually matters is that no CONTROL on the page carries an unrecognised parameter
    // forward, because `buildFlagListQuery` writes from the parsed struct.
    //
    // Found by running this suite for the first time; it is the same lesson this epic keeps
    // relearning — a guard asserting the wrong SCOPE reports on something other than its claim.
    const hrefs = await page
      .locator('main a')
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''))
    for (const href of hrefs) {
      expect(href, 'a control carried an unknown parameter forward').not.toContain('evil=')
      expect(href, 'a control echoed an unrecognised sort').not.toContain('sort=%3Cimg')
    }
    // ...and the page still renders rather than erroring on the junk.
    await expect(page.locator('[data-feature-list]')).toBeVisible()
  })

  test('the credentials route renders both key kinds for an owner', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flag-credentials/${slug}`)

    await expect(page.getByRole('heading', { name: `Flag credentials — ${slug}` })).toBeVisible()
    // Both tables and both minting forms — the four things Story 3.1 moved.
    await expect(page.getByRole('table').filter({ hasText: 'Snapshot keys' })).toBeVisible()
    await expect(page.getByRole('table').filter({ hasText: 'Catalog sync keys' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mint 30-day snapshot key' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mint 30-day catalog sync key' })).toBeVisible()
  })

  test('the audit route renders, and reads its actions as sentences', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flag-audit/${slug}`)

    await expect(page.getByRole('heading', { name: `Flag audit — ${slug}` })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'What changed' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Feature' })).toBeVisible()

    // D7 on the surface that most tempted the storage vocabulary: the audit stores
    // `definition_created` / `activated` / `deactivated` and must never render them.
    const body = await page.locator('main').innerText()
    for (const stored of ['definition_created', 'activated', 'deactivated']) {
      expect(body, `the audit rendered the stored value "${stored}" instead of a sentence`).not.toContain(
        stored
      )
    }
  })

  test('a feature has its own address, with the three tabs', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // Click through from the list, which is Story 2.1's promise — the row IS the way in.
    const firstFeature = page.locator('[data-feature-list] .row-key').first()
    const key = (await firstFeature.innerText()).trim()
    test.skip(key === '', 'this tenant has no flag definitions yet')
    await firstFeature.click()

    await expect(page.getByRole('heading', { name: key })).toBeVisible()
    for (const tab of ['Value', 'History', 'Settings']) {
      await expect(page.getByRole('link', { name: tab, exact: true })).toBeVisible()
    }

    // Each environment named with its state — the epic's outcome test in miniature, and the reason
    // "never turned on here" exists as a distinct state at all.
    for (const environment of ['development', 'preview', 'production']) {
      await expect(page.getByText(environment, { exact: true }).first()).toBeVisible()
    }
  })

  test('the flags page no longer carries the credential forms once the console owns them', async ({
    page,
  }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // The move, asserted from the side that LOST them. Both are gate-conditional, so with the
    // console on they must be absent here and present on their own route — never in both places,
    // and never in neither.
    await expect(page.getByRole('button', { name: 'Mint 30-day snapshot key' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Lifecycle audit' })).toHaveCount(0)

    // ...and the authoring form STAYS, which is the near-miss Story 3.3 caught: it shared a JSX
    // block with the credential forms, so gating them hid it too — leaving no way to create a flag.
    //
    // Scoped to the TEXTAREA form, because two controls carry this exact label: the rule builder's
    // (disabled until its draft validates) and this one. An unscoped `getByRole` resolves to both
    // and fails on strict mode — which is what it did the first time this suite was run, and the
    // same ambiguous-locator class `flag-rule-builder.authed.spec.ts` already records twice.
    // `textareaSubmit` there solves it identically; this is that shape, not a new one.
    await expect(
      page
        .locator('form')
        .filter({ has: page.locator('#flag-definition') })
        .getByRole('button', { name: 'Create immutable version' })
    ).toBeVisible()
  })
})

// ── console-ia-overhaul · Sprint 3, Story 3.1 — the answer line and the dormant collapse ──────
//
// ⚠️ NOT in the blocking gate (`authed` is opt-in). Run with `npm run test:e2e:authed` and
// `FLAG_CONSOLE_ENABLED=true`; the PR body states the run and its result rather than implying CI
// covered it. The arithmetic and the words are unit-tested in `lib/`; what only a browser can show
// is that they reached the page and that the disclosure actually collapses.

test.describe('Story 3.1 — the features list answers in one line', () => {
  // Same predicate the file already uses above — `isFlagConsoleEnabled()` rather than a raw env
  // read, so this suite cannot disagree with the gate the page itself consults.
  test.skip(
    () => !isFlagConsoleEnabled(),
    'the console renders behind FLAG_CONSOLE_ENABLED; this pass needs it on'
  )

  test('the answer line is the first thing on the list, and never announces a zero', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // Asserted on a PARSED value, not a rendered substring: `toContainText` normalises whitespace,
    // which is how `flags-visual-rule-builder`'s most important check ended up asserting nothing.
    // `.answer` is the approved design's name for the page's lede — a gold-bordered line, not the
    // generic `.lede` class the pre-redesign page used.
    const lede = page.locator('.answer').first()
    await expect(lede).toBeVisible()
    const line = ((await lede.innerText()) ?? '').trim()

    // The shape that must hold in EVERY tenant, including this fixture: it is a sentence about an
    // environment, and no clause in it reports an empty category.
    expect(line, 'the answer line is empty').not.toBe('')
    expect(line, 'the answer line does not end as a sentence').toMatch(/\.$/)
    expect(
      /\b0 (features?|deliberately|never)/.test(line),
      `the answer line announced an empty category: ${line}`
    ).toBe(false)
  })

  test('never-turned-on features collapse behind ONE disclosure row', async ({ page }) => {
    await page.goto(`/app/flags/${tenantSlug()}`)

    // One summary ROW, not a <details> holding fifteen more rows — the approved design collapses
    // every dormant feature into a single line with a "Show them" link.
    const disclosure = page.locator('[data-dormant-summary]')
    const count = await disclosure.count()
    if (count === 0) {
      // ⚠️ No dormant summary. On THIS fixture the reason is the ALL-DORMANT rule, not the
      // fewer-than-two rule — every flag it provisions is untouched, and collapsing all of them
      // would leave a table with no rows and no empty state. An earlier comment named the wrong
      // rule (fresh reviewer, PR #124), which mattered because it made the branch read as a
      // small-data quirk rather than a deliberate behaviour with its own regression test.
      //
      // Stated plainly: the meaningful half of this test — "Show them" → `state=never` → rows —
      // does NOT execute on this fixture. It is covered exhaustively in `flag-list-view.test.ts`,
      // where the dataset is controlled.
      const rows = await page.locator('[data-feature-list] .row').count()
      expect(rows, 'no disclosure AND no rows — the list did not render at all').toBeGreaterThan(0)
      return
    }

    // ⚠️ The design does not expand in place — it LINKS. A <details> that pages inside itself
    // re-collapses on every navigation, so the dormant group is one row plus "Show them", which
    // goes to the exact `state=never` view where paging already works.
    //
    // So the property is no longer "collapsed then expands". It is: one line stands for many, and
    // it offers a way to see them. Asserting the old behaviour here would be asserting a control
    // the approved design deliberately does not have.
    await expect(disclosure).toContainText('never been turned on')
    const showThem = disclosure.getByRole('link', { name: /Show them/i })
    await expect(showThem).toBeVisible()
    await showThem.click()
    await expect(page).toHaveURL(/state=never/)
    // And the destination actually lists them, rather than being a link to nowhere.
    await expect(page.locator('[data-feature-list] .row').first()).toBeVisible()
  })

  test('searching turns grouping off — the rows you asked for are never collapsed away', async ({ page }) => {
    // Story 3.1's own rule. A filtered view has no uniform majority to summarise, and hiding a row
    // the reader just searched for hides the answer they asked for.
    await page.goto(`/app/flags/${tenantSlug()}?q=gb`)
    // ⚠️ Was `locator('details', …)`, which is green on EVERY input — the redesign renders the
    // dormant summary as a div and there is no `<details>` on this page at all, filtered or not. A
    // guard that cannot fail is the failure mode `sprint-3.md` warns about in its own build
    // contract, eight lines from the end.
    await expect(page.locator('[data-dormant-summary]')).toHaveCount(0)
  })
})
