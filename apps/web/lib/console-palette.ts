// console-ia-overhaul · Sprint 1, Story 1.5 — what ⌘K matches, decided outside the DOM.
//
// ── Why the filter is here and not in the component ───────────────────────────────────────────
// The palette is the ONE client island in `ProductShell`, which wraps every signed-in route. Every
// line that lives in the component is a line that can only be exercised through a real browser with
// a real session — which this repo's blocking gate does not have. So the matching, the ordering and
// the cursor arithmetic live here, where `npm run test:unit` can reach them, and the component is
// left with keystrokes and markup.
//
// Same argument and same shape as `lib/console-shell.ts` and `lib/agent-rail-visibility.ts`
// (CODE-QUALITY rule 5). This module imports nothing at all.

import { CONSOLE_SECTIONS, type ProjectSurfaceLink } from './project-route-inventory'

/**
 * One row in the palette.
 *
 * `kind` is a union with a single member today, on purpose. Story 3.4 adds `'feature'`, and a
 * closed union means that story cannot add feature rows without every consumer being made to say
 * what it does with them — the same technique as `ProjectSurfaceGate` and `ConsoleSection`.
 *
 * **Features are deliberately NOT indexed in this sprint** (Story 1.5's own acceptance): D7 is
 * resolved, but the index it describes is Story 3.4's, and shipping it here would be shipping a
 * later story early with none of its cost measured.
 */
export type PaletteEntry = {
  kind: 'surface'
  /** Stable identity for React keys and for the cursor — unique within one palette. */
  id: string
  label: string
  /** The section this lives in, in the words the header uses. Rendered beside the label. */
  hint: string
  href: string
}

const SECTION_LABEL = new Map(CONSOLE_SECTIONS.map((section) => [section.id, section.label]))

/**
 * The palette's contents, from the links `getShellNav()` already resolved.
 *
 * **No new query and no new route** (Story 1.5). The shell has already paid for this list in order
 * to render the rail; the palette is a second view of the same data, not a second read of it.
 */
export function buildPaletteEntries(links: readonly ProjectSurfaceLink[]): PaletteEntry[] {
  return links.map((link) => ({
    kind: 'surface' as const,
    id: `surface:${link.routeSegment}`,
    label: link.label,
    hint: SECTION_LABEL.get(link.section) ?? link.section,
    href: link.href,
  }))
}

/**
 * Filter by what the reader typed.
 *
 * Matches the label AND the section, so typing `setup` lists everything in Setup — the palette
 * answers "where do I want to go" in either vocabulary, which is the point of labelling the rows
 * with their section at all.
 *
 * Case- and whitespace-insensitive. An empty query returns everything rather than nothing: the
 * palette opens as a list of where you can go, not as a blank box that must be guessed at.
 */
export function filterPaletteEntries(entries: readonly PaletteEntry[], query: string): PaletteEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...entries]
  return entries.filter(
    (entry) => entry.label.toLowerCase().includes(needle) || entry.hint.toLowerCase().includes(needle)
  )
}

/**
 * Where the cursor lands after a move.
 *
 * Wraps in both directions, and — the part worth extracting — **is total over an empty list**.
 * `↓` on "no matches" is a real keystroke a real person will make while typing, and an index of
 * `-1 % 0` or `NaN` reaching a `[]` lookup is how a palette throws. It returns `0` there, which the
 * component renders as nothing selected because there is nothing to select.
 *
 * The wrap is also what makes `↑` from the first row useful rather than inert: the last row is one
 * keystroke away in a list of any length.
 */
export function movePaletteCursor(index: number, delta: number, length: number): number {
  if (length <= 0) return 0
  return (((index + delta) % length) + length) % length
}
