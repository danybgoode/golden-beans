// The icon NAMES, as data — separate from the component that renders them.
//
// ⚠️ This is not tidiness. `Icon.tsx` is `.tsx`, and Node's type-stripping cannot load JSX — so any
// unit test importing the name list from there dies with `ERR_UNKNOWN_FILE_EXTENSION`. That is this
// repo's own recorded rule: a unit-tested pure value cannot live in the same file as code that
// imports a framework (Roadmap/LEARNINGS.md). `project-route-inventory.test.ts` asserts that every
// surface's `iconKey` is a name the component actually defines, and it needs to read that list
// without booting React.
//
// `Icon.tsx` re-exports both, so every existing import keeps working.

export const ICON_NAMES = [
  // design-system-rails · Sprint 2, Story 2.4 (epic D4) — the rail and the section tabs.
  //
  // ⚠️ These exist because `check-design-drift.mjs` BANS pictographs inside `/app`, which is the
  // reason no rail item ever had an icon: the approved prototype draws them as `◧ ◑ ◔ ≡ ⌁ ⌗ → ◫`,
  // and every one of those is a glyph the guard refuses. The answer the audit demanded (§10.5, "do
  // not disable the rule") is an SVG component, so each prototype glyph gets one here.
  //
  // Nothing outside this file imports `lucide-react`, which is what keeps the underlying set a
  // one-file swap.
  'activity',
  'calendar-clock',
  'home',
  'key',
  'link',
  'list-checks',
  'rocket',
  'route',
  'sliders',
  'webhook',
  // app-component-kit-adoption S1.1 — DataTable's sort indicator. Added here rather than drawn as a
  // ▲/▼ glyph so the direction stays an SVG like every other mark in the system, and so the drift
  // guard's no-pictograph rule has nothing to catch.
  'arrow-down',
  'arrow-right',
  'arrow-up',
  'binary',
  'book',
  'cable',
  'check',
  // landing-frijoles-rebrand S1.6 (epic D3) — the glyphs the Frijoles sections need: the journey
  // nodes, the chaos/security drill rows, and the release room. The mockup's implementation notes
  // ask for Iconoir; the product-owner call was to keep ONE icon seam rather than run a second
  // library for the same job (CODE-QUALITY.md #1), so the mockup's intent — real icons, never an
  // emoji, never an "I" placeholder — ships from the map that already exists. Nothing outside this
  // file imports lucide-react, which is what makes swapping the underlying set later a one-file job.
  'check-circle',
  'clock',
  'code',
  'copy',
  'database',
  'external',
  'flask',
  'gauge',
  'flag',
  'group',
  'help',
  // design-system-rails S4 — the standing note's marker (`Callout`).
  'info',
  'lock',
  'map-pin',
  'panels',
  'refresh',
  // design-system-rails S4 — the feature list's search field.
  'search',
  'server',
  'settings',
  'shield',
  'sparkles',
  'star',
  'trend-down',
  'trend-up',
  'warning',
  'warning-triangle',
] as const

export type IconName = (typeof ICON_NAMES)[number]
