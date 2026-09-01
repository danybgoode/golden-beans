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
import {
  IMPACT_FEATURE_KEY,
  IMPACT_SERIES,
  SCENARIO_FLAG_KEY,
  readTenantRecord,
} from './helpers/authed-fixture'
import { booleanDefinition, seedFlagVersion } from './helpers/seed-flag'
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
    await expect(page.locator('.ds-listhead')).toContainText('Feature')
    await expect(page.locator('.ds-listhead')).toContainText('State in')

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
    await expect(page.locator('.ds-answer')).toContainText('production')
    await expect(page.locator('.ds-answer')).toContainText(/\.$/)

    // Story 1.3's actual promise — a filtered view is an ADDRESS. Asserted by navigating to one
    // directly rather than by clicking, because "survives a refresh and a paste into another
    // session" is the property, and clicking would prove only that the click worked.
    await page.goto(`/app/flags/${slug}?env=development&sort=state`)
    await expect(page.locator('[data-feature-list] .ds-listhead')).toContainText('State in development')
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

  // ⚠️ **`the credentials route renders both key kinds for an owner` is RETIRED — S4.5.** It drove
  // `/app/flag-credentials`, which is a permanent redirect now: both key kinds are minted and
  // revoked on Setup › Keys, for the same owner, with the same server actions. The coverage did not
  // go with the route — `e2e/flag-sync-keys.authed.spec.ts` drives the full mint-and-revoke round
  // trip at the new address, and `e2e/setup-keys.authed.spec.ts` pins all four kinds and the
  // member boundary. Named here rather than silently deleted, because a test that vanishes with the
  // page it tested is indistinguishable from coverage that was dropped.

  test('the audit route renders, and reads its actions as sentences', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flag-audit/${slug}`)

    await expect(page.getByRole('heading', { name: 'Flag audit', exact: true })).toBeVisible()
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

  test('a feature has its own address, with the six tabs', async ({ page }) => {
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    // Click through from the list, which is Story 2.1's promise — the row IS the way in.
    const firstFeature = page.locator('[data-feature-list] .ds-row-key').first()
    const key = (await firstFeature.innerText()).trim()
    test.skip(key === '', 'this tenant has no flag definitions yet')
    await firstFeature.click()

    await expect(page.getByRole('heading', { name: key })).toBeVisible()
    // ⚠️ THREE → SIX. Story 3.2 added Funnel and Impact — the two surfaces whose own nav entries
    // used to tell the reader to edit the URL — and split Targeting out of Value, which is what
    // makes Value fit on one screen. The list is exhaustive on purpose: asserting a subset would
    // stay green if a tab silently disappeared.
    //
    // They are LINKS with `aria-current`, not `role="tab"`: activating one navigates, and there is
    // no JS on this page to give a tablist its arrow keys. Same markup the shell's section tabs use.
    // ⚠️ SIX → SEVEN. Story 4.2 restores `Environments` as a TAB. It used to render as a table
    // ABOVE the strip, recorded there as a deliberate deviation from the approved design — the
    // deviation is withdrawn, because WAYS-OF-WORKING now says an approved design IS the contract
    // and the sprint's acceptance cites reference state `feature-environments` by name.
    const tabs = ['Value', 'Targeting', 'Environments', 'Funnel', 'Impact', 'History', 'Settings']
    const strip = page.getByRole('navigation', { name: 'Feature sections' })
    for (const tab of tabs) {
      await expect(strip.getByRole('link', { name: tab, exact: true })).toBeVisible()
    }
    await expect(strip.getByRole('link')).toHaveCount(tabs.length)
    // Exactly one is current, and it is the default. `aria-current` carries it to a screen reader,
    // not just to the pixels.
    await expect(strip.locator('[aria-current="page"]')).toHaveCount(1)
    await expect(strip.locator('[aria-current="page"]')).toHaveText('Value')

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

    // ⚠️ **This assertion is INVERTED as of Story 3.3, and the inversion is the story.**
    //
    // It used to read "…and the authoring form STAYS" — because at the time it did, and had to:
    // deleting it would have left no way to create a feature at all. Story 3.3 lands the
    // replacement (`new-feature.tsx`) in the same commit as the deletion, so the form goes, and
    // this line now pins the deletion rather than the near-miss that preceded it.
    //
    // Both halves are asserted together on purpose. An absence assertion alone would pass on a
    // blank page, and this epic has shipped guards that could not fail; a presence assertion alone
    // would not notice the duplicate surviving. Together they say the thing that matters: **exactly
    // one creation surface, and it is the new one.**
    await expect(page.locator('#flag-definition')).toHaveCount(0)
    await expect(page.locator('textarea')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Create immutable version' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Create an immutable definition version' })).toHaveCount(0)
    // The rule builder is the SECOND free-key creation path (A21 — A3 said there was one). It goes
    // with the first, and its own strings go with it.
    await expect(page.locator('.rule-builder')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Build a rule' })).toHaveCount(0)
    await expect(page.getByText('Show JSON')).toHaveCount(0)

    // The replacement, on the same page, in the same render.
    await expect(page.getByRole('button', { name: '+ New feature' })).toBeVisible()
  })

  test('the wizard is a real modal — focus stays in, and comes back out to the trigger', async ({ page }) => {
    // ⚠️ **This is the assertion the FIRST version of this control could not have passed.** It was a
    // `<div role="dialog" aria-modal="true">` over a scrim, and `aria-modal="true"` on a container
    // that does not trap focus is a claim the markup cannot keep: Tab walked out onto the page
    // behind it, and closing restored focus nowhere. It is a native `<dialog>` + `showModal()` now,
    // the pattern `ConfirmDialog` already proves in this repo.
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)
    await page.getByRole('button', { name: '+ New feature' }).click()
    await expect(page.locator('dialog[open]')).toBeVisible()

    // Twenty-five tabs. Focus may legitimately pass through the BROWSER's own chrome — where
    // `document.activeElement` reports `<body>` — but it must never land on a control belonging to
    // the page behind the dialog. Asserted as "which element", not as a boolean, so a failure names
    // what it escaped to.
    const escapes: string[] = []
    for (let press = 0; press < 25; press += 1) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null
        if (element === null) return 'null'
        if (element.closest('dialog[open]') !== null) return 'dialog'
        return element.tagName
      })
      if (where !== 'dialog' && where !== 'BODY') escapes.push(where)
    }
    expect(escapes, 'focus left the dialog for a control on the page behind it').toEqual([])

    // And it comes back. `showModal()`'s focus restoration only happens if the element is closed
    // through the native `close()` — which is why this component never unmounts the dialog, the
    // same trap `ConfirmDialog` records paying for once.
    await page.keyboard.press('Escape')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ New feature' })).toBeFocused()
  })

  test('the "New feature" wizard creates a feature and lands on it', async ({ page }) => {
    // ⚠️ **The end-to-end proof that the deletion above did not remove a capability.** Every other
    // assertion in this file is about what is absent; this one is about what replaced it, and it
    // goes all the way through the real server action to a real row.
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)
    await page.getByRole('button', { name: '+ New feature' }).click()

    const name = `probe_${Date.now().toString(36)}`
    await page.getByLabel('Feature name').fill(name)
    await page.getByLabel('What this controls').fill('Story 3.3 replacement-control smoke.')
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 2 cannot be left without BOTH answers — the footer says which one is missing rather than
    // leaving a dead button, so the note is asserted, not just the disabled state.
    const continueButton = page.getByRole('button', { name: 'Continue' })
    await expect(continueButton).toBeDisabled()
    await page.getByRole('button', { name: 'Release toggle' }).click()
    await expect(continueButton).toBeDisabled()
    await page.getByRole('button', { name: 'Medium risk' }).click()
    await continueButton.click()

    // The review names the key the code will import, composed from the area and the fixed ending.
    await expect(page.getByText(`${name}_enabled`).first()).toBeVisible()
    await page.getByRole('button', { name: 'Create feature' }).click()

    // It lands ON the new feature — which is where its switch is, because the wizard turns nothing
    // on (one write path, one validator: it creates a definition and nothing else).
    await page.waitForURL(new RegExp(`/app/flags/${slug}/${name}_enabled$`))
    await expect(page.getByRole('heading', { name: `${name}_enabled` })).toBeVisible()
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
    const lede = page.locator('.ds-answer').first()
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
      const rows = await page.locator('[data-feature-list] .ds-row').count()
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
    await expect(page.locator('[data-feature-list] .ds-row').first()).toBeVisible()
  })

  test('searching turns grouping off — the rows you asked for are never collapsed away', async ({ page }) => {
    // Story 3.1's own rule. A filtered view has no uniform majority to summarise, and hiding a row
    // the reader just searched for hides the answer they asked for.
    await page.goto(`/app/flags/${tenantSlug()}?q=gb`)
    // ⚠️ Was `locator('details', …)`, which is green on EVERY input — the redesign renders the
    // dormant summary as a div and there is no `<details>` on this page at all, filtered or not. A
    // guard that cannot fail is the failure mode `sprint-3.md` warns about in its own build
    // contract, eight lines from the end.
    // ⚠️ This asserted `toHaveCount(0)` on `?q=gb` — and the fixture tenant renders NO dormant
    // summary on any input (it is all-dormant, so `groupDormantFlagRows` declines to group). The
    // assertion was 0 before the filter and 0 after: green on every input, which is the same
    // "guard that cannot fail" its own comment claimed to be replacing (fresh reviewer, round 2).
    //
    // The honest version compares the two states rather than asserting an absolute. If the unfiltered
    // page has no summary either, the comparison proves nothing and says so instead of passing.
    const unfiltered = await page.goto(`/app/flags/${tenantSlug()}`).then(async () => {
      await page.waitForLoadState('networkidle')
      return page.locator('[data-dormant-summary]').count()
    })
    test.skip(
      unfiltered === 0,
      'this tenant renders no dormant summary unfiltered, so "searching turns grouping off" has nothing to compare against — the rule is covered exhaustively in lib/flag-list-view.test.ts'
    )
    await page.goto(`/app/flags/${tenantSlug()}?q=gb`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-dormant-summary]')).toHaveCount(0)
  })
})

// ── console-ia-overhaul · Sprint 3, Story 3.2 — Funnel and Impact, on the feature ─────────────
//
// ⚠️ **The honest empty state IS the deliverable, and that is what most of this asserts** (A4).
// Live production 2026-08-27: the TARS registry holds ONE row for `miyagisanchez` — `setup_guide` —
// against 42 flag definitions, and the join on `key` returns ZERO. So for every feature a reader
// can click today, these tabs render a sentence rather than a number, and the thing worth pinning
// is that the sentence names WHICH absence it is and that the page still serves 200.
//
// Both halves are covered, which is the part that needed arranging: a flag with no TARS twin (the
// common case) and one WITH a linked input (the case that proves the read path is real). The second
// needs a flag whose key matches the impact fixture's `feature_key`, so this suite seeds one.

test.describe('Story 3.2 — a feature carries its own funnel and impact', () => {
  test.skip(
    () => !isFlagConsoleEnabled(),
    'the console renders behind FLAG_CONSOLE_ENABLED; this pass needs it on'
  )

  test('the Funnel tab explains the absence — it does not 404 and it does not show a zero', async ({
    page,
  }) => {
    const slug = tenantSlug()
    const base = `/app/flags/${slug}/${encodeURIComponent(SCENARIO_FLAG_KEY)}`

    // ⚠️ **The status code is the assertion, not decoration.** A4's first hard constraint is that
    // the tab must NOT call `notFound()` — `app/app/funnel/[projectSlug]/[featureKey]/page.tsx:26`
    // does exactly that on `feature_not_found`, and a tab that 404s the whole feature page because
    // the OTHER registry has no row is a regression caused by a missing measurement. Asserted on
    // the response, because the rendered sentence looks the same either way to a reader.
    const response = await page.goto(`${base}?tab=funnel`)
    expect(response?.status(), 'the Funnel tab must not 404 a feature that exists').toBe(200)

    // It names which absence this is — two registries, not one broken number.
    await expect(page.getByText('Nothing is measuring this yet')).toBeVisible()
    await expect(page.getByText(/nothing in the TARS registry is measuring it/)).toBeVisible()

    // ⚠️ And NEVER a zero. "Measured, and the answer is nothing" is a different claim from "nobody
    // is measuring this", and rendering the first when the second is true is the failure this repo
    // has shipped to production before (`lib/tars-query.ts` filters on a tag the realistic caller
    // has no reason to set — LEARNINGS records four instances).
    await expect(page.locator('.ds-kpis .ds-stat')).toHaveCount(0)

    // The same shape on Impact, whose absence has a different sentence because it is a different
    // fact: nothing is linked, rather than nothing is measured.
    const impact = await page.goto(`${base}?tab=impact`)
    expect(impact?.status(), 'the Impact tab must not 404 a feature that exists').toBe(200)
    await expect(page.getByText('No impact to attribute yet')).toBeVisible()
    // ⚠️ **The two absences say DIFFERENT things**, and asserting only the headline would have
    // passed on the version that blamed the TARS registry for both (cross-review, agy). Impact
    // misses on `feature_inputs`, not on `features` — a North Star input has to be LINKED, which is
    // a different act in a different table, and telling an operator otherwise sends them to fix the
    // wrong thing.
    await expect(page.getByText(/no North Star input is linked to it/)).toBeVisible()
    await expect(page.getByText(/TARS registry/)).toHaveCount(0)
    await expect(page.locator('.ds-kpis .ds-stat')).toHaveCount(0)
  })

  test('the Impact tab renders NUMBERS when an input is actually linked', async ({ page }) => {
    // ⚠️ **Without this the suite would only ever have proved the empty state**, which is the
    // failure mode A4's own note warns about from the other direction: a tab that renders nothing
    // and a tab that cannot render anything look identical from the outside.
    //
    // The auth fixture already links a North Star input to `IMPACT_FEATURE_KEY` and seeds its
    // series; what it has no reason to create is a FLAG with that key, because the two registries
    // are unrelated. Seeding one here is the whole trick, and it is also a live demonstration of
    // A4's point: the join hits only when somebody deliberately makes the two keys match.
    const slug = tenantSlug()
    await seedFlagVersion(
      IMPACT_FEATURE_KEY,
      booleanDefinition('Story 3.2 impact-tab fixture.'),
      'Story 3.2 impact-tab fixture.'
    )

    const base = `/app/flags/${slug}/${encodeURIComponent(IMPACT_FEATURE_KEY)}`
    const response = await page.goto(`${base}?tab=impact`)
    expect(response?.status()).toBe(200)

    // Three readings, from the series the fixture seeded — asserted as a COUNT of tiles plus the
    // latest value, so a pane that rendered the right shape with the wrong numbers still fails.
    await expect(page.locator('.ds-kpis .ds-stat')).toHaveCount(3)
    const latest = IMPACT_SERIES[IMPACT_SERIES.length - 1]
    await expect(page.locator('.ds-kpis .ds-stat-value').first()).toHaveText(String(latest.value))
    // The correlation caveat rides with the numbers. It is the one claim this pane could overstate.
    await expect(page.getByText(/not a causal claim/)).toBeVisible()

    // ⚠️ And its FUNNEL is still empty, on the same feature, in the same run — because
    // `feature_inputs` and `features` are two different tables. That pairing is A4 stated as a test
    // rather than as a paragraph.
    await page.goto(`${base}?tab=funnel`)
    await expect(page.getByText('Nothing is measuring this yet')).toBeVisible()
  })

  test('the standalone funnel and impact routes still work and keep their URLs', async ({ page }) => {
    // Story 3.2's own criterion: old links do not break, they simply stop being the only way in.
    // Both left the NAV in Story 1.2 (their descriptions told the reader to edit the URL); neither
    // left the product.
    const slug = tenantSlug()
    const impact = await page.goto(`/app/impact/${slug}/${encodeURIComponent(IMPACT_FEATURE_KEY)}`)
    expect(impact?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: new RegExp(IMPACT_FEATURE_KEY) })).toBeVisible()
  })
})
