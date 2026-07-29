# Sprint 2 — Product shell and loaders

**Status:** ✅ Shipped — Golden Beans PRs [#51](https://github.com/danybgoode/golden-beans/pull/51)
and [#53](https://github.com/danybgoode/golden-beans/pull/53), 2026-07-28

## Story 2.1 — A product shell instead of bare HTML

> **As a** signed-in operator, **I want** every dashboard page to inherit a branded shell and sane
> component defaults, **so that** the product feels deliberate even before a page receives bespoke
> composition.

**Acceptance:** `/app/**` receives a shared navigation shell, page width/rhythm, panels, tables,
forms, empty states, and responsive behavior without weakening any existing auth or tenancy checks.

## Story 2.2 — Waiting that belongs to Golden Beans

> **As a** user waiting on a dynamic route, **I want** a distinctive progress state, **so that** the
> product feels alive without inventing progress or data.

**Acceptance:** Client navigation and form submission use the approved phrase list, a
pulsing gold status dot, `aria-live`, sequential 1.5-second phrase rotation, and reduced-motion
behavior. The loader must not introduce a streamed route boundary that changes a feature-gated 404
into a 200.

## Story 2.3 — Representative browser proof

> **As a** product owner, **I want** rendered desktop/mobile evidence, **so that** the lift is judged
> on the actual interface rather than source code.

**Acceptance:** Browser smoke covers public, auth, install, and product-shell states at desktop and
mobile widths, including focus visibility and horizontal overflow.

## Story 2.4 — The rails fail closed on drift

> **As a** future builder, **I want** design-system drift rejected automatically, **so that** a new
> page cannot silently reintroduce inline landing styles, UI emoji, or raw color literals.

**Acceptance:** A zero-dependency guard scans `landing/` and `app/`, is unit-tested, runs in
pre-commit for relevant paths, and has a dedicated CI workflow. The landing contains no
`style={{}}` declarations.

## Shipped evidence

- Signed-in routes share the branded shell, resilient component defaults, and responsive layout
  rails without changing their authorization or tenancy boundaries.
- The approved navigation/submission loader provides the gold status dot, sequential phrases,
  accessible live region, and reduced-motion behavior without adding a streamed route boundary.
- Desktop/mobile browser coverage and the tested design-drift guard protect the representative
  public, auth, install, and signed-in surfaces in CI and pre-commit.
