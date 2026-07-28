# Golden Beans asset pack

Canonical geometry: Lucide `Bean` (ISC), on the 24×24 Lucide grid. Canonical brand color:
`#FFD700`.

| Asset | Use |
|---|---|
| `golden-bean-mark.svg` | Primary material/ingot mark on transparent backgrounds |
| `golden-bean-mark-flat.svg` | Small sizes, engraving, one-color-friendly reproduction |
| `golden-beans-lockup-dark.svg` | Ready-made lockup for dark placements |
| `golden-beans-lockup-light.svg` | Ready-made lockup for light placements |

In the React app, use `GoldenBeanMark` / `BrandLockup` from `components/brand`; do not import these
SVGs into product UI. That component uses `lucide-react` directly and keeps accessible labeling,
sizing, and the material finish on the shared design-system rail. The SVGs are for external decks,
profiles, README surfaces, and handoff to tools that do not render React.

Do not rotate into a coffee-bean shape or add coffee leaves. The mark is a familiar food bean,
gilded like a small ingot: the working magic bean that compounds into a limitless beanstalk.
