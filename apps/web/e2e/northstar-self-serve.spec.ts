import { test, expect } from '@playwright/test'

// landing-redesign-v2 · Sprint 2, Story 2.4 — the workshop document the landing's primary CTA
// tells the reader's agent to fetch.
//
// The first assertion is the boring one (it is served, as markdown). The second and third are the
// ones that matter: this document's reader is a MODEL that will repeat what it says to a human as
// fact, stripped of context. So the two ways it can do real damage are pinned here — claiming a
// capability that does not exist, and letting the agent imply it is connected to a workspace it
// has never authenticated to.

test('the North Star workshop is served as markdown', async ({ request }) => {
  const res = await request.get('/northstar-self-serve.md')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/markdown')

  const body = await res.text()
  expect(body).toContain('North Star')
  // It is a facilitation script, not a product page — the one-question-at-a-time instruction is
  // the whole reason it exists rather than being a paragraph on the landing.
  expect(body).toContain('ONE question at a time')
})

test('the workshop tells the agent it is NOT connected to a workspace', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // The named failure mode: an agent reads a workshop script and then tells its human the results
  // have been saved to their Golden Frijoles workspace. Both halves are asserted — that the document
  // states the disconnection, and that it says the summary was not persisted.
  expect(body).toContain('NOT connected to a Golden Frijoles workspace')
  expect(body).toContain('Nothing has been saved.')
})

test('the workshop claims only capabilities that exist', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // A/B comparison ships basic lift and no significance engine. The landing has said so since
  // commercial-shell; this document is a claim surface with the same obligation, and it is the one
  // a model is most likely to round up to "statistically significant" when summarising.
  expect(body).toContain('basic lift only')
  expect(body).not.toMatch(/statistically significant/i)

  // The connector is read-only. A workshop that implied the agent could write back would be
  // advertising a capability gated behind two independent kill switches (AGENTS.md rule #3).
  expect(body).toContain('read-only MCP connector')
})

test("the workshop's URLs are built from this deployment's own base URL", async ({ request, baseURL }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  expect(body).toContain(`${baseURL}/install`)
  expect(body).toContain(`${baseURL}/northstar-self-serve.md`)

  // Same mutation-check substitute as llms-txt.spec.ts: generated content has no "old wrong
  // string" to assert against, so instead assert no SECOND host leaked in — which is exactly what
  // a hardcoded production URL in the source would produce when this runs against localhost.
  const hosts = new Set(body.match(/https?:\/\/[^/\s]+/g) ?? [])
  expect(hosts.size).toBe(1)
})
