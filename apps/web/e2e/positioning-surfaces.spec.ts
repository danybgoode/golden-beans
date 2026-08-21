import { test, expect } from '@playwright/test'
import { CATEGORY_DEFINITION } from '@/lib/positioning'

// agentic-pm-public-surface · Sprint 3, Stories 3.2 and 3.4 (epic D2).
//
// `lib/positioning.ts` exists so one category name and one definition reach five outward surfaces
// without being retyped on any of them. That is a claim about the SURFACES, not about the module —
// the module's own unit test cannot tell you whether anybody imported it, and four of the five
// could drift to a hand-typed variant while every existing spec stayed green.
//
// Split across two files by Playwright project: the two markdown surfaces are `request` reads and
// live in the `api` gate; the three rendered ones need a page and live in `positioning-surfaces.browser.spec.ts`.
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

test('the workshop opens on the category, verbatim from the module', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()
  expect(body).toContain(CATEGORY_DEFINITION)
})

test('the manifest opens on the category, verbatim from the module', async ({ request }) => {
  const body = await (await request.get('/llms.txt')).text()
  expect(body).toContain(CATEGORY_DEFINITION)
})
