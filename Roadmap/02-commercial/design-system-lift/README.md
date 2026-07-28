---
status: in-progress
slug: design-system-lift
---

# Epic: Design system lift — the limitless golden-bean brand

> **Area:** 02-commercial · **Risk:** low · **Source:** Daniel’s 2026-07-28 design handoff and mark direction

## Why

Golden Beans has a coherent dark product shell, but too many signed-in screens still inherit bare
browser HTML and the public face still reads as a coffee roastery. The product is a working version
of the magic-beans tale: familiar Mexican beans transformed into polished gold, planted as a small
primitive and compounding without an artificial ceiling. This epic makes that metaphor visible and
turns it into reusable product rails rather than a one-page skin.

## Scope

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Gold-ingot bean mark and reusable asset pack | LOW |
| 1 | 1.2 Shared tokens, primitives, focus/motion/accessibility rails | LOW |
| 1 | 1.3 Public landing and auth/install surface lift | LOW |
| 2 | 2.1 Signed-in shell and inherited styling for existing dashboard pages | LOW |
| 2 | 2.2 Branded route loaders with the approved phrase rotation | LOW |
| 2 | 2.3 Responsive browser QA across public and signed-in representative routes | LOW |

## Design contract

- The canonical interface mark is Lucide’s `Bean`, rendered with a `#FFD700` material-gold finish.
- Beans are food beans / magic beans, never coffee beans. Copy uses planting, climbing,
  compounding, gilding, and limitless growth—not roasting or brewing.
- Product code consumes shared brand/UI components and tokens; no page creates a second logo,
  loader, button, input, card, or shell treatment.
- Motion obeys `prefers-reduced-motion`, focus is always visible, and all normal text clears WCAG AA
  against its surface.
- Loaders are client-side navigation/submission feedback, not an App Router `loading.tsx` boundary:
  a streamed parent fallback can turn a child feature gate's required HTTP 404 into a 200.

## Verification

- Deterministic gate: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`.
- Browser gate: desktop and mobile screenshots of `/`, `/login`, `/install`, and a representative
  signed-in shell or its loading state; verify no horizontal overflow and visible keyboard focus.
- Asset check: every SVG in `apps/web/public/brand` parses and the React mark uses Lucide’s `Bean`.
