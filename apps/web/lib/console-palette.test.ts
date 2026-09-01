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

const {
  buildFeatureEntries,
  buildPaletteEntries,
  filterPaletteEntries,
  movePaletteCursor,
  projectFeatureIndex,
} = await import('./console-palette.ts')

const allGatesOpen: ProjectSurfaceGates = {
  'experiment-governance': true,
  'flag-console': true,
  'flag-serving': true,
  'journey-projections': true,
  signals: true,
  // The console is ON here, so `legacy-keys` is its inverse — the palette indexes `Setup › Keys`
  // and NOT the three routes it replaces. A7: they are never both listed.
  'console-shell': true,
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
  assert.equal(entries.find((entry) => entry.label === 'Features')?.hint, 'Ship')
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
  for (const owned of ['Keys', 'Destinations', 'Share links']) {
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
    ['Connect your agent', 'Keys', 'Destinations', 'Share links']
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

// ── console-ia-overhaul · Sprint 3, Story 3.4 — the feature half ──────────────────────────────

const registryFlags = [
  {
    key: 'checkout.stripe_enabled',
    versions: [
      { version: 1, definition: { description: 'Old wording.' } },
      { version: 3, definition: { description: 'Offer Stripe at checkout.' } },
      { version: 2, definition: { description: 'Middle wording.' } },
    ],
  },
  { key: 'catalog.owned_shop_only_enabled', versions: [{ version: 1, definition: {} }] },
  { key: 'legacy_enabled', versions: [] },
]

test('the index describes each feature with its NEWEST version, not the first row returned', () => {
  // ⚠️ Ordering is not assumed. `flag-registry.ts` happens to order versions, and an assumption
  // about that is invisible until the day it changes — so the fixture above deliberately puts v3 in
  // the MIDDLE. Taking `versions[0]` or `.at(-1)` both give the wrong answer here.
  const index = projectFeatureIndex(registryFlags)
  assert.equal(index[0].description, 'Offer Stripe at checkout.')
})

test('a feature with no readable description gets an empty string, never "undefined"', () => {
  // The component renders the hint only when it is non-empty, so this is what stops the word
  // "undefined" appearing beside a feature key in the palette.
  const index = projectFeatureIndex(registryFlags)
  assert.equal(index[1].description, '')
  // …and a feature with no versions at all still appears. It exists; it simply says nothing.
  assert.deepEqual(index[2], { key: 'legacy_enabled', description: '' })
})

test('the index carries ONLY the key and the description', () => {
  // A6's whole argument is the byte count: ~1.1 KB instead of ~16 KB, because the projection happens
  // server-side. A field creeping in here is the projection quietly becoming a copy.
  for (const entry of projectFeatureIndex(registryFlags)) {
    assert.deepEqual(Object.keys(entry).sort(), ['description', 'key'])
  }
})

test('a feature row opens the feature, with its key escaped for the URL', () => {
  const [entry] = buildFeatureEntries([{ key: 'a b.c', description: 'x' }], 'miyagisanchez')
  assert.equal(entry.href, '/app/flags/miyagisanchez/a%20b.c')
  assert.equal(entry.kind, 'feature')
  assert.equal(entry.label, 'a b.c')
})

test('feature ids cannot collide with surface ids', () => {
  // A feature legitimately called `flags` must not share an id with the Flags surface — the id is
  // what React keys on and what `aria-activedescendant` points at, so a collision would move the
  // cursor's announcement onto the wrong row.
  const feature = buildFeatureEntries([{ key: 'flags', description: '' }], 'miyagisanchez')[0]
  assert.ok(!entries.some((surface) => surface.id === feature.id))
})

test('the filter matches a feature by its key AND by its description', () => {
  const featureEntries = buildFeatureEntries(projectFeatureIndex(registryFlags), 'miyagisanchez')
  const all = [...featureEntries, ...entries]
  assert.deepEqual(
    filterPaletteEntries(all, 'stripe').map((entry) => entry.label),
    ['checkout.stripe_enabled']
  )
  // Typing a word from what the feature DOES finds it, which is the point of indexing the
  // description at all — a reader who remembers "the Stripe one" and a reader who remembers
  // "checkout payments" are the same person on different days.
  assert.deepEqual(
    filterPaletteEntries(all, 'Offer Stripe').map((entry) => entry.label),
    ['checkout.stripe_enabled']
  )
})

test('surfaces are still reachable once features are in the list', () => {
  // The regression this guards is a merge that pushed 42 features in front of 13 surfaces and left
  // no way to reach a surface by name.
  const all = [...buildFeatureEntries(projectFeatureIndex(registryFlags), 'miyagisanchez'), ...entries]
  const flagsSurface = filterPaletteEntries(all, 'Activity')
  assert.equal(flagsSurface.length, 1)
  assert.equal(flagsSurface[0].kind, 'surface')
})
