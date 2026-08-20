---
title: "The public surface names the category — agentic product management, a hero that hands you a prompt, and a North Star workshop worth the URL"
slug: agentic-pm-public-surface
status: queued
area: "02"
type: feature
priority: "wave-2026-08-20"
appetite: L
underwritten_by: "Roadmap/bets/wave-2026-08-20-agentic-pm.md"
risk: low
epic: "02-commercial/agentic-pm-public-surface"
build_order: 23
updated: 2026-08-20
---

# Scope — the public surface says one thing, and the workshop earns its URL

> **Class:** Feature (a copy-and-composition epic with one genuinely-new document) · **Lane:** shaped bet · **Risk:** low
> **Source:** product-owner instruction 2026-08-20 (groom session), plus two attachments — the
> `northstar-workshop` skill Daniel has been running in Claude, and *Amplitude — How-to Guide:
> Running Your North Star Workshop (2024)*, 28pp.
> **Predecessors:** [`landing-maker-ops`](../../02-commercial/landing-maker-ops/README.md) (the
> spine this edits), [`landing-readability-pass`](../../02-commercial/landing-readability-pass/README.md)
> (the subtractive pass this continues), [`methodology-experience`](../../02-commercial/methodology-experience/README.md)
> (shipped 2026-08-20 — `/methodology` is the room this epic points at).
> **Underwriting:** approved by the product owner 2026-08-20 and bet at
> [`Roadmap/bets/wave-2026-08-20-agentic-pm.md`](../../bets/wave-2026-08-20-agentic-pm.md).
> **Scaffolded at:** [`02-commercial/agentic-pm-public-surface/`](../../02-commercial/agentic-pm-public-surface/README.md)

## Mirror-back

You want the three surfaces a stranger actually reads — the landing, `/llms.txt`, and
`/northstar-self-serve.md` — to stop being three voices. All three should name one category,
**agentic product management**; all three should carry the harder, more credible register of a
serious enterprise product brief without the page changing who it is for; the landing should stop
opening on an illustration and start opening on something you can paste into your own agent; and the
North Star workshop should stop being a competent generic script and become the best practitioner
experience on the site.

## Classification

**Feature.** Three surfaces, three different buckets:

| Half | Bucket (Stage 2.5) | Notes |
|---|---|---|
| The four structural landing edits | **Light enhancement** — every component exists; two get deleted, one gets a heading swap, one gets its right column replaced. No new route, no new data, no new primitive. | The hero's new right column is `CopyPromptCard`, which already exists and is already specced. |
| The register + category pass (landing, meta, `/llms.txt`, `/methodology` intro) | **Light enhancement** — copy only, on surfaces that already render it. One new tiny module (`lib/positioning.ts`) so the category is stated once. | |
| `/northstar-self-serve.md`, rebuilt | **Genuinely new** — the route exists, the document is a placeholder. What replaces it is a different artefact with a different shape and a much higher bar. | This is the epic's centre of gravity and Sprint 1. |

Groomed as **one epic** rather than three, because the register is the thing being unified — a copy
pass that lands on the landing but not on the manifest an agent reads produces exactly the
two-voices problem this epic exists to end. **Sprint 1 is carved to ship standalone**: if the
appetite is exhausted after it, the highest-priority thing you asked for is live and nothing else is
half-built.

## Decisions locked (Daniel, 2026-08-20 groom session)

### D1. Borrow the enterprise register. Do not borrow the enterprise motion.

The source copy is a job post for a sales-led, up-market product — procurement, security reviews,
seat expansion, company-wide deployment. The page it would land on repositioned eight days ago,
across 21 stories, onto the opposite claim: *one maker, a whole operation*. Importing the motion
would re-argue `landing-maker-ops` by accident.

What transfers, and it transfers cleanly, is the **surface**. The job post's pitch is that one
person can own identity and access, governance, security, spend control, admin tooling and the
growth engine — which is a literal description of Golden Frijoles' four Ops surfaces, at a different
scale. So the translation rule for the whole epic:

> **Enterprise scope, maker scale.** Every borrowed phrase gets re-pointed at one person and their
> agents. "Give the world's largest organizations control of their policies and costs" becomes
> control of *your* policies and costs, without a department. "Employees stuck using a single model
> family" becomes *you*, stuck on whichever agent you happened to start with.

**What we take:** lock-in and capacity constraints as the named enemy · the flexibility to move
fast, scale confidently and stay future-proof *as models evolve* · model-agnosticism as a stated
value (Golden Frijoles is already exactly this — "you bring the agent") · owning a broad product
surface rather than a feature · the difference between something that demos well and something that
holds up in production · high product taste · analytics-heavy and technical, said without apology.

**What we leave:** procurement, RFPs, security questionnaires, seat expansion, "the world's largest
organizations", anything implying a sales team or an admin console for other people's employees.

**Where it lands** (spread, per your instruction — not one enterprise block):

| Surface | The borrowed idea it carries |
|---|---|
| `§hero` sub-copy | move fast · future-proof as models evolve |
| `§ops` (renamed, see D3) | the broad product surface, one person owns it |
| `§authority` | governance and control over policy — without a department |
| `§finops` | spend control and unit economics (it already says it is unbuilt; that badge stays) |
| `§methodology` | high product taste · demos well vs. holds up |
| `§pricing` + `§start` | no lock-in · you bring the agent |
| `/llms.txt` | the whole positioning paragraph, in plain language |

### D2. The category gets named **and defined**, once, from one place in the code

"Agentic product management" is an emerging term with no owner, and today's usage mostly means
*managing agentic AI products* — building agents — which is not what we mean. Used bare, an agent
summarising this page for someone will repeat the term with the market's meaning and file us as an
agent-building tool. So we define it, in one line, and then use it bare everywhere else.

**Proposed line (Story 1.1 finalises the wording with you):**

> *Agentic product management: the whole product discipline — decide, build, prove, grow — run by
> one person and their agents, on rails that keep the evidence honest.*

**One string, one module.** This repo has been bitten three times in one epic by two lists that had
to agree (`MakerHero`'s bag rows vs. `MAKER_OPS_SURFACES`), and the fix each time was to derive
rather than to repeat. A category name and its definition repeated across five outward-facing
surfaces is the same defect waiting. So: `lib/positioning.ts` exports the category name and the
definition sentence; every public surface that names the category imports it; a spec asserts the
string appears identically on each. Renaming the category later is then one edit, not a hunt.

### D3. The four structural edits, exactly

1. **`§hero`'s right column becomes a single `CopyPromptCard`.** Both current objects go — the kraft
   bag and the illustrated agent window. The bag's honest surface list is not lost: `§ops` derives
   from the same `MAKER_OPS_SURFACES` and resolves the same gates. The hero stops illustrating and
   starts inviting.
2. **`§product` ("One operating context") is deleted** — component, registry entry, and the app-shell
   illustration inside it, all in the same commit, per the rule `lib/landing-sections.ts` states
   about itself.
3. **`§ops`'s eyebrow changes from "One project, many operations" to "One operating context"** — the
   phrase survives its section. Everything else in `§ops` is untouched: the tabs, the derived
   surfaces, the gate resolution.
4. **`§proof` is deleted** — `ProofSection`, `PodReportProof`, `LiveEngineProof`, and their registry
   entry. See D4 for what this costs and what has to move.

### D4. Deleting `§proof` has three consequences, and each has an owner

You chose the full removal over the split. That is a defensible call — both proofs are *about us*,
and the Pod Report opens by telling a maker to skip it — but it is not free, and the story that does
it has to handle all three:

- **The nav loses two anchors.** `Nav.tsx` links `/#product` and `/#proof`, and
  `e2e/landing.browser.spec.ts` asserts every registry id is a real DOM id. Proposed resolution:
  the nav becomes `Ops · Pricing · Methodology`, with "Product" retired rather than re-pointed at
  `#ops` (a link labelled Product landing on a section called Ops is the kind of small lie that
  costs more than the link is worth). **Flag if you want "Product" kept.**
- **The stamps renumber.** `§proof` is `SectionDivider number={1}` and `§pricing` is `2`. With proof
  gone there is one stamped section, and a lone "1" stamp is a numbering that describes a document
  nobody can read. Proposed: drop the divider from `§pricing` too, and the device retires with the
  argument it was counting.
- **Orphans.** `lib/week-over-week.ts` exists only because `LiveEngineProof` needed it testable.
  The story checks for and removes what becomes unreachable, or states why it stays.

**One thing I flagged and you overruled, recorded because it is the risk:** the page's central
argument is evidence over assertion, and `LiveEngineProof` was the only non-illustrative thing on
it — a real read of the demo tenant, performed while the page rendered. After this epic every frame
on `/` is explicitly labelled an illustration. The mitigation already in the plan is the hero prompt
(D5): a reader who pastes it gets their own agent to go and check us, which is a stronger proof than
a stat tile and does not require us to be believed. If the page later feels thin on evidence, the
live read comes back as a strip under the hero rather than as a section — do not rebuild `§proof`.

### D5. The hero gets `handoffPrompt`; `§start` keeps `decisionPrompt`

`handoffPrompt()` is written, documented and covered by `e2e/landing-prompts.spec.ts`, and has had
**no call site** since `landing-readability-pass` cut `§try`. It is the better hero prompt on the
merits: it tells the reader's agent to explain Golden Frijoles plainly and *not to sell*, then offers
to run the North Star workshop — which routes the top of the page straight into this epic's
centrepiece.

`decisionPrompt` stays at the bottom, where its rhetorical job is. `landing-readability-pass` D1
ruled that two copy-a-prompt blocks read as a pattern rather than an invitation; that ruling stands
for two blocks asking the *same* thing. These ask different things at different moments — the top
offers to teach you something, the bottom asks your own agent whether to bother — and the page now
has a graphic-free hero that needs a reason to exist. The epic README records the reversal
explicitly so a future reader does not think it was forgotten.

### D6. `/northstar-self-serve.md` is rebuilt from the real methodology, in our words, with visible lineage

The current document is a competent eight-question script that any capable model could have written
unaided. What Daniel actually runs is the `northstar-workshop` skill, which is a facilitation
programme with theory, case studies, a checklist and a heuristic behind it — and the source is
Amplitude's North Star Framework (the *North Star Playbook*, Cutler & McBride).

**Attribution ruling:** the structure is theirs, the words and the mechanics are ours. Every step is
rewritten in Golden Frijoles' voice and connected to what our engine actually computes; the North
Star Framework and the Playbook are credited by name, with a link, once, near the top. Not
throughout — a credit repeated is a document that reads like someone else's.

**What the rebuilt document has to contain** (from the skill + the guide, mapped to our surfaces):

| Element | Source | How it lands here |
|---|---|---|
| The three languages — customer, product, business | skill | Framing paragraph; why alignment is the point |
| **The three games** — Attention · Transaction · Productivity | skill + guide pp.8–10 | An early forced choice. Pick one. The guide's own finding: encouraging one game is most fruitful, and it changes the whole focus |
| Value exchange over apparent transaction | guide p.10 | The season-pass example, retold with a product we can name |
| Leading vs. lagging indicators | skill + guide p.23 | Netflix: three DVDs in the first session, 60% → 90%, two points of first-month retention |
| **The North Star checklist** (7 questions) | guide p.11 | The critique instrument. The agent runs the candidate against it, out loud |
| The qualitative statement — "our path to sustainable growth is a function of our ability to…" | skill + guide p.14 | Gate before numbers: if you cannot say it, you cannot measure it |
| **The statement ladder** — North Star → Inputs → Opportunities → Interventions, each with measurement options and its own character notes | guide pp.15–16 | The document's spine, and the thing the current version has no equivalent of |
| **Breadth · Depth · Frequency · Efficiency** | skill + guide p.18 | The input heuristic, with the Instacart worked example |
| Inputs must be independent, and few (3–5) | skill | Explicit instruction to the agent to test independence |
| Warm-up on someone else's product | guide p.19 | Optional; the agent offers it when the person is stuck or defensive |
| Silent brainstorm, then pair, then converge | guide p.24 | Adapted for one person + one agent: candidates *before* critique, so the agent does not anchor them |
| Progress over perfection; write terrible candidates on purpose | guide pp.11, 24 | Named as a rule, because the failure mode of a solo workshop is stalling on the first answer |
| The "I would be more confident… if I observed an increase in… which we could measure by…" template | guide p.25 | A fill-in the agent can offer when the person is circling |
| The greenfield test | skill | Closing check: two minutes of opportunities per input, or the inputs are pitched wrong |
| Converge — game · candidates · what to eliminate · what you still need to know | guide p.26 | The close |
| It is never done; it will evolve | guide p.27 | The last line, and the honest one |

**Case studies to carry** (all from the sources, all checkable): Netflix, Burger King (digital
transactions per user), Dave (recurring expenses, 5.7x), Instacart (monthly items received on time),
Spotify and OpenTable worksheets, Amazon/Walmart/Salesforce/Adobe as game archetypes.

**What must survive from the current document, non-negotiably** — the safety property is the whole
reason this route is a route and not a static file:

- "Ask **ONE question at a time**" (pinned by `e2e/northstar-self-serve.spec.ts`).
- "You are **NOT connected to a Golden Frijoles workspace**" and "**Nothing has been saved.**" (pinned).
- "**basic lift only**", never "statistically significant" (pinned).
- "**read-only MCP connector**" (pinned).
- Every absolute URL from `getSiteUrl()`; exactly one host in the body (pinned).

Any rewrite that drops one of these turns a green suite red, which is the point.

### D7. `/llms.txt` becomes an operating brief, not just a map

Your note — *"asks the right questions and replies in simple language"* — cannot be literally true of
a static manifest: it is fetched, not conversed with. What it *can* do is tell the agent that fetched
it how to behave with the practitioner on the other side. So the rebuilt manifest keeps its route
map and gains three things:

1. **The positioning paragraph** — what Golden Frijoles is, in the D1 register, naming the category
   from `lib/positioning.ts`.
2. **"If someone has just arrived, ask these"** — four or five diagnostic questions an agent should
   put to a practitioner before recommending anything (what are you building · what decides your
   roadmap today · where does context get lost between you and your agent · what would you have to
   stop guessing about · do you have a goal your team agrees on). This is what makes it a top-shelf
   experience rather than a sitemap.
3. **A plain-language rule** — an explicit instruction to answer in short sentences, avoid our
   vocabulary until the person has a reason to care about it, and say "I don't know" rather than
   infer a capability.

The honesty guardrail the current file states about itself is unchanged and inherited: **this
manifest lists only what is live in this deployment right now.**

## Platform-first note

No new route, table, event path, flag or primitive. One new pure module (`lib/positioning.ts`), two
components deleted, one component's right column replaced, four copy files edited. Telemetry is
untouched — `SelfTrackBeacon` stays first in `app/page.tsx` (AGENTS rule #1). Every gate
(`RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `DESTINATION_DELIVERY_ENABLED`,
`SIGNUP_ENABLED`) is read exactly as before. `force-dynamic` stays on `/` — it was never only about
the proof numbers; every flag-derived sentence on the page depends on it.

## What already exists (reuse, don't rebuild)

| Need | Already there |
|---|---|
| A copy-a-prompt card with a real clipboard round-trip | `components/landing/CopyPromptCard.tsx` — already used on `/methodology`, already specced |
| The hero prompt itself | `lib/landing-prompts.ts` → `handoffPrompt()`, written and tested, currently call-site-free |
| Prompt URL safety (one host, every path resolves) | `e2e/landing-prompts.spec.ts` + `PROMPT_ROUTES` |
| The section ↔ epic registry and its round-trip assertion | `lib/landing-sections.ts` + `e2e/landing.browser.spec.ts` |
| The honest Ops surface list with per-request gate resolution | `lib/maker-ops.ts` (`§ops` keeps it; the hero's copy of it goes away with the bag) |
| The methodology's chapter registry | `lib/methodology-chapters.ts` — `§methodology`'s card derives from it; the register pass must not fork it |
| Every absolute URL | `lib/site-url.ts` → `getSiteUrl()` (AGENTS rule #5) |
| The workshop route's safety pins | `e2e/northstar-self-serve.spec.ts` — four tests that already encode D6's non-negotiables |
| The manifest's host + capability pins | `e2e/llms-txt.spec.ts` |
| Heading-style enforcement (no terminal full stop) | `scripts/check-design-drift.mjs` D7 |

## Sprints — proposed slicing

### Sprint 1 — the workshop earns its URL *(your top priority; ships standalone)*

| # | Story | Risk | QA stage |
|---|---|---|---|
| 1.1 | **As a reader, I want the category named the same way everywhere**, so that one product is described once. `lib/positioning.ts` + unit spec. Wording confirmed with Daniel before it lands. | low | unit spec (`positioning.test.ts`) |
| 1.2 | **As a practitioner without an account, I want a workshop that actually teaches me the North Star Framework**, so that I leave with a defensible metric rather than a nice conversation. The full D6 rebuild of `app/northstar-self-serve.md/route.ts`. | low | extend `e2e/northstar-self-serve.spec.ts` — existing four tests stay green untouched; new tests for the games, the checklist, the ladder, the BDFE heuristic, and the attribution line |
| 1.3 | **As an agent running the workshop, I want to know when to stop and what to hand back**, so that I do not stall or over-run. The close: the summary shape, the greenfield test, the "nothing has been saved" statement, and the honest hand-off to `/install`. | low | in 1.2's spec |
| 1.4 | **As Daniel, I want to run the whole thing end-to-end in a real agent before it is public.** Paste the hero prompt into a fresh Claude/ChatGPT against the preview URL and run the workshop on a real product. | low | **owed to you by name** — no automated smoke can judge whether a facilitation script facilitates |

### Sprint 2 — the landing's structure

| # | Story | Risk | QA stage |
|---|---|---|---|
| 2.1 | **As a reader, I want the hero to hand me something I can use**, so that the first thing I meet is not an illustration. Right column → `CopyPromptCard(handoffPrompt)`; bag and agent window deleted. | low | `e2e/landing.browser.spec.ts` — clipboard round-trip in the hero; the "every framed window carries a SurfaceNote" assertion updated for a hero that has no framed window |
| 2.2 | **As a reader, I want one section about the operating context, not two.** Delete `§product` + registry entry; `§ops` eyebrow → "One operating context". | low | registry round-trip spec (already asserts id ↔ DOM id) |
| 2.3 | **As a reader, I want the page to end on the offer.** Delete `§proof` + both proofs + registry entry; nav loses `Product` and `Proof`; stamps retire; orphan sweep. | low | registry round-trip + a nav-link spec asserting every nav anchor resolves |
| 2.4 | **As a reader on a phone, I want the new hero to still fit.** `mobile-heuristics.browser.spec.ts` calls the prompt card the element most likely to blow the layout budget — and it just moved above the fold. | low | `e2e/mobile-heuristics.browser.spec.ts` |

### Sprint 3 — the register, everywhere it shows

| # | Story | Risk | QA stage |
|---|---|---|---|
| 3.1 | **As a reader, I want the page to sound like a serious product**, so that I take the claim seriously. The D1 copy pass across `§hero`, `§ops`, `§authority`, `§finops`, `§methodology`, `§pricing`, `§start`. No capability claim changes; every badge and gate sentence untouched. | low | `check-design-drift.mjs` + a browser read-through; the existing gate/badge assertions must stay green *without being edited* — if a copy change requires touching one, the copy overclaimed |
| 3.2 | **As someone who sees the link before the page, I want the preview to name the category.** `<title>` + meta description + OG alt. **Constraint inherited:** the description names NO capability — a link preview travels without its qualification and gate state is per-deployment (three review rounds established this; do not re-litigate). | low | `e2e/landing-redirects.spec.ts` / metadata spec |
| 3.3 | **As an agent sent to `/llms.txt`, I want to know how to help the person who sent me.** The D7 rebuild. | low | `e2e/llms-txt.spec.ts` — existing host/capability pins stay; new assertions for the diagnostic questions and the plain-language rule |
| 3.4 | **As a reader arriving at `/methodology`, I want it to open on the same category the landing named.** Intro copy only — the six chapters, their vocabulary and `Consider · Operate · Exit` are untouched. | low | `e2e/methodology-vocabulary.spec.ts` must stay green untouched |

## In scope / out of scope

**In:** `app/page.tsx` · `components/landing/{MakerHero,OpsSection,MakerClosingCta,Nav,PricingSection}.tsx` ·
deletion of `{OperatingContextSection,ProofSection,PodReportProof,LiveEngineProof}.tsx` ·
`lib/landing-sections.ts` · new `lib/positioning.ts` · `app/layout.tsx` metadata · `app/opengraph-image.tsx` alt ·
`app/llms.txt/route.ts` · `app/northstar-self-serve.md/route.ts` · `/methodology` intro copy · the specs named above.

**Out:**

- The signed-in app. The category sweep stops at the public surface — the same ruling
  `wave-2026-08-20` made for *Shape → Design*, honoured rather than rediscovered.
- `AGENTS.md`, `WAYS-OF-WORKING.md`, `LEARNINGS.md`, the `groom` skill, the seeds. Internal
  vocabulary is unchanged.
- The six methodology chapters' content. Only the intro is touched.
- `references/design/assets/tokens.css` — still the byte-mirrored handoff, still not edited.
- Pricing tiers, the payment rail, `SIGNUP_ENABLED`, and every gate's polarity.
- Any new enterprise capability. This epic changes how we *speak*, not what we *have* — if a
  sentence in Sprint 3 needs a capability we do not ship, the sentence is wrong.
- The `/hub` roadmap views, which the Pod Report deletion must not disturb.

## Open risks

1. **The register pass is the one place this epic can start lying.** Enterprise copy is confident
   copy, and this codebase has thirteen review rounds of history about exactly that. The guard is
   procedural and in the story: Sprint 3's gate/badge assertions must pass **unedited**. A copy
   change that requires loosening an honesty assertion is the assertion catching it.
2. **`§proof`'s removal is one-way in practice.** Reinstating it means resurrecting two deleted
   components. D4 records the mitigation and the "if it feels thin, do this instead" path.
3. **Two prompt cards on one page** reverses `landing-readability-pass` D1. Recorded deliberately
   (D5) with its reasoning, so it reads as a decision rather than as drift.
4. **The workshop is judged by a human, not a suite.** Story 1.4 is owed to you by name and is the
   only real acceptance test Sprint 1 has.
5. **Appetite.** You called this Large-almost-XL; the tiers are S/M/L, so this is **L — multi-wave,
   re-bet at each sprint boundary**. Named exhaustion risk: Sprint 1 is the deepest work, and if it
   consumes the wave, Sprints 2–3 get re-bet rather than extended in flight. Sprint 1 is carved to
   make that outcome a clean stop.

## Research cited

- *Amplitude — How-to Guide: Running Your North Star Workshop* (2024), 28pp — the games (pp.8–10),
  the checklist (p.11), the statement exercise and ladder (pp.14–16), breadth/depth/frequency/
  efficiency with the Instacart example (p.18), the OpenTable and Spotify worksheets (pp.19–22),
  the Netflix case (p.23), converge and next steps (pp.24–27). Attached to this groom session; land
  it in `references/` as Story 1.2's first move.
- The `northstar-workshop` skill (Daniel's, attached) — the three languages, the three games, the
  Burger King / Dave / Instacart cases, the greenfield test.
- "Agentic product management" — checked 2026-08-20: an emerging term with no clear owner, whose
  dominant current usage is *product management **of** agentic AI products*, not *product management
  **with** agents*. This is the whole reason D2 defines it rather than assuming it.

## Definition of Ready

- [x] Story shape and acceptance testable by Daniel
- [x] Stage-2.5 bucket named per half
- [x] v1 in/out boundary written
- [x] Reuse list produced
- [x] Every story risk-tiered (all low) and a QA stage named
- [x] Research cited
- [x] **Daniel approved this scope doc** (2026-08-20) → epic scaffolded at
      `02-commercial/agentic-pm-public-surface/` (README + three sprints), bet recorded at
      `Roadmap/bets/wave-2026-08-20-agentic-pm.md`, committed, kickoff prompts emitted
