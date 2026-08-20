# Methodology experience — Sprint 3: The reading experience

**Status:** ✅ **Shipped and verified in production** — PR [#107](https://github.com/danybgoode/golden-beans/pull/107), squashed to `main` as `3196171`, Production deployment `6008591605` reported `success` for that exact SHA.
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

### Story 3.1 — The chapter shell  ✅ `d9c5d11`

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

### Story 3.2 — The work-block family as primitives  ✅ `1990c00` + `c23815e`

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

### Circuit-breaker evidence for Story 3.3, gathered BEFORE the build (2026-08-20)

The breaker's condition is *"if translucency does not read well over warm kraft inside this story's
budget"*. That is a question with an answer, so it was answered first — with a prototype over the
real tokens rather than by building the feature and then judging it.

**Finding 1 — D2's premise describes the mockup's page, not ours.** D2 says "translucent sticky
chrome over the **paper** ground" and "mechanics over kraft". The mockup is a light page
(`--paper: #f5eddf`). **This site is dark**: the page ground is `--roast: #16120d`, and kraft is a
material for *cards* (the bag label, the field-guide) — never the page ground. So the breaker's
literal condition, "over warm kraft", describes a surface that does not exist on `/methodology`.
The question that matters is whether it reads over `--roast`.

**Finding 2 — it does, and my first visual read was WRONG.** Both grounds were prototyped with the
same bar, the same blur, and real content scrolled underneath. Judged by eye on a full-page
screenshot, the dark version looked nearly invisible. Measured, the opposite is true:

| Ground | mean channel delta, glass vs opaque | max |
|---|---|---|
| `--roast` (ours) | **15.13 / 255** | 46 |
| `--paper` (the mockup's) | 10.44 / 255 | 34 |

The dark ground changes **more**, because a bright element passing under the bar (the gold swatch,
`--gold`) has far more contrast against near-black than kraft has against paper. Isolated, the
translucent bar shows a warm luminous wash where the opaque one is flat.

**This is the "verify a visual claim by RENDERING, not by grepping" rule one level in: a full-page
screenshot at small scale is not a measurement either.** Had the breaker been pulled on the first
impression, a working effect would have been cut on false evidence.

**Consequence: the breaker does NOT fire on this criterion.** It stays armed for the other two the
story names — the fallbacks not landing in the same story, and frame cost on a long chapter.

**Finding 3 — a scope question the story does not settle, and the architect's call.** D2 asks for
translucent sticky chrome on "topbar and TOC rail". The TOC rail is already sticky (Story 3.1) and
is methodology's own chrome, so it costs nothing. **The topbar is not sticky anywhere on this site**,
and `Nav` is shared by `/`, `/talk`, `/install` and `/login` — making it sticky site-wide is a change
to every page, from a sprint whose contract is the methodology's reading experience. It is scoped to
the methodology routes via their own layout instead, or it is not done. Recorded here so the
narrower reading is a decision rather than an omission.

### A rejected review finding that turned out to be right — recorded, not buried (2026-08-20)

On PR #105 round 3, Antigravity raised: *"the reduced-motion reset block is no longer the final
block in the stylesheet … appending new section blocks below it reintroduces a regression hazard for
any future `:active` transforms or transitions added lower in the file."*

**I rejected it**, on the grounds that `globals.css` switches motion off **at the source** by zeroing
`--motion-quick`/`--motion-base`, so a rule added later that uses those tokens needs no edit there
and declaration order cannot matter. That was true of every transition in the file, and it is why
the rejection was reasonable.

**It was false for the very next thing this epic built.** Story 3.3's chapter-arrival effect is a
`@keyframes` animation, and an animation does not consult `--motion-base` for its own *existence* —
only for its duration. The unguarded rule sat ~1300 lines below the reduced-motion block, won on
order, and the `animation: … both` shorthand applied its `from` state regardless: a reader who asks
for reduced motion would have landed on a chapter at **`opacity: 0`**. An invisible chapter, for
precisely the readers who asked for less movement. The spec caught it on its first run.

**The fix is the guard, not a re-ordering:** the animation is declared inside
`@media (prefers-reduced-motion: no-preference)`, so there is nothing to switch off and no order to
get wrong. `no-preference` is deliberately not "not reduce" — an engine that has never heard of the
query matches neither and gets the static page, which is the correct degradation.

**The transferable rule** (for `RETROSPECTIVE.md` and `LEARNINGS.md`): *a review finding rejected on
sound reasoning about the code as it stands can be a correct prediction about the code you are about
to write.* The rejection is not retroactively wrong — it was right about transitions — but the
finding named a hazard class, and a class outlives the instance that prompted it. When a reviewer
describes a **hazard** rather than a defect, the useful question is not "is this broken today" but
"what would have to be added for this to break", and this epic added it within the hour.

### Story 3.3 — The Apple-materials pass, with its fallbacks  ✅ `e512bf4`

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

### Story 3.4 — Real progress, or no progress  ✅ `ce80701`

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

Env: **production** · <https://goldenfrijoles.com> · deployed SHA `3196171` (confirmed via
`gh api repos/danybgoode/golden-beans/deployments`, not inferred from a green CI run).

All public surface. Steps 5–7 need a browser setting changed, and are the ones an automated check
cannot fully stand in for.

| # | Do this | Expect |
|---|---|---|
| 1 | Open <https://goldenfrijoles.com/methodology/design-it> on a wide screen | Three columns: a contents rail on the left, the article at a comfortable measure, space on the right |
| 2 | Look at the rail | Chapters grouped under **CONSIDER · OPERATE · EXIT**, with `02 Design it` highlighted |
| 3 | Open <https://goldenfrijoles.com/methodology/prove-it> **directly**, in a new tab | `05 Prove it` is highlighted — the active state comes from the URL, not from having clicked |
| 4 | Scroll down a long chapter, e.g. <https://goldenfrijoles.com/methodology/build-it> | The topbar stays, and content passing beneath it tints and blurs through the bar. The rail stays put and never slides under the topbar |
| 5 | **macOS:** System Settings → Accessibility → Display → **Reduce transparency**. Reload | The topbar and rail go fully opaque. Still clearly separated from the article — the hairline and shadow survive |
| 6 | Turn on **Increase contrast** instead. Reload | Opaque again, with a brighter edge on the chrome |
| 7 | Turn on **Reduce motion**. Reload a chapter | The chapter appears immediately, with no slide-and-fade. **It must not be invisible** — that was a real defect this sprint |
| 8 | Open three or four chapters, then look at the right-hand column | *"N of 6 chapters opened"* and *"Counted in this browser only."* Never a ✓, never *Tried*, never *Produced* |
| 9 | Open the same page in a private window | No rail — a fresh browser has nothing to report, and it says nothing rather than "0 of 6" |
| 10 | Narrow to a phone width | The rail becomes a scrollable strip above the article; the progress card follows the article. Nothing is hidden |
| 11 | Run the sprint's specs against production | `PLAYWRIGHT_BASE_URL=https://goldenfrijoles.com npx playwright test apps/web/e2e/methodology-shell.browser.spec.ts apps/web/e2e/methodology-materials.browser.spec.ts apps/web/e2e/methodology-progress.browser.spec.ts --project=browser` → **19 passed** |

**Step 11 found a real defect on its first run**, which is why it is in the walkthrough rather than
assumed: 18 of 19 passed and the margin-switching spec reported the rail as missing. The rail was
rendering correctly — the spec read computed styles before the client effect had run, a race a fast
local server hides and a real network exposes. Fixed in `b0b6e7a`.

**Owed to the product owner by name — answered, and the answer is yes.** Put `/` and a chapter side
by side: the landing is full-bleed bands, display headlines, figures and gold bars, everything
competing for attention. The chapter is one column at reading measure, a persistent rail saying
where you are in six, quiet section markers instead of headlines, and content passing under a
translucent bar. It reads as a document rather than a page.

Two honest qualifications. The room is different but the **building** is the same — same palette,
same nav, same footer — which is D1 working exactly as intended rather than a shortfall. And the
difference comes overwhelmingly from **layout and density**; the materials pass is a real but subtle
finish on top of that, not the thing doing the work. If the glass were removed tomorrow, it would
still read as a different room.
