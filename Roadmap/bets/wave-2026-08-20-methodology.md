# Wave 2026-08-20 — the methodology gets a room of its own

The product owner arrived with a mockup
(`references/golden-frijoles-methodology-experience-v0.3.html`), the field guide it renders, three
copy instructions, and an instruction to build it as one orchestrated epic run.

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| **#18 The methodology becomes a place you can go** — `/methodology` as a six-chapter reading experience, the landing loop reads as three portfolio moves, and *Shape* becomes *Design* | **L** (multi-wave epic, re-bet at each wave boundary) | The analytics charting-dependency spike and the Git & Releases discovery spike stay unfunded for a second consecutive wave. `landing-readability-pass`'s remaining close-out items are unaffected (different surface). |

**Decisions of record.**

- The bet is underwritten by the product owner's 2026-08-20 approval of
  `Roadmap/00-ideas/seeds/methodology-experience.md`. The seed and the epic frontmatter point here.
- **The mockup is the argument, not the skin — again.** Same ruling as wave-2026-08-19, and it has
  to be restated because this mockup was authored outside the design system too and ships its own
  `:root` palette. The epic README carries the substitution table so no story re-litigates it.
- **The mockup also has four outright defects, not style disagreements** — a rendered JavaScript
  object literal in every chapter lede, pandoc horizontal-rule artifacts, a collapsed bullet list,
  and a progress rail that stamps "Read ✓" before the reader has read anything. Enumerated in the
  epic README so a builder fixes them rather than faithfully porting them.
- **"Material design" means Apple's materials, not Google's.** Layered depth, translucency and
  vibrancy per the HIG and the Liquid Glass language — rendered in kraft over `tokens.css`, with
  reduced-transparency / increased-contrast / reduced-motion fallbacks shipping in the same story as
  the effect. Apple themselves walked the effect back mid-beta on legibility; we do not get to skip
  the fallback.
- **`Shape` → `Design` stops at the public surface.** `AGENTS.md`, `WAYS-OF-WORKING.md`,
  `LEARNINGS.md`, the `groom` skill and the seeds keep *Shape* and keep their `references/shapeup/`
  lineage legible.
- **Sprint 1 is carved to ship standalone.** If the appetite is exhausted after it, the live page is
  still better and nothing is half-built.

**Why this was worth the wave.** `MethodologySection` currently makes a promise with a placeholder
destination — its own source comment says "the epic that writes the document re-points it." The
method is the thing the product is actually selling (the page's own words: *"the way to learn it is
to use it"*), and today there is nowhere to send a reader who says yes. That is the cheapest kind of
gap to close and the most expensive kind to leave open on the one page a stranger reads.

**Circuit breaker.** L is multi-wave by definition: each wave boundary re-bets the remaining sprints
rather than extending this one in flight. The named exhaustion risk is Sprint 3's materials pass —
if translucency does not read well over warm kraft inside its budget, ship the composition without
it and re-bet, do not rebuild the design system to make glass work.
