# Methodology experience — Sprint 2: `/methodology` skateboard

**Status:** 🟨 In progress — Story 2.1 (shared surface, architect) built; 2.2–2.4 next
**Branch:** `feat/methodology-experience-s2` (cut from `feat/methodology-experience`)
**Risk:** LOW — reviewer may auto-merge on green CI

> **Build contract (locked by the architect before any builder starts).**
> **Story 2.1 is shared surface and is built FIRST, by the architect.** `lib/methodology-chapters.ts`
> is imported by every other story in this sprint and every story in Sprints 3 and 4; a builder who
> starts 2.2 against a module that is still moving pays the conflict tax for the whole epic
> (WAYS-OF-WORKING, "one architect, many builders" · "shared surface first").
>
> This sprint is **deliberately plain**. It is the skateboard: six chapters, readable, at real URLs,
> composed from primitives that already exist. The reading experience is Sprint 3 and must not leak
> forward — a builder who starts styling the TOC here has started Sprint 3 without a build contract.
>
> Cite the epic's D1, D5, D7, D8, D9, D10; do not re-derive them.
> `references/design/assets/tokens.css` is **not edited**.

## Stories

### Story 2.1 — The methodology is one typed module *(architect, first, shared surface)*

**As a** future agent or builder, **I want** the six chapters to live in one typed module, **so that**
the prose has exactly one source and the page, the TOC, the metadata and any downloadable edition all
derive from it instead of drifting apart.

**Acceptance:**
- New pure module `apps/web/lib/methodology-chapters.ts`: an ordered array of chapters, each with
  `id` (kebab route segment) · `phase` (`consider` | `operate` | `exit`) · `number` · `title` ·
  `lede` · `blocks[]`. No imports that reach the database — it is content, and it is unit-testable
  without a server.
- `blocks[]` is a **discriminated union** covering what the source actually contains: `prose`,
  `heading`, `list`, `blockquote`, and `work` with `variant: 'do' | 'agent' | 'look' | 'yours' | 'learned'`.
  The `agent` variant carries a **plain prompt string** and nothing else (epic D8) — anything the
  render side adds is text the reader's agent receives and the reader never saw.
- A `getChapter(id)` lookup that **throws** on an unknown id, and `chapterNeighbours(id)` for
  prev/next. Same mechanism as `lib/landing-sections.ts`'s `getSection` (epic D7): a typo becomes a
  build-time failure, not a missing page.
- **All five mockup defects are fixed in the content, not carried:** each chapter has its own real
  `lede` string (never the `{1:"…"}[n]` literal); no
  `------------------------------------------------------------------------` paragraphs; Chapter 3's
  *"Ask: - Does the Opportunity matter? - …"* is restored as a real `list` block, as are the
  equivalent flattened lists in §0 and the Practitioner checkpoint.
- **Chapter 2 is *Design it*** and the rename is applied to the body prose as a copy pass, not a swap
  (epic D3) — including *"A shaped Bet should be bounded enough to operate"*, *"Shape creates a
  plausible bounded investment decision"*, *"the correct result of shaping"* and Chapter 1's agent
  prompt *"Before shaping it, read the project agents…"*. Each rewritten line is readable on its own.
- **Field guide version skew is reconciled or recorded.** ⚠️ **CORRECTED 2026-08-19 — see
  [A5](README.md).** An earlier version of this line claimed there was no skew, on the evidence that
  the v0.3 mockup contains no Practitioner checkpoint. That was true about the *mockup* and it
  answered the wrong question: the story asks about the **v0.2 source**, which was not in the
  repository at the time and is now. It **does** carry the Practitioner checkpoint, and it carries
  the line *"You do not need to memorize nine practices to do it again."* The skew is real. A5 holds
  the decision.
- `references/golden-frijoles-minimum-viable-field-guide-v0.2.md` is added and tracked (mode 644) as
  the dated provenance record the content was derived from — **not** as a live second source (D5).
  ✅ **Done** (`1a6fdfc`). The product owner supplied the real file; A3 resolved with option (a), and
  it is tracked verbatim and unedited. The module was then checked against it rather than assumed:
  all six chapters are faithful, and the only deviations are the deliberate D3 rewrites.
- Unit tests: exactly six chapters in phase order; every `id` unique and URL-safe; every chapter has
  a non-empty `lede` that **does not contain `{`**; `getChapter` throws on an unknown id;
  `chapterNeighbours` returns `null` at both ends; every `agent` block's prompt is non-empty.
**Risk:** LOW

### Story 2.2 — A methodology index I can link to

**As a** maker, **I want** a methodology index at its own URL, **so that** I can find the method
without hunting the landing page, and send someone the whole thing in one link.

**Acceptance:**
- `apps/web/app/methodology/page.tsx` renders: the kicker/hero (*"Make something real."*), the
  Direction + three-phase card (Consider / Operate / Exit with the field guide's one-line summaries),
  and six chapter cards **derived from the module**, never hand-listed.
- Cards are real `next/link` elements, not `<div onClick>` (mockup defect 5) — focusable,
  keyboard-operable, with a visible focus ring from the existing focus rails.
- Reuses `Nav`, `Footer`, `Button`, `Icon`, `BrandLockup`. The brand **links home** — the mockup's
  does not, and there is currently no way back to the site from the methodology.
- Composed from existing primitives and tokens only. No new CSS device beyond what the grid needs;
  the reading shell is Sprint 3.
**Risk:** LOW

### Story 2.3 — Every chapter at its own URL

**As a** maker, **I want** each chapter to have its own URL, **so that** I can send someone straight
to the one that matters instead of "scroll to chapter 4".

**Acceptance:**
- `apps/web/app/methodology/[chapter]/page.tsx` with `generateStaticParams` over the module's ids.
  An unknown segment returns a real 404, not a throw in the render path.
- Each chapter renders its **own** lede (mockup defect 1), its phase label, its heading hierarchy and
  every block variant, with the `agent` variant rendered by `CopyPromptCard` (epic D8).
- Prev/next chapter navigation from `chapterNeighbours`, with the field guide's phase labels
  (`NEXT · CONSIDER`, etc.). Chapter 6's "next" is the index, and it says so.
- Exactly **one `<h1>` per route**, and the chapter titles keep their full stops out of headings or
  are written as titles — `check-design-drift`'s `heading-period` rule will reject *"Bring an idea."*
  as an `<h1>`. **Decide once, here, and record it:** either the titles lose the stop, or the
  displayed title is not a heading element. Do not special-case the guard.
**Risk:** LOW

### Story 2.4 — The promise gets its destination

**As a** visitor who just read "explore the methodology", **I want** the button to take me there,
**so that** the page stops making an offer it cannot keep.

**Acceptance:**
- `MethodologySection`'s CTA points at `/methodology`. The `landing-maker-ops` D5 comment in that
  file, which explains why the destination was a placeholder and says *"the epic that writes the
  document re-points it"*, is updated to record that this epic did.
- `Nav` grows a Methodology link, root-relative (`/methodology`) — the nav renders on `/talk` too,
  and bare fragments silently did nothing there once already.
- `Footer` links it. `MakerHero`'s "See how the method works" ghost button is re-pointed from
  `/#methodology` to `/methodology` — or is deliberately left as the in-page jump, with the reason
  written down.
- Story 1.3's temporary inline chapter list in `MethodologySection` is **replaced by a derive** from
  `lib/methodology-chapters.ts`. The comment promising this is removed with it.
- `lib/landing-sections.ts`'s header note records that §methodology now links out to a real route.
**Risk:** LOW

## Sprint QA

- **`api` project (the blocking gate)** — a spec that walks **all six** chapter URLs plus the index:
  each answers 200; each renders its own title and phase label; **no rendered lede contains `{`**
  (defect 1 can only ever regress silently, so this assertion is the point of the spec); prev/next
  targets resolve; an unknown segment 404s; every id in the module renders as exactly one reachable
  route and every TOC/card link has a target (the D7 round trip).
- **`browser` project** — the index and one chapter: cards are keyboard-reachable and activate on
  Enter; `CopyPromptCard` copies the visible prompt text (reuse the existing landing assertion).
- **Red first**, per Definition of Done.

## Sprint 2 — Smoke walkthrough

*Written at sprint close, with real production URLs. Placeholder — do not tick the sprint without it.*
Env: production · `https://goldenfrijoles.com` (preview URL while pre-merge)
