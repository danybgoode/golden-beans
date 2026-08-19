# Wave 2026-08-19 — the landing repositions to maker ops

The product owner arrived with a signed-off mockup
(`references/golden-frijoles-maker-ops-landing-v0.2.html`) and an instruction to build it as one
orchestrated epic run, with "done" defined as shipped to production.

| Bet | Appetite | Displaced (the opportunity cost) |
|---|---|---|
| **#17 The landing sells maker ops** — one operating context, four Ops surfaces, and a primary CTA that runs a real Bet | **M** (one architect run, three review boundaries) | The analytics charting-dependency spike and the Git & Releases discovery spike both stay unfunded; the scenarios epic's own close-out items are unaffected (different surface) |

**Decisions of record.**

- The bet is underwritten by the product owner's 2026-08-19 build instruction. The seed and epic
  frontmatter point here.
- **The mockup is the argument, not the skin.** It was authored outside this repo's design system
  and ships its own logo, palette, icon placeholders and charts. Every one of those is superseded by
  what already exists; the epic README carries the substitution table so no story re-litigates it.
- **The evidence sections survive the repositioning.** The mockup drops Proof, Connect, SDK and
  Pricing — the page's only live numbers and both conversion paths. The product owner's call was to
  keep them and re-weave them below the new spine (epic D1).
- **The mockup's CTAs are kept verbatim and given a real destination.** "Run your first Bet" routes
  to self-serve signup through the gate `PricingSection` already reads (epic D2).
- **Copy gets two foreign-family passes.** The mockup's prose came from one model family; agy and
  vibe read it adversarially before it ships, then a de-slop sweep (epic D7).

**Why this was worth the wave.** The product spans four operating surfaces and three of them are
serving; the page names none of them. The gap is not between what is built and what is claimed — it
is between what is built and what is *legible*, which is the cheapest kind of gap to close and the
most expensive kind to leave open on the one page a stranger actually reads.
