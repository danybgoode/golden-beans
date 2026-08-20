import { getSiteUrl } from '@/lib/site-url'
import { CATEGORY_DEFINITION } from '@/lib/positioning'

// GET /northstar-self-serve.md — landing-redesign-v2 · Sprint 2, Story 2.4, rebuilt from the real
// methodology by agentic-pm-public-surface · Sprint 1, Stories 1.2 and 1.3 (epic D6).
//
// The landing's hero hands the reader a prompt that tells THEIR agent to read this document and
// facilitate a North Star workshop. So this file is not documentation about the product — it is the
// script the agent runs. Its reader is a model, and its user is whoever that model is talking to.
//
// ── What changed in the rebuild, and why it was worth a sprint ────────────────────────────────
// The version this replaces was eight competent questions that any capable model could have
// produced unaided. It taught nothing: no games, no ladder, no checklist, no worked examples, no
// instrument for critiquing a candidate. A practitioner who ran it got a pleasant conversation and
// a metric with no argument behind it.
//
// This version teaches the North Star Framework as the sources actually set it out. The structure
// is theirs; every word here is ours, and each element is connected to what our engine computes.
// Sources are IN THE REPO, not in a chat log — references/amplitude-north-star-how-to-guide-2024.pdf
// and references/northstar-workshop-skill.md, with references/northstar-sources.md recording the
// provenance and the page-level map.
//
// ── The attribution is scheme-less on purpose (epic A10) ─────────────────────────────────────
// `e2e/northstar-self-serve.spec.ts` asserts this document contains exactly ONE host, which is what
// proves every absolute URL in it came from `getSiteUrl()` rather than being a hardcoded
// wrong-environment literal. A markdown link to Amplitude would be a second `https://` host and
// would fail that pin — for a reason entirely outside what the pin exists to catch.
//
// Rather than loosen a safety assertion to fit a citation, the citation is written without a
// scheme. The credit is complete (title, both authors, publisher, path), a reader or an agent can
// still find it, and the invariant gets STRONGER rather than weaker: every absolute URL in this
// document is ours, with no exceptions to remember. The path was fetched and returns 200 —
// `amplitude.com/north-star-playbook`, the obvious guess, is a 404.
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
// explicitly and more than once that the agent reading it is NOT connected to a Golden Frijoles
// workspace — because the single most likely failure mode of this whole surface is an agent that
// reads a workshop script and then cheerfully claims to have saved the result somewhere.
// e2e/northstar-self-serve.spec.ts pins that, and five other properties, and it was not edited by
// the rebuild — going green unedited is the mutation check on a document that was fully rewritten.
export const dynamic = 'force-dynamic'

export async function GET() {
  const siteUrl = getSiteUrl()

  const body = `# The North Star workshop — self-serve

> A facilitation script for an AI agent to run with a product person, one question at a time.
> Published by Golden Frijoles at ${siteUrl}/northstar-self-serve.md — free to use, no account needed.

${CATEGORY_DEFINITION} This workshop is the first move of it: deciding what "better" means before
anyone builds anything.

**Where this comes from.** The North Star Framework is Amplitude's, set out in *The North Star
Playbook* by John Cutler and Jason McBride and in their 2024 guide *Running Your North Star
Workshop* (amplitude.com/resources/north-star-playbook). The structure below is theirs. The words,
the mechanics and the opinions are ours, and where we disagree with the source we say so. This is
the only place they are credited, because a credit repeated is a document that reads like someone
else's.

## Read this part first (instructions for the agent)

You are facilitating, not answering. The person you are talking to owns their product and their
decision; you own the rigour of the process. Concretely:

1. **Ask ONE question at a time.** Wait for the answer before the next one. A wall of ten questions
   gets one vague reply and the workshop is already over.
2. **Do not anchor them.** Never offer your own candidate metric before they have produced one.
   The source runs this as a silent brainstorm for exactly this reason: the first idea in the room
   becomes the only idea in the room, and you are the fastest talker they will ever work with.
3. **Challenge vague language, every time.** "Engagement", "activation", "value", "quality" and
   "success" are not metrics — they are placeholders for an argument nobody has had yet. When one
   appears, ask what observable event would count.
4. **Keep the goal measurable.** If you cannot describe how the number would be computed from
   things the product can actually observe, it is not a North Star yet.
5. **Do not flatter the answer.** If the metric they propose would go up when the product gets
   worse, say so and show the case.
6. **Progress over perfection.** The failure mode of a workshop with one participant is stalling on
   the first answer and polishing it for an hour. Ask for several candidates, invite deliberately
   terrible ones for contrast, and keep moving. A powerful idea imperfectly measured beats a perfect
   measure of a weak one.
7. **You are NOT connected to a Golden Frijoles workspace.** Unless the person has actually connected
   the MCP connector in this conversation, you cannot read their product data, you cannot save
   anything, and you must not imply otherwise. Say "I don't have access to your data — you'll have
   to tell me" whenever that is the true answer.

Budget: about an hour of real conversation. If they have fifteen minutes, do Steps 1, 2, 4 and 7 and
tell them what you skipped.

## Why this is worth an hour

A North Star exists to make three languages agree: the language of the **customer** (what they
needed, what delighted them), the language of the **product** (what got built and released), and the
language of the **business** (revenue, retention, cost). Teams that are misaligned are usually not
in disagreement — they are speaking three languages and assuming they mean the same thing. One
metric that all three can recognise is what ends that.

It is also why revenue is a bad North Star. Revenue is the business language only, and it is a
**lagging** indicator: by the time it moves, the decision that moved it is months old. A North Star
is a **leading** indicator of the business result — something you can see move this month that
predicts the thing you actually care about next year.

## Step 1 — What does this product do for someone, in one sentence?

Plain language, no positioning. You are listening for the moment of value: the thing that, if it
stopped happening, would mean the product had stopped working.

Then: **who is it for, and what were they doing before?** The "before" matters more than the
persona. It tells you what the product replaced, which is what the metric has to beat.

## Step 2 — Which game is this product playing?

This is the forced choice, and it comes early because it changes everything after it. In the
source's experience it is usually the first real disagreement of a workshop and the most useful one:
it clarifies the team's thinking and often changes the whole focus of the North Star.

Make them pick **one**. Not two, not "a bit of both". Push back once if they hedge.

- **The attention game** — how much time will customers spend here? You win when someone is
  absorbed. *Netflix, Facebook, a news publisher.*
- **The transaction game** — how many transactions do customers make? You win when it is effortless
  to find the right thing and buy it. *Amazon, Walmart, an insurer.*
- **The productivity game** — how efficiently can someone get a job done? You win when they finish
  faster and with fewer errors — and a measure of success might be that they use the product
  **less**. *Salesforce, Adobe, a legal-research tool.*

### The value-exchange trap

Pick the game by the event that creates value, not by the event that moves money.

Run a sports-league app. Customers watch free content and buy a season pass for the broadcasts. It
looks like the transaction game — someone is buying something. But a customer can buy the pass,
never watch a single match, and quietly not renew. The purchase was not the value; the watching was.
That product is playing the attention game.

If they name a game because of where the invoice is, ask what the customer would miss if the product
vanished tomorrow.

### If they are stuck, warm up on someone else's product

Optional, and worth offering the moment they get defensive or go quiet — it is much easier to think
clearly about a product you do not own.

> **OpenTable.** People discover restaurants, read reviews, and book tables. Diners pay nothing;
> restaurants pay a base subscription plus a flat fee per reservation.
>
> Which game is OpenTable playing? What would you propose as its North Star, and what are the two or
> three inputs underneath it?

Spend five minutes on it, then come back. Do not skip the return trip — the point is the contrast.

## Step 3 — Say it qualitatively, before any numbers

Have them finish this sentence:

> "Our path to medium-to-long-term sustainable growth is a function of our ability to ______."

Customer value goes in the blank, not a metric and not a feature. If they cannot explain it
qualitatively, they will not be able to measure it quantitatively — this is the gate, and the source
reports whole workshops spent on this one sentence, productively.

Push until the sentence is specific enough that a competitor could not paste their own name into it.

## Step 4 — The ladder

The single most useful thing in this workshop, and the thing most versions of it leave out. A North
Star is not one number floating above a roadmap. It is the top of a four-rung ladder, and each rung
has a different character:

**North Star** — *ideally customer-centric, stable, mid-to-long-term, specific and descriptive, not
revenue, and deliberately not directly addressable.* You do not "do" a North Star.

*...which is a function of our ability to:*

**Inputs** — *addressable, part of the formula, each one a variable you can move, not a piece of
work, persistent over quarters or years.* Three to five.

*...and we believe the key opportunities and leverage points to influence those inputs are:*

**Opportunities** — *leverage points; each one inspires several options; months to quarters;
solution-agnostic but directional and opinionated.*

*...and some representative options to make tangible progress include:*

**Interventions** — *work-like, experiment-like, time-bound, and expected to change.* This is the
roadmap. It is the bottom rung, not the top.

Ask for **measurement options at every rung**, not just the top. A rung nobody can measure is a rung
where the argument will restart in three months.

The reason this matters: teams that treat the North Star as a task ship a quarter of work that moves
nothing. The North Star is not actionable *on purpose*. The inputs are where the work attaches.

## Step 5 — Candidates, before critique

Ask for **three or four** North Star candidates before you react to any of them. Give them a minute
of silence to write, if the medium allows it. Invite one deliberately terrible candidate — it is
faster than explaining what a vanity metric is, and it sets a floor everyone can see.

Do not evaluate as they arrive. Collect first.

If they circle, offer this fill-in and let them complete it:

> "I would be more confident that our current product strategy is setting us up for sustainable
> long-term growth, if I observed an increase in ______, which we could measure by ______."

Then push the definition until it is countable. "Users sharing content" is not a metric. "Unique
users who shared two or more articles in a week" is.

## Step 6 — Run each candidate against the checklist, out loud

This is the critique instrument. Seven questions, asked about each candidate, with the answer said
rather than assumed:

1. Does it express customer value?
2. Does it represent the product vision and strategy?
3. Is it a **leading** indicator of success?
4. Is it actionable?
5. Is it understandable to someone non-technical?
6. Is it measurable?
7. Is it **not** a vanity metric?

Then run the attack yourself: **would this number go up if the product got worse?** Almost every
candidate has a degenerate path. Engagement rises when people cannot find things. Sign-ups rise when
the trial is confusing. Session length rises when the workflow is slow. If you find one, go back to
Step 5 rather than patching the definition.

### What a good one looks like when it works

Netflix, in the DVD era, had a retention problem: 88% of new members made it past the first month,
which meant 12% did not. Retention is a lagging indicator and far too slow to A/B test against, so
they went looking for something that predicted it. What they found was the number of DVDs a new
member added to their queue in their very first session — three or more, and that member was
markedly more likely to stay.

That became the North Star. They moved it from 60% to 90%, and the two percentage points of
first-month retention it bought — 88% to 90% — were worth a great deal to the business.

Note what is going on there. The metric is not retention. It is a specific, observable, early
customer behaviour that *predicts* retention, and it is one the product team could actually
influence with product work.

Two more, briefly: **Burger King** runs on digital transactions per user, with new-user activation,
registration and frequency underneath it. **Dave**, in banking, found that people who added their
recurring expenses during onboarding were 5.7 times more likely to retain — and pointed the whole
North Star at that.

## Step 7 — The inputs

Three to five. Fewer than three and it is not a formula; more than five and nothing is a priority.

Use **breadth, depth, frequency and efficiency** as the starting frame — it fits most products and
gives them somewhere to push from:

> **Instacart.** North Star: total monthly items received on time by customers.
> **Breadth** — customers placing orders each month.
> **Depth** — items in an order.
> **Frequency** — orders completed per customer per month.
> **Efficiency** — percentage of orders delivered on time.

Note that efficiency input. It is what stops the other three from being gamed: volume that arrives
late does not count.

A worked one in the attention game, for contrast:

> **Spotify.** North Star: time spent listening to music by subscribers.
> **Breadth** — premium trial users; premium subscriptions; users listening on more than one device.
> **Depth** — hours per session; songs shared per user per month; recommended songs per session.
> **Frequency** — sessions per week; median usage interval; weekly stickiness of radio.
> **Mid/long-term impact** — monthly subscriptions from premium users.

Two things to insist on:

- **They must be independent.** Moving one should not automatically move another. Ask it directly,
  input by input: "if this one went up 20% and you changed nothing else, would any of the others
  move on their own?" If yes, you have one input written twice.
- **Each one needs a direction.** "Orders per customer" is not an input. "Orders per customer, up"
  is.

## Step 8 — The greenfield test, before you write anything down

Take each input in turn and ask: **in two minutes, how many different things could you try that
would move this?**

If they can rattle off five or six, the input is pitched at the right altitude. If they run dry
after one, the input is really an intervention wearing an input's name — go back to Step 7 and
raise it a rung.

Run this **before** the summary, not after. A summary you have already been told is wrong is worse
than no summary, because it is the artefact they will keep.

## Close the workshop

Only once the greenfield test passes. Write it back in exactly this shape, and nothing longer:

- **The game:** attention, transaction or productivity — the one they chose.
- **North Star:** the sentence, with its unit and its period. ("Sellers who received a payout this
  week." "Teams that shipped at least one experiment this month.")
- **Inputs:** three to five. Each with the direction it should move, and which of breadth, depth,
  frequency or efficiency it is.
- **Guardrails:** what must NOT get worse while they push the North Star — churn, cost, latency,
  refunds, support load. A goal without guardrails is an instruction to cheat.
- **Assumptions:** what they are betting is true and have not checked.
- **First tests:** the two or three cheapest things that would tell them they are wrong.

Then tell them plainly: this summary exists only in this conversation. Nothing has been saved.

And tell them the honest thing about the artefact itself: a North Star is never finished. Teams that
use this framework well are the ones that keep checking whether the metric still represents what
they believe, and change it when it does not. What they have just built is a hypothesis with a
number attached, not a decision they are stuck with.

## What Golden Frijoles does with this, if they want it saved

Golden Frijoles is a product-context layer their agent operates over MCP.

**Be precise about who does the saving, because you cannot.** The MCP connector is **read-only** —
connecting it lets you *read* their product context on every future question; it does not let you
write their North Star, and it does not save this conversation. Setting the North Star up is
something *they* do in Golden Frijoles, through the app or the SDK. Once it exists there, the engine
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
