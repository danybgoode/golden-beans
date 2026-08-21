# Agentic PM public surface — Sprint 2: The landing's structure

**Status:** ⬜ not started

> **Build contract.** Four structural edits to `/`, and nothing else. No copy rewrite — that is
> Sprint 3. Two sections and four components are deleted; one component's right column is replaced;
> one eyebrow changes. Every gate read stays exactly where it was.
>
> Read the epic README's **D3** (the four edits, exactly), **D4** (what deleting §proof costs) and
> **D5** (why the page now carries two prompt cards) before starting.
>
> **The rule this sprint lives under:** a component is deleted in the SAME COMMIT as its
> `LANDING_SECTIONS` entry. `lib/landing-sections.ts` states that rule about itself, and
> `e2e/landing.browser.spec.ts` enforces it by asserting every registry id is a real DOM id on `/`.

## Build contract (locked by the architect before the builder started)

**Four specs break or lie when this sprint lands, and the plan named none of them.** The `browser`
project is not in the blocking gate, so the deterministic gate will stay green while they rot
(LEARNINGS, 2026-08-19). Each has a decided disposition — do not improvise a fifth:

| Spec | What happens | Locked disposition |
|---|---|---|
| `landing.browser.spec.ts` "the landing renders the maker-ops narrative" | asserts `.prompt-card` count **1**, under a comment arguing "not two" | Count → 2, **and the comment is rewritten citing epic D5** (A7) |
| `landing.browser.spec.ts` "section dividers carry a legible numbered stamp" | fails outright — no stamps remain | **Deleted with the device.** Its enclosed-numeral guard (`/[①-⓿]/`) moves to a test that still has a subject (A5) |
| `landing.browser.spec.ts` "every nav link resolves to something real" | still passes, over three links | Unchanged. It is the guard for the nav edit; a **new** spec asserts the retired anchors are gone |
| `landing.browser.spec.ts` "every section in the registry is on the page, exactly once" | passes only if both registry entries go in the same commit | Unchanged. This is the rule enforcing itself |

**The stylesheet sweep has a trap: `.app-shell` belongs to the signed-in product** (A8). Sweep only
the classes verified to have one landing call site. Check each class for a non-landing user before
deleting its rule, then **render the page** — a static class sweep is not evidence (LEARNINGS,
2026-08-19).

**Three prose references to §proof survive in files this sprint does not delete** (A4). They are
listed by file and line in the epic README. A comment asserting a property the code no longer has is
CODE-QUALITY #3.

**`force-dynamic` stays.** Its comment loses the proof-numbers reason and keeps the flag-derived-copy
reason, which was always the load-bearing half.

**The manifest check is on every claim `/llms.txt` makes about `/`, not on its route list** (A2).


## Stories

### Story 2.1 — The hero hands the reader a prompt
**As a** maker landing here for the first time, **I want** the first thing I meet to be something I
can use, **so that** I can check this product with my own agent instead of being shown a picture of
one.

**Acceptance:**
- `MakerHero`'s right column is a single `CopyPromptCard` carrying `handoffPrompt(getSiteUrl())`.
- The kraft `.baglabel` (with its derived `MAKER_OPS_SURFACES` rows and resolved badges) and the
  illustrated `AgentWindow` / `ChatThread` / `ContextCard` block are both **deleted from the hero**.
  `MakerHero`'s gate reads and `surfaceBadgeLabel` import go with them — §ops still resolves the
  same surfaces from the same module, so no honesty is lost, only a second copy of it.
- The hero's `SurfaceNote` goes with the window it labelled. The `landing.browser` assertion that
  *every framed window on `/` carries a SurfaceNote* stays — it is now vacuously true of the hero and
  still meaningful elsewhere; update its comment, not its rule.
- `handoffPrompt` gains a real call site for the first time since `landing-readability-pass` cut
  §try. `e2e/landing-prompts.spec.ts` is unchanged and must stay green.
- The clipboard round-trip is asserted in the hero: what the card copies is what the card renders.
- `MakerHero`'s header comment is rewritten to describe the component that now exists. The long
  narrative about the bag's derived rows and the three review findings moves to `OpsSection` (which
  is now the only place that derivation appears) rather than being deleted — it is the reasoning
  that keeps the derivation from being un-done.
**Risk:** low
**QA:** `e2e/landing.browser.spec.ts` — hero clipboard round-trip; framed-window assertion still green

### Story 2.2 — One section about the operating context, not two
**As a** reader, **I want** the page to make its operating-context argument once, **so that** I am
not shown the same idea twice under two headings.

**Acceptance:**
- `OperatingContextSection.tsx` is deleted, and its `LANDING_SECTIONS` entry (`id: 'product'`) with
  it, in the same commit.
- `OpsSection`'s eyebrow changes from "One project, many operations" to **"One operating context"**.
  The headline, the lead paragraph, `OpsTabs`, the derived surfaces and the gate resolution are all
  untouched.
- The `ops` registry entry's `title` is updated to match what the section now says.
- `PROJECT_ROUTE_INVENTORY` is **not** deleted — it is the product's own route registry and is unit
  tested; only this page's illustration of it goes. Confirm no other importer breaks.
- `scripts/check-design-drift.mjs` D7 passes: the new eyebrow is a title, not a sentence.
**Risk:** low
**QA:** registry round-trip in `e2e/landing.browser.spec.ts` (already asserts id ↔ DOM id)

### Story 2.3 — §proof comes out, and the nav and the stamps come out with it
**As a** reader, **I want** the page to reach its offer without a detour through our own delivery
history, **so that** the argument closes where the ask is.

**Acceptance:**
- `ProofSection.tsx`, `PodReportProof.tsx` and `LiveEngineProof.tsx` are deleted, with the `proof`
  `LANDING_SECTIONS` entry, in the same commit.
- **Nav:** `Nav.tsx` becomes `Ops · Pricing · Methodology`. `/#product` and `/#proof` are removed;
  "Product" is **retired, not re-pointed** at `#ops` (epic D4). A spec asserts every nav anchor
  resolves to a section that exists on `/`.
- **Stamps:** `SectionDivider` comes off `PricingSection` too. A lone "1" would describe a document
  nobody can read; the device retires with the argument it was counting. If `SectionDivider` has no
  remaining call site, delete it.
- **Orphans:** `lib/week-over-week.ts` exists only because `LiveEngineProof` needed it testable —
  delete it and its spec if nothing else imports it, or state in the PR why it stays. Same check for
  `.trend--up` / `.lift--up` CSS and any demo-tenant read helper that becomes unreachable.
- **`/hub` is not disturbed.** `app/hub/report-components.tsx` is a different surface; confirm
  before deleting anything shared, and if the Pod Report's computation is shared, it stays.
- `force-dynamic` **stays** on `app/page.tsx`, and its header comment is corrected: the demo-project
  numbers are no longer a reason, but every flag-derived sentence still is. A comment asserting a
  reason that no longer exists is CODE-QUALITY #3.
- `/llms.txt` is re-read and confirmed to name only routes that still exist (its full rewrite is
  Story 3.3; this is the "don't ship a manifest that lies for a week" check).
**Risk:** low
**QA:** registry round-trip + a new nav-anchor spec; `e2e/landing-redirects.spec.ts` still green

### Story 2.4 — The new hero survives a phone
**As a** reader on a phone, **I want** the hero to fit, **so that** the first thing I meet is not a
prompt card overflowing its column.

**Acceptance:**
- `e2e/mobile-heuristics.browser.spec.ts` — which already calls `CopyPromptCard` the element most
  likely to blow the layout budget — passes with that card now **above the fold**.
- No horizontal scroll at the spec's narrow widths; the `<pre>` scrolls inside its own container.
- The hero's two-column grid collapses cleanly with the bag gone (the D4 overlap rule from
  `landing-readability-pass` had a `<1000px` branch that no longer has two objects to reflow —
  simplify it rather than leaving dead CSS).
- Tap target and copy-button affordance verified on a real narrow viewport, not only in the spec.
**Risk:** low
**QA:** `e2e/mobile-heuristics.browser.spec.ts`

## Sprint QA

- `e2e/landing.browser.spec.ts` — registry round-trip, hero clipboard, framed-window rule.
- New nav-anchor spec.
- `e2e/mobile-heuristics.browser.spec.ts`.
- `e2e/landing-prompts.spec.ts` — unchanged, must stay green (it is the proof that reviving
  `handoffPrompt` broke nothing).
- `scripts/check-design-drift.mjs`.
- Every new spec observed failing at least once.
- Deterministic gate: `tsc` + `build` + Playwright `api` project.

## Smoke walkthrough

_To be written by the builder before the sprint is called done. Numbered steps, one action + one
expected result each, real production URLs once deployed (preview URLs pre-merge). The clipboard
round-trip and the phone-width read are the two steps most worth doing by hand._
