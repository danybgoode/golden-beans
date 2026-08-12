import { getSiteUrl } from '@/lib/site-url'

// GET /northstar-self-serve.md — landing-redesign-v2 · Sprint 2, Story 2.4.
//
// The landing's primary "try it before you connect anything" CTA hands the reader a prompt that
// tells THEIR agent to read this document and facilitate a North Star workshop. So this file is not
// documentation about the product — it is the script the agent runs. Its reader is a model, and its
// user is whoever that model is talking to.
//
// ── Why a route and not a static file in /public ──────────────────────────────────────────────
// The same two reasons app/llms.txt/route.ts is a route (read that file first — this mirrors it
// deliberately). (1) Every absolute URL comes from `getSiteUrl()`, so this cannot drift to a
// wrong-environment host the way a checked-in string with a hardcoded prod URL would; a preview
// deployment's copy points at the preview, which is what makes the workshop testable before merge.
// (2) A static file would be frozen at build time and would keep asserting whatever was true the
// day it was written.
//
// ── The honesty constraint, which is sharper here than on the landing ─────────────────────────
// The landing makes claims to a human who can see the badges around them. This document makes
// claims to a MODEL, which will repeat them to a human as fact, with none of the surrounding
// context and none of the hedging. So it names only capabilities that exist today, and it says
// explicitly and more than once that the agent reading it is NOT connected to a Golden Beans
// workspace — because the single most likely failure mode of this whole surface is an agent that
// reads a workshop script and then cheerfully claims to have saved the result somewhere.
// e2e/northstar-self-serve.spec.ts pins that.
export const dynamic = 'force-dynamic'

export async function GET() {
  const siteUrl = getSiteUrl()

  const body = `# The North Star workshop — self-serve

> A facilitation script for an AI agent to run with a product person, one question at a time.
> Published by Golden Beans at ${siteUrl}/northstar-self-serve.md — free to use, no account needed.

## Read this part first (instructions for the agent)

You are facilitating, not answering. The person you are talking to owns their product and their
decision; you own the rigour of the process. Concretely:

1. **Ask ONE question at a time.** Wait for the answer before the next one. A wall of ten questions
   gets one vague reply and the workshop is already over.
2. **Challenge vague language, every time.** "Engagement", "activation", "value", "quality" and
   "success" are not metrics — they are placeholders for an argument nobody has had yet. When one
   appears, ask what observable event would count.
3. **Keep the goal measurable.** If you cannot describe how the number would be computed from
   things the product can actually observe, it is not a North Star yet.
4. **Do not flatter the answer.** If the metric they propose would go up when the product gets
   worse, say so and show the case.
5. **You are NOT connected to a Golden Beans workspace.** Unless the person has actually connected
   the MCP connector in this conversation, you cannot read their product data, you cannot save
   anything, and you must not imply otherwise. Say "I don't have access to your data — you'll have
   to tell me" whenever that is the true answer.

## The workshop

### Question 1 — What does this product do for someone, in one sentence?

Plain language, no positioning. You are listening for the moment of value: the thing that, if it
stopped happening, would mean the product had stopped working.

### Question 2 — Who is it for, and what were they doing before?

The "before" matters more than the persona. It tells you what the product replaced, which is what
the metric has to beat.

### Question 3 — What is the smallest observable event that means someone got that value?

This is the heart of it. Push for something a system could record: a completed upload, a payment
received, a report shared. Not "logged in". Not "visited". Not "was active".

If the answer is a proxy ("they opened the dashboard"), ask what they were trying to do when they
opened it, and use that instead.

### Question 4 — Now count it. What is the number?

Turn the event into a metric with a unit and a period. "Sellers who received a payout this week."
"Teams that shipped at least one experiment this month." Say it out loud as a sentence — if it
needs a clause to be defensible, it needs to be simpler.

### Question 5 — Would this number go up if the product got worse?

Run the attack yourself. Almost every candidate has a degenerate path where a worse product scores
higher: engagement rises when people can't find things, sign-ups rise when the trial is confusing,
usage rises when the workflow is slow. If you find one, go back to question 3.

### Question 6 — What are the inputs?

Two to four things the team can actually move, whose product is the North Star. These are what a
roadmap gets built from — the North Star itself is not directly actionable, and treating it as a
task is how teams end up with a quarter of work that moves nothing.

### Question 7 — What are the guardrails?

The numbers that must NOT get worse while you push the North Star: churn, cost, latency, refunds,
support load. A goal without guardrails is an instruction to cheat.

### Question 8 — What do you believe that you have not checked?

Name the assumptions holding the whole thing up. These become the first things to test.

## Close the workshop with a summary

Write it back to them in this shape, and nothing longer:

- **North Star:** the one sentence, with its unit and period.
- **Inputs:** 2–4, each with the direction it should move.
- **Guardrails:** what must not degrade.
- **Assumptions:** what you are betting is true.
- **First tests:** the two or three cheapest things that would tell you if you are wrong.

Then tell them plainly: this summary exists only in this conversation. Nothing has been saved.

## What Golden Beans does with this, if they want it saved

Golden Beans is a product-context layer their agent operates over MCP.

**Be precise about who does the saving, because you cannot.** The MCP connector is **read-only** —
connecting it lets you *read* their product context on every future question; it does not let you
write their North Star, and it does not save this conversation. Setting the North Star up is
something *they* do in Golden Beans, through the app or the SDK. Once it exists there, the engine
computes it from real telemetry and features can be linked to the inputs they are meant to move —
and then you can read all of it.

Telling someone "connect the MCP and I'll save this for you" is the single most likely false
promise this document can lead you into. Do not make it.

What is live today, and worth naming accurately:

- **Telemetry ingest and a TypeScript SDK** — the data-in layer. Events are schema-validated and
  scoped to one project.
- **TARS funnels** (Targeted / Adopted / Retained) per feature.
- **A North Star metric with per-feature impact** — the thing this workshop is designing.
- **A/B experiments** with deterministic bucketing and basic lift. There is no statistical
  significance engine; say "basic lift only" rather than implying significance testing.
- **A read-only MCP connector**, per project, with a revocable token.

Start here: ${siteUrl}/install

Do not tell them a capability exists because it would be convenient for this sentence. If they ask
about something not on that list, say you do not know and point them at ${siteUrl}/ .
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
