---
status: shipped
slug: design-system-lift
build_order: 9
---

# Epic: Design system lift — the limitless golden-bean brand

> **Area:** 02-commercial · **Risk:** low · **Source:** Daniel’s 2026-07-28 approved handoff in
> `references/golden-beans-design-system-proposal/` and
> `references/golden-beans-mark-exploration-round2.html`

## Why

The supplied visual system already defines the product: dark-roast software, kraft packaging, foil
highlights, and brass instruments. The implementation had drifted into inline page styling and
literal pictographs, so the approved finish was not reliably reaching the site. This epic applies
the handoff as reusable rails. Its bean is a familiar food bean transformed into a polished gold
ingot—the working magic bean that grows without an artificial ceiling.

## Scope

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Gold-ingot bean mark and reusable asset pack | LOW |
| 1 | 1.2 Shared tokens, primitives, focus/motion/accessibility rails | LOW |
| 1 | 1.3 Public landing and auth/install consumption | LOW |
| 2 | 2.1 Signed-in shell and inherited styling for existing dashboard pages | LOW |
| 2 | 2.2 Restrained route loader with the complete approved phrase rotation | LOW |
| 2 | 2.3 Responsive browser QA across public and signed-in representative routes | LOW |
| 2 | 2.4 Automated token/icon/inline-style drift guard | LOW |

## Design contract

- The canonical interface mark is Lucide’s `Bean`, rendered with a `#FFD700` material-gold finish.
- The global accent remains `--gold: #e8b93c`; `#FFD700` is reserved for the canonical mark.
- The approved materials stay dark roast, kraft, foil, and brass. Beans are food/magic beans, not
  coffee beans; brew language may appear only where the supplied voice intentionally uses it.
- Product code consumes shared brand/UI components and tokens; no page creates a second logo,
  loader, button, input, card, or shell treatment.
- The loader is the approved pulsing gold status dot and one sequential phrase at a time. It never
  adds a bean, sprout, or decorative spectacle that was absent from the handoff.
- Motion obeys `prefers-reduced-motion`, focus is always visible, and all normal text clears WCAG AA
  against its surface.
- Loaders are client-side navigation/submission feedback, not an App Router `loading.tsx` boundary:
  a streamed parent fallback can turn a child feature gate's required HTTP 404 into a 200.

## Verification

- Deterministic gate: `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run build`.
- Drift gate: `npm run check:design-drift`; canonical tokens are imported directly by the app.
- Browser gate: desktop and mobile screenshots of `/`, `/login`, `/install`, and a representative
  signed-in shell or its loading state; verify no horizontal overflow and visible keyboard focus.
- Asset check: every SVG in `apps/web/public/brand` parses and the React mark uses Lucide’s `Bean`.

## Shipped

The full lift shipped in Golden Beans PR [#51](https://github.com/danybgoode/golden-beans/pull/51)
and its corrective handoff follow-up [#53](https://github.com/danybgoode/golden-beans/pull/53) on
2026-07-28. The approved visual system now covers public, auth, install, and signed-in routes;
the navigation loader and route safeguards are in place; and the drift guard runs locally and in
CI. The post-handoff review also preserved feature-gated 404 semantics by keeping guards above
streaming shell/loading boundaries.
