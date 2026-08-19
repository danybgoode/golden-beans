# Maker ops — Sprint 3: Copy, adversarially

**Status:** not started

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

_Filled in by Story 3.1. One row per finding: family · finding · accepted/rejected · why._
