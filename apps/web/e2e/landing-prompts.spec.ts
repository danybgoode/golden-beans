import { test, expect } from '@playwright/test'
import { PROMPT_ROUTES, decisionPrompt, handoffPrompt } from '@/lib/landing-prompts'

// landing-redesign-v2 · Sprint 2, Story 2.2 — the prompts the landing hands to a reader's agent.
//
// ── The failure this exists to catch ──────────────────────────────────────────────────────────
// The landing's primary CTA is "copy this prompt into your agent". That prompt names URLs, and a
// URL inside a copied string is the least visible dependency this app has: nothing imports it, no
// type-checker sees it, no link-checker crawls it, and it breaks silently on somebody else's
// machine inside somebody else's model. `/northstar-self-serve.md` did not exist at all when the
// mockup was written — the CTA would have shipped pointing at a 404 and nobody here would ever
// have seen the failure.
//
// So every URL named in a prompt is fetched against this run's own base URL. This is only possible
// because `lib/landing-prompts.ts` takes `siteUrl` as an argument instead of hardcoding the
// production host — a literal would make this assertion untestable everywhere except production,
// which is everywhere it gets reviewed.

test('every route named in a landing prompt resolves', async ({ request }) => {
  for (const route of PROMPT_ROUTES) {
    const res = await request.get(route)
    expect(res.status(), `${route} is named in a landing prompt but does not resolve`).toBe(200)
  }
})

test('the prompts name no URL outside the checked set', async ({ baseURL }) => {
  const prompts = [handoffPrompt(baseURL!), decisionPrompt(baseURL!)]

  for (const prompt of prompts) {
    const urls = prompt.match(/https?:\/\/\S+/g) ?? []
    expect(urls.length, 'a prompt with no URLs would send the agent nowhere').toBeGreaterThan(0)

    for (const url of urls) {
      // Strip trailing punctuation the prose puts after a URL ("…/llms.txt.").
      const cleaned = url.replace(/[.,)\]]+$/, '')
      const path = cleaned.slice(baseURL!.length)
      expect(
        PROMPT_ROUTES as readonly string[],
        `${cleaned} is named in a prompt but is not in PROMPT_ROUTES, so nothing checks it resolves`
      ).toContain(path)
    }
  }
})

// ── The safety property of this whole surface, and WHERE IT NOW LIVES ────────────────────────
//
// The likeliest bad outcome from these prompts is not a wrong answer but a confident one about data
// the agent never had: a model telling its human "I can see your workspace" when nothing is
// connected, or "connect the MCP and I'll save your North Star" when the connector is read-only
// (AGENTS.md rule #3). Two assertions used to pin that sentence inside `handoffPrompt`, added after
// a cross-family review of PR #92.
//
// ⚠️ **`24220da` ("optimize hero copy", 2026-09-02) rewrote `handoffPrompt` and the sentence went
// with it** — so both assertions were RED on `main`, and on every PR opened after it, until
// `mockups-as-built` Sprint 1 tripped over them. Daniel confirmed the new copy is deliberate and
// stays.
//
// **The guard is re-pointed rather than deleted, because the property did not go anywhere — it
// moved one layer down.** The new `handoffPrompt`'s FIRST instruction is *"Read <site>/llms.txt"*,
// and `app/llms.txt/route.ts` carries it in full: *"Do not claim to be connected… Even once
// connected, the connector is read-only."* So the agent still receives it, from the document the
// prompt exists to load.
//
// Deleting these two tests would have been the easy read of "the copy changed". That is the move
// this repo keeps paying for — a guard "fixed" by weakening it until it matches whatever shipped.
// What is asserted is the PROPERTY, at its real home, plus the link that carries a reader to it.
test('the agent is told not to claim a connection it does not have', async ({ request, baseURL }) => {
  // `decisionPrompt` still says it inline, so it is still pinned inline.
  expect(decisionPrompt(baseURL!)).toContain("Don't pretend you have access to my workspace")

  // `handoffPrompt` delegates to the manifest — so the delegation itself is the assertion. A
  // handoff prompt that stopped naming llms.txt would carry no honesty instruction at all, and
  // that is exactly the state this must go red on.
  expect(
    handoffPrompt(baseURL!),
    'the handoff prompt no longer points at llms.txt, which is the only place it carries the ' +
      '"do not claim to be connected" instruction'
  ).toContain('/llms.txt')

  const manifest = await request.get(`${baseURL}/llms.txt`)
  expect(manifest.status()).toBe(200)
  const body = await manifest.text()
  expect(body, 'llms.txt no longer tells the agent not to claim a connection').toContain(
    'Do not claim to be connected'
  )
})

test('the agent is told the connector is read-only and cannot save the work', async ({
  request,
  baseURL,
}) => {
  // The second half of the same problem, caught in cross-family review of PR #92: a model reading a
  // loose version would reasonably tell its human "connect the MCP and I'll save your North Star",
  // which nothing in the system can do.
  const manifest = await request.get(`${baseURL}/llms.txt`)
  expect(manifest.status()).toBe(200)
  const body = await manifest.text()
  expect(body, 'llms.txt no longer states the read-only boundary').toContain('the connector is read-only')
  expect(body, 'llms.txt no longer says the agent cannot write').toContain('you cannot write anything')
})
