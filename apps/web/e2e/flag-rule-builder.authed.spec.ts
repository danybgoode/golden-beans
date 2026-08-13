// flags-visual-rule-builder · Sprint 1 QA.
//
// ── Why this is an `authed` browser spec and not an `api` one ─────────────────────────────────
// sprint-1.md asked for an api spec plus a `flag-rule-builder-dark.spec.ts` following
// `flag-serving-dark.spec.ts`. Both assumed a route. **This epic adds no route** (A1): the builder
// posts through the server action the textarea already used, so there is no endpoint for an api
// spec to call and no 404 for a dark spec to assert. Writing one anyway would produce a spec that
// passes without exercising anything — the "unreachable by construction" false green CODE-QUALITY
// rule 5 names.
//
// The coverage is therefore split where the code actually is:
//   • the pure seams — clause serialisation, basis-points conversion, cap-from-constant — are unit
//     tested against the REAL parser in lib/flag-rule-draft.test.ts and lib/rollout-percent.test.ts
//     (31 assertions, no browser, and mutation-checked).
//   • the gate's dark behaviour is asserted directly on the resolver in lib/flags.test.ts, via the
//     shared registry table: unset, exactly 'true', and nine near-misses. This is the
//     agent-rail-visibility precedent — a guard behind a session that the api project cannot reach
//     gets extracted and asserted, not tested through a surface the harness cannot log into.
//   • what neither of those can see — that the CONTROLS produce the right bytes — is this file.
//
// This spec replaces the browser smoke Sprint 1 owed the product owner for the 10%-means-1000
// check, which is the one step the epic README calls the most important in the whole build.

import { test, expect } from '@playwright/test'
import {
  FLAG_ENVIRONMENTS,
  MAX_FLAG_CLAUSES,
  explainFlagEvaluation,
  type FlagDefinition,
} from '@golden-frijoles/sdk'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag rule builder smoke requires the auth-setup project')
  return slug
}

const flagKey = () => `builder.smoke_${Date.now().toString(36)}`

/**
 * The TEXTAREA form's submit button, scoped by the control only that form contains.
 *
 * ── Why this helper exists (found while building Sprint 2) ────────────────────────────────────
 * Sprint 1's rejection probe below reached for `getByRole('button', { name: 'Create immutable
 * version' }).first()`. The builder and the textarea form use the same words on their submit
 * buttons, and the builder renders FIRST — so `.first()` was the BUILDER's button, which is
 * disabled whenever its form has problems, which an untouched form always does. The probe would
 * have hung on an unclickable element rather than testing the textarea. It was never caught because
 * the `authed` Playwright project does not run in CI (see playwright.config.ts) and Sprint 1's
 * signed-in walkthrough is still owed to the product owner.
 *
 * Positional locators over two identically-worded buttons are the defect; scoping by the control
 * that distinguishes the two forms is the fix, and it cannot silently re-point if a third form with
 * the same verb ever lands on this page.
 */
const textareaSubmit = (page: import('@playwright/test').Page) =>
  page
    .locator('form')
    .filter({ has: page.locator('#flag-definition') })
    .getByRole('button', { name: 'Create immutable version' })

/**
 * Create an immutable version through the JSON TEXTAREA.
 *
 * Module scope because Sprints 2 and 3 both need it: the textarea is the surface that can express a
 * metadata entry (Story 2.3's fallback case) and an arbitrary rule shape (Sprint 3's fixtures), and
 * using it keeps those assertions independent of the builder's own controls.
 */
async function createVersion(
  page: import('@playwright/test').Page,
  key: string,
  value: FlagDefinition,
  reason: string
) {
  await page.locator('#flag-key').fill(key)
  await page.locator('#flag-definition').fill(JSON.stringify(value, null, 2))
  await page.locator('#flag-reason').fill(reason)
  await textareaSubmit(page).click()
  await expect(page.getByRole('status').filter({ hasText: `Created ${key}` })).toBeVisible()
}

/** One flag's article, located by its own heading rather than by position (A9). */
const flagOf = (page: import('@playwright/test').Page, key: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name: key }) })

test.describe('the visual rule builder', () => {
  test.skip(
    process.env.FLAG_RULE_BUILDER_ENABLED !== 'true',
    'the builder is gated; this pass needs FLAG_RULE_BUILDER_ENABLED=true'
  )

  test('a rule built from controls stores 10% as 1000 basis points', async ({ page }) => {
    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)

    const builder = page.locator('.rule-builder')
    await expect(builder).toBeVisible()

    await builder.getByLabel('Flag key').fill(key)
    await builder.getByLabel('Description').fill('Rule builder round-trip smoke.')

    await builder.getByRole('button', { name: 'Add a rule' }).click()

    // D1, asserted rather than assumed: the enum is closed at six and the operators at two. If the
    // component ever hand-lists either, this is where the extra option shows up.
    const fieldSelect = builder.getByLabel('Condition 1 — field')
    await expect(fieldSelect.locator('option')).toHaveCount(6)
    await expect(builder.getByLabel('Operator').locator('option')).toHaveCount(2)

    await fieldSelect.selectOption('plan')
    await builder.getByLabel('Operator').selectOption('equals')
    await builder.getByLabel('Value').fill('pro')
    // `{ exact: true }` because `getByLabel` matches on SUBSTRING, and the builder has two selects
    // whose labels are prefixes of one another: the definition-level "Serves variant when no rule
    // matches" and the rule card's "Serves variant". Without it the locator resolves to two elements
    // and the test dies at the exact step the epic calls its most important — the 10%-means-1000
    // check. Found by RUNNING the authed project for the first time (2026-08-10); it is the third
    // ambiguous-locator defect in this one file, after A9's two, and the third is the proof of A9's
    // second half: a spec no pipeline runs is a spec that decays silently.
    await builder.getByLabel('Serves variant', { exact: true }).selectOption('on')
    await builder.getByLabel('Rollout (%)').fill('10')
    await builder.getByLabel('Reason').fill('Rule builder round-trip smoke.')

    // THE assertion of the epic. Not 10, not 100000. The JSON disclosure renders exactly what the
    // action will send, so reading it here reads the bytes that get stored.
    //
    // ── Asserted on the PARSED value, not on rendered substrings (found 2026-08-10) ─────────────
    // This was three `toContainText` checks, and one of them **could never pass**: Playwright
    // normalises whitespace before a substring match, so the trailing `\n` in
    // `not.toContainText('"basisPoints": 10\n')` was stripped — leaving `"basisPoints": 10`, which
    // is a prefix of `"basisPoints": 1000` and therefore always present. The guard written to catch
    // the epic's single most dangerous defect was itself the thing that failed, on a correct build.
    // Parsing removes the whole class: `1000`, `10` and `100000` are three different numbers and
    // nothing about rendering can blur them.
    await builder.getByRole('group').filter({ hasText: 'Show JSON' }).getByText('Show JSON').click()
    const built = JSON.parse(await builder.locator('pre').innerText()) as FlagDefinition
    expect(built.rules[0].rollout?.basisPoints).toBe(1000)

    await builder.getByRole('button', { name: 'Create immutable version' }).click()
    await expect(page.getByRole('status').filter({ hasText: `Created ${key}` })).toBeVisible()

    // Stored → re-read → same. The immutable version's own JSON, not the builder's preview of it —
    // so the locator is scoped to the VERSIONS TABLE rather than to the first `pre` in the flag's
    // article. Sprint 2 adds a second disclosure to that article (the version diff's "Show JSON"),
    // and a positional `.first()` would have started reading the wrong one the moment a flag had
    // two versions.
    const versions = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: key }) })
      .locator('table')
    const storedDefinition = versions.locator('pre').first()
    await versions.getByText('Inspect immutable JSON').click()
    // Parsed, for the same reason as above: this is the round-trip claim — what the CONTROLS built
    // is byte-for-byte what the control plane stored — and it deserves the strong form.
    await expect(storedDefinition).toBeVisible()
    const stored = JSON.parse(await storedDefinition.innerText()) as FlagDefinition
    expect(stored.rules[0].rollout?.basisPoints).toBe(1000)
    expect(stored.rules[0].clauses[0]).toEqual({ field: 'plan', operator: 'equals', value: 'pro' })
    expect(stored).toEqual(built)
  })

  test('a rule cannot exceed the clause cap, and the page says why', async ({ page }) => {
    // Smoke step 6. The cap and the sentence both come from MAX_FLAG_CLAUSES, so this asserts the
    // constant reached the UI rather than that someone typed five twice.
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)
    const builder = page.locator('.rule-builder')
    await builder.getByRole('button', { name: 'Add a rule' }).click()

    // Driven from the constant, not from a literal 5 (cross-review, Codex): a spec that hardcodes
    // the cap it claims to derive would keep passing while the UI and the SDK drifted apart, which
    // is the exact failure D5 exists to prevent.
    const addCondition = builder.getByRole('button', { name: 'Add a condition' })
    for (let added = 1; added < MAX_FLAG_CLAUSES; added++) await addCondition.click()

    await expect(builder.getByLabel(/^Condition \d+ — field$/)).toHaveCount(MAX_FLAG_CLAUSES)
    await expect(addCondition).toBeDisabled()
    await expect(
      builder.getByRole('status').filter({ hasText: `at most ${MAX_FLAG_CLAUSES} conditions` })
    ).toBeVisible()
  })

  test('a server-side rejection is shown on screen, never swallowed', async ({ page }) => {
    // D2. The builder cannot easily produce an invalid definition — that is the point of it — so
    // this drives the TEXTAREA, which is the surface that can, and asserts the same error channel
    // the builder renders through. Smoke step 7.
    const slug = tenantSlug()
    await page.goto(`/app/flags/${slug}`)

    await page.locator('#flag-key').fill('builder.invalid_probe')
    await page.locator('#flag-definition').fill('{"valueType":"boolean"}')
    await page.locator('#flag-reason').fill('Deliberate rejection probe.')
    await textareaSubmit(page).click()

    await expect(page.getByRole('alert').first()).toBeVisible()
  })
})

// ── Sprint 2 · Stories 2.1, 2.2 and 2.3 ───────────────────────────────────────────────────────
//
// The integration claim only, as sprint-2.md asks. The arithmetic and the prose are pure functions
// with their own unit tests (lib/flag-environment-view.test.ts pins the evaluator agreement,
// lib/flag-definition-diff.test.ts the four diff cases and the fallback); what neither of them can
// see is whether those sentences and those bars actually REACH the page. That is this block.
//
// Both versions below are created through the JSON textarea rather than the builder, deliberately:
// it is the surface that can express a metadata entry, which is what Story 2.3's fallback case
// needs, and it keeps these assertions independent of the builder's own controls.
test.describe('rollout bars and the version diff', () => {
  test.skip(
    process.env.FLAG_RULE_BUILDER_ENABLED !== 'true',
    'Sprint 2 renders behind the same gate as the builder; this pass needs FLAG_RULE_BUILDER_ENABLED=true'
  )

  function definition(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
    return {
      valueType: 'boolean',
      description: 'Rollout visualisation smoke.',
      defaultVariantKey: 'off',
      variants: [
        { key: 'off', value: false },
        { key: 'on', value: true },
      ],
      rules: [
        {
          priority: 10,
          clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
          rollout: { basisPoints: 1000 },
          variantKey: 'on',
        },
      ],
      ...overrides,
    }
  }

  test('every environment gets a bar and production is set apart', async ({ page }) => {
    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)
    await createVersion(page, key, definition(), 'Rollout bar smoke.')

    const rows = flagOf(page, key).locator('.rollout-bar__row')
    // Driven from the constant, not from a literal 3: the component reads FLAG_ENVIRONMENTS and so
    // does this assertion, so a page that quietly renders two bars fails here rather than passing a
    // hardcoded expectation that happens to agree with it.
    await expect(rows).toHaveCount(FLAG_ENVIRONMENTS.length)
    for (const environment of FLAG_ENVIRONMENTS) {
      await expect(rows.filter({ hasText: environment })).toHaveCount(1)
    }
    await expect(rows.filter({ hasText: 'production' })).toHaveAttribute('data-production', 'true')
    await expect(rows.filter({ hasText: 'development' })).toHaveAttribute('data-production', 'false')
  })

  test('an ACTIVATED 10% rollout reads 10% on its bar, never 1000', async ({ page }) => {
    // Fresh review, PR #88: the tests around this one create a version and never activate it, so
    // every row renders "not active", NO fill element exists, and the row-count assertions would
    // pass with the geometry and the percent label completely broken. This is the one that puts a
    // real number on a real bar — smoke walkthrough step 2, and the epic's headline claim applied
    // to the reading surface rather than the authoring one.
    //
    // Skipped rather than branched when serving is off: the Activate control only renders with
    // FLAG_SERVING_ENABLED, and a conditional assertion is a test that reports green for having
    // checked nothing. Same idiom as flag-serving.spec.ts.
    test.skip(
      process.env.FLAG_SERVING_ENABLED !== 'true',
      'activating a version needs FLAG_SERVING_ENABLED=true'
    )

    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)
    await createVersion(page, key, definition(), 'Rollout bar activation smoke.')

    // Scoped to the development cell by the environment's own label rather than by position —
    // the three buttons in that row are identically worded, which is exactly A9's defect.
    const flag = flagOf(page, key)
    await flag
      .locator('td div')
      .filter({ has: page.getByText('development', { exact: true }) })
      .getByRole('button', { name: 'Activate v1' })
      .click()
    await expect(page.getByRole('status').filter({ hasText: 'Activated v1 in development' })).toBeVisible()

    const development = flag.locator('.rollout-bar__row').filter({ hasText: 'development' })
    await expect(development).toHaveAttribute('data-active', 'true')
    await expect(development.locator('.rollout-bar__fill')).toHaveCount(1)
    await expect(development.locator('.rollout-bar__label')).toHaveText('10%')
    await expect(development).not.toContainText('1000')

    // The environments that were NOT activated must not borrow the number.
    await expect(flag.locator('.rollout-bar__row').filter({ hasText: 'production' })).toContainText(
      'not active'
    )
  })

  test('the diff describes a rollout change in percent on both sides', async ({ page }) => {
    // Smoke walkthrough steps 3 and 4. 1000 → 5000 is what the database stores; "10% → 50%" is the
    // only true statement about what the PM did, and this asserts it survives the whole stack.
    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)
    await createVersion(page, key, definition(), 'Initial 10% rollout.')

    const widened = definition()
    widened.rules[0].rollout = { basisPoints: 5000 }
    await createVersion(page, key, widened, 'Widen the rollout to half.')

    // The two most recent versions are compared by default, which is the comparison this walkthrough
    // is about — no selection needed.
    const flag = flagOf(page, key)
    await expect(flag.locator('.flag-insight__changes')).toContainText('rollout 10% → 50%')
    await expect(flag.locator('.flag-insight__changes')).not.toContainText('1000')
    await expect(flag.locator('.flag-insight__changes')).not.toContainText('5000')
    await expect(flag.locator('.flag-insight__unexplained')).toHaveCount(0)
  })

  test('a change outside the six diffed parts says so, with the JSON one click away', async ({ page }) => {
    // Smoke walkthrough step 5, and D8's bound rendered: metadata is a real, valid change this diff
    // deliberately does not describe. It must not invent a description and must not show nothing.
    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)
    await createVersion(page, key, definition(), 'Initial 10% rollout.')
    await createVersion(page, key, definition({ metadata: { owner: 'growth' } }), 'Record the owner.')

    const flag = flagOf(page, key)
    await expect(flag.locator('.flag-insight__unexplained')).toHaveText('definition changed — show JSON')
    await flag.locator('.flag-insight__json').getByText('Show JSON').click()
    await expect(flag.locator('.flag-insight__json pre')).toContainText('"owner": "growth"')
  })
})

// ── Sprint 3 · Stories 3.1, 3.2 and 3.3 — preview as a user ───────────────────────────────────
//
// sprint-3.md's QA asks for three contexts — one that matches, one that matches nothing, and one
// excluded by rollout — and says the parity assertion is the important one. Parity is pinned where
// it belongs, on the SDK, in packages/sdk/src/flags.test.ts: `explainFlagEvaluation(...).variantKey
// === evaluateFlag(...).variant` across thirteen contexts. What THAT cannot see is whether the
// answer survives the server action, the wire and the render, so this block computes each expected
// outcome with the SDK **in the spec** and asserts the page agrees.
//
// It also proves the read-only claim (Story 3.1's last criterion) the only way it can be proved:
// count the versions before and after.
test.describe('preview as a user', () => {
  test.skip(
    process.env.FLAG_RULE_BUILDER_ENABLED !== 'true',
    'the preview is gated with the builder; this pass needs FLAG_RULE_BUILDER_ENABLED=true'
  )
  test.skip(
    process.env.FLAG_SERVING_ENABLED !== 'true',
    'a preview needs a version ACTIVATED in an environment; that needs FLAG_SERVING_ENABLED=true'
  )

  const previewDefinition: FlagDefinition = {
    valueType: 'boolean',
    description: 'Preview smoke: plan is pro at 10%, plus a region rule with no rollout.',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
    ],
  }

  /** A targeting key the 10% rollout excludes, chosen with the SDK rather than guessed. */
  function subjectExcludedByRollout(flagKey: string): string {
    for (let index = 0; index < 500; index++) {
      const targetingKey = `probe-${index}`
      const explained = explainFlagEvaluation({
        flag: { key: flagKey, definitionVersion: 1, definition: previewDefinition },
        context: { targetingKey, plan: 'pro' },
      })
      if (explained.rules.some((rule) => rule.outcome === 'rollout_excluded')) return targetingKey
    }
    throw new Error('no probe subject was excluded by the 10% rollout')
  }

  test('the three outcomes reach the screen, and evaluating writes nothing', async ({ page }) => {
    const slug = tenantSlug()
    const key = flagKey()
    await page.goto(`/app/flags/${slug}`)
    await createVersion(page, key, previewDefinition, 'Preview smoke.')

    const flag = flagOf(page, key)
    await flag
      .locator('td div')
      .filter({ has: page.getByText('development', { exact: true }) })
      .getByRole('button', { name: 'Activate v1' })
      .click()
    await expect(page.getByRole('status').filter({ hasText: 'Activated v1 in development' })).toBeVisible()

    const preview = flag.locator('.flag-preview')
    await expect(preview).toBeVisible()
    // Story 3.3's empty state: it tells a PM what to do rather than showing a blank result.
    await expect(preview.locator('.flag-preview__empty')).toBeVisible()
    await preview.getByLabel('Environment').selectOption('development')

    // 1 — a context excluded by the rollout. The distinct wording is the sprint's whole point.
    const excluded = subjectExcludedByRollout(key)
    await preview.getByLabel('plan').fill('pro')
    await preview.getByLabel('targetingKey').fill(excluded)
    await preview.getByRole('button', { name: 'Evaluate' }).click()
    await expect(preview.locator('.flag-preview__rules li[data-outcome="rollout_excluded"]')).toContainText(
      'excluded this context'
    )
    await expect(preview.locator('.flag-preview__verdict')).toContainText('No rule matched')
    await expect(preview.locator('.flag-preview__rules')).not.toContainText('1000')

    // 2 — a context that matches nothing at all. Different words from the case above.
    await preview.getByLabel('plan').fill('free')
    await preview.getByRole('button', { name: 'Evaluate' }).click()
    await expect(preview.locator('.flag-preview__verdict')).toContainText('No rule matched')
    await expect(preview.locator('.flag-preview__rules li[data-outcome="clause_failed"]')).toContainText(
      'did not match'
    )
    await expect(preview.locator('.flag-preview__rules li[data-outcome="rollout_excluded"]')).toHaveCount(0)
    // A5 — the error-fallback word must never describe an ordinary no-match.
    await expect(preview.locator('.flag-preview__verdict')).not.toContainText('DEFAULT')

    // 3 — a context the rollout admits. Found with the SDK, so the page and the spec agree by
    // construction about which subject should get through.
    let admitted: string | null = null
    for (let index = 0; index < 500 && admitted === null; index++) {
      const targetingKey = `probe-${index}`
      const explained = explainFlagEvaluation({
        flag: { key, definitionVersion: 1, definition: previewDefinition },
        context: { targetingKey, plan: 'pro' },
      })
      if (explained.matched?.priority === 10) admitted = targetingKey
    }
    expect(admitted).not.toBeNull()
    await preview.getByLabel('plan').fill('pro')
    await preview.getByLabel('targetingKey').fill(admitted!)
    await preview.getByRole('button', { name: 'Evaluate' }).click()
    await expect(preview.locator('.flag-preview__verdict')).toContainText('Rule 10 matched')
    await expect(preview.locator('.flag-preview__verdict')).toContainText('"on"')

    // Story 3.1's last criterion, and smoke step 5: nothing was written. Three evaluations, and the
    // flag still has exactly the one immutable version it started with.
    await page.reload()
    await expect(flagOf(page, key).locator('tbody tr')).toHaveCount(1)
  })
})
