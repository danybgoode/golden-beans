# Sprint 2 — Product shell and loaders

**Status:** 🟨 In progress

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
growing/gilded bean animation, `aria-live`, deterministic hydration-safe phrase selection, and
reduced-motion behavior. The loader must not introduce a streamed route boundary that changes a
feature-gated 404 into a 200.

## Story 2.3 — Representative browser proof

> **As a** product owner, **I want** rendered desktop/mobile evidence, **so that** the lift is judged
> on the actual interface rather than source code.

**Acceptance:** Browser smoke covers public, auth, install, and product-shell states at desktop and
mobile widths, including focus visibility and horizontal overflow.
