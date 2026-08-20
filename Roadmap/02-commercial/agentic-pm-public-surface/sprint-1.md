# Agentic PM public surface — Sprint 1: The workshop earns its URL

**Status:** ⬜ not started

> **Build contract.** This sprint ships standalone. It touches `lib/positioning.ts` (new),
> `app/northstar-self-serve.md/route.ts`, `references/` (landing the source guide) and
> `e2e/northstar-self-serve.spec.ts`. It does **not** touch `/` — the landing is Sprints 2 and 3.
> If the appetite is exhausted here, the product owner's top-priority ask is live and nothing else
> is half-built.
>
> Read the epic README's **D2** (the category string) and **D6** (attribution and what the document
> must contain) before starting.

## Build contract (locked by the architect before the builder started)

**Sources are in the repo before a word is written.** `references/North-Star_how-to-Guide_2024.pdf`
and `references/northstar-workshop.md` land in Story 1.2's first commit. Every page citation in the
element map below was checked against the PDF and is correct — **except the OpenTable worksheet,
which is a duplicated Spotify page in the source (epic A1).** Carry p.19's OpenTable *brief* as the
warm-up and exactly one completed worksheet, Spotify's.

**The five pinned properties are a mutation check, not a formality.** `e2e/northstar-self-serve.spec.ts`
was written against the document this story replaces. It must go green **with no edit to the file**.
If a pin fails, the rewrite dropped a safety property — restore the property, never the assertion.

**`lib/positioning.ts` is the shared seam and lands FIRST**, by the architect, before anything
imports it (WAYS-OF-WORKING: highest blast radius goes first). Story 1.2 imports it; it does not
copy the string.

**The document is a route, not a file.** Every absolute URL comes from `getSiteUrl()` (AGENTS rule
#5). The one-host assertion is what proves it, and it is why the workshop is testable on a preview.

**Attribution is once, near the top, by name, with a link** (epic D6). A credit repeated is a
document that reads like someone else's.


## Stories

### Story 1.1 — The category is stated once, from one module
**As a** reader of any Golden Frijoles surface, **I want** the product described the same way
everywhere, **so that** I am reading about one product.

**Acceptance:**
- `lib/positioning.ts` is a new pure module (no `server-only`, no env reads, no imports beyond
  types) exporting the category name and its definition sentence, per epic D2:
  *"Agentic product management: the whole product discipline — decide, build, prove, grow — run by
  one person and their agents, on rails that keep the evidence honest."*
- The module's header comment states **why it exists** — that this string appears on five outward
  surfaces and two lists that must agree is the defect this repo lost three review rounds to — and
  names the surfaces that import it.
- `lib/positioning.test.ts` asserts the definition is a single sentence, contains the category name,
  and names no capability (the same rule `app/layout.tsx`'s DESCRIPTION lives under: a string that
  travels without its qualification cannot claim a gated capability).
- Nothing imports it yet except Story 1.2. Later stories add the other call sites.
**Risk:** low
**QA:** unit spec (`lib/positioning.test.ts`)

### Story 1.2 — The workshop teaches the actual framework
**As a** practitioner with no account, **I want** a workshop that actually teaches me the North Star
Framework, **so that** I leave with a metric I can defend rather than a nice conversation.

**First move:** land *Amplitude — How-to Guide: Running Your North Star Workshop (2024)* in
`references/` so the document has a source in the repo rather than in a chat log, and add the
product owner's `northstar-workshop` skill text beside it.

**Acceptance — the document contains every element below, in our words:**

| Element | Source | How it lands |
|---|---|---|
| The three languages — customer, product, business | skill | Framing paragraph; why alignment is the point |
| **The three games** — Attention · Transaction · Productivity | skill + guide pp.8–10 | An early forced choice. Pick one. The guide's own finding: pushing for a single game is most fruitful and changes the whole focus |
| Value exchange over apparent transaction | guide p.10 | The season-pass trap, retold |
| Leading vs. lagging indicators | skill + guide p.23 | Netflix: three DVDs in the first session, 60% → 90%, two points of first-month retention |
| **The North Star checklist** (7 questions) | guide p.11 | The critique instrument — the agent runs the candidate against it out loud |
| The qualitative statement — *"our path to sustainable growth is a function of our ability to…"* | skill + guide p.14 | The gate before numbers: if you cannot say it, you cannot measure it |
| **The statement ladder** — North Star → Inputs → Opportunities → Interventions, each with measurement options and its own character notes | guide pp.15–16 | The document's spine. The current version has no equivalent |
| **Breadth · Depth · Frequency · Efficiency** | skill + guide p.18 | The input heuristic, with the Instacart worked example |
| Inputs are few (3–5) and **independent** | skill | An explicit instruction to test independence, not just to list four things |
| Warm up on someone else's product | guide p.19 | Optional; offered when the person stalls or gets defensive |
| Candidates before critique | guide p.24 | The silent-brainstorm idea, adapted for one person + one agent — the agent must not anchor them |
| Progress over perfection; write terrible candidates on purpose | guide pp.11, 24 | Named as a rule. The failure mode of a solo workshop is stalling on the first answer |
| The *"I would be more confident… if I observed an increase in… which we could measure by…"* template | guide p.25 | A fill-in the agent offers when the person circles |
| The greenfield test | skill | Closing check: two minutes of opportunities per input, or the inputs are pitched wrong |
| Converge — game · candidates · what to eliminate · what you still need to know | guide p.26 | The close |
| It is never done; it will evolve | guide p.27 | The last line, and the honest one |

**Case studies carried** (all from the sources, all checkable): Netflix · Burger King (digital
transactions per user) · Dave (recurring expenses, 5.7×) · Instacart (monthly items received on
time) · Spotify and OpenTable worksheets · Amazon / Walmart / Salesforce / Adobe as game archetypes.

**Attribution:** the North Star Framework and the *North Star Playbook* (Cutler & McBride) are
credited by name with a link, **once**, near the top. Not repeated (epic D6).

**The category:** the document's header names the category from `lib/positioning.ts` — the same
string, imported, not retyped.

**Acceptance — the five pinned properties survive untouched.** `e2e/northstar-self-serve.spec.ts`
must stay green **without being edited**:
- "Ask **ONE question at a time**"
- "You are **NOT connected to a Golden Frijoles workspace**" and "**Nothing has been saved.**"
- "**basic lift only**", and never "statistically significant"
- "**read-only MCP connector**"
- Every absolute URL from `getSiteUrl()`; exactly one host in the body

**Risk:** low
**QA:** the four existing tests stay green unedited (that is the mutation check — they were written
against the document this replaces). New assertions added for: the three games, the checklist, the
ladder's four rungs, breadth/depth/frequency/efficiency, and the attribution line.

### Story 1.3 — The workshop knows how to close, and what it cannot claim
**As an** agent running this workshop, **I want** to know when to stop and what to hand back, **so
that** I neither stall nor over-run nor promise something I did not do.

**Acceptance:**
- The close writes back exactly one shape: North Star (sentence, unit, period) · Inputs (3–5, each
  with the direction it should move and which of breadth/depth/frequency/efficiency it is) ·
  Guardrails · Assumptions · First tests · and the game that was chosen.
- The greenfield test runs before the summary, not after — if it fails, the agent goes back to the
  inputs rather than writing a summary it has already been told is wrong.
- The "nothing has been saved" statement is in the close, verbatim, and the document says once more
  — in the Golden Frijoles section — that connecting the MCP is **read-only** and that the person
  sets the North Star up themselves.
- The capability list names only what is live: telemetry ingest + TypeScript SDK · TARS funnels ·
  North Star with per-feature impact · A/B with deterministic bucketing and **basic lift only** ·
  read-only per-project MCP connector with a revocable token.
- The hand-off is `${siteUrl}/install`, and the document says "I don't know, see ${siteUrl}/" for
  anything not on the list.
**Risk:** low
**QA:** in Story 1.2's spec

### Story 1.4 — The product owner runs it end-to-end in a real agent
**As** Daniel, **I want** to run the whole workshop in a fresh agent against the preview, **so that**
we find out whether a facilitation script actually facilitates.

**Acceptance:**
- The hero prompt is not live yet (Sprint 2), so paste `handoffPrompt`'s text manually into a fresh
  Claude and a fresh ChatGPT, pointed at the **preview URL**, and run the workshop on a real
  product — ideally one Daniel is not already certain about.
- Judged on four things, written into this doc as findings: did it ask one question at a time · did
  it challenge a vague answer rather than accept it · did the ladder produce inputs he could act on
  this week · did either agent claim at any point to have saved something.
- Any failure is a copy fix in Story 1.2, not a note for later.
**Risk:** low
**QA:** **owed to the product owner by name.** No automated smoke can judge whether a facilitation
script facilitates.

## Sprint QA

- `e2e/northstar-self-serve.spec.ts` — four existing tests green **unedited**, plus the new
  content assertions from Story 1.2.
- `lib/positioning.test.ts` — new unit spec.
- Every new spec observed failing at least once (break the string, watch it go red).
- Deterministic gate: `tsc` + `build` + Playwright `api` project.

## Smoke walkthrough

_To be written by the builder before the sprint is called done. Numbered steps, one action + one
expected result each, real production URLs once deployed (preview URLs pre-merge). Story 1.4's
end-to-end agent run is flagged as **owed to the product owner by name**._
