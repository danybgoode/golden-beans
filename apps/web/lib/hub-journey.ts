// pod-report · Sprint 1, Story 1.2 — the journey view's "you are here" marker placement.
//
// Pure so the placement rule is unit-tested without a page render (Roadmap/LEARNINGS.md: a
// unit-tested pure helper cannot share a file with a `server-only` / framework import). The epics
// array is already build-order sorted by `summarizeRoadmap` — this module only decides WHERE the
// marker sits, never what "shipped" means (that derivation lives once, in
// roadmap-artifact-schema.ts, and this file takes the already-derived `shipped` boolean as input).
//
// The rule: the marker sits at the first epic that is NOT shipped — "you are here" means "this is
// what's being built next." Everything before the marker renders as shipped-behind; everything
// from the marker onward is ahead. When every epic has shipped, the marker sits past the end of the
// list (the destination has been reached, not "next" anything); an empty roadmap places it at 0.

export type JourneyEpic = { shipped: boolean }

export function journeyMarkerIndex(epics: readonly JourneyEpic[]): number {
  const idx = epics.findIndex((e) => !e.shipped)
  return idx === -1 ? epics.length : idx
}
