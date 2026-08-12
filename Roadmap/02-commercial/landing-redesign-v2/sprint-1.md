# Landing redesign v2 — Sprint 1: Mobile rails + the v2 skin

**Status:** ✅ Shipped — PR [#92](https://github.com/danybgoode/golden-beans/pull/92), merged as `4553767`. Live in production.

> **Build contract.** This sprint ships **CSS and one spec harness**. No landing component changes
> — Sprint 2 consumes what this lays down. `tokens.css` is a byte-mirrored handoff artifact and is
> **not** edited (D3, and the same rule `app-component-kit-adoption` S1 hit); every new class goes
> into `apps/web/app/globals.css`.

## Stories

### Story 1.1 — Mobile heuristics as global rails
**As a** person opening Golden Beans on a phone, **I want** every page to behave — no sideways
scroll, no tap target I miss, no code block that pushes the layout off-screen — **so that** the
product is usable on the device I actually have with me.

**Acceptance:**
- Global base rules in `globals.css` make these structurally hard rather than per-page fixed:
  - horizontal overflow containment (`overflow-x` guard on the root, `min-width: 0` on grid/flex
    children, `overflow-wrap` on long tokens);
  - wide content (tables, `pre`, code) scrolls **inside its own container**, never the page body;
  - every interactive element meets the ~44px tap-target floor stated in
    `references/ux-guidelines.md`;
  - `env(safe-area-inset-*)` respected on the page gutter so notched devices don't clip;
  - `prefers-reduced-motion: reduce` honoured by anything this epic animates.
- Rules are authored **mobile-first**: base CSS is the narrow case, `min-width` queries only add.
- No raw hex; `npm run check:design-drift` passes.
**Risk:** low

### Story 1.2 — One guard spec that sweeps many routes
**As a** future contributor, **I want** adding a route to the mobile check to be appending a path,
**so that** coverage accretes instead of being copy-pasted per page.

**Acceptance:**
- A single parameterised Playwright spec asserts, for a **list** of public routes at 360/390px:
  no horizontal overflow, and no interactive element under the tap-target floor.
- The route list is one exported array — adding the 28th route is one line.
- The spec was observed **failing red** at least once against a deliberately-broken rule
  (mutation check, per the story DoD).
**Risk:** low

### Story 1.3 — The v2 component classes
**As a** builder in Sprint 2, **I want** every visual device the mockup uses to exist as a named
class, **so that** the landing components carry zero inline styles (D3).

**Acceptance:**
- `globals.css` gains classes for each device in `references/golden-beans-landing-v2.html`: the
  eyebrow/kicker/takeaway type scale, the surface note, the prompt card, the flow column, the stat
  grid, the release list, the staged-proposal app shell, the comparison table, the centred closing
  CTA, and the divider/bag-label variants the mockup adds.
- Each is mobile-first and matches the mockup's rendering at 390px, 640px and 1140px.
- No raw hex — every colour is a token.
**Risk:** low

## Smoke walkthrough

1. `npm run dev`, open `http://localhost:3000` in a 390px-wide viewport → the page renders with no
   horizontal scrollbar.
2. Rotate to 900px → columns appear; no rule fights another with `!important`.
3. `npm run check:design-drift` → passes.
4. `npm run test:e2e:browser` → the mobile-heuristics sweep passes for every listed route.
