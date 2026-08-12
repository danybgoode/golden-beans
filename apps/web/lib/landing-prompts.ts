// landing-redesign-v2 · Sprint 2, Story 2.2 — the two prompts the landing hands to a reader's own
// agent.
//
// ── Why these are FUNCTIONS OF the site URL, not string constants ─────────────────────────────
// The obvious version hardcodes `https://goldenbeans.app/llms.txt`, because that is the URL a
// stranger's ChatGPT has to be able to fetch. It is also the version that cannot be tested and
// that AGENTS.md rule #5 exists to prevent: every absolute URL in this app is built by
// `getSiteUrl()` so it can never be a wrong-environment literal. Taking `siteUrl` as an argument
// buys three things — a preview deployment's prompt points at the preview and can actually be
// exercised before merge, `e2e/landing-prompts.spec.ts` can fetch every URL the prompt names
// against the run's own base URL, and there is no production hostname in the source to go stale
// the next time the domain moves.
//
// No `import 'server-only'`: `CopyPromptCard` is a client component and receives the built strings
// as props, so this module is legitimately reachable from both sides of the boundary. It stays
// pure — the caller resolves `getSiteUrl()` (which IS server-only) and passes the result in.
//
// ── The rule both prompts end on, and why it is in the prompt rather than in our heads ────────
// Both tell the reader's agent not to claim it is connected to a Golden Beans workspace it has not
// actually been given. That sentence is the whole safety property of this surface: the prompt is
// executed by a model we do not control, in a context we cannot see, and the likeliest bad outcome
// is not a wrong answer — it is a confident one about data it never had. It is stated here AND in
// /northstar-self-serve.md because the reader's agent may be handed either one first.

/**
 * The paths every prompt names. `e2e/landing-prompts.spec.ts` asserts each resolves, and that the
 * built prompts mention no URL outside this list.
 */
export const PROMPT_ROUTES = ['/llms.txt', '/northstar-self-serve.md'] as const

/**
 * The `#try` section's prompt — evaluate Golden Beans, then optionally run the workshop.
 *
 * Deliberately instructs the agent NOT to sell: an agent told to pitch produces marketing copy the
 * reader already discounted before they pasted anything, which wastes the one moment of genuine
 * curiosity this page gets.
 */
export function handoffPrompt(siteUrl: string): string {
  return `Read ${siteUrl}/llms.txt and act as my product-thinking partner for this conversation.

First, explain Golden Beans in plain English: what it is, what it gives my agent, and what it deliberately does not do. Keep it brief and don't sell me.

Then give me two choices:
1) ask questions about Golden Beans, or
2) run the North Star workshop now.

If I choose the workshop, read ${siteUrl}/northstar-self-serve.md and facilitate it one question at a time. Use my answers, challenge vague language, and keep the goal measurable. At the end, summarize the proposed North Star, its inputs, guardrails, assumptions, and the first things we should test.

Do not claim you are connected to my Golden Beans workspace unless I have actually connected the MCP. If we finish useful work, explain that connecting Golden Beans is how I can save it and give you ongoing product context.`
}

/**
 * The closing CTA's prompt — should I even use this?
 *
 * Asks the reader's own agent to argue both sides, including "where it probably would not help".
 * A decision aid that can only reach one conclusion is an advert with extra steps, and a reader
 * who notices that has learned something about the product rather than about the prompt.
 */
export function decisionPrompt(siteUrl: string): string {
  return `Read ${siteUrl}/llms.txt. Based on what Golden Beans actually does, help me decide whether it could improve how I manage product decisions and move our North Star. Ask me only the minimum questions you need about my product, current decision process, and where context gets lost. Then give me: (1) where Golden Beans would create leverage, (2) where it probably would not help, and (3) whether the next sensible step is the North Star workshop or connecting Golden Beans. Don't pretend you have access to my workspace unless I connect it.`
}
