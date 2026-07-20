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
  expect(body).toContain('Golden Beans')
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
