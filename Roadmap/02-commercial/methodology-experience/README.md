---
status: scaffolded   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: methodology-experience
build_order: 22
---

# Epic: The methodology gets a room of its own

> **Area:** 02-commercial · **Risk:** low · **Class:** Feature · **Archetype:** New surface + vocabulary change
> **Appetite:** L (multi-wave; re-bet at each wave boundary) · **Underwritten by:**
> [`Roadmap/bets/wave-2026-08-20-methodology.md`](../../bets/wave-2026-08-20-methodology.md)
> **Seed:** [`methodology-experience`](../../00-ideas/seeds/methodology-experience.md) (approved 2026-08-20)
> **Mockup:** [`references/golden-frijoles-methodology-experience-v0.3.html`](../../../references/golden-frijoles-methodology-experience-v0.3.html)
> **Field guide:** *Golden Frijoles — Minimum Viable Field Guide v0.2* — **not yet in the repo**; landing it is Story 2.1.
> **Predecessor:** [`landing-maker-ops`](../landing-maker-ops/README.md) — this epic redeems the promise its `MethodologySection` deliberately left open.

## Why

See [the seed](../../00-ideas/seeds/methodology-experience.md) for the full pitch. In one line: the
page sells a method (*"the way to learn it is to use it"*) and then has nowhere to send the reader
who says yes — `MethodologySection`'s CTA carries the mockup's label over a placeholder destination,
and its own source comment says *"the epic that writes the document re-points it."* This is that epic.

Two smaller instructions ride along and are cheap once you are in these files: the maker loop
collapses from five mechanical steps to the three portfolio moves the method actually has, and the
method's second move stops being called *Shape*.

## Platform-first note

**Nothing new is modelled.** No migration, no new table, no new database-reaching `lib/` seam, no new
runtime dependency, no new env var, no new flag. Two new pure modules (the chapter content, the
chapter registry), one new route tree, and CSS that resolves entirely from existing tokens.
Everything else is presentation.

## The mockup is the argument, not the skin

Same ruling as the predecessor epic, restated because this mockup was authored outside the design
system too. Recorded here so no story re-litigates it, and so a reviewer can check the substitution
rather than guess at it:

| The mockup ships | What actually ships | Why |
|---|---|---|
| Its own `:root` palette (`--paper:#f5eddf`, `--gold:#e6b64a`, `--green:#2d6245`…) | `references/design/assets/tokens.css`, imported by `app/globals.css` line 1 | Near-identical values, different file — which is the whole problem. `check-design-drift` has a `raw-hex` rule over `.tsx` **and** `globals.css`, plus a `token-source` rule asserting globals imports the canonical file first. |
| `<span class="bean">` — a CSS-shaped div logo, and a brand that is not a link | `GoldenFrijolMark` + `BrandLockup`, linking home | A second lockup is a second brand (decided in `landing-frijoles-rebrand`). And there is currently no way back to the site from the methodology. |
| `.btn` / `.btn.gold` | `components/ui/Button.tsx` | The button system exists. |
| `.prompt` + `.copy` — a dark block with a Copy button | `components/landing/CopyPromptCard.tsx` | Already built, already copies from its own rendered node so displayed and copied text cannot diverge, already asserted in `e2e/landing.browser.spec.ts`. Do not write a second one (D8). |
| `✓` in the progress rail | Nothing — the rail is cut (D6) | `check-design-drift`'s `ui-pictograph` rule bans `✓` outright. |
| `box-shadow: 0 22px 60px rgba(57,40,23,.08)` picked by eye | The named elevation ladder already in `globals.css` | Six ad-hoc shadow values were consolidated into named rungs by `landing-frijoles-rebrand` S3 S3.2. A new surface picks a **role**, not a number (D2). |
| `backdrop-filter: blur(12px)` on the topbar, with no fallback | The same effect, with its degradation shipped alongside (D2) | The mockup is already reaching for Apple materials. It just isn't reaching for the part that keeps them legible. |

Kept **as-is** because it is content, not skin: the six-chapter structure with its
Consider/Operate/Exit grouping, and the four-way work-block taxonomy (gold *Do this on your project*,
dark *Use your agent*, green *Look for*, plain *This part is yours* / *What you just learned*). That
taxonomy is the pedagogy and it is good.

## What the mockup gets wrong — fix, do not port

These are defects, not preferences. A builder who ports faithfully ships all five.

1. **The lede is a rendered JavaScript object.** All six `<p class="lede">` blocks contain the raw
   `{1:"…",2:"…",…}[n]` literal as visible body text. A templating step never ran. Each chapter takes
   its own lede string (Story 2.1); the Sprint 2 spec asserts no rendered lede contains `{`, because
   this can only ever regress silently.
2. **Pandoc artifacts.** Every "What you just learned" block ends with a literal
   `------------------------------------------------------------------------` paragraph — a markdown
   horizontal rule that survived conversion from the field guide.
3. **A collapsed bullet list.** Chapter 3's *"Ask: - Does the Opportunity matter? - Is the Outcome a
   change in reality…"* is a real list flattened into one hyphenated paragraph. The same defect is in
   the field guide source (§0, §3, §Practitioner checkpoint). Restore them as lists.
4. **It is a `display:none` SPA.** No URLs, no deep links, no back button, nothing for a crawler or an
   LLM to read — and `openChapter(1); showHome();` on load leaves chapter 1 marked active regardless
   of state. Real routes are the point of Sprint 2 (D7).
5. **The cards are `<div onclick>`** — not focusable, not keyboard-operable, no role.

## Architecture decisions — locked before any code

Verified against the live code, not inferred from the plan. Builders **cite** these; they never
re-derive them.

### D1. Same tokens, new composition — the room changes, the building does not
*Product owner, 2026-08-20.*

`/methodology` gets its distinct feel from **layout and density**, not from a second palette: a
three-column reading shell, a sticky phase-grouped TOC, article measure and type rhythm, chapter
cadence. Every colour and type value still resolves from `tokens.css`.

**Verified:** `apps/web/app/globals.css` line 1 is `@import '../../../references/design/assets/tokens.css';`,
and `scripts/check-design-drift.mjs` carries both a `raw-hex` rule (over `.tsx` **and** `globals.css`)
and a `token-source` rule asserting that import comes first. `tokens.css` is the byte-mirrored design
handoff and is **not edited** by this epic — new rules land in `globals.css` and use tokens only.

### D2. "Material design" means Apple's materials, rendered in ours
*Product owner, 2026-08-20.*

Not Google's Material Design 3. The reference is Apple's HIG *materials* — layered depth,
translucency and vibrancy, elevation expressed as a material sitting over content rather than as a
drop shadow — as extended by the Liquid Glass language (WWDC 2025, iOS 26 / macOS 26). Applied here
as **mechanics over kraft**: translucent sticky chrome over the paper ground, depth by layering, an
HIG-scale type hierarchy, spring-weighted motion on chapter transitions.

**It extends the existing elevation ladder rather than inventing shadows.** `globals.css` already
names its rungs by what a surface *is* (`raised` — sits on the page ground: a prompt card, an app
shell — and its siblings), after `landing-frijoles-rebrand` S3.2 consolidated six ad-hoc shadow
values into three conceptual heights. A materials pass that picks new blur radii by eye undoes that.

**Mandatory rider, non-negotiable, ships in the same story as the effect (3.3):**
`prefers-reduced-transparency`, `prefers-contrast: more` and `prefers-reduced-motion` fallbacks, and
the browser smoke asserts the opaque fallback actually renders. Apple shipped Liquid Glass and then
reduced its translucency during the iOS 26 beta cycle over legibility complaints; `Reduce
Transparency` and `Increase Contrast` are first-class user settings. Web support for
`prefers-reduced-transparency` is still uneven across engines — **verify in a real browser, do not
infer from the media query.**

### D3. `Shape` → `Design` travels to public surfaces and the methodology content only
*Product owner, 2026-08-20.*

**In:** the landing copy, the six chapter texts, the field guide.
**Out:** `AGENTS.md`, `Roadmap/WAYS-OF-WORKING.md` (whose betting layer says *shaping* eleven times
and cites `references/shapeup/` as its lineage), `Roadmap/LEARNINGS.md`, the `groom` skill, the
seeds. Our internal operating vocabulary keeps *Shape*.

**This is a copy pass, not `sed`.** The source has *"a shaped Bet"*, *"the correct result of
shaping"*, *"Shape creates a plausible bounded investment decision"* and the agent prompt's *"Before
shaping it, read the project agents…"*. A mechanical swap produces at least four awkward lines. Per
LEARNINGS: take the diagnosis, write the line yourself.

**Recorded hazard, accepted:** "Design it" now sits one repo away from "design system" and
`check-design-drift`. Judged cheaper than renaming the operating docs.

### D4. The loop teaches the phases; the Methodology section previews the chapters
*Product owner, 2026-08-20.*

With §loop becoming Consider/Operate/Exit, the landing would otherwise say those three words twice —
`MethodologySection`'s field-guide card already renders exactly `['Consider', 'Operate', 'Exit']`. So
that card stops repeating the phases and previews the six real chapters instead.

The loop copy is the product owner's, **verbatim**:

| # | Title | Copy |
|---|---|---|
| 01 | Consider | Consider whether it deserves investment. |
| 02 | Operate | Operate by deploying that investment through humans and agents. |
| 03 | Exit | Exit by deciding what the Evidence justifies. |

`MakerLoopSection`'s "Why five steps and not four" comment is **replaced**, not deleted. A comment
explaining a property the code no longer has is CODE-QUALITY #3, and this file has one aimed
directly at it.

### D5. The content module is the SSOT; any downloadable edition is generated from it

Once `lib/methodology-chapters.ts` exists, a hand-maintained field-guide markdown is a second copy of
the same prose — precisely the drift class `lib/landing-sections.ts` exists to prevent, and the class
this repo has now been bitten by three times. The TS module is authoritative; the downloadable
edition is **generated** (Story 4.2), never maintained in parallel. If generation is not built, the
download button is **cut** rather than pointed at a file that will silently diverge.

The v0.2 field guide still lands in `references/` (Story 2.1) — as the dated provenance record the
content was derived from, not as a live second source.

### D6. No fake state, and no button that goes nowhere

Two mockup elements are claims the product cannot back, and both are the exact failure
CODE-QUALITY #9 names:

- The right-hand rail stamps **Read ✓** before the reader has read anything and leaves *Tried* and
  *Produced* permanently `○` — on the one panel whose own copy says *"Scrolling does not count."*
- **"Download current edition ↓"** has no handler.

The rail is **cut from the skateboard** and returns in Story 3.4 only as real per-visitor progress.
The download button ships working (D5) or does not ship. This is the same ruling `landing-maker-ops`
D5 made about this section's placeholder CTA; it did not stop being true.

### D7. Real routes, and a chapter registry that fails loudly

`/methodology` (index) and `/methodology/[chapter]` (six chapters), server-rendered with
`generateStaticParams`, deep-linkable and crawlable. The chapter registry follows
`lib/landing-sections.ts`'s shape and keeps its **throwing** lookup: `getSection()` throws on an
unknown id, which is what makes a typo a build-time failure rather than a silently missing page.
`lib/horizon-destinations.ts` is the precedent for generalising that shape.

Ids are route segments **and** TOC targets. A registry entry with no chapter, and a TOC link with no
target, are the same failure — the Sprint 2 spec asserts the round trip.

### D8. The agent-prompt block is `CopyPromptCard`, and the content module holds a plain string

**Verified:** `CopyPromptCard` takes `{ label, prompt, className? }`, copies from its own rendered
`<pre>` node rather than from the prop (so displayed and copied text cannot diverge), trims
surrounding whitespace only, and falls back to selecting the text when the clipboard write is
refused. `e2e/landing.browser.spec.ts` already asserts the clipboard contents.

Consequence for Story 2.1: each chapter's *Use your agent* block is a **plain prompt string** in the
content module. No JSX, no template wrapper — anything the render side adds is text the reader's
agent receives and the reader never saw.

### D9. Route metadata follows `layout.tsx`'s `generateMetadata` precedent and names no gated capability

**Verified:** `app/layout.tsx` uses `async generateMetadata`, deliberately and with the reasoning
recorded, because a static object bakes in whatever `SITE_URL` was set at build time and this repo's
`typecheck-build` CI job runs `npm run build` with no env vars at all. The methodology routes do the
same. The rule from that file applies unchanged: a link preview travels **without** the qualification
the page carries, so it describes the shape and names no capability a flag flip can falsify.

### D10. The route is held dark by not being linked, not by a flag

No kill-switch and no enablement flag. Everything here is public presentation: no money, no auth, no
DB write, no migration. The route simply is not linked from the nav until Story 2.4 — same "hold it
dark" property, none of the flag debt.

## Sprints

Sprint 1 is carved to **ship standalone**. If the appetite is exhausted after it, the live page is
still better and nothing is half-built.

| # | Sprint | Outcome |
|---|---|---|
| 1 | [The vocabulary and the loop](sprint-1.md) | Three portfolio moves, one word for the second move, and §methodology stops repeating §loop. No new route. |
| 2 | [`/methodology` skateboard](sprint-2.md) | The content module, real routes, all six chapters readable and deep-linkable, the CTA finally pointed somewhere. Deliberately plain. |
| 3 | [The reading experience](sprint-3.md) | The chapter shell, the work-block family, the Apple-materials pass with its fallbacks, real read progress. |
| 4 | [Evidence, honesty, close-out](sprint-4.md) | Reader telemetry, the generated edition (or the cut button), a11y + drift + metadata, ship, prove it shipped, close. |

## Branch plan — stacked, not siblings

Per WAYS-OF-WORKING ("stack or pay"): these sprints share `globals.css`, `lib/landing-sections.ts`
and the landing components by construction.

```
main
└── feat/methodology-experience        (S1)  → PR, merge
    └── feat/methodology-experience-s2 (S2)  → PR, merge
        └── feat/methodology-experience-s3 (S3) → PR, merge
            └── feat/methodology-experience-s4 (S4) → PR, merge
```

Each cut from the previous, one PR per sprint, merged in order. Merging to `main` is the deploy.

## Definition of Done (epic)

- [ ] Every story's acceptance checks pass, run and reported with real output.
- [ ] `npm run typecheck && npm run lint && npm run test:unit && npm run test:e2e` green locally.
- [ ] `npm run check:design-drift` green — no raw hex, no inline style in `components/landing`, no
      pictograph, no heading ending in a full stop, `token-source` intact.
- [ ] Two cross-family review rounds minimum per PR, routed by `scripts/review-route.mjs`, and **the
      last round is clean from both families** — a count is not the stopping condition.
- [ ] Merged to `main` (= the deploy), and the deployed SHA confirmed via
      `gh api repos/danybgoode/golden-beans/deployments` — never assumed from a green CI run.
- [ ] Production smoke on `https://goldenfrijoles.com`: §loop renders three moves, no rendered
      "Shape" on `/`, all six chapter URLs answer 200, no lede contains `{`, every CTA resolves, the
      reduced-transparency fallback renders opaque, no horizontal scroll at 390px.
- [ ] Each `sprint-N.md` carries its fool-proof smoke walkthrough with real production URLs.
- [ ] `Roadmap/README.md` poster updated · `RETROSPECTIVE.md` written · durable learnings promoted to
      `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append) · frontmatter `status: shipped` ·
      `node scripts/build-order.mjs` regenerated (never hand-edited) · branches deleted.
- [ ] **Owed to the product owner by name** (no automated check covers these): does `/methodology`
      read as a genuinely different room from `/`, and does the renamed vocabulary actually read
      better as *Design* than it did as *Shape*, sentence by sentence?
