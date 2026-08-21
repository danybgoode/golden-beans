import { test, expect } from '@playwright/test'
import { CATEGORY, CATEGORY_DEFINITION } from '@/lib/positioning'

// agentic-pm-public-surface · Sprint 3, Stories 3.2 and 3.4 (epic D2).
//
// `lib/positioning.ts` exists so one category name and one definition reach five outward surfaces
// without being retyped on any of them. That is a claim about the SURFACES, not about the module —
// the module's own unit test cannot tell you whether anybody imported it, and four of the five
// could drift to a hand-typed variant while every existing spec stayed green.
//
// The RENDERED half. Its `api` sibling (`positioning-surfaces.spec.ts`) covers the two markdown
// surfaces; these three need a real page. NOTE: the `browser` project is not in the blocking gate,
// so this file must be run on purpose — `node scripts/run-local-e2e.mjs --browser`.
//
// So this asserts the round trip: the string in the module is the string a stranger reads. It is
// the guard that makes that module load-bearing rather than decorative, and `positioning.ts`'s
// header names this file by path — a promise this file has to keep.
//
// ── Why "identically" and not "mentions the category" ────────────────────────────────────────
// A near-copy is the failure mode, not an absence. Nobody ships a surface that forgets to describe
// the product; what happens is that one surface says "the whole product discipline" and another
// says "the entire product discipline", and the difference survives for a year because both read
// fine in isolation. Exact containment is the only assertion that catches that.

test('the landing states the category exactly once', async ({ page }) => {
  await page.goto('/')
  const text = await page.locator('body').innerText()

  expect(text, 'the landing should define the category it claims').toContain(CATEGORY_DEFINITION)

  // Once, not twice. A definition repeated on one page stops being a definition and becomes a
  // slogan — and epic D1 spreads the borrowed register across seven sections precisely so no single
  // idea has to be stated twice to land.
  const occurrences = text.split(CATEGORY_DEFINITION).length - 1
  expect(occurrences, 'the definition should appear once on the landing, not repeated').toBe(1)
})

test('/methodology opens on the same category as the landing', async ({ page }) => {
  await page.goto('/methodology')
  const text = await page.locator('body').innerText()
  expect(text).toContain(CATEGORY_DEFINITION)
})

test('the link preview names the category and still claims no capability', async ({ page }) => {
  await page.goto('/')

  const title = await page.title()
  expect(title.toLowerCase()).toContain(CATEGORY.toLowerCase())

  const description = await page
    .locator('meta[name="description"], meta[property="og:description"]')
    .first()
    .getAttribute('content')
  expect(description, 'the page should carry a description').toBeTruthy()

  // ── The inherited constraint, and it is NOT re-litigated here ──────────────────────────────
  // `app/layout.tsx`'s DESCRIPTION took three review rounds to settle on naming no capability: a
  // link preview travels WITHOUT the qualification the page carries, gate state is per-deployment,
  // and this string is baked per-build — so any capability named here is a claim a flag flip can
  // falsify and the preview cannot qualify.
  //
  // The same rule is asserted on CATEGORY_DEFINITION by `lib/positioning.test.ts`. It is repeated
  // against the RENDERED metadata because that unit test checks the module, and this checks what a
  // chat app actually unfurls — which is the thing the rule was written about.
  const CAPABILITIES = [
    'telemetry',
    'TARS',
    'funnel',
    'A/B',
    'experiment',
    'MCP',
    'connector',
    'flag',
    'release',
    'scenario',
    'webhook',
  ]
  for (const capability of CAPABILITIES) {
    expect(
      new RegExp(`\\b${capability}\\b`, 'i').test(description!),
      `the link preview names "${capability}" — a gate flip can falsify it and the preview cannot qualify it`
    ).toBe(false)
  }
})
