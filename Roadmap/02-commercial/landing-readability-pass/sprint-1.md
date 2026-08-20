# Landing readability pass — Sprint 1: The page says each thing once

**Status:** ✅ done

> **Build contract.** One slice, because the changes share a single subject: what the page says
> twice, in green, or after the reader has already decided. Every gate read stays where it was;
> only copy, badge vocabulary, section set and hero composition move. See the epic README's
> D1–D5 for the reasoning behind each.

## Stories

### Story 1.1 — The hero opens at the mockup's scale, and its graphics compose
**As a** maker landing on this page for the first time, **I want** the opening to read in two
seconds, **so that** I know what this is before I decide whether to scroll.

**Acceptance:**
- Headline and sub-copy carry the mockup's type scale — `clamp()` on `.hero .display` and
  `.hero .hero-sub`, scoped to the hero so §start's closing headline is untouched.
- The sub-copy is the product owner's two sentences; the promise line is
  "Bring an idea. Consider it. Operate it. Learn from it."
- At ≥1000px the bag label and the agent window overlap in one grid cell — bag tilted top-right,
  window across its bottom-left corner — and the bag's masthead and first row stay readable at
  every width in that range (D4). Below 1000px both return to normal flow.
- The bag's brand plate, the agent window's bar text (title, platform pills, liveness chip) and the
  Bet card's `source`/`meta` header are gone. The window's bar renders its dots and nothing else.
- The window's `SurfaceNote` moves BELOW the frame — the only one on the page that does — because
  anything stacked above an overlapped frame lands on kraft. It is the page's honesty label and
  cannot be the hard-to-read element.
**Risk:** low

### Story 1.2 — Nothing on the page is green, and no claim is made twice
**As a** reader scanning for what is and is not built, **I want** the page's accent to mean
something, **so that** I can find the exceptions without reading every paragraph.

**Acceptance:**
- Zero green ink on `/` — text or border — asserted by sweeping computed styles over every element,
  not by grepping for a class name.
- Every `Badge status="live"` is removed (§product, §authority ×2, §proof). Every `tag-next` badge
  survives: FinOps on the bag, the Ops tab and panel, §finops, and §authority's two gated cards.
- The two `.note` paragraphs restating a gate in §authority are deleted;
  `drillAvailabilitySentence` and its unit tests go with them. `gatedDrillNote` stays — the Ops
  panel renders it and the badge resolution runs on it.
- §proof's `.trend--up` / `.lift--up` readings are recoloured to `--gold-hot`, not deleted (D2).
- The gate guard MOVES rather than being deleted: the authority spec asserts the resolved badge
  against the two real drill routes, where it asserted the deleted sentence's wording before.
**Risk:** low

### Story 1.3 — §connect and §sdk come out, and nothing they carried is lost
**As a** reader deciding whether this category exists, **I want** the proof to reach the price
without two integration sections in between, **so that** the argument closes.

**Acceptance:**
- `ConnectSection.tsx` and `SdkSection.tsx` deleted in the same commit as their
  `LANDING_SECTIONS` entries — the rule that file states about itself.
- Section stamps renumber: Proof (1), Pricing (2).
- §start's second CTA points at `/install`, not at the deleted `#connect` anchor.
- The `npm install @golden-frijoles/sdk` assertion moves to a spec on `/install` rather than being
  deleted with the section that used to print it.
- `/llms.txt` and the footer's agent manifest are re-read and confirmed to name only routes that
  still exist.
**Risk:** low

### Story 1.4 — The remaining sections say the mockup's version of what they say
**As a** reader, **I want** the copy to match what was designed, **so that** the page reads as one
piece of writing.

**Acceptance:**
- §authority's lead, §finops (eyebrow, headline, lead, three figures, four facets, the optimisation
  note, and the closing "illustrative product direction" line) all take the mockup's copy.
- §methodology's CTA reads "Explore the methodology" over the page's real destination — never the
  mockup's `href="#"` — and its field guide lists Consider · Operate · Exit (D5).
- The kraft strip and §loop take the product owner's replacement lines.
- §pricing's intro centres. The cause was a dead rule, not a missing one: `.pricing__intro` sat
  ~1400 lines above `.measure` at equal specificity, so `.measure { margin: 12px 0 }` won on source
  order and every declaration in `.pricing__intro` was inert. The rule is deleted and the centring
  joins `.center-cta .measure`, which already worked.
**Risk:** low

## Smoke walkthrough

Run against **https://goldenfrijoles.com** once merged (localhost:3000 pre-merge). Each step is one
action and one expected result.

1. Load `/` on a desktop viewport ≥1280px wide.
   → The headline is three lines at ~78px. To its right the kraft bag is tilted, and the dark agent
     window crosses its lower-left corner. The bag's "Grow ideas into products" title and its
     "Product Ops" row are both readable above the window's top edge.
2. Read the bag's top-left.
   → There is no "GOLDEN FRIJOLES · MAKER GRADE" plate. The title is the first thing on the packet.
3. Look at the agent window's title bar (both the hero's and §proof's).
   → Three dots and nothing else. No "shaping a Bet", no Claude/ChatGPT/your-agent pills, no
     "connected"/"revocable" chip.
4. Read the line under the hero's CTAs.
   → "Bring an idea. Consider it. Operate it. Learn from it."
5. Scroll to the kraft strip below the hero.
   → "Plant Golden Frijoles and operate across the board, grow with no limit."
6. Read the first paragraph of §loop.
   → Begins "Golden Frijoles enables makers."
7. Scan the whole page for green text or green outlines.
   → There are none. Amber "Next build" / "Partly gated" / "Built, currently gated" pills are still
     present — those are the qualifications and they stay.
8. Read §authority ("More than an endpoint").
   → The lead is the mockup's. Neither card has a paragraph under its activity feed. Each card that
     is gated still carries its amber badge.
9. Open §ops' FinOps tab.
   → The tab and the panel both carry "Next build".
10. Read §finops' panel to its last line.
    → It ends "Illustrative product direction — FinOps is the next build, not a shipped capability."
11. Look at §methodology's kraft card.
    → Three pills: CONSIDER · OPERATE · EXIT. The CTA to their left reads "Explore the methodology".
12. Scroll from §proof to §pricing.
    → They are adjacent. There is no "Bring your agent" section and no "For the engineers who will
      ask" section between them. The kraft section stamps read 1 and 2.
13. Read §pricing's sentence under the headline.
    → "Start with one project for $0…" is centred under the heading, not flush left.
14. Click "Connect your agent" in the closing section.
    → Lands on `/install`, which mints a tokenized connector URL and shows
      `npm install @golden-frijoles/sdk`.
15. Reload `/` at 390px wide and scroll the whole page.
    → No horizontal scrollbar at any point. The bag and the agent window are stacked, not
      overlapping, and the bag's title is the largest thing on it.

**Owed to the product owner:** none. No money, auth or checkout step is involved in this epic.
