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
import { SCENARIO_FLAG_KEY, readTenantRecord } from './helpers/authed-fixture'
import { seedFlagVersion } from './helpers/seed-flag'
import { isFlagConsoleEnabled } from '../lib/flags'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag rule builder smoke requires the auth-setup project')
  return slug
}

const flagKey = () => `builder.smoke_${Date.now().toString(36)}`

/**
 * Create an immutable version for a fixture flag.
 *
 * ── It no longer drives the UI, and that is Story 3.3's doing ─────────────────────────────────
 * This used to fill the JSON textarea on the flags page. console-ia-overhaul Story 3.3 DELETES that
 * form (and the builder's own free-key field beside it) from the console branch, replacing them
 * with the "New feature" wizard — which creates a plain on/off definition and cannot express the
 * arbitrary rules, rollouts and metadata these suites need as FIXTURES.
 *
 * The write itself lives in `helpers/seed-flag.ts`, shared with the Story 3.2 suite that needed the
 * same thing in the same story. Nothing about what these tests ASSERT changes — they are about how
 * a version RENDERS (its bars, its diff, its preview), and the surface that used to supply them was
 * never the subject.
 *
 * ⚠️ Stated rather than quietly swapped: this trades one thing away. While the textarea existed,
 * every one of these tests incidentally exercised it. It does not exist on the console any more, so
 * that cover is gone rather than moved — and the thing it covered is covered directly instead, by
 * `flag-console.authed.spec.ts`'s assertion that the form is absent with the gate on and by
 * `lib/new-feature-draft.test.ts` against the real parser.
 */
async function createVersion(
  _page: import('@playwright/test').Page,
  _slug: string,
  key: string,
  value: FlagDefinition,
  reason: string
) {
  await seedFlagVersion(key, value, reason)
}

type Page = import('@playwright/test').Page

/**
 * Where one flag's surfaces live — which depends on the console gate.
 *
 * ── The port these suites were skipped waiting for (Sprint 3, Story 3.4) ─────────────────────
 * flags-console-parity moved the per-flag surfaces off the flags page. With `FLAG_CONSOLE_ENABLED`
 * on, each feature has its own route and the `<article>` stack is gone:
 *
 *   DARK                                    LIT
 *   /app/flags/<slug>  → <article> per flag  /app/flags/<slug>/<key>
 *     · versions table                         · History tab
 *     · FlagInsight (bars + diff)              · History tab
 *     · FlagPreview                            · Value tab
 *
 * Sprint 2 skipped these suites rather than porting them, with the cost stated. This is the port.
 * It follows the move instead of pinning either state, so the same assertions hold on both sides of
 * the flip — which is what makes them useful DURING a flip, the one moment they matter most.
 */
const consoleLit = () => isFlagConsoleEnabled()

/** Navigate to where `key`'s surfaces are. `tab` is ignored while the console is dark. */
async function gotoFlag(page: Page, slug: string, key: string, tab: 'value' | 'history' = 'history') {
  if (!consoleLit()) {
    await page.goto(`/app/flags/${slug}`)
    return
  }
  const base = `/app/flags/${slug}/${encodeURIComponent(key)}`
  await page.goto(tab === 'value' ? base : `${base}?tab=${tab}`)
}

/**
 * Where the rule BUILDER now lives, which — like everything else in this file — depends on the gate.
 *
 * DARK: on the flags list, beside the JSON textarea (`flag-manager.tsx`).
 * LIT:  on a feature's own page, **Targeting** tab (`[flagKey]/flag-authoring.tsx`) —
 *       console-ia-overhaul Story 3.3 removed the list's copy along with the textarea, because both
 *       carried a FREE-TEXT flag key and the console's creation control is the "New feature" wizard
 *       now (A21); Story 3.2 then moved it off Value, where it and the preview together made the
 *       page 3346px tall in a 960px viewport.
 *
 * The builder's own key field stays editable on the feature page, which is why these tests can
 * still create a new key from it: `FlagAuthoring` follows the key when it changes rather than
 * refreshing the page for the old one.
 */
async function gotoBuilder(page: Page, slug: string) {
  if (!consoleLit()) {
    await page.goto(`/app/flags/${slug}`)
    return
  }
  await page.goto(`/app/flags/${slug}/${encodeURIComponent(SCENARIO_FLAG_KEY)}?tab=targeting`)
}

/**
 * The scope one flag's assertions run in.
 *
 * Dark: its `<article>`, located by its own heading rather than by position (A9).
 * Lit: the whole `<main>` — the destination is ALREADY scoped to one flag by its URL, so scoping
 * again would look symmetrical and mean nothing.
 */
const flagOf = (page: Page, key: string) =>
  consoleLit()
    ? page.locator('main')
    : page.locator('article').filter({ has: page.getByRole('heading', { name: key }) })

/**
 * The rows of the IMMUTABLE VERSIONS table, wherever it now lives.
 *
 * Lit, the feature page carries two tables — the per-environment summary Story 3.2 put above the
 * tabs, and the versions table on History — so "the tbody rows under main" is no longer one thing.
 * Dark, the flag's `<article>` has only the one.
 */
const versionRows = (page: Page, key: string) =>
  consoleLit() ? page.locator('.data-table tbody tr') : flagOf(page, key).locator('tbody tr')

/**
 * Turn `key` on in development, wherever that control now lives.
 *
 * DARK: the per-version button in the definitions stack, labelled `Activate v1`.
 * LIT:  `FlagSwitch` on the destination's Value tab, labelled `Turn on in development` — Story 2.2
 *       replaced N per-version buttons with ONE control per environment, and D7 retired the word
 *       "Activate". Both activate the same version through the same server action; only the surface
 *       and the wording changed.
 *
 * ⚠️ Leaves the page on the destination's **Value** tab when lit, which is where the SWITCH lives.
 * The preview moved to Targeting in Story 3.2, so a caller that wants it navigates again — see the
 * preview suite below, which now does. (The old sentence said Value "is where the preview lives",
 * and it was true when it was written.)
 */
async function turnOnInDevelopment(page: Page, slug: string, key: string) {
  if (!consoleLit()) {
    // The legacy per-version button, scoped to the development cell by the environment's own label
    // rather than by position — the three buttons in that row are identically worded (A9).
    await flagOf(page, key)
      .locator('td div')
      .filter({ has: page.getByText('development', { exact: true }) })
      .getByRole('button', { name: 'Activate v1' })
      .click()
    await expect(page.getByRole('status').filter({ hasText: 'Activated v1 in development' })).toBeVisible()
    return
  }
  await gotoFlag(page, slug, key, 'value')
  await page.getByRole('button', { name: 'Turn on in development' }).click()

  // ── These fixtures default to `off`, so turning them on CONFIRMS first ────────────────────────
  // Sprint 2's "activated is not on" guard: a version whose defaultVariantKey names a falsey variant
  // serves `false`, so turning it on warns that "on" will not mean what it says. Every definition in
  // this file has `defaultVariantKey: 'off'`, which makes that the norm here rather than the corner.
  //
  // Confirmed rather than avoided. Rewriting the fixtures to default `on` would dodge the dialog and
  // silently stop exercising the money-path warning on the surface that owns it — and these suites
  // exist to catch exactly that kind of quiet loss.
  const confirm = page.locator('dialog.confirm-dialog')
  if (await confirm.isVisible()) {
    await expect(confirm).toContainText('evaluates to false by default')
    await confirm.getByRole('button', { name: 'Turn on' }).click()
  }

  await expect(
    page.getByRole('status').filter({ hasText: `${key} in development is now serving v1` })
  ).toBeVisible()
}

// ✅ flags-console-parity, Sprint 3, Story 3.4 — these suites are PORTED, not skipped.
//
// Sprint 2 guarded them with `legacyStackOnly()` because their selectors (`locator('article')`,
// `Activate v1`) live in the stack the console removes, and stated the cost: with the gate on they
// had no cover at all. That debt is paid here.
//
// They now FOLLOW the move via `gotoFlag` / `flagOf` / `turnOnInDevelopment`, so the same assertions
// run on both sides of the flip. That is deliberately stronger than pinning either state: the one
// moment this coverage matters most is DURING a flip, when a regression would otherwise look like
// the flip working.

test.describe('the visual rule builder', () => {
  test.skip(
    process.env.FLAG_RULE_BUILDER_ENABLED !== 'true',
    'the builder is gated; this pass needs FLAG_RULE_BUILDER_ENABLED=true'
  )

  test('a rule built from controls stores 10% as 1000 basis points', async ({ page }) => {
    const slug = tenantSlug()
    const key = flagKey()
    // ⚠️ The builder FOLLOWS THE MOVE now. It used to stay on the flags page in both gate states;
    // console-ia-overhaul Story 3.3 removed the list's copy with the textarea beside it, because
    // both were free-key creation paths (A21). Lit, it is on a feature's own page.
    await gotoBuilder(page, slug)

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
    // ⚠️ The CONFIRMATION follows the move too, and it is a different shape on each side — which is
    // exactly the kind of detail a port loses. Dark, `flag-manager.tsx` renders a status line and
    // stays put. Lit, `flag-authoring.tsx` navigates to the key that was actually written, because
    // the builder's key field is editable and a refresh would otherwise reload the page for the OLD
    // feature while telling the reader the save succeeded (its own comment records that finding).
    //
    // So the lit assertion is the stronger one available: the URL now names the key, which is proof
    // the write landed on the feature the reader typed.
    if (consoleLit()) {
      await page.waitForURL(`**/app/flags/${slug}/${key}`)
    } else {
      await expect(page.getByRole('status').filter({ hasText: `Created ${key}` })).toBeVisible()
    }

    // Stored → re-read → same. The immutable version's own JSON, not the builder's preview of it —
    // so the locator is scoped to the VERSIONS TABLE rather than to the first `pre` in the flag's
    // article. Sprint 2 adds a second disclosure to that article (the version diff's "Show JSON"),
    // and a positional `.first()` would have started reading the wrong one the moment a flag had
    // two versions.
    // The stored version's table is on the destination's History tab once the console is lit, and
    // in the flag's article while dark. `gotoFlag` resolves that; `flagOf` then scopes to whichever
    // container this state uses. (An inline `locator('article')` survived the first pass of the
    // port here — the reason `flagOf` exists is so exactly one place knows the answer.)
    await gotoFlag(page, slug, key, 'history')
    const versions = flagOf(page, key).locator('table')
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
    await gotoBuilder(page, slug)
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
    // D2 — the server is the authority on validity, and whatever it says has to reach the screen.
    //
    // ⚠️ **This used to drive the JSON textarea**, which was the only surface that could express an
    // invalid definition. Story 3.3 deleted it from the console, so the probe had to find another
    // way to be rejected — and there is exactly one left, which is worth knowing: the builder's
    // "Flag key" field is FREE TEXT and its only local check is that the field is non-empty
    // (`argumentProblems` in `rule-builder.tsx`). A key the SDK's `validateFlagKey` refuses
    // therefore reaches the server and comes back rejected, through the same `serverError` channel
    // the builder renders.
    //
    // That is a stronger probe than the old one in one respect: it proves the SERVER is still the
    // authority on a key the CLIENT was willing to send. Smoke step 7.
    const slug = tenantSlug()
    await gotoBuilder(page, slug)

    const builder = page.locator('.rule-builder')
    await builder.getByLabel('Flag key').fill('Not A Valid Key!')
    await builder.getByLabel('Description').fill('Deliberate rejection probe.')
    await builder.getByLabel('Reason').fill('Deliberate rejection probe.')
    await builder.getByRole('button', { name: 'Create immutable version' }).click()

    // The server's own words, not a generic failure — `createFlagDefinitionVersionAction` returns
    // "Invalid flag key." and the reader has to be able to act on it.
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid flag key' })).toBeVisible()
  })
})

// ── Sprint 2 · Stories 2.1, 2.2 and 2.3 ───────────────────────────────────────────────────────
//
// The integration claim only, as sprint-2.md asks. The arithmetic and the prose are pure functions
// with their own unit tests (lib/flag-environment-view.test.ts pins the evaluator agreement,
// lib/flag-definition-diff.test.ts the four diff cases and the fallback); what neither of them can
// see is whether those sentences and those bars actually REACH the page. That is this block.
//
// Both versions below are SEEDED through `create_flag_definition_version` rather than built from
// controls, deliberately: the fixture needs an arbitrary metadata entry (Story 2.3's fallback case)
// and an arbitrary rule shape, neither of which the builder or the "New feature" wizard can express
// — and how the version got there was never what these tests assert. See `createVersion`.
// ⚠️ **Serial: these tests share one optimistic lock and `fullyParallel` splits them.**
// This file activates versions five times on the SAME tenant, and every activation reads
// `flag_environment_states.snapshot_version` and writes back expecting it unchanged. Split across
// workers, two of them collide and one is correctly rejected — so the suite failed roughly every
// other full run with "an ACTIVATED 10% rollout reads 10% on its bar, never 1000".
//
// That is a correct database refusing a lost update, not a product bug: the same protection is what
// `experiment-governance` and the connector mint rely on. The test was racing itself.
//
// Surfaced while running the full `authed` suite for console-ia-overhaul (PR #124); this file is
// otherwise untouched by that work. Serialising the describe is the smallest fix that makes the
// contention impossible rather than unlikely.
// ⚠️ FILE scope, not describe scope — `test.describe.configure` at the top level covers every
// describe in the file. That is stronger than the comment above originally claimed, and correct:
// the activations are spread across two of them.
test.describe.configure({ mode: 'serial' })

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
    await createVersion(page, slug, key, definition(), 'Rollout bar smoke.')
    await gotoFlag(page, slug, key, 'history')

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
    await createVersion(page, slug, key, definition(), 'Rollout bar activation smoke.')
    await gotoFlag(page, slug, key, 'history')

    // Scoped to the development cell by the environment's own label rather than by position —
    // the three buttons in that row are identically worded, which is exactly A9's defect.
    await turnOnInDevelopment(page, slug, key)
    // Back to History for the bars: `turnOnInDevelopment` leaves the page on the Value tab when the
    // console is lit, because that is where the control lives.
    await gotoFlag(page, slug, key, 'history')

    const development = flagOf(page, key).locator('.rollout-bar__row').filter({ hasText: 'development' })
    await expect(development).toHaveAttribute('data-active', 'true')
    await expect(development.locator('.rollout-bar__fill')).toHaveCount(1)
    await expect(development.locator('.rollout-bar__label')).toHaveText('10%')
    await expect(development).not.toContainText('1000')

    // The environments that were NOT activated must not borrow the number.
    await expect(
      flagOf(page, key).locator('.rollout-bar__row').filter({ hasText: 'production' })
    ).toContainText('not active')
  })

  test('the diff describes a rollout change in percent on both sides', async ({ page }) => {
    // Smoke walkthrough steps 3 and 4. 1000 → 5000 is what the database stores; "10% → 50%" is the
    // only true statement about what the PM did, and this asserts it survives the whole stack.
    const slug = tenantSlug()
    const key = flagKey()
    await createVersion(page, slug, key, definition(), 'Initial 10% rollout.')
    await gotoFlag(page, slug, key, 'history')

    const widened = definition()
    widened.rules[0].rollout = { basisPoints: 5000 }
    await createVersion(page, slug, key, widened, 'Widen the rollout to half.')
    // Re-navigate: `createVersion` writes from the flags page, so after a SECOND version the page is
    // no longer the destination this test asserts on.
    await gotoFlag(page, slug, key, 'history')

    // The two most recent versions are compared by default, which is the comparison this walkthrough
    // is about — no selection needed.
    const flag = flagOf(page, key)
    await expect(flagOf(page, key).locator('.flag-insight__changes')).toContainText('rollout 10% → 50%')
    await expect(flagOf(page, key).locator('.flag-insight__changes')).not.toContainText('1000')
    await expect(flagOf(page, key).locator('.flag-insight__changes')).not.toContainText('5000')
    await expect(flag.locator('.flag-insight__unexplained')).toHaveCount(0)
  })

  test('a change outside the six diffed parts says so, with the JSON one click away', async ({ page }) => {
    // Smoke walkthrough step 5, and D8's bound rendered: metadata is a real, valid change this diff
    // deliberately does not describe. It must not invent a description and must not show nothing.
    const slug = tenantSlug()
    const key = flagKey()
    await createVersion(page, slug, key, definition(), 'Initial 10% rollout.')
    await createVersion(page, slug, key, definition({ metadata: { owner: 'growth' } }), 'Record the owner.')
    await gotoFlag(page, slug, key, 'history')

    const flag = flagOf(page, key)
    await expect(flag.locator('.flag-insight__unexplained')).toHaveText('definition changed — show JSON')
    await flagOf(page, key).locator('.flag-insight__json').getByText('Show JSON').click()
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
    await createVersion(page, slug, key, previewDefinition, 'Preview smoke.')

    await turnOnInDevelopment(page, slug, key)

    // The preview lives on Targeting since Story 3.2 — `turnOnInDevelopment` leaves us on Value.
    if (consoleLit()) await page.goto(`/app/flags/${slug}/${encodeURIComponent(key)}?tab=targeting`)
    const preview = flagOf(page, key).locator('.flag-preview')
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
    //
    // Counted on HISTORY, because that is where the versions table lives once the console is lit —
    // the preview runs on Value, so a bare `reload()` would re-render the tab with no table on it
    // and count zero rows. `gotoFlag` is a reload plus the right address.
    await gotoFlag(page, slug, key, 'history')
    // ⚠️ Scoped to the VERSIONS table, not to every `tbody tr` under `main`. Story 3.2 added a
    // second table to this page — the per-environment summary above the tabs — so the loose
    // locator counted 4 rows for a flag with one version and failed on a correct build. Fourth
    // over-broad locator in this file, and the same lesson each time: scope by the thing that
    // distinguishes the surface, never by the tag.
    await expect(versionRows(page, key)).toHaveCount(1)
  })
})
