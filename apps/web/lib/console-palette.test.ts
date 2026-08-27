// console-ia-overhaul · Sprint 1, Story 1.5. The palette's matching and cursor, asserted directly.
//
// The component around this needs a browser AND a session, which the blocking `api` gate has
// neither of — so anything asserted only through the component is asserted nowhere that runs on
// every PR. What is here is what the gate can actually defend.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Module from 'node:module'
import { getProjectSurfaceLinks, type ProjectSurfaceGates } from './project-route-inventory.ts'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (
  Module as typeof Module & {
    registerHooks: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { buildPaletteEntries, filterPaletteEntries, movePaletteCursor } = await import('./console-palette.ts')

const allGatesOpen: ProjectSurfaceGates = {
  'experiment-governance': true,
  'flag-console': true,
  'flag-serving': true,
  'journey-projections': true,
  signals: true,
}

const links = getProjectSurfaceLinks({
  projectSlug: 'miyagisanchez',
  role: 'owner',
  gates: allGatesOpen,
})
const entries = buildPaletteEntries(links)

test('the palette indexes exactly the entitled surfaces — no more, no fewer', () => {
  assert.equal(entries.length, links.length)
  assert.deepEqual(
    entries.map((entry) => entry.href),
    links.map((link) => link.href)
  )
})

test('every entry carries its section in the words the header uses', () => {
  // The row says "Destinations · Setup", not "Destinations · setup". One vocabulary across the
  // header, the rail and the palette, from CONSOLE_SECTIONS — never a second copy of the labels.
  const destinations = entries.find((entry) => entry.label === 'Destinations')
  assert.equal(destinations?.hint, 'Setup')
  assert.equal(entries.find((entry) => entry.label === 'Flags')?.hint, 'Ship')
  for (const entry of entries) {
    assert.ok(
      ['Today', 'Measure', 'Ship', 'Setup'].includes(entry.hint),
      `${entry.label} is hinted "${entry.hint}", which is not one of the four section labels`
    )
  }
})

test('a member’s palette cannot contain an owner-only surface', () => {
  // The palette is a view of `getShellNav`'s already-filtered links, so this holds by construction
  // — which is precisely why it is worth pinning: the day someone "improves" it by indexing the
  // whole inventory instead, this is what goes red.
  const memberEntries = buildPaletteEntries(
    getProjectSurfaceLinks({ projectSlug: 'miyagisanchez', role: 'member', gates: allGatesOpen })
  )
  for (const owned of ['API keys', 'Destinations', 'Share links', 'Agent write keys']) {
    assert.equal(
      memberEntries.some((entry) => entry.label === owned),
      false,
      `a member's palette offered ${owned}`
    )
  }
})

test('NO feature keys are indexed in this sprint — every entry is a surface', () => {
  // Story 1.5's acceptance says so explicitly: D7 is resolved but Story 3.4 owns the feature index.
  // When 3.4 lands it adds `kind: 'feature'` and this assertion is the one it must consciously
  // change — which is the point of `kind` being a closed union with one member today.
  for (const entry of entries) assert.equal(entry.kind, 'surface')
})

// ── Matching ───────────────────────────────────────────────────────────────────────────────────

test('typing part of a label narrows to it', () => {
  const found = filterPaletteEntries(entries, 'dest')
  assert.deepEqual(
    found.map((entry) => entry.label),
    ['Destinations']
  )
})

test('typing a SECTION name lists everything in that section', () => {
  // The reason rows carry their section at all: "setup" is a thing a person types when they know
  // the kind of thing they want and not its name.
  const found = filterPaletteEntries(entries, 'setup')
  assert.deepEqual(
    found.map((entry) => entry.label),
    ['API keys', 'Flag credentials', 'Destinations', 'Share links', 'Agent write keys']
  )
})

test('matching ignores case and surrounding whitespace', () => {
  for (const query of ['DEST', '  dest  ', 'Dest']) {
    assert.deepEqual(
      filterPaletteEntries(entries, query).map((entry) => entry.label),
      ['Destinations'],
      `query ${JSON.stringify(query)} did not match`
    )
  }
})

test('an empty query shows everything, not nothing', () => {
  // A palette that opens blank is a box you have to guess at. It opens as a list of where you can go.
  assert.equal(filterPaletteEntries(entries, '').length, entries.length)
  assert.equal(filterPaletteEntries(entries, '   ').length, entries.length)
})

test('a query that matches nothing returns an empty list rather than everything', () => {
  // The failure worth naming: a filter that falls back to "show all" on no match tells the reader
  // their query succeeded. It did not.
  assert.deepEqual(filterPaletteEntries(entries, 'zzzz-no-such-surface'), [])
})

test('filtering does not mutate the source list', () => {
  const before = entries.length
  filterPaletteEntries(entries, 'dest')
  filterPaletteEntries(entries, '')
  assert.equal(entries.length, before)
})

// ── The cursor ─────────────────────────────────────────────────────────────────────────────────

test('the cursor wraps in both directions', () => {
  assert.equal(movePaletteCursor(0, 1, 3), 1)
  assert.equal(movePaletteCursor(2, 1, 3), 0, 'down from the last row must reach the first')
  assert.equal(movePaletteCursor(0, -1, 3), 2, 'up from the first row must reach the last')
  assert.equal(movePaletteCursor(1, -1, 3), 0)
})

test('the cursor is TOTAL over an empty list — the keystroke that would otherwise throw', () => {
  // ↓ on "no matches" is a real keystroke a real person makes while still typing. `-1 % 0` is NaN,
  // and NaN reaching a `[]` lookup is how a palette in the shell takes down every signed-in route.
  // A9's error boundary would catch that; not needing it to is better.
  for (const delta of [1, -1, 5]) {
    const next = movePaletteCursor(0, delta, 0)
    assert.equal(next, 0)
    assert.ok(Number.isInteger(next), `cursor returned ${next} for an empty list`)
  }
})

test('the cursor is always a valid index into a list of that length', () => {
  // Stated as the property rather than as three examples: for any start, any delta and any length,
  // the result must be addressable. This is the assertion a future "optimisation" of the modulo
  // has to survive.
  for (const length of [1, 2, 5, 13]) {
    for (let index = 0; index < length; index += 1) {
      for (const delta of [1, -1, 3, -4]) {
        const next = movePaletteCursor(index, delta, length)
        assert.ok(
          Number.isInteger(next) && next >= 0 && next < length,
          `index=${index} delta=${delta} length=${length} gave ${next}`
        )
      }
    }
  }
})
