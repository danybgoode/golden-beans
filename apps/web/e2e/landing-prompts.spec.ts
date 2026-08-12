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

// The safety property of this whole surface. Both prompts run inside a model we do not control,
// in a context we cannot see; the likeliest bad outcome is not a wrong answer but a confident one
// about data the agent never had. If this instruction is ever edited out, the prompt starts
// inviting exactly that.
test('both prompts forbid the agent from claiming a workspace connection', async ({ baseURL }) => {
  expect(handoffPrompt(baseURL!)).toContain('Do not claim you are connected to my Golden Beans workspace')
  expect(decisionPrompt(baseURL!)).toContain("Don't pretend you have access to my workspace")
})
