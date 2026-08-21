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

  // ── Widened from "exactly one host" by product-owner amendment, 2026-08-20 (epic A10) ──────
  // This is the ONLY edit to the four tests that predate agentic-pm-public-surface, and it is a
  // deliberate strengthening rather than a relaxation, so the reason is recorded here rather than
  // in a commit message nobody will read again.
  //
  // The old form counted hosts and required the count to be 1. That was a PROXY for the property
  // this test actually defends — every absolute URL in this document is built by `getSiteUrl()`,
  // never a hardcoded wrong-environment literal — and a count cannot tell you WHICH host it found.
  // It also left no room for citing a source, which Story 1.2 requires; cross-family review called
  // that Blocking twice, and the product owner amended the criterion rather than dropping the
  // credit.
  //
  // The property is now asserted directly: every host is either THIS deployment's or a named
  // citation. Adding a host to CITATION_HOSTS is a deliberate act with a review behind it, not a
  // number quietly going up.
  const CITATION_HOSTS = new Set(['amplitude.com'])
  const ourHost = new URL(baseURL!).host

  const hosts = new Set((body.match(/https?:\/\/[^/\s)]+/g) ?? []).map((url) => new URL(url).host))
  expect(hosts.has(ourHost), "this deployment's own host is missing").toBe(true)

  for (const host of hosts) {
    expect(
      host === ourHost || CITATION_HOSTS.has(host),
      `${host} is neither this deployment nor a named citation — a hardcoded wrong-environment URL looks exactly like this`
    ).toBe(true)
  }
})

// ── agentic-pm-public-surface · Sprint 1, Story 1.2 ──────────────────────────────────────────────
//
// Everything above this line was written against the document these tests now run against a full
// rewrite of, and NONE of it was edited. That is the mutation check on the rewrite: a document can
// be replaced word for word and still be obliged to keep every safety property the old one had.
//
// What follows is new, and it guards a different class of failure. The old document's problem was
// not that it was unsafe — it was that it taught nothing, and "teaches nothing" is invisible to a
// test suite that only checks for danger. These assert that the framework is actually in here, so a
// future edit that quietly reverts it to eight generic questions fails loudly instead of reading as
// a tidy-up.

test('the workshop makes the reader pick one of the three games', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // The forced choice is the element the source calls the first real disagreement of a workshop and
  // the most useful one. A version of this document without it is a metric exercise, not the North
  // Star Framework.
  for (const game of ['attention game', 'transaction game', 'productivity game']) {
    expect(body.toLowerCase(), `the ${game} is not named`).toContain(game)
  }
})

test('the workshop carries the seven-question checklist and the ladder', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // The checklist is the critique instrument — without it the agent has opinions about a candidate
  // rather than a test for one. Counted by its rungs rather than by a heading, because a heading
  // can survive an edit that guts what is under it.
  expect(body).toContain('leading** indicator of success')
  expect(body).toContain('vanity metric')

  // The ladder is the document's spine and the thing the version this replaced had no equivalent
  // of. All four rungs, in order, each of which means something different.
  const ladder = ['**North Star**', '**Inputs**', '**Opportunities**', '**Interventions**']
  let cursor = -1
  for (const rung of ladder) {
    const at = body.indexOf(rung)
    expect(at, `${rung} is missing from the ladder`).toBeGreaterThan(-1)
    expect(at, `${rung} is out of order — the ladder only means anything top-down`).toBeGreaterThan(cursor)
    cursor = at
  }
})

test('the workshop gives the input heuristic and a worked example of it', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  for (const dimension of ['Breadth', 'Depth', 'Frequency', 'Efficiency']) {
    expect(body, `${dimension} is missing from the input heuristic`).toContain(dimension)
  }

  // A heuristic with no worked example is a list of four nouns. Instacart is the source's own, and
  // its efficiency input is the half that stops the other three being gamed.
  expect(body).toContain('Instacart')
  expect(body).toContain('delivered on time')
})

test('the framework is credited by name, once, and the credit is not repeated', async ({ request }) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // Whitespace-insensitive: the title spans a line break in the rendered document today, and a
  // reflow of that paragraph is not a dropped credit. Assert the claim, not the wrapping.
  expect(body).toMatch(/The North Star\s+Playbook/)
  expect(body).toContain('John Cutler')
  expect(body).toContain('Jason McBride')

  // Epic D6: credited ONCE, near the top. A credit repeated is a document that reads like someone
  // else's — so this asserts the count, not just the presence.
  const mentions = body.match(/Amplitude/g) ?? []
  expect(mentions.length, 'Amplitude should be credited once, not throughout').toBe(1)

  // The credit is a real Markdown hyperlink (Story 1.2, "credited by name with a link"), pointing
  // at the path that was actually fetched. `amplitude.com/north-star-playbook` — the obvious guess
  // — is a 404, so the exact path is asserted rather than the domain: a citation that 404s is
  // worse than none, and nothing else in the pipeline would ever notice.
  expect(body).toContain('](https://amplitude.com/resources/north-star-playbook)')
})

test('the close runs the greenfield test first and names every part of the hand-off', async ({
  request,
}) => {
  const body = await (await request.get('/northstar-self-serve.md')).text()

  // Story 1.3: the greenfield test runs BEFORE the summary. A summary the agent has already been
  // told is wrong is worse than none, because it is the artefact the person keeps. Asserted as an
  // ordering, which is the only form the claim actually has.
  const greenfield = body.indexOf('greenfield test')
  const close = body.indexOf('## Close the workshop')
  expect(greenfield, 'the greenfield test is missing').toBeGreaterThan(-1)
  expect(close, 'the close is missing').toBeGreaterThan(-1)
  expect(greenfield, 'the greenfield test must run before the summary, not after').toBeLessThan(close)

  // The close writes back exactly one shape, and every part of it is load-bearing: guardrails stop
  // the metric being gamed, assumptions are what the first tests attack, and the game is what the
  // whole thing was chosen against.
  for (const part of ['**The game:**', '**North Star:**', '**Inputs:**', '**Guardrails:**', '**Assumptions:**', '**First tests:**']) {
    expect(body, `the close is missing ${part}`).toContain(part)
  }
})
