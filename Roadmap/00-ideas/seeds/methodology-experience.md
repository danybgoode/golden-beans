---
title: "The methodology becomes a place you can go — /methodology as a reading experience, the loop reads as three portfolio moves, and Shape becomes Design"
slug: methodology-experience
status: scaffolded
area: "02"
type: feature
priority: "wave-2026-08-20"
appetite: L
underwritten_by: "Roadmap/bets/wave-2026-08-20-methodology.md"
risk: low
epic: "02-commercial/methodology-experience"
build_order: 22
updated: 2026-08-20
---

# Scope — the methodology gets a room of its own

> **Class:** Feature · **Lane:** shaped bet · **Risk:** low
> **Source:** product-owner instruction 2026-08-20, plus the mockup
> [`references/golden-frijoles-methodology-experience-v0.3.html`](../../../references/golden-frijoles-methodology-experience-v0.3.html)
> and the field guide *Golden Frijoles — Minimum Viable Field Guide v0.2* (attached to the groom
> session; **not yet in the repo** — landing it is Story 2.1).
> **Predecessor:** [`landing-maker-ops`](../../02-commercial/landing-maker-ops/README.md) — this
> epic redeems the promise its `MethodologySection` deliberately left open.

## Mirror-back

You want the methodology to stop being a paragraph on the landing page and become a place a reader
can actually go — `/methodology`, six chapters, learn-by-doing, with the reading experience feeling
like a different room from the sales page. Along the way the method's second move stops being
called *Shape* and starts being called *Design*, and the landing's maker loop collapses from five
mechanical steps to the three portfolio moves the method actually has: **Consider · Operate · Exit**.

## Classification

**Feature**, but it is honestly two asks that are coupled by one word:

| Half | Bucket (Stage 2.5) | Could ship |
|---|---|---|
| Rename + 3-step loop + Methodology-section rework | **Light enhancement** — copy and content on components that already exist. No new route, no new data. | This week, on its own |
| `/methodology` as a real reading experience | **Genuinely new** — the route does not exist (`apps/web/app` has no `methodology/`). Heavy reuse, but new surface. | After |

They are groomed as **one epic** rather than two, because the rename has to land identically on the
landing copy and in the chapter content or the product says two words for the same move. **Sprint 1
is carved so it ships standalone** — if the rest of the epic never gets bet on, Sprint 1 is still a
complete, shippable improvement to the live page.

## Decisions locked (Daniel, 2026-08-20 groom session)

### D1. Same tokens, new composition — the room changes, the building does not

The mockup ships its own `:root` palette (`--paper:#f5eddf`, `--gold:#e6b64a`, `--green:#2d6245`…),
which is *near-identical* to `references/design/assets/tokens.css` — which is exactly the problem
`landing-maker-ops` already ruled on ("the mockup is the argument, not the skin"). `/methodology`
gets its distinct feel from **layout and density**, not from a second palette: a three-column
reading shell, a sticky phase-grouped TOC, article measure and type rhythm, chapter cadence. Every
colour and type value still resolves from tokens, so `scripts/check-design-drift.mjs` passes
unchanged and the site keeps one brand.

### D2. "Material design" here means **Apple materials**, rendered in our materials

Not Google's Material Design 3. The reference is Apple's Human Interface Guidelines' *materials* —
layered depth, translucency and vibrancy, elevation expressed as a material sitting over content
rather than as a drop shadow — as extended by the Liquid Glass language introduced at WWDC 2025 for
iOS 26 / macOS 26 (see Research). Applied here as **mechanics over kraft**: a translucent sticky
topbar and TOC rail floating over the paper ground (`backdrop-filter`, which the mockup already
reaches for), depth by layering rather than by heavier borders, an HIG-scale type hierarchy, and
spring-weighted motion on chapter transitions.

**This decision carries a mandatory accessibility rider** (Story 3.3, non-negotiable): Apple shipped
Liquid Glass and then had to dial its translucency back during the iOS 26 beta cycle over legibility
complaints, and the HIG's own guidance is that materials must degrade. So
`prefers-reduced-transparency`, `prefers-contrast: more` and `prefers-reduced-motion` fallbacks ship
*in the same story as the effect*, and the browser smoke asserts the opaque fallback actually
renders. A glass effect over warm kraft with no fallback is the one version of this that cannot ship.

### D3. Shape → Design travels to public surfaces and the methodology content only

In scope: the landing copy, the six chapter texts, the field guide. **Out of scope this epic:**
`AGENTS.md`, `Roadmap/WAYS-OF-WORKING.md` (whose betting layer says *shaping* eleven times and cites
`references/shapeup/` as its lineage), `Roadmap/LEARNINGS.md`, the `groom` skill, the seeds. Our
internal operating vocabulary keeps *Shape*, and that lineage stays legible.

**Recorded hazard, accepted:** "Design it" now sits one repo away from "design system" and
`check-design-drift`. A reader who goes from `/methodology` into `AGENTS.md` will meet both words.
Judged cheaper than renaming the operating docs.

### D4. The loop teaches the phases; the Methodology section previews the chapters

With §loop becoming Consider/Operate/Exit, the landing would otherwise say those three words twice —
`MethodologySection`'s field-guide card already lists exactly `['Consider', 'Operate', 'Exit']`. So
that card stops repeating the phases and previews the **six real chapters** instead, and its CTA
finally gets the destination its own source comment promised ("the epic that writes the document
re-points it" — `components/landing/MethodologySection.tsx`).

### D5. The content module is the SSOT; the downloadable edition is generated from it

Once `lib/methodology-chapters.ts` exists, the field-guide markdown becomes a second copy of the
same prose — precisely the drift class `lib/landing-sections.ts` was built to prevent. So the TS
module is authoritative and any downloadable edition is **generated** from it (Story 4.2), never
maintained in parallel. If that generation is not built, the download button is cut rather than
pointed at a file that will silently diverge.

### D6. No fake state, and no button that goes nowhere

Two things in the mockup are claims the product cannot back, and both are the exact failure
CODE-QUALITY #9 names:

- The right-hand rail stamps **Read ✓** before the reader has read anything, and leaves *Tried* and
  *Produced* permanently ○ — on the one panel whose copy says *"Scrolling does not count."*
- **"Download current edition ↓"** has no handler.

The rail is **cut from the skateboard** and returns in Story 3.4 only as real per-visitor progress.
The download button ships working (D5) or does not ship.

## Research (verified 2026-08-20, cited)

- **Apple materials / Liquid Glass.** Liquid Glass is Apple's current material language (introduced
  WWDC 2025, shipping across iOS 26 / macOS 26), built on the HIG's long-standing materials model:
  translucency, vibrancy, and hierarchy expressed through layered depth. Its stated principles are
  hierarchy, harmony and consistency — which is why D2 takes the *mechanics* and not the chrome.
- **The accessibility caveat is documented, not theoretical.** Practitioner and accessibility write-ups
  through the iOS 26 cycle flagged legibility and contrast regressions from translucent controls over
  busy grounds, and Apple reduced the effect's intensity in later betas. `Reduce Transparency` /
  `Increase Contrast` are first-class user settings, with web equivalents in
  `prefers-reduced-transparency` and `prefers-contrast` — support for the former is still uneven
  across engines, so Story 3.3's fallback must be verified in a real browser, not assumed from the
  media query.

Sources: [Liquid Glass: Redefining design through Hierarchy, Harmony and Consistency](https://www.createwithswift.com/liquid-glass-redefining-design-through-hierarchy-harmony-and-consistency/) · [iOS 26 in detail: Liquid Glass UI between Usability and Accessibility](https://letsdev.de/en/blog/ios-26-in-detail-liquid-glass-ui-between-usability-and-accessibility.php) · [Apple's New Liquid Glass Design: Practical Guidance for Designers](https://designedforhumans.tech/blog/liquid-glass-smart-or-bad-for-accessibility) · [Apple HIG — design system breakdown](https://www.designsystems.one/design-systems/apple-hig)

## What already exists (reuse, don't rebuild)

Read the code before writing any. Nothing here is new infrastructure — the whole epic is
presentation over things this repo already has.

| Need | Already exists | Note |
|---|---|---|
| The dark "Use your agent" prompt block with a Copy button | `components/landing/CopyPromptCard.tsx` | The mockup's `.prompt` + `.copy` is this component. Do not write a second one. |
| Nav, brand lockup, footer | `components/landing/Nav.tsx`, `components/brand/BrandLockup.tsx`, `GoldenFrijolMark`, `Footer.tsx` | The mockup's `<span class="bean">` is a second logo — superseded on contact, same as last wave. |
| Buttons, icons, badges | `components/ui/Button.tsx`, `Icon.tsx` (lucide map), `Badge.tsx` | The mockup's `.btn.gold` is `Button`. `✓` is banned outright by the drift guard's `ui-pictograph` rule. |
| "Content lives in a pure data module, the component derives from it" | `lib/maker-ops.ts` + `MakerHero`/`OpsSection` | The pattern `lib/methodology-chapters.ts` must follow — and `MakerHero`'s lesson: **derive the list, never keep a parallel copy.** |
| A registry keyed to DOM ids, asserted by a spec | `lib/landing-sections.ts`, `lib/horizon-destinations.ts` | Same shape for chapters; `horizon-destinations` is the precedent for generalising it. |
| Design tokens + the drift gate | `references/design/assets/tokens.css`, `app/globals.css`, `scripts/check-design-drift.mjs` | Bans raw hex, inline `style={}` in `components/landing`, pictographs, enclosed numerals, and full stops on headings (D7 rule). |
| CTA whose destination resolves from a flag | `components/landing/RunYourFirstBet.tsx` | Keep as the primary action; the methodology link is the secondary. |
| Landing telemetry | `components/landing/SelfTrackBeacon.tsx` | Story 4.1 extends this rather than adding a second beacon. |
| Two-layer QA | `apps/web/e2e/` — `api` (the blocking gate) + `browser` (opt-in smoke) | One spec per testable story, per WAYS-OF-WORKING. |
| Metadata / OG | `app/opengraph-image.tsx`, `app/twitter-image.tsx` | Chapters need their own; the pattern exists. |

## What the mockup gets wrong (fix, don't port)

Recorded so no story re-litigates it and a reviewer can check the substitution rather than guess:

1. **The lede is a rendered JavaScript object.** All six `<p class="lede">` blocks contain the raw
   `{1:"…",2:"…"}[n]` literal as visible text. A templating step never ran. Each chapter takes its
   own lede string.
2. **Pandoc artifacts.** Every "What you just learned" block ends with a literal
   `------------------------------------------------------------------------` paragraph — a
   markdown horizontal rule that survived conversion.
3. **Collapsed bullet lists.** Chapter 3's *"Ask: - Does the Opportunity matter? - Is the Outcome…"*
   is a real list flattened into one hyphenated paragraph. Same defect in the field guide source
   (§3, §Practitioner checkpoint, §0). Restore them as lists.
4. **It is a `display:none` SPA.** No URLs, no deep links, no back button, nothing for a crawler or
   an LLM to read. Real routes are the point of Sprint 2.
5. **Cards are `<div onclick>`** — not focusable, not keyboard-operable, no role. They become `Link`s.
6. **`openChapter(1); showHome();` on load** leaves chapter 1 marked active regardless of state.
7. **The brand is not a link** — there is no way back to the site from the methodology.
8. Raw-hex `:root`, `✓` glyph, inline `style="height:33%"`-class devices → all superseded (D1).

Two things are kept **as-is** because they are content, not skin: the six-chapter structure with its
Consider/Operate/Exit grouping, and the work-block family (gold *Do this on your project*, dark
*Use your agent*, green *Look for*, plain *This part is yours* / *What you just learned*). That
four-way block taxonomy is the pedagogy and it is good.

## v1 boundary

**In:**

- The landing's loop reads as three phases with the product owner's copy, verbatim.
- Shape → Design on every public surface and in all six chapters.
- `/methodology` (index) and `/methodology/[chapter]` (six chapters), server-rendered, deep-linkable,
  crawlable.
- The chapter content as one typed module, with the mockup's four defects fixed.
- The reading shell: phase-grouped sticky TOC, article typography, prev/next, Apple-materials pass
  with its accessibility fallbacks.
- Real per-visitor read progress, or no progress rail at all.
- Reader telemetry through the existing beacon.

**Out (say no now, so it can't creep):**

- Any change to `AGENTS.md`, `WAYS-OF-WORKING.md`, `LEARNINGS.md`, the `groom` skill, or the seeds (D3).
- Accounts, sign-in, saved progress across devices, comments, or a "mark as complete" that writes to
  a database. No migration, no new table, no new env var, no new runtime dependency.
- Rewriting the methodology itself. This epic renames one move and builds a reader; it does not
  change doctrine.
- A second palette, a second lockup, a second button system (D1).
- Localisation. The page is English-only today and stays that way.
- Turning the whole landing into finance jargon. The portfolio metaphor is carried by
  Consider/Operate/Exit and by *invest / deploy / Evidence / Exit* where they already fit; it does
  not license *allocation*, *position sizing* or *carry* on the hero.

## Slicing (skateboard → car) — 4 sprints

### Sprint 1 — The vocabulary and the loop *(no new route; ships standalone)*

| # | Story | Risk |
|---|---|---|
| 1.1 | **As a visitor, I want the maker loop to read as three portfolio moves, so that I understand the method as investment decisions rather than a five-step process.** `MakerLoopSection` goes 5 → 3 with the product owner's copy verbatim: *Consider whether it deserves investment · Operate by deploying that investment through humans and agents · Exit by deciding what the Evidence justifies.* The component's "why five steps and not four" comment is **replaced**, not deleted — the new one records why three. `lib/landing-sections.ts`'s loop title updates in the same commit. **Acceptance:** `/` §loop renders exactly three items with those three titles and that copy. | LOW |
| 1.2 | **As a reader, I want the product to use one word for the second move, so that it doesn't say Shape and Design in the same breath.** Shape → Design on every rendered string on `/`; the hero's micro line and `MethodologySection`'s prose realigned. **This is a copy pass, not a find-and-replace** — see Open risks. **Acceptance:** the rendered HTML of `/` contains no user-visible "Shape"/"shaping". | LOW |
| 1.3 | **As a visitor, I want the Methodology section to preview the actual chapters, so that the page stops saying Consider/Operate/Exit twice** (D4). The field-guide card lists the six chapter titles grouped by phase. CTA destination unchanged until 2.4. **Acceptance:** §loop and §methodology no longer render the same three-word list. | LOW |

**Sprint QA:** one `api` spec over `/`'s rendered HTML — three loop titles present, zero "Shape",
the two lists differ. One `browser` smoke, desktop + mobile. Smoke walkthrough owed: none money/auth.

### Sprint 2 — `/methodology` skateboard *(real routes, all six chapters readable, deliberately plain)*

| # | Story | Risk |
|---|---|---|
| 2.1 | `lib/methodology-chapters.ts` — the typed content module (id · phase · number · title · lede · typed blocks). All six chapters, defects 1–3 fixed, chapter 2 renamed *Design it*. Field guide v0.2 lands in `references/` as the provenance record. Pure module, unit-tested. | LOW |
| 2.2 | **As a maker, I want a methodology index I can link to, so that I can find the method without hunting the landing page.** `/methodology`: kicker/hero, the Direction + three-phase card, six chapter cards as real `Link`s. | LOW |
| 2.3 | **As a maker, I want each chapter at its own URL, so that I can send someone straight to the one that matters.** `/methodology/[chapter]` with `generateStaticParams`, the correct lede per chapter, prev/next. | LOW |
| 2.4 | Nav grows a Methodology link; `MethodologySection`'s CTA and the footer point at `/methodology`; `lib/landing-sections.ts` note updated. | LOW |

**Sprint QA:** an `api` spec walking all six chapter URLs — title, phase label, prev/next target, and
an explicit assertion that no lede contains `{` (defect 1 can only regress silently). `browser` smoke
on index + one chapter.

### Sprint 3 — The reading experience *(where the Apple-materials pass lives)*

| # | Story | Risk |
|---|---|---|
| 3.1 | The chapter shell: sticky phase-grouped TOC with a real active state, mobile collapse, keyboard-operable throughout. | LOW |
| 3.2 | The work-block family as tokens-only primitives — gold *Do this on your project*, dark *Use your agent* (**reusing `CopyPromptCard`**), green *Look for*, plain *This part is yours* / *What you just learned*. | LOW |
| 3.3 | **The Apple-materials pass** (D2): translucent layered chrome over the paper ground, depth by material rather than shadow, HIG-scale type hierarchy and reading measure, spring motion on chapter transition — **shipping with `prefers-reduced-transparency` / `prefers-contrast` / `prefers-reduced-motion` fallbacks in the same story**, verified in a real browser. | LOW |
| 3.4 | Real per-visitor read progress replacing the mockup's hardcoded ✓ (D6). *Tried* and *Produced* are either honestly labelled as not-tracked or cut. | LOW |

**Sprint QA:** `browser` smoke asserting the reduced-transparency fallback renders opaque and legible;
axe pass on index + one chapter. **Owed to Daniel by name:** the subjective "does this feel like a
different room" judgment — no automated check covers it.

### Sprint 4 — Evidence, honesty, close-out

| # | Story | Risk |
|---|---|---|
| 4.1 | Reader telemetry through the existing beacon (`methodology_visited`, `methodology_chapter_opened`), registered so the funnel has shape — the methodology reader becomes a real TARS funnel we dogfood. | LOW |
| 4.2 | The downloadable edition, **generated from the content module** (D5), linked from the page and `llms.txt` — or the button is cut. | LOW |
| 4.3 | `check-design-drift` clean; a11y sweep (one `h1` per route, landmarks, focus rails, keyboard-reachable cards); metadata + OG images for index and chapters. | LOW |
| 4.4 | Epic close-out per WAYS-OF-WORKING: poster updated, `RETROSPECTIVE.md`, LEARNINGS promotion, every sprint's smoke walkthrough written with real production URLs. | LOW |

## Stage 6b — kill-switch decision

**No kill-switch, and no enablement flag.** Everything here is public presentation over data this
repo already resolves: no money, no auth, no DB write, no migration. The route is simply **not
linked from the nav until Story 2.4**, which gives the same "hold it dark" property as a flag with
none of the flag debt. If Daniel wants the content signed off before the URL is guessable, say so at
approval and 2.2 grows a `methodologyExperienceEnabled` gate (default `false`, created disabled).

## QA / smoke (Stage 8b owners)

Every sprint closes with a numbered walkthrough in its `sprint-N.md` using real production URLs
(preview URLs pre-merge). Nothing in this epic touches the money or auth path, so no step is owed to
Daniel on those grounds — **but two judgments are owed to him anyway**, because no automated check
can make them:

1. Does `/methodology` read as a genuinely different experience from `/` (Sprint 3)?
2. Does the renamed vocabulary actually read better as *Design* than it did as *Shape*, sentence by
   sentence (Sprint 1)?

## Open risks

- **"Designing" and "a designed Bet" read worse than "shaping" and "a shaped Bet" in several
  sentences.** The field guide has *"A shaped Bet should be bounded enough to operate"*, *"Shape
  creates a plausible bounded investment decision"*, *"'Do not build this' can be the correct result
  of shaping"*, and the agent prompt's *"Before shaping it, read the project agents…"*. A mechanical
  swap produces at least four awkward lines. **Story 1.2 and 2.1 are copy passes with a human read,
  not `sed`.** Per LEARNINGS: take an advisory reviewer's diagnosis, write the line yourself.
- **Apple materials over warm kraft can go muddy.** Translucency tuned on Apple's cool greys behaves
  differently over `--paper`. Named rabbit hole: if the glass does not read well over kraft within
  Story 3.3's budget, ship the composition without it (D1 already delivers the "different room") and
  re-bet the materials pass — do not rebuild the design system to make glass work.
- **`backdrop-filter` cost on a long scrolling article** is real on low-end hardware, and
  `prefers-reduced-transparency` support is uneven across engines. Verify in a browser; do not infer
  from the media query.
- **Two copies of the methodology prose** is the drift risk this epic creates. D5 is the answer; if
  4.2 slips, the download button must be cut rather than left pointing at a diverging file.
- **Field guide version skew.** The attached edition is v0.2 and its own §Practitioner-checkpoint
  language still gestures at "nine practices" while the reader has six chapters. Story 2.1 reconciles
  or explicitly records the gap.
- **Scope pressure from "portfolio management metaphor more throughout."** The v1 boundary names the
  no-go; if Daniel wants a full vocabulary sweep of the landing, that is a separate S bet after this
  ships, judged against the copy actually on the page.

## Definition of Ready

- [x] "As a / I want / so that" clear on every story; acceptance testable by Daniel.
- [x] Stage-2.5 bucket named (light enhancement + genuinely new, split across sprints).
- [x] v1 in/out boundary written.
- [x] Research cited (Apple materials / Liquid Glass + the accessibility rider).
- [x] Reuse list produced — nothing new is modelled.
- [x] Every story risk-tiered (all LOW); QA stage named per sprint; smoke owners identified.
- [x] **Daniel approved this doc, 2026-08-20.**

## Bet and scaffold — done 2026-08-20

Approved as a whole-epic orchestrated run. Appetite **L** (multi-wave, re-bet at each wave boundary),
with Sprint 1 carved to ship on its own if the rest is not funded.

- **Underwritten by** [`Roadmap/bets/wave-2026-08-20-methodology.md`](../../bets/wave-2026-08-20-methodology.md) — bet #18.
- **Displaces** the analytics charting-dependency spike and the Git & Releases discovery spike, both
  now unfunded for a second consecutive wave.
- **Epic scaffolded** at [`02-commercial/methodology-experience`](../../02-commercial/methodology-experience/README.md)
  — README with decisions D1–D10 locked, four sprint docs with build contracts.

This seed is now **funnel-only**: the epic README's frontmatter `status:` is the SSOT from here.
