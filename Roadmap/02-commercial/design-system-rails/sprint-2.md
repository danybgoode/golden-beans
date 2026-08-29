# One design system, every surface — Sprint 2: The language, systematised

**Status:** ⬜ not started

> **This is the sprint Daniel is actually buying.** Everything after it is application. The approved
> prototype is the language (locked at the scoping review); this sprint turns it from one HTML file
> into tokens, primitives and states that 29 routes can be built from.
>
> `references/ux-guidelines.md` was drafted 2026-07-23 and has **never been applied to a primitive.**
> Most of Story 2.2 is that document, executed.

## Build contract (locked by the architect before the builder started)

> Sprint 2 is **not delegated** (README → *Routing*): it defines the primitives Sprints 3–6 assemble
> from, so a permissive reading here is re-paid 29 times. **Cite a decision; never re-derive one.**

**Paths this sprint owns.** `apps/web/design-system/**` · `apps/web/components/ui/**` (extend, never
re-author) · `apps/web/lib/project-route-inventory.ts` (`iconKey`) · a new specimen route
`apps/web/app/app/design-system/page.tsx` · `apps/web/e2e/design-system-primitives.authed.spec.ts` ·
`apps/web/e2e/vocabulary.spec.ts`. **It changes no existing product route.**

| # | The contract | Cites |
|---|---|---|
| 1 | Scales are **measured out of the approved prototype**, from the regenerated spec table — never chosen. `23/700` h1, `13.5/600` rail item, `11/600 uppercase` list header, `26/600 IBM Plex Mono` stat number, `38 × 21` switch. | **D8** |
| 2 | The specimen is a **real route in the manifest with a reference state**, not a Storybook. It is how Daniel approves the language on one screen before any page is rebuilt on it. Coverage after this sprint: **2/29**. | **D5** |
| 3 | Every primitive class is `ds-`-prefixed under `.ds`. The drift guard's namespace rule (Story 1.3) is what enforces it. | **D3** |
| 4 | Icons are `<Icon name="…">` from the closed `ICON_NAMES` union. **`↗` is never typed** — `name="external"` is the approved arrow. The pictograph ban is not touched. | **D4**, **F1** |
| 5 | `iconKey` is added to `ProjectSurface`, to the `Pick<>` that builds `ProjectSurfaceLink`, and to the mapper. The closed union makes an unknown key a **compile error**, not a blank square. | **D4** |
| 6 | Existing `components/ui` primitives are **adopted and extended**. `Panel`, `Button`, `Badge`, `Icon`, `DataTable`, `StatCard`, `FunnelBars`, `RolloutBar`, `ConfirmDialog`, `ActivityFeedItem`, `FormSection`, `SectionDivider` already exist — audit §2.2: *"the work is mostly adoption and a handful of new primitives."* | audit §2.2 |
| 7 | ⚠️ **The dialog-centring bug is ALREADY FIXED.** `globals.css` restates `margin: auto` on `.confirm-dialog`. This sprint owes the **assertion**, and its red comes from a **mutation check recorded in the PR body** — delete `margin: auto`, watch the position assertion fail at `x: 0, y: 0`, restore. | **D12** |
| 8 | Where the prototype and the control plane disagree about a word, **the control plane wins** and the disagreement is written down as a finding. `flag-vocabulary.ts` **generalises**; it is not replaced. | Story 2.5 |
| 9 | Live copy this sprint must remove, verified on production 2026-08-29: uppercase mono body copy (*"WHAT THIS LIST REPORTS…"*), and storage-model page copy (*"Definitions, immutable versions and their audit…"*). Do-not #3 and #7. | contract Do-nots |
| 10 | `prefers-reduced-motion` is honoured, and **focus is visible on every interactive element** — the keyboard pass is an assertion, not a review comment. | `ux-guidelines.md` |

**The nine states, from `references/ux-guidelines.md` — the document drafted 2026-07-23 and never
applied to a primitive:** idle · hover · focus · pressed · loading · success · error · empty ·
disabled. **Every primitive gets all nine designed and rendered.** *"The pressed state was not
implemented"* becomes a gate failure rather than a review comment — that exact defect shipped last
epic.

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
- ⚠️ **CORRECTED AT THE LOCK (D12) — the dialog bug is already fixed; the ASSERTION is missing.**
  As scaffolded this read *"the dialog fixes a live bug … every confirmation dialog has been pinned
  to the viewport's top-left corner since the component shipped"*. `apps/web/app/globals.css`
  already restates `margin: auto` on `.confirm-dialog`, with a comment explaining the
  `* { margin: 0 }` interaction — it landed in `console-ia-overhaul` S3.3. What is genuinely missing
  is that **no spec asserts where the dialog is**: `design-system.authed.spec.ts` asserts modality,
  the focus trap and focus restoration, and never geometry — so the fix is one stylesheet edit from
  silently regressing. **Assert where the dialog *is*, not only that it opened**, and because it
  cannot go red on `main`, produce its red with a **mutation check recorded in the PR body**.
- Existing `components/ui` primitives are **adopted and extended, never re-authored** — audit §2.2:
  *"the work is mostly adoption and a handful of new primitives."*
**Approved states:** every state — the primitive set is what all 32 are assembled from — in `apps/web/design-system/console-prototype.html`.
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

> ⚠️ **REWRITTEN AT THE LOCK (D9).** As scaffolded this ran on *"the branch preview"*. **Preview has
> no Supabase credentials and no session** — see D9 — so `/app/design-system` cannot render there at
> all. Steps 1–4 run **locally**; step 5 is the PR's CI run.

Env: steps 1–4 **local** — `supabase start`, then a production build (`npm run build` +
`npm run start`) with `CONSOLE_SHELL_ENABLED=true`, signed in as the local fixture user. Kill any
`next dev` first: a dev server colliding with the runner's own `.next` build is the failure that
looks like a regression and is not.

1. Go to `http://localhost:3000/app/design-system` (signed in).
   → The specimen renders every type step, every space step, and every primitive in all **nine**
   states, on one screen. **This is the language. Approve or reject it here.**
2. Tab through the specimen with the keyboard only, without touching the mouse.
   → Every interactive element shows a visible focus ring. Nothing is reachable-but-invisible.
3. On the specimen, open the confirmation dialog.
   → It is **centred in the viewport**. (It already is — Story 2.3 is adding the assertion that
   keeps it centred. The PR body must show the mutation check that proved the assertion can fail.)
4. Look at the rail items on the specimen.
   → Each carries an **SVG** icon — no glyph, no emoji — and the active one is a raised card:
   lighter fill, a 1px border, a gold icon, full-strength text. Legible at a glance rather than a
   fill you have to look for.
5. Open the PR's CI run.
   → Coverage reports **2/29** (Ship › Features + the specimen). Product routes are unchanged, and
   `https://goldenfrijoles.com/app/flags/miyagisanchez` still looks exactly as it did after Sprint 1.

If any step fails, note the step number + what you saw — that's the bug report.
