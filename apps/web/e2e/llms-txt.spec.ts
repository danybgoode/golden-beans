import { test, expect } from '@playwright/test'

// Story 3.2 (commercial-shell/sprint-3.md) — the `llms.txt`-style manifest must be served, plain
// text, and list the real public routes/connector docs using THIS deployment's own base URL (never
// a hardcoded localhost or a wrong-env prod URL baked into the source) — see app/llms.txt/route.ts
// for why it's a real route built on getSiteUrl() rather than a checked-in static string.

test('the /llms.txt manifest is served as plain text and lists the public routes', async ({ request }) => {
  const res = await request.get('/llms.txt')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/plain')

  const body = await res.text()
  expect(body).toContain('Golden Frijoles')
  expect(body).toContain('/install')
  expect(body).toContain('/api/v1/public/mcp/c/{token}')
})

test("the manifest's route URLs are absolute and built from this deployment's own base URL, not a hardcoded one", async ({
  request,
  baseURL,
}) => {
  const res = await request.get('/llms.txt')
  const body = await res.text()

  // Every listed route/connector path is an absolute URL rooted at this run's own base URL (the
  // same one getSiteUrl() resolves to in this environment) -- proves the manifest is generated
  // from getSiteUrl() live, not a stale/checked-in string pointing at a different environment.
  expect(body).toContain(`${baseURL}/`)
  expect(body).toContain(`${baseURL}/install`)
  expect(body).toContain(`${baseURL}/api/v1/public/mcp/c/{token}`)

  // A deliberate mutation check substitute: this manifest is generated code, not a static file, so
  // there's no "old wrong string" to assert against directly -- instead assert it did NOT fall back
  // to a different host than baseURL (which is what a hardcoded/mis-wired URL would produce).
  const otherHostMatches = body.match(/https?:\/\/[^/\s]+/g) ?? []
  const uniqueHosts = new Set(otherHostMatches)
  expect(uniqueHosts.size).toBe(1)
})

// ── agentic-pm-public-surface · Sprint 3, Story 3.3 ─────────────────────────────────────────────
//
// The two tests above are unedited: this manifest is still served as plain text, still lists the
// real routes, and still builds every URL from this deployment's own base. What changed is what it
// is FOR. It used to be a sitemap written for a deployment two epics ago; it is now an operating
// brief — it tells the agent that fetched it how to behave with the practitioner on the other side.
//
// That is the part with no other guard. A route list going stale is visible to anyone who opens the
// page; a manifest that quietly loses its instructions is invisible, because no human reads this
// file and every fetch of it still returns 200.

test('the manifest names the category, once, from lib/positioning.ts', async ({ request }) => {
  const body = await (await request.get('/llms.txt')).text()
  const { CATEGORY_DEFINITION } = await import('@/lib/positioning')

  // Imported, not retyped — this is the assertion that makes lib/positioning.ts load-bearing rather
  // than decorative. If a future edit rewrites the sentence here, this fails rather than the two
  // surfaces silently drifting apart.
  expect(body).toContain(CATEGORY_DEFINITION)

  // "Once" is in this test's name, so it is asserted rather than implied. A test title that claims
  // a property the body does not check is the same defect as a comment that does — the next reader
  // takes the name as coverage and stops looking. Caught by agy in review of PR #114.
  //
  // It matters here specifically: this manifest is read by a model, and a definition repeated in a
  // short document reads as emphasis — which is how a definition quietly becomes a slogan.
  const occurrences = body.split(CATEGORY_DEFINITION).length - 1
  expect(occurrences, 'the manifest should define the category once, not repeat it').toBe(1)
})

test('the manifest tells the agent what to ask before it recommends anything', async ({ request }) => {
  const body = await (await request.get('/llms.txt')).text()

  // Diagnostic questions, not a pitch. An agent that arrives here and immediately describes the
  // product has skipped the only part that tells it whether the product is relevant at all.
  expect(body).toContain('If someone has just arrived, ask these')

  const questions = body.match(/^\d+\. .+\?$/gm) ?? []
  expect(
    questions.length,
    'the brief should put a handful of diagnostic questions to a new arrival'
  ).toBeGreaterThanOrEqual(4)
})

test('the manifest carries the plain-language rule and its honesty guardrail', async ({ request }) => {
  const body = await (await request.get('/llms.txt')).text()

  expect(body).toContain('How to talk about this')
  // The three halves of the rule, each pinned by the phrase that carries it. Asserted separately
  // because they fail independently: a rewrite can keep the heading and drop any one of them.
  expect(body).toMatch(/Do not use our vocabulary/i)
  expect(body).toContain(`Say "I don't know."`)
  expect(body).toMatch(/Do not claim to be connected/i)

  // Inherited verbatim from the manifest this replaces — the guardrail that keeps it a claim
  // surface rather than a wish list, and the reason it is a route rather than a static file.
  expect(body).toContain('This manifest lists only what is live in this deployment right now.')

  // The connector's two kill switches are still described as two. A manifest that says the flag is
  // the only gate would be advertising a weaker guarantee than AGENTS.md rule #3 actually makes.
  expect(body).toMatch(/two independent kill switches/i)
})
