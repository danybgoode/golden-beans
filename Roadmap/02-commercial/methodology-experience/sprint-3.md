# Methodology experience — Sprint 3: The reading experience

**Status:** ⬜ Not started
**Branch:** `feat/methodology-experience-s3` (cut from `feat/methodology-experience-s2`)
**Risk:** LOW — reviewer may auto-merge on green CI

> **Build contract (locked by the architect before any builder starts).**
> **Story 3.1's CSS is shared surface** — the shell's grid and the work-block family are imported by
> everything else here — so it lands first and in `apps/web/app/globals.css`, using tokens only.
> `references/design/assets/tokens.css` is **not edited**.
>
> This is the sprint that makes `/methodology` feel like a different room, and it is also the sprint
> most likely to exhaust the appetite. **The circuit breaker is named in advance (epic D2):** if
> translucency does not read well over warm kraft inside Story 3.3's budget, ship the composition
> without it — D1's layout and density already deliver "a different room" — and re-bet the materials
> pass at the wave boundary. **Do not rebuild the design system to make glass work.**
>
> Cite the epic's D1, D2, D6, D8; do not re-derive them.

## Stories

### Story 3.1 — The chapter shell

**As a** reader working through the method, **I want** to see where I am and jump between chapters
without going back to the index, **so that** six chapters read as one guide rather than six pages.

**Acceptance:**
- Three-column reading shell on `/methodology/[chapter]`: sticky left TOC, article column at a real
  reading measure, right column reserved (its content is Story 3.4, or nothing).
- The TOC is **grouped by phase** (Consider / Operate / Exit) and derived from
  `lib/methodology-chapters.ts` — never hand-listed. The active chapter has a real active state, and
  it is derived from the route, not from a click handler (the mockup's
  `openChapter(1); showHome();` leaves chapter 1 active regardless of state — defect 4).
- Fully keyboard-operable with visible focus, and the TOC is a real landmark/nav, not a stack of
  buttons. It collapses to a usable control below the mockup's 700px breakpoint rather than
  `display: none` — the mockup hides the whole TOC on mobile, which strands a phone reader in a
  chapter with no way sideways.
- Every rule lands in `globals.css` and resolves from tokens (epic D1).
**Risk:** LOW

### Story 3.2 — The work-block family as primitives

**As a** reader, **I want** "do this", "use your agent", "look for" and "what you just learned" to be
visually distinct, **so that** I can tell the instruction from the explanation while skimming.

**Acceptance:**
- The four-way taxonomy renders as a primitive family keyed off the module's
  `variant: 'do' | 'agent' | 'look' | 'yours' | 'learned'` — gold, dark, green, and the plain card.
  One component, five variants; not five components.
- The `agent` variant **is** `CopyPromptCard` (epic D8), with the block's prompt string and a label.
  No second copy-to-clipboard implementation, and no wrapper that adds text to the copied string.
- Elevation picks a **named rung** from the existing ladder in `globals.css`, not a new blur radius
  chosen by eye — `landing-frijoles-rebrand` S3.2 consolidated six ad-hoc shadow values into three
  conceptual heights, and a materials sprint is exactly where that gets undone.
- Blockquote, list and heading blocks get the article typography treatment. Contrast is checked
  against the paper ground, not assumed — the mockup's `--muted: #746a5f` on `--paper: #f5eddf` is
  close enough to the AA boundary at small sizes to need measuring.
**Risk:** LOW

### Story 3.3 — The Apple-materials pass, with its fallbacks

**As a** reader, **I want** the methodology to feel materially different from the sales page, **so
that** I know I have moved from being sold to, to being taught — **and as a** reader with reduced
transparency or increased contrast turned on, **I want** it to stay legible.

**Acceptance:**
- Translucent layered chrome over the paper ground (topbar and TOC rail), depth expressed by layering
  and material rather than by heavier borders, HIG-scale type hierarchy, and spring-weighted motion
  on chapter transition. Values from tokens; no raw hex (epic D1, D2).
- **The fallbacks ship in this story, not a follow-up:** `prefers-reduced-transparency`,
  `prefers-contrast: more` and `prefers-reduced-motion` each degrade to an opaque, legible, still
  hierarchical surface.
- **Verified in a real browser, not inferred from the media query.** Support for
  `prefers-reduced-transparency` is uneven across engines; the browser spec below emulates the
  preference and asserts the rendered result, and the PR states which engines were actually checked.
- Performance is checked on a long chapter: `backdrop-filter` over a scrolling article is the one
  thing here with a real cost. If it drops frames, the effect is reduced — the reading experience
  wins over the effect.
- **The circuit breaker applies to this story specifically.** If it is not reading well when the
  budget is spent, stop, ship 3.1 + 3.2 without it, and say so in the PR.
**Risk:** LOW

### Story 3.4 — Real progress, or no progress

**As a** returning reader, **I want** the page to show what I have actually read, **so that** the
progress rail is information rather than decoration.

**Acceptance:**
- The mockup's hardcoded **Read ✓ / Tried ○ / Produced ○** rail is **not ported** (epic D6). `✓` is
  banned by `check-design-drift`'s `ui-pictograph` rule anyway.
- What ships is **real per-visitor read progress**: chapters opened / 6, held client-side, degrading
  silently to no rail when storage is unavailable. No account, no database, no cross-device promise.
- *Tried* and *Produced* are either **cut**, or rendered as an explicit honest gap in the vocabulary
  this page already owns ("not tracked yet") — never as a permanently empty circle next to copy that
  says *"Scrolling does not count."*
- The rail's own prose (*"Produced means something real changed"*) survives only if what it sits
  above is true.
**Risk:** LOW

## Sprint QA

- **`browser` project** — emulate `prefers-reduced-transparency: reduce` and `prefers-contrast: more`
  and assert the chrome renders **opaque and legible**; emulate `prefers-reduced-motion` and assert
  the transition is suppressed. This is the spec that makes D2's rider real rather than stated.
- **`browser` project** — TOC keyboard operation, active state follows the route, mobile TOC reachable
  at 390px, no horizontal scroll.
- **axe** pass on the index and one chapter; contrast measured, not assumed.
- **`api` project** — the Sprint 2 spec still green (the shell must not change what the routes serve).
- **Red first**, per Definition of Done.

## Sprint 3 — Smoke walkthrough

*Written at sprint close, with real production URLs. Placeholder — do not tick the sprint without it.*
Env: production · `https://goldenfrijoles.com` (preview URL while pre-merge)

**Owed to the product owner by name:** does `/methodology` read as a genuinely different room from
`/`? That is the whole point of the sprint and no automated check covers it.
