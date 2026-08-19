# Maker ops — Sprint 3: Copy, adversarially

**Status:** ✅ done — both passes run, ledger below.

> **Build contract.** The mockup's copy was written by one model family. A house style is invisible
> to the house — so the page's prose gets read by two *foreign* families before it ships (epic D7).
> Both passes are **advisory and print-only**, exactly as `cross-panel.mjs` and `prose-draft.mjs`
> already work: they never edit a file. The orchestrator is the editor, and a rejected note is
> recorded here as a decision rather than disappearing.

## Stories

### Story 3.1 — Two foreign families read the copy
**As a** product owner, **I want** the page's prose reviewed by model families that did not write
it, **so that** brand drift, clichés, flat rhythm and filler transitions get caught by someone who
cannot see them as normal.

**Acceptance:**
- The full rendered copy of the new spine is extracted and passed to **agy** and to **vibe**, each
  in one single-pass read, against an explicit lens: brand compliance (against
  `references/design-direction.md` + `references/ux-guidelines.md`), cliché detection, sentence
  rhythm, emotional resonance, and filler-transition removal.
- Each pass runs against a **different** family — a same-family read wearing the label of a
  cross-family one is a silent downgrade of this layer (`review-route.mjs`'s rule 1).
- Both passes' raw findings are recorded below, with an accept/reject and a one-line reason each.
- Anything accepted is applied to the components and re-verified against the drift guard (a copy
  edit can reintroduce a heading that ends in a full stop).
**Risk:** low

### Story 3.2 — The de-slop sweep
**As a** reader, **I want** the page free of the words that make software copy sound like every
other piece of software copy, **so that** the voice reads like a person wrote it.

**Acceptance:**
- A sweep over `components/landing/**` for buzzwords and filler: *seamless, leverage (as a verb),
  robust, cutting-edge, unlock, empower, supercharge, revolutionise, best-in-class, delve,
  game-changing, effortlessly, at scale (as decoration), it's important to note, in today's
  landscape, the future of*, and hollow transitions (*moreover, furthermore, that being said*).
- Each hit is either rewritten or explicitly kept with a reason (some words are load-bearing —
  "leverage" as a *noun* is this product's actual pitch and stays).
- The result is checked against the rhythm note the two external passes converge on, not against a
  word count.
**Risk:** low

## Findings ledger

Both passes ran 2026-08-19 against the **rendered** copy of the live local page (11.3 KB of visible
text, extracted top-to-bottom), not against the source — so each reviewer read what a reader reads.
**agy** answered on `gemini-3.6-flash-high`; **vibe** on its account default. Both are single-pass,
print-only; neither touched a file.

**The two findings both families reached independently are the two that mattered most.** That
convergence is the signal this sprint exists to produce: one model disliking a sentence is taste,
two unrelated families landing on the same sentence is a defect.

### Accepted

| # | Family | Finding | What shipped |
|---|---|---|---|
| 1 | **both** | The hero lead — *"Agents turn your ideas into working software faster than you can decide what to build next"* — is a speed claim nobody can check, in a voice the brand does not use, on the one sentence every reader reads | Rewritten to name the problem instead of asserting a benefit: agents can build anything you describe; what they cannot do is remember what it was for, or tell you whether it worked. Neither model's replacement line was used — both were slop ("operational destination") |
| 2 | **both** | The authority lead is a 33-word run-on with four stacked noun phrases, landing on the dead metaphor *"a box you cannot see into"* | Split into two sentences; the metaphor replaced with the actual mechanism. Rejected vibe's "a black box" — the same cliché wearing a shorter coat |
| 3 | agy | FinOps opens on an administrative benefit ("attribute token spend") for a reader whose real relationship to the subject is an unexpected bill | Problem first: an agent looping overnight is a bill you learn about from the bill. **Its suggested replacement was NOT taken** — it promised Golden Frijoles "caps spend per Bet", inventing a feature in the one section whose entire justification is that it says nothing is built |
| 4 | vibe | The maker-loop lead's second sentence is 28 words with no break | Split; the evidence clause becomes its own three-word sentence |
| 5 | agy | Spelling drifts — `behaviour`/`unauthorised` beside the page's otherwise American copy | The three visible British spellings I introduced are now American, matching the rest of the page. agy's own fix ("unmetred") is not a word |
| 6 | agy | *"inevitably"* used as cute filler twice within four sections | Kept in Pricing (where it carries the joke), dropped from the SDK divider |
| 7 | agy | Product Ops' description states an intention rather than a problem | Now opens "Stop guessing what to build next" |
| 8 | vibe | *"across the surfaces a real product needs in order to grow"* — "in order" is filler | Cut |

### Rejected, with the reason

| # | Family | Finding | Why not |
|---|---|---|---|
| 9 | agy | *"Your next idea does not need a department"* breaks "headings are titles, not sentences" | It is an `.eyebrow`, not a heading element. The rule is about headings; the reviewer could not see the markup. Its Title Case replacement is also not this page's style |
| 10 | agy | *"AI-adoption ladder"* is consulting fluff standing in for "human vs agent commits" | It names a real, published document (`references/Steps-of-AI-Adoption.md`) and the figure is computed against it. The reviewer guessed at the referent and guessed wrong |
| 11 | agy | The $49 tier's disclaimer is three flat same-length sentences | True, and deliberate. That paragraph was written to be unambiguous about a price nobody can pay yet (landing-redesign-v2 D1). Precision outranks cadence there |
| 12 | agy | **Cut the "Pods" pricing tier** — a consulting tier undermines the self-serve narrative | A positioning and revenue decision, not a copy edit, and it belongs to the product owner. **Flagged for Daniel** rather than actioned |
| 13 | agy | *"Your dev team, as a revenue engine"* contradicts the maker positioning | Real tension, and created by this epic. But the Pod Report headline is `pod-report`'s surface and the fix is a positioning call. **Flagged for Daniel** |
| 14 | vibe | *"Grow what works"*, *"Maker grade"*, *"Grow ideas into products"* are clichés | All three are the product owner's signed-off mockup copy, and the growing metaphor is the brand's whole conceit (it is called Golden Frijoles) |
| 15 | vibe | *"Bring an idea. Shape it. Build it. Operate it."* is four identical-length imperatives | That is the device, not a defect — it mirrors the five-step loop directly below it |
| 16 | vibe | *"One maker. A whole operation."* overstates; *"the whole thing"* is vague | It is the positioning, not a metric. "A real operation" is strictly weaker |

**Where both models were wrong in the same way**: every replacement line either invented a
capability (#3), used vocabulary this page bans (#1's "operational destination"), or swapped one
cliché for a shorter one (#2's "black box"). The findings were worth the run; the fixes were not
usable as written. That is roughly the expected shape of an advisory pass and the reason this rail
is print-only.
