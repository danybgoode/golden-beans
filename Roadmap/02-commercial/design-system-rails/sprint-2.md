# One design system, every surface — Sprint 2: The language, systematised

**Status:** ⬜ not started

> **This is the sprint Daniel is actually buying.** Everything after it is application. The approved
> prototype is the language (locked at the scoping review); this sprint turns it from one HTML file
> into tokens, primitives and states that 29 routes can be built from.
>
> `references/ux-guidelines.md` was drafted 2026-07-23 and has **never been applied to a primitive.**
> Most of Story 2.2 is that document, executed.

## Stories

### Story 2.1 — The type and space scale, on a specimen that renders from the system
**As a** builder, **I want** one type scale, one space scale and one elevation set,
**so that** a page's spacing is a choice from a scale rather than a number someone typed.
**Acceptance:**
- Scales derived from the approved prototype by measurement, not by taste — the sizes and weights in
  the contract's spec table are the source, and Story 1.4 makes them regenerable.
- A **specimen route** renders every scale step from `design-system/`, and is itself in the coverage
  manifest with a reference state. The specimen is how a reviewer sees the whole language on one
  screen.
- `globals.css`'s `.product-shell main > h1` — `clamp(30px, 7vw, 48px)` against an approved
  **23px/700** (contract Do-not #1) — is superseded here, not left to Sprint 6.
**Risk:** high

### Story 2.2 — Every primitive has all nine states
**As a** person using the product, **I want** every control to tell me what it will do, that it is
working, and what happened, **so that** I never have to click something to find out what it does.
**Acceptance:**
- The full taxonomy from `ux-guidelines.md` — **idle · hover · focus · pressed · loading · success ·
  error · empty · disabled** — is *designed* for every primitive, not just the two states someone
  happened to style.
- **Focus is visible on every interactive element**, keyboard-only included, and
  `prefers-reduced-motion` is honoured.
- Each state has a reference render, so "the pressed state was not implemented" becomes a gate
  failure rather than a review comment. That exact defect shipped last epic.
**Risk:** high

### Story 2.3 — The primitive set the approved states are built from
**As a** builder, **I want** the components the mockups already show, **so that** a page is
assembled rather than hand-drawn in CSS.
**Acceptance:** each of the following exists in `design-system/`, renders from the token file, has
its nine states and a reference render: **rail item · project switcher · environment menu · section
tab · state pill · three-state switch (on / off / dashed "never") · stat tile · data table with
header row, row menu and empty state · answer line · primary and secondary button · dialog · toast ·
numbered step card · wizard**.
- **The dialog fixes a live bug:** a universal `* { margin: 0 }` reset defeats the UA's
  `margin: auto` on `dialog:modal`, and **every confirmation dialog in this product has been pinned
  to the viewport's top-left corner since the component shipped**, measured at `x: 0, y: 0` in
  1440×960. Assert where the dialog *is*, not only that it opened.
- Existing `components/ui` primitives are **adopted and extended, never re-authored** — audit §2.2:
  *"the work is mostly adoption and a handful of new primitives."*
**Approved states:** every state — the primitive set is what all 32 are assembled from — in `design/console-prototype.html`.
**Risk:** high

### Story 2.4 — Icons ✳ *D4* — and the reason there were none
**As a** person scanning the rail, **I want** a leading icon on every item, **so that** a 36px
single-line entry is recognisable rather than read.
**Acceptance:**
- An SVG `Icon` set covering every rail item in the approved states — Ship (Features, Experiments,
  Scheduled changes, Activity) and Setup (Connect, Keys, Destinations, Share links) — plus the
  section tabs.
- **`iconKey` is a field on `ProjectSurfaceLink` in `lib/project-route-inventory.ts`.** There is no
  icon slot today, which is why there is nowhere for an icon to come from. One list, extended.
- **The pictograph ban stays on.** `check-design-drift.mjs` bans pictographs inside `/app`, and that
  is why no icon was ever added — the answer is `Icon` components, not an exemption (audit §10.5:
  *"do not disable the rule"*).
**Risk:** high

### Story 2.5 — One product vocabulary
**As a** person using the product, **I want** the words to be about my job, **so that** the page
stops describing the storage model.
**Acceptance:**
- `flag-vocabulary.ts` **generalises** into a product vocabulary module; it is not replaced, and
  every user-facing word in `design-system/` goes through it.
- **Uppercase appears in exactly two places and never in mono** (contract Do-not #3), and **no page
  copy is about storage** (Do-not #7). Both are live defects: *"WHAT THIS LIST REPORTS IS WHAT
  PRODUCTION IS SERVING"* and *"Definitions, immutable versions and their audit remain visible while
  flag serving is dark"* are on screen today.
- **Where the prototype and the control plane disagree about a word, the control plane wins and the
  disagreement is recorded as a finding.** The last epic's clearest example: the design's *"a release
  toggle is off by default"* maps onto `defaultVariantKey: 'off'`, which creates a feature you cannot
  turn on.
**Risk:** high

## Sprint QA
- **api spec(s):** `e2e/design-system-primitives.browser.spec.ts` — every primitive × every state
  asserted against its reference render, including **the dialog's position** and a keyboard-only
  focus pass · `e2e/vocabulary.spec.ts` — no uppercase outside the two permitted places, no storage
  words in user-facing copy.
- **browser smoke owed:** yes, to Daniel — **the specimen route**, which is the one screen where he
  approves or rejects the language before any page is rebuilt on it.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: **the branch preview** — the design system is not yet on any product route.

1. Go to `<preview-url>/app/design-system` (signed in).
   → The specimen renders every type step, every space step, and every primitive in all nine
   states, on one screen. **This is the language. Approve or reject it here.**
2. Tab through the specimen with the keyboard only, without touching the mouse.
   → Every interactive element shows a visible focus ring. Nothing is reachable-but-invisible.
3. On the specimen, open the confirmation dialog.
   → It is **centred in the viewport**. It has been pinned to the top-left corner since the
   component shipped; if it is still in the corner, this story is not done.
4. Look at the rail items on the specimen.
   → Each carries an SVG icon, and the active one is a raised card — lighter fill, a border, a gold
   icon — legible at a glance rather than a fill you have to look for.
5. Open the PR's CI run.
   → Coverage reports **2/29** (Ship › Features + the specimen). Product routes are unchanged.

If any step fails, note the step number + what you saw — that's the bug report.
