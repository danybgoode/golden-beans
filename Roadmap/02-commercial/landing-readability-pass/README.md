---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: landing-readability-pass
build_order: 21
---

# Epic: The landing reads at a glance — the maker-ops page, cut down to what it claims

> **Area:** 02-commercial · **Risk:** low · **Class:** Chore · **Archetype:** Sweeper ·
> **Appetite:** S
> **Predecessor:** [`landing-maker-ops`](../landing-maker-ops/README.md) — shipped and live
> 2026-08-19; this is the product owner's first read of that page in production.

## Why

`landing-maker-ops` shipped a page that argues a new category well and says a great many true things
while doing it. Read in production rather than in review, three of those habits work against it:

1. **Every claim carries a second copy of itself.** A gated capability gets a resolved badge *and* a
   computed sentence underneath restating the same gate. That redundancy was built deliberately —
   thirteen review rounds pushed hard on honesty — and it is now the page's dominant texture.
2. **Green is doing a job nobody reads.** The `tag-live` pill labels shipped surfaces as shipped,
   which a reader takes for granted, so the page spends its one non-gold accent on its least
   informative statement.
3. **The hero undersells itself.** The mockup's hero is a big headline over an overlapping bag and
   agent window; what shipped is a smaller headline over two stacked rectangles, because the
   overlap was judged to collapse at narrow widths.

The fix is subtractive, and it is explicitly NOT "remove the honesty." The qualifications that name
a closed gate or an unbuilt capability all survive — as badges, which is the shorter of the two
copies the page was carrying. What goes is the second copy, the decorative half of the badge
vocabulary, and two whole sections that answer a question the reader has only after deciding.

## Platform-first note

No new primitive, route, table, event path, or flag. Every gate this page reads
(`RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, `DESTINATION_DELIVERY_ENABLED`,
`CONNECTOR_WRITES_ENABLED`, `SIGNUP_ENABLED`) is read exactly as before, per request, through
`lib/flags.ts` and `lib/maker-ops.ts`. Telemetry is untouched — `SelfTrackBeacon` is the only
instrumentation on the page and this epic does not go near it (AGENTS rule #1).

## Architecture decisions

**D1 — The qualification stays; the second statement of it goes.**
Every gated or unbuilt surface keeps a resolved `Badge`, computed from the live flag. What is deleted
is the paragraph beneath it that said the same thing at length. Concretely: `drillAvailabilitySentence`
is removed from `lib/maker-ops.ts` (with its unit tests), and §authority's two `.note` paragraphs go
with it. `gatedDrillNote` stays — the Ops panel still renders it, and it is what the badge resolution
runs on.

This is the one decision in this epic that could quietly become "the page over-claims", so the guard
moves rather than being deleted: `e2e/landing.browser.spec.ts` used to match the sentence's
"switched off" wording against the two real drill routes; it now asserts the **badge** against the
same two routes. Same property, same evidence, shorter copy.

**D2 — `tag-live` is removed from the landing; `tag-next` is kept.**
The green pill only ever labelled things that are shipped, which is the page's default state and
therefore not news. The amber pill labels the exceptions — FinOps is not built, SecOps/DevOps ride
closed gates, staged writes are gated — and those are the statements a reader needs. Removing both
would have stripped the page's honesty rail; removing neither leaves the accent meaningless. The
mockup this page is drawn from makes the same split.

The rule is enforced by rendering rather than by convention: a computed-style sweep of `/` reports
zero green ink, text or border. The two genuinely-green data readings in §proof (`.trend--up`,
`.lift--up`) are **recoloured to `--gold-hot`, not deleted** — they are measurements off the demo
tenant, and their direction is carried independently by the arrow glyph, which
`references/ux-guidelines.md` requires regardless of colour.

**D3 — §connect and §sdk are cut, and `/install` absorbs both.**
"Bring your agent" pointed all three of its routes at `/install`, and "For the engineers who will
ask" printed the install line that `/install` already documents. Both answer *how do I wire this up*,
which is a question a reader has after deciding they want it — and both sat between the proof and the
price. Their components are deleted in the same commit as their registry entries, per the rule
`lib/landing-sections.ts` states about itself.

Nothing they carried becomes unreachable: `/install` still mints the tokenized connector URL, the
footer's agent manifest still links it, `/llms.txt` still names it, and §start's second CTA now points
straight at it. The package-name assertion that lived on `/` moves to a spec on `/install` rather than
being deleted.

**D4 — The hero overlaps in ONE grid cell, not with two absolute children.**
`landing-maker-ops` stacked the bag and the agent window and wrote down why: the mockup's absolute
positioning "only exists at one viewport width." That objection was right about absolute positioning
and wrong about the composition. Overlapping both objects in a single grid cell — bag `start`/`end`,
window `end`/`start`, with a `margin-top` offset on the window — makes the row height
`max(bag, window + offset)`, *measured* rather than declared. The window's top is therefore always
exactly the offset below the bag's, whatever either one's content does at any width.

The first attempt here did use two absolutely-positioned children with a `min-height` on the parent,
and it failed at the first width it was not tuned at (1024px, where the window's top landed across
the bag's masthead). That is recorded because it is the whole argument for the grid version.

Below 1000px both objects return to normal flow — the predecessor's stacked layout, unchanged.

**D5 — The methodology card lists three steps, not nine.**
Nine mono pills at 9.5px is a spec sheet. Three — Consider · Operate · Exit — is the method's shape,
and it is the same three beats the hero's promise line now sets up, so the page teaches one
vocabulary instead of two.

## Out of scope

- The nav's link set (`Product · Ops · Proof · Pricing`) — unchanged; the mockup's "Methodology" link
  is not adopted here.
- `references/design/assets/tokens.css` — still the byte-mirrored handoff, still not edited. Every
  override in this epic lands in `apps/web/app/globals.css`.
- `/install` itself, beyond gaining the package-name spec that moved off `/`.

## Sprints

- [`sprint-1.md`](./sprint-1.md) — the whole pass, as one slice.
