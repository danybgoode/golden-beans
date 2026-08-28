import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readTenantRecord } from './helpers/authed-fixture'

// console-ia-overhaul · the VISUAL gate.
//
// ── Why this file exists, in one sentence ────────────────────────────────────────────────────
// Sprints 1 and 2 shipped a correct information architecture and a rejected visual result, and
// nothing in the plan could go red on the way a page looked: every acceptance criterion was
// structural ("the header renders one project switcher and four sections"), and the shipped build
// satisfies all of them while looking like a different product.
//
// The approved design is `design/flags-console-prototype.html`. It is the contract, not
// inspiration. These are the three numbers from `design/CONSOLE-CONTRACT.md` — the cheapest
// assertions that would have caught this on day one.
//
// ⚠️ Two of the three are pure geometry and hold for ANY dataset. The third counts rendered rows,
// so it is only meaningful against the prototype's dataset — which is why this spec SEEDS that
// dataset rather than asserting a number the fixture happens to produce. A row-count assertion
// against arbitrary data is a number that passes for the wrong reason.

const VIEWPORT = { width: 1440, height: 960 }

// The prototype's exact shape for `miyagisanchez` / Production: 42 features, 2 serving, 40 never
// switched on. Production has since drifted to 3 serving / 39 never — the design is the contract,
// so the FIXTURE is seeded to the design, and the production drift is recorded in the epic README
// rather than silently baked into a test.
const TOTAL_FEATURES = 42
const SERVING_IN_PRODUCTION = 2
const NEVER_SWITCHED_ON = TOTAL_FEATURES - SERVING_IN_PRODUCTION

const PROTOTYPE_KEYS = ['checkout.stripe_enabled', 'domain.paywall_enabled'] as const

function admin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are required')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function tenant() {
  const record = readTenantRecord()
  if (!record?.slug || !record?.projectId) {
    throw new Error('the visual gate needs the auth-setup project')
  }
  return record
}

/**
 * The prototype's dataset, written into the fixture tenant so the row count means something.
 *
 * ⚠️ **Idempotent and serial, and the first version was neither.** Playwright runs one worker per
 * test file by default but `beforeAll` fires per worker — so with three tests this seeded three
 * times concurrently, every run accumulated another 42 flags, and the activations raced into
 * `flag snapshot version conflict`. Test 3 then "failed" on a seeding error rather than on the
 * horizontal-scroll assertion it exists to make.
 *
 * A test that fails for the wrong reason proves nothing, and a RED one hides that as effectively as
 * a green one. It deletes what it previously wrote before writing again, and the describe block is
 * `mode: 'serial'` so the activations cannot race each other.
 */
async function seedPrototypeShape(): Promise<void> {
  const db = admin()
  const { projectId, userId } = tenant() as { projectId: string; userId: string }

  // Remove anything a previous run left, so the count is what THIS run wrote and not a total.
  await db
    .from('flag_registries')
    .delete()
    .eq('project_id', projectId)
    .or(`key.like.gb.visual.%,key.in.(${PROTOTYPE_KEYS.join(',')})`)

  for (let index = 0; index < TOTAL_FEATURES; index += 1) {
    const serving = index < SERVING_IN_PRODUCTION
    const key = serving ? PROTOTYPE_KEYS[index] : `gb.visual.dormant_${String(index).padStart(2, '0')}`
    const { data, error } = await db.rpc('create_flag_definition_version', {
      p_project_id: projectId,
      p_flag_key: key,
      p_definition: {
        rules: [],
        variants: [
          { key: 'off', value: false },
          { key: 'on', value: true },
        ],
        valueType: 'boolean',
        defaultVariantKey: serving ? 'on' : 'off',
        description: serving
          ? index === 0
            ? 'Paying by card at checkout.'
            : 'Requiring a paid plan before a custom domain can be connected.'
          : 'A feature nobody has switched on in this environment.',
        metadata: { source: 'visual-fixture', polarity: 'killswitch', criticality: 'high' },
      },
      p_reason: 'visual gate fixture',
      p_actor_user_id: userId,
    })
    if (error) throw new Error(`could not seed ${key}: ${error.message}`)
    const row = data?.[0] as { flag_id?: string; version_id?: string } | undefined
    if (!serving || !row?.flag_id || !row?.version_id) continue

    // Only the first two are switched on in Production. The other 40 get NO activation row at all —
    // which is what "never turned on here" means, and is a different fact from being switched off.
    const { data: state } = await db
      .from('flag_environment_states')
      .select('snapshot_version')
      .eq('project_id', projectId)
      .eq('environment', 'production')
      .maybeSingle()
    const { error: activationError } = await db.rpc('set_flag_activation', {
      p_project_id: projectId,
      p_environment: 'production',
      p_flag_id: row.flag_id,
      p_version_id: row.version_id,
      p_expected_snapshot_version: state?.snapshot_version ?? 0,
      p_reason: 'visual gate fixture',
      p_actor_user_id: userId,
    })
    if (activationError) throw new Error(`could not activate ${key}: ${activationError.message}`)
  }
}

async function openFeatures(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT)
  await page.goto(`/app/flags/${tenant().slug}?env=production`)
  await page.waitForLoadState('networkidle')
}

// ── Why the three assertions share ONE test ──────────────────────────────────────────────────
// `fullyParallel: true` runs a file's tests across workers, and `beforeAll` fires once per worker —
// so three tests seeded three times concurrently, accumulated 42 flags per run, and raced the
// activations into `flag snapshot version conflict`. Test 3 then "failed" on a seeding error rather
// than on the assertion it exists to make, which is a red test proving nothing.
//
// `mode: 'serial'` fixes the race but SKIPS every test after the first failure — and all three of
// these are expected to fail on the current build, so I would only ever see the first one.
//
// So: one test, one seed, and three `expect.soft` assertions. Soft assertions all report, and the
// test still fails. Each keeps the number it measured in its message, because "the design does not
// scroll" is not an actionable failure and "3695px in a 960px viewport" is.
test.describe('the console matches the approved design', () => {
  test.skip(
    !process.env.FLAG_CONSOLE_ENABLED || !process.env.CONSOLE_SHELL_ENABLED,
    'the visual gate asserts the LIT console; run with both gates on'
  )

  test('Ship › Features at 1440x960 matches the approved prototype', async ({ page }) => {
    await seedPrototypeShape()
    await openFeatures(page)

    // Evidence, not decoration: the pair (this shot, the prototype) is how a human checks the two
    // agree, and the numbers below are how CI does. Written to a stable path so the comparison can
    // be regenerated rather than remembered.
    await page.screenshot({ path: 'test-results/console-visual/ship-features.png' })

    const geometry = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
      contentWidth: Math.round(document.querySelector('main')?.getBoundingClientRect().width ?? 0),
    }))

    // 1. The approved design fits Ship › Features in one screen. A page that scrolls means the
    //    chrome is eating the viewport — 48px headings, three-line rail cards, a list that pages at
    //    25 instead of collapsing.
    expect
      .soft(
        geometry.scrollHeight,
        `[1] the page is ${geometry.scrollHeight}px tall in a ${geometry.innerHeight}px viewport — the approved design does not scroll`
      )
      .toBeLessThanOrEqual(geometry.innerHeight)

    // 2. Counted on the ROWS, not on a rendered string: the design's claim is that 42 features
    //    become two rows plus one line, and a substring check would pass on a page showing all 42.
    // ⚠️ Both locators were too loose on their first run, and each failed for the wrong reason —
    // which is worth recording, because a RED test hides that as effectively as a green one.
    //
    //   • `table tbody tr` matched the dormant disclosure's OWN table as well as the feature list,
    //     so "17 rows" was really 2 feature rows + 15 expanded dormant rows.
    //   • `details summary` matched every disclosure on the page, so "4 summary lines" counted
    //     three unrelated ones.
    //
    // Scoped to the feature list itself, and to a stable hook rather than a tag name. The hook does
    // not exist on the current build, so this reads 0 — an honest red that turns green only when the
    // dormant group is built as the prototype has it: ONE summary row inside the list, not a
    // <details> holding fifteen more rows.
    const featureList = page.locator('[data-feature-list]')
    // `.row` inside the list, not `tbody tr`: the approved design's list is flex rows, not a table.
    // The locator originally assumed a table and read 0 against a correct page — a green-looking
    // hook pointing at markup that no longer exists.
    const featureRows = featureList.locator('.row').filter({ has: page.locator('code') })
    const dormantSummary = page.locator('[data-dormant-summary]')
    const rowCount = await featureRows.count()
    const summaryCount = await dormantSummary.count()
    expect
      .soft(
        rowCount,
        `[2] ${rowCount} feature rows rendered for ${TOTAL_FEATURES} features — the approved design renders ${SERVING_IN_PRODUCTION}`
      )
      .toBe(SERVING_IN_PRODUCTION)
    expect
      .soft(
        summaryCount,
        `[2] ${summaryCount} dormant summary lines — the other ${NEVER_SWITCHED_ON} collapse into exactly one`
      )
      .toBe(1)

    // 3. Wide content scrolls inside its own container; the PAGE never does.
    expect
      .soft(
        geometry.scrollWidth,
        `[3] the body is ${geometry.scrollWidth}px wide in a ${geometry.innerWidth}px viewport — content is being clipped`
      )
      .toBeLessThanOrEqual(geometry.innerWidth)

    // 3b. ⚠️ **The contract's third number does not reproduce, and this is what it was pointing at.**
    //     CONSOLE-CONTRACT.md predicts `body.scrollWidth > innerWidth` on the shipped build. It is
    //     false at 1440x960: the tables already scroll inside their own `overflow-x: auto`
    //     containers, which is the behaviour the contract's own Do-not #6 asks for. So assertion 3
    //     passes and would have passed on day one — it could not have caught this.
    //
    //     The real defect is one layer up and IS visible in the screenshot: the AgentRail sits
    //     inside the console grid and squeezes the content column to roughly 545px against the
    //     approved 1180. That is why every table clips. Asserting the content width catches it;
    //     asserting page scroll does not.
    //
    //     Do-not #4 calls this "a decision the epic never made" — whether the rail moves out of the
    //     console grid or is not rendered on console routes. This assertion states the requirement
    //     without prejudging which way that decision goes.
    expect
      .soft(
        geometry.contentWidth,
        `[3b] the content column is ${geometry.contentWidth}px against the approved 1180 — the AgentRail is inside the console grid`
      )
      .toBeGreaterThanOrEqual(1000)
  })
})
