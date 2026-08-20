# Methodology experience — Sprint 1: The vocabulary and the loop

**Status:** 🟦 In review — stories 1.1–1.3 built and gated locally (`d65ddec`, `db2ea21`, `a0f797f`, `1672315`, `7f15e1a`)
**Branch:** `feat/methodology-experience` (off latest `main`)
**Risk:** LOW — reviewer may auto-merge on green CI

> **Build contract (locked by the architect before any builder starts).**
> **Amended in flight — see [A1](README.md#a1--sprint-1-touches-globalscss-2026-08-19).** The clause
> below said this sprint touches no CSS. It does: Story 1.3's six-title contents list could not reuse
> the three-pill band that held the three-word list, so `.field-guide__steps` is deleted and replaced
> from the same tokens. No new device, no new token, nothing dropped. The rest of the contract stands
> unchanged, and this note stays here rather than in the amendment alone — a contract that asserts a
> property the code does not have is read as evidence by the next reviewer (CODE-QUALITY #3).
>
> This sprint touches **only** existing landing components, `lib/landing-sections.ts` and the one
> `globals.css` rule named above. It adds no
> route, no module, no CSS device and no dependency, and it is carved so that **if the epic stops
> here, the live page is still better and nothing is half-built.**
> `references/design/assets/tokens.css` is **not edited** — it is the byte-mirrored design handoff.
> Cite the epic's D1–D4; do not re-derive them. In particular: the loop copy in D4 is the product
> owner's and is used **verbatim**, and D3's rename is a copy pass with a human read, **never `sed`**.

## Stories

### Story 1.1 — The maker loop reads as three portfolio moves  ✅ `d65ddec`

**As a** visitor, **I want** the maker loop to read as three investment moves, **so that** I
understand the method as decisions about what deserves funding rather than as a five-step process.

**Acceptance:**
- `components/landing/MakerLoopSection.tsx` renders exactly **three** items, with the epic D4 table's
  titles and copy **verbatim** — no rewording, no added trailing punctuation on the titles
  (`check-design-drift`'s `heading-period` rule reads the final character of heading text).
- The component's **"Why five steps and not four"** comment is *replaced* by one recording why three
  — the portfolio metaphor, and the fact that Release/Observe/Grow are all *Operate*. Deleting it
  silently, or leaving it, are both CODE-QUALITY #3.
- `lib/landing-sections.ts`'s `loop` entry title is updated in the **same commit** — the registry is a
  description, not a wish.
- Numbering stays `01/02/03`; the kraft `.divider` above the section is untouched.
**Risk:** LOW

### Story 1.2 — The product uses one word for the second move  ✅ `db2ea21` + `a0f797f`

**As a** reader, **I want** the page to say *Design* and never *Shape*, **so that** the product does
not use two words for the same move while I am deciding whether to trust it.

**Acceptance:**
- No user-visible "Shape"/"shaping"/"shaped" in the rendered HTML of `/`. Today's occurrences to
  clear: `MakerLoopSection`'s step 01 (removed by 1.1 anyway), `MethodologySection`'s prose (*"shape
  a Bet with your agents"*), and `MakerHero`'s illustrated chat bubble (*"Help me shape it."*).
- **Each replacement is read as a sentence, not swapped.** *"…install the rails, design a Bet with
  your agents…"* is fine; a line that reads worse after the swap gets rewritten, not tolerated (D3).
- The hero's micro line is realigned to the three moves. Proposal for the product owner's call at
  review: *"Bring an idea. Consider it. Operate it. Exit on the Evidence."*
- `MethodologySection`'s "Three steps, not nine" comment is updated — it currently explains a
  vocabulary that Story 1.3 changes.
- **Out of scope, and a reviewer should reject it if it appears:** `AGENTS.md`,
  `Roadmap/WAYS-OF-WORKING.md`, `Roadmap/LEARNINGS.md`, the seeds, `references/shapeup/`, and every
  internal use of "shape" that means *the shape of a data structure* (there are ~30 in `lib/`).
**Risk:** LOW

### Story 1.3 — The Methodology section previews the chapters instead of repeating the phases  ✅ `a0f797f`

**As a** visitor, **I want** §methodology to tell me what is actually in the field guide, **so that**
the page stops printing Consider/Operate/Exit twice and I learn something new by scrolling.

**Acceptance:**
- `MethodologySection`'s field-guide card lists the **six chapter titles grouped by phase** rather
  than `['Consider', 'Operate', 'Exit']` (epic D4): Bring an idea · Design it · Place the Bet ·
  Build it · Prove it · Decide what happens next.
- §loop and §methodology no longer render the same three-word list.
- The CTA keeps `RunYourFirstBet` and its current destination. **Story 2.4 repoints it** — this
  sprint must not ship a link to a route that does not exist yet.
- The chapter list is written inline here and is **explicitly temporary**: a comment says Story 2.1
  replaces it with a derive from `lib/methodology-chapters.ts`. Two lists that must agree is the
  defect `MakerHero` was bitten by three times; here it lives for one sprint by design, and the
  comment is what makes that a decision rather than a leak.
**Risk:** LOW

## Sprint QA

- **`api` project (the blocking gate)** — one spec over `/`'s rendered HTML: the three loop titles
  are present with their copy; there is **zero** occurrence of the word "Shape" outside code
  identifiers; §loop's list and §methodology's list are not equal.
- **`browser` project (opt-in smoke)** — `/` at desktop and 390px: three loop items, no horizontal
  scroll, §methodology's six-item list renders.
- **Red first.** Every new spec is observed failing at least once (mutate the implementation if the
  spec was written after the code) — a spec asserting "no Shape on the page" passes trivially against
  a page that failed to render at all.

## Sprint 1 — Smoke walkthrough

*Written at sprint close, with real production URLs. Placeholder — do not tick the sprint without it.*
Env: production · `https://goldenfrijoles.com` (preview URL while pre-merge)

**Owed to the product owner by name:** the judgment in Story 1.2 — does each renamed sentence read
better as *Design*? No automated check covers that.
