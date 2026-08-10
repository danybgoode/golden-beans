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
import { MAX_FLAG_CLAUSES } from '@golden-beans/sdk'
import { readTenantRecord } from './helpers/authed-fixture'

function tenantSlug(): string {
  const slug = readTenantRecord()?.slug
  if (!slug) throw new Error('the flag rule builder smoke requires the auth-setup project')
  return slug
}

const flagKey = () => `builder.smoke_${Date.now().toString(36)}`

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
    await builder.getByLabel('Serves variant').selectOption('on')
    await builder.getByLabel('Rollout (%)').fill('10')
    await builder.getByLabel('Reason').fill('Rule builder round-trip smoke.')

    // THE assertion of the epic. Not 10, not 100000. The JSON disclosure renders exactly what the
    // action will send, so reading it here reads the bytes that get stored.
    await builder.getByRole('group').filter({ hasText: 'Show JSON' }).getByText('Show JSON').click()
    const json = builder.locator('pre')
    await expect(json).toContainText('"basisPoints": 1000')
    await expect(json).not.toContainText('"basisPoints": 10\n')
    await expect(json).not.toContainText('100000')

    await builder.getByRole('button', { name: 'Create immutable version' }).click()
    await expect(page.getByRole('status').filter({ hasText: `Created ${key}` })).toBeVisible()

    // Stored → re-read → same. The immutable version's own JSON, not the builder's preview of it.
    const storedDefinition = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: key }) })
      .locator('pre')
      .first()
    await page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: key }) })
      .getByText('Inspect immutable JSON')
      .click()
    await expect(storedDefinition).toContainText('"basisPoints": 1000')
    await expect(storedDefinition).toContainText('"operator": "equals"')
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
    await page.getByRole('button', { name: 'Create immutable version' }).first().click()

    await expect(page.getByRole('alert').first()).toBeVisible()
  })
})
