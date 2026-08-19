---
title: "The landing repositions from 'the growth engine your agent operates' to 'maker ops' — one operating context, four Ops surfaces, and a Bet you can actually run"
slug: landing-maker-ops
status: scaffolded
area: "02"
type: feature
priority: "wave-2026-08-19"
appetite: M
underwritten_by: "Roadmap/bets/wave-2026-08-19-maker-ops.md"
risk: low
epic: "02-commercial/landing-maker-ops"
build_order: 20
updated: 2026-08-19
---

# Pitch — the landing stops selling an engine and starts selling the operating context

> **Class:** Feature · **Lane:** shaped bet · **Risk:** low
> **Source:** product-owner mockup, `references/golden-frijoles-maker-ops-landing-v0.2.html`
> (signed off 2026-08-19, at the same time the build was instructed).

## Problem

The live page sells a *primitive set*. Its spine — "your roadmap has enough opinions" → try it →
how → why it's hard → what an agent adds → proof → connect → SDK → price — argues that decisions
should carry receipts, and it argues it well. What it never says is **who this is for now**.

The buyer has changed underneath the page. Agents can build; a single maker can now hold a product
that used to need a department. The thing that maker lacks is not the ability to ship — it is
somewhere for all that shipping to *go*: shared context, bounded action, and evidence that outlives
the chat window. The current page answers a question about analytics primitives for a reader whose
actual question is "can I operate a whole product on my own."

Concretely, the page never names the four operating surfaces the product already spans — product,
delivery, security/resilience, and (next) AI spend — even though three of the four are built and
serving. A reader has to infer the scope of the thing from a funnel chart.

## Appetite

**M — one wave.** This is presentation over data and flags this repo already resolves: no
migration, no new table, no new `lib/` data seam that reaches the database. If the work starts
building a new capability to satisfy a section of the mockup, the appetite is being spent on the
wrong problem — the section becomes an honest `next` teaser instead (the page has a vocabulary for
that already) and the capability gets its own bet.

**Circuit breaker:** the Ops tab-panel is the one genuinely new interactive device. If it cannot be
built accessibly out of the existing kit inside its story, ship the four surfaces as four static
panels and cut the tabs — the content is the value, the tabbing is the compression.

## Outcome & signal

**What's true after:** a maker landing on `goldenfrijoles.com` is told in the first screen that this
is for them and their agents; can see the whole operating surface (four Ops, one context); can tell
at a glance which parts are shipped and which are next; and can start — the primary CTA on the page
is "Run your first Bet", and it goes to real self-serve signup rather than an anchor.

**Signal it worked:** the dogfood funnel already instruments this page end to end
(`SelfTrackBeacon` → `landing_visited`). Movement in landing → signup conversion is the read, and it
is readable in the product's own TARS funnel without new instrumentation.

## Rabbit holes (named, so they can be refused)

- **Rebuilding the design language to match the mockup.** The mockup ships its own bean-shaped
  `<div>` logo, its own hex palette, letter placeholders where icons go, and hand-rolled bar
  charts. All of it is superseded by what this repo already has (the `GoldenFrijolMark`, the token
  file, the `Icon` map, `FunnelBars`/`StatCard`), and `npm run check:design-drift` would reject
  most of it on sight. **The mockup is the argument and the copy; it is not the skin.**
- **Dropping the live sections because the mockup omits them.** Proof, Connect, SDK and Pricing are
  the page's only real evidence and its only conversion paths.
- **Building FinOps.** The mockup's AI-economics section is explicitly a concept. It ships as one,
  labelled, or not at all.
- **A methodology microsite.** The mockup's methodology block carries a "to be designed in a
  focused session" placeholder. A section that promises a document nobody has written is a dead
  link with extra steps.

## What already exists (reuse, don't rebuild)

- `apps/web/components/ui/*` — the component kit: `Panel`, `StatCard`, `Badge`, `Button`, `Icon`,
  `AgentWindow`, `ChatThread`, `ContextCard`, `ActivityFeedItem`, `SectionDivider`, `FunnelBars`.
- `apps/web/components/brand/*` — `GoldenFrijolMark` + `BrandLockup`, the canonical mark.
- `references/design/assets/tokens.css` — the only sanctioned source of colour and type.
- `apps/web/lib/landing-sections.ts` — the section↔epic↔status registry the badges read from.
- `apps/web/lib/flags.ts` — every gate the page is allowed to make a claim about.
- `scripts/check-design-drift.mjs` — the rail that makes all of the above enforceable.
