# Maker ops — Sprint 2: The new spine

**Status:** not started

> **Build contract.** Every story below consumes Sprint 1's shared surface and adds nothing to it.
> The mockup supplies the argument and the copy; the skin comes from the component kit
> (`components/ui/*`, `components/brand/*`) and the token file — see the epic's substitution table.
> No story ships a raw hex, an inline `style={}`, a pictograph, or a heading ending in a full stop;
> the drift guard enforces all four.

## Stories

### Story 2.1 — The hero says who this is for
**As a** maker who builds with agents, **I want** the first screen to name me and show what I would
actually do here, **so that** I know within one screen whether this product is for me.

**Acceptance:**
- Eyebrow, headline ("Make more. / Grow what works."), lead and the two CTAs from the mockup.
- The primary CTA is "Run your first Bet" and resolves through `isSignupEnabled()` (epic D2) — never
  a dead anchor.
- The kraft bag label lists the four Ops surfaces, using the existing kraft material family.
- The agent window is an `AgentWindow` with a `ChatThread` and a `ContextCard` — the Bet card is the
  context card, not a bespoke device.
- It carries a `SurfaceNote` committing to **illustration** (the `landing.browser` spec asserts
  every framed window on this page does).
- `GoldenFrijolMark`/`BrandLockup` supply the logo. The mockup's `.bean` div does not ship.
**Risk:** low

### Story 2.2 — The maker loop, in five steps
**As a** reader who just got the pitch, **I want** the shape of the loop in five plain steps,
**so that** "operate your product" becomes something concrete rather than a category.

**Acceptance:**
- Shape → Build → Release → Observe → Grow, numbered, each with one sentence.
- The kraft band above it carries the mockup's line about what actually changed.
- Single-column on a phone; five across on a wide viewport, from the base-first rules.
**Risk:** low

### Story 2.3 — One operating context
**As a** maker, **I want** to see that my North Star, journeys, signals, experiments, flags,
scenarios and agent activity live in one place, **so that** I understand the product is a context,
not a dashboard.

**Acceptance:**
- The product shell renders the real `/app` navigation vocabulary, so the illustration matches the
  product a reader will actually meet.
- The figures use `StatCard`, which forces a real reading or an explicit "unreadable" state, and
  the trend uses `FunnelBars` — never an unlabelled `<i style="height:33%">`.
- Every number on this frame is illustrative, and the frame says so once, above it, via
  `SurfaceNote` — not per-tile (per-element caveats are how a page ends up with caveats nobody
  reads).
- The agent-activity line renders through `ActivityFeedItem`, the one device for agent activity in
  this codebase.
**Risk:** low

### Story 2.4 — Four Ops surfaces, one panel
**As a** maker weighing whether this covers my whole operation, **I want** to move between Product,
Dev, Sec and FinOps, **so that** I can see the breadth without eight screens of scrolling.

**Acceptance:**
- Renders from `lib/maker-ops.ts` (Story 1.3) — no copy in the component.
- A real **tablist**: `role="tablist"`/`role="tab"`/`role="tabpanel"`, `aria-selected`, arrow-key
  navigation, roving `tabindex`, and a visible focus ring. A `<div>` with a click handler does not
  satisfy this story.
- The SecOps surface's badge reads the live gates (epic D3) and says which part is gated, not a
  blanket "coming soon".
- FinOps carries the `next` badge everywhere it appears, including on its tab.
- **Circuit breaker:** if the accessible tablist cannot be built inside this story, ship four static
  panels and cut the tabs — the content is the value.
**Risk:** medium *(the one genuinely new interactive device on the page)*

### Story 2.5 — Agents move, authority stays put
**As a** maker being asked to let an agent act on my product, **I want** to see exactly where its
autonomy stops, **so that** "let agents move" reads as a controlled system rather than a leap of
faith.

**Acceptance:**
- Two panels: staged action + approval, and bounded scenarios + evidence.
- The activity rows use `ActivityFeedItem` with real `Icon`s — the mockup's `<i>A</i>`, `<i>✓</i>`,
  `<i>R</i>`, `<i>S</i>`, `<i>E</i>` placeholders do not ship (`✓` is a drift-guard violation on
  sight).
- The scenario panel's claims are gate-aware: with both scenario gates OFF in production, the panel
  says the drills are built and currently gated, and it says it by reading the flag.
**Risk:** low

### Story 2.6 — FinOps, labelled as the concept it is
**As a** reader, **I want** the AI-economics section to be unmistakably a plan, **so that** I do
not sign up expecting a cost dashboard that does not exist.

**Acceptance:**
- A `next` badge on the section, the mockup's own "next build, not a shipped capability" line kept,
  and the figures visibly hypothetical.
- No `StatCard` presenting a hypothetical as a reading — the concept panel uses its own treatment so
  the two are not confusable (epic D4, and CODE-QUALITY #9).
- The optimisation-suggestion line keeps its "recommendation only" qualifier.
**Risk:** low

### Story 2.7 — The methodology, without the placeholder
**As a** reader who wants the way of working behind the product, **I want** the field guide's shape
and its nine steps, **so that** I know what I would be learning.

**Acceptance:**
- The kraft field-guide card with ORIENT → … → LEARN and the "practice earns doctrine" line.
- **No dead link and no design-session placeholder** (epic D5). The section's CTA is the page's real
  one.
**Risk:** low

### Story 2.8 — The page is recomposed
**As a** reader, **I want** one page that argues once, **so that** the repositioning is not bolted
on top of the argument it replaces.

**Acceptance:**
- `app/page.tsx` renders the D1 order. `SelfTrackBeacon` stays first — the dogfood funnel must keep
  firing.
- The nine retired sections are **deleted**, not orphaned: no unreferenced component files, no
  unreferenced CSS, no registry entries without a renderer.
- The nav links point at sections that exist (the `landing.browser` spec asserts this).
- `Nav` and `Footer` keep `BrandLockup`; the closing CTA carries the primary "Run your first Bet".
- Page metadata (`layout.tsx` title/description) matches the repositioning — the tab title currently
  states the pitch this epic replaces.
**Risk:** medium *(the deletion half — an orphan is invisible until someone greps for it)*
