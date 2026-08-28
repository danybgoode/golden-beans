// Fast unit layer for the feature list's arithmetic (Story 1.2).
//
// The whole of `flag-list-view.ts` is reachable from here because it is import-free: no React, no
// database, no SDK. The component that renders it can only be exercised through a signed-in
// browser, which is outside the merge gate — so everything worth pinning lives in this file, and
// this file IS the gate for it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DORMANT_PAGE_SIZE,
  FLAG_LIST_PAGE_SIZE,
  buildFlagListQuery,
  buildFlagListView,
  groupDormantFlagRows,
  summariseFlagList,
  filterFlagRowsByQuery,
  filterFlagRowsByState,
  filterFlagRowsByType,
  paginateFlagRows,
  parseFlagListParams,
  projectFlagRows,
  resolveActivationState,
  sortFlagRows,
  type FlagListFlagInput,
  type FlagListParams,
  type FlagListRow,
} from './flag-list-view.ts'

const ENVIRONMENTS = ['development', 'preview', 'production']

function version(id: string, number_: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    version: number_,
    definition: {
      valueType: 'boolean',
      description: `description for ${id}`,
      metadata: { polarity: 'enablement', criticality: 'low' },
      ...extra,
    },
  }
}

function flag(overrides: Partial<FlagListFlagInput> & { key: string }): FlagListFlagInput {
  return {
    id: `id-${overrides.key}`,
    versions: [version(`v-${overrides.key}`, 1)],
    activations: [],
    ...overrides,
  }
}

function row(overrides: Partial<FlagListRow> & { key: string }): FlagListRow {
  return {
    id: `id-${overrides.key}`,
    description: '',
    state: 'never',
    polarity: 'enablement',
    criticality: 'low',
    version: null,
    updatedAt: null,
    ...overrides,
  }
}

// ── The three states (Story 2.3 / Amendment 2) ────────────────────────────────────────────────

test('no activation row at all reads as "never", not "off"', () => {
  const resolved = resolveActivationState([], 'production')
  assert.equal(resolved.state, 'never')
  assert.equal(resolved.updatedAt, null)
})

test('an activation row holding NULL reads as "off" — a deliberate deactivation, not an absence', () => {
  const resolved = resolveActivationState(
    [{ environment: 'production', versionId: null, updatedAt: '2026-08-01T00:00:00Z' }],
    'production'
  )
  assert.equal(resolved.state, 'off')
  // The timestamp survives: when somebody turned it off is the point of keeping the row.
  assert.equal(resolved.updatedAt, '2026-08-01T00:00:00Z')
})

test('an activation row with a version reads as "on"', () => {
  const resolved = resolveActivationState(
    [{ environment: 'production', versionId: 'v1', updatedAt: '2026-08-01T00:00:00Z' }],
    'production'
  )
  assert.equal(resolved.state, 'on')
  assert.equal(resolved.versionId, 'v1')
})

test('"off" and "never" are genuinely different values, not two names for one', () => {
  const off = resolveActivationState([{ environment: 'production', versionId: null }], 'production')
  const never = resolveActivationState([{ environment: 'development', versionId: null }], 'production')
  assert.notEqual(off.state, never.state)
})

test('a state is resolved per environment — on in one, never in another', () => {
  const activations = [{ environment: 'development', versionId: 'v-a', updatedAt: '2026-08-01T00:00:00Z' }]
  assert.equal(resolveActivationState(activations, 'development').state, 'on')
  assert.equal(resolveActivationState(activations, 'production').state, 'never')
})

// ── The projection (D2: environment first) ────────────────────────────────────────────────────

test('the projection answers about the environment it was given, not the flag in general', () => {
  const flags = [
    flag({
      key: 'checkout.stripe_enabled',
      versions: [version('v-a', 1)],
      activations: [{ environment: 'development', versionId: 'v-a', updatedAt: '2026-08-01T00:00:00Z' }],
    }),
  ]
  assert.equal(projectFlagRows(flags, 'development')[0].state, 'on')
  assert.equal(projectFlagRows(flags, 'production')[0].state, 'never')
})

test('an "on" row is described by the version that environment SERVES, not the newest draft', () => {
  const flags = [
    flag({
      key: 'a',
      versions: [
        version('v1', 1, { description: 'what production actually serves' }),
        version('v2', 2, { description: 'an unactivated draft' }),
      ],
      activations: [{ environment: 'production', versionId: 'v1' }],
    }),
  ]
  const [projected] = projectFlagRows(flags, 'production')
  assert.equal(projected.description, 'what production actually serves')
  assert.equal(projected.version, 1)
})

test('when nothing is serving, the row falls back to the highest-numbered version', () => {
  const flags = [
    flag({
      key: 'a',
      // ASCENDING, which is what `getFlagRegistryView` actually returns (`.order('version')`).
      // This fixture used to be [v2, v1] with a comment claiming it proved order-independence — but
      // highest-first makes "take the highest" and "take the first" indistinguishable, so the
      // assertion could not see the property it named break, AND the fixture was unlike production.
      // With ascending input, a `take the first` mutant returns 'oldest' and this spec goes red.
      // (Fresh HIGH-tier reviewer, PR #118 — mutation-verified.)
      versions: [version('v1', 1, { description: 'oldest' }), version('v2', 2, { description: 'newest' })],
      activations: [],
    }),
  ]
  const [projected] = projectFlagRows(flags, 'production')
  assert.equal(projected.description, 'newest')
  assert.equal(projected.version, null)
})

test('an activation pointing at a version the view does not carry stays "on" with an unreadable version', () => {
  const flags = [
    flag({
      key: 'a',
      versions: [version('v1', 1)],
      activations: [{ environment: 'production', versionId: 'ghost' }],
    }),
  ]
  const [projected] = projectFlagRows(flags, 'production')
  assert.equal(projected.state, 'on')
  assert.equal(projected.version, null)
})

// ── D1a: polarity and criticality are a convention, not a guarantee ───────────────────────────

test('a definition with no metadata bag reads as unclassified, never undefined', () => {
  const flags = [flag({ key: 'a', versions: [{ id: 'v1', version: 1, definition: { description: 'x' } }] })]
  const [projected] = projectFlagRows(flags, 'production')
  assert.equal(projected.polarity, 'unclassified')
  assert.equal(projected.criticality, 'unclassified')
})

test('an unrecognised metadata value is unclassified rather than echoed into the page', () => {
  const flags = [
    flag({
      key: 'a',
      versions: [version('v1', 1, { metadata: { polarity: 'KILLSWITCH', criticality: 'urgent' } })],
    }),
  ]
  const [projected] = projectFlagRows(flags, 'production')
  assert.equal(projected.polarity, 'unclassified')
  assert.equal(projected.criticality, 'unclassified')
})

test('the live spelling is `killswitch`, one word', () => {
  const flags = [flag({ key: 'a', versions: [version('v1', 1, { metadata: { polarity: 'killswitch' } })] })]
  assert.equal(projectFlagRows(flags, 'production')[0].polarity, 'killswitch')
})

test('a null or non-object definition does not throw — JSONB makes no type promises', () => {
  for (const definition of [null, undefined, 'a string' as unknown, 42 as unknown, [] as unknown]) {
    const flags = [flag({ key: 'a', versions: [{ id: 'v1', version: 1, definition: definition as never }] })]
    const [projected] = projectFlagRows(flags, 'production')
    assert.equal(projected.description, '')
    assert.equal(projected.polarity, 'unclassified')
  }
})

test('a non-string description reads as empty, not as the raw value', () => {
  const flags = [flag({ key: 'a', versions: [version('v1', 1, { description: { nested: true } })] })]
  assert.equal(projectFlagRows(flags, 'production')[0].description, '')
})

// ── Search ────────────────────────────────────────────────────────────────────────────────────

test('search matches the key', () => {
  const rows = [row({ key: 'checkout.stripe_enabled' }), row({ key: 'ml.sync_enabled' })]
  assert.deepEqual(
    filterFlagRowsByQuery(rows, 'stripe').map((r) => r.key),
    ['checkout.stripe_enabled']
  )
})

test('search also matches the DESCRIPTION, not only the key', () => {
  const rows = [
    row({ key: 'a', description: 'Reveal the Stripe card rail at checkout.' }),
    row({ key: 'b', description: 'Something else.' }),
  ]
  assert.deepEqual(
    filterFlagRowsByQuery(rows, 'stripe').map((r) => r.key),
    ['a']
  )
})

test('search is case-insensitive in both directions', () => {
  const rows = [row({ key: 'Checkout.STRIPE' })]
  assert.equal(filterFlagRowsByQuery(rows, 'stripe').length, 1)
  assert.equal(filterFlagRowsByQuery(rows, 'STRIPE').length, 1)
})

test('an all-whitespace query matches everything — a typed space is not an intent to exclude', () => {
  const rows = [row({ key: 'a' }), row({ key: 'b' })]
  assert.equal(filterFlagRowsByQuery(rows, '   ').length, 2)
})

// ── Filters ───────────────────────────────────────────────────────────────────────────────────

test('the "off" filter means NOT ON — it includes never-turned-on rows', () => {
  const rows = [
    row({ key: 'a', state: 'on' }),
    row({ key: 'b', state: 'off' }),
    row({ key: 'c', state: 'never' }),
  ]
  assert.deepEqual(
    filterFlagRowsByState(rows, 'off').map((r) => r.key),
    ['b', 'c']
  )
  assert.deepEqual(
    filterFlagRowsByState(rows, 'on').map((r) => r.key),
    ['a']
  )
  assert.equal(filterFlagRowsByState(rows, 'all').length, 3)
})

test('the type filter can reach unclassified rows, so a flag cannot hide from every filter', () => {
  const rows = [
    row({ key: 'a', polarity: 'killswitch' }),
    row({ key: 'b', polarity: 'enablement' }),
    row({ key: 'c', polarity: 'unclassified' }),
  ]
  assert.deepEqual(
    filterFlagRowsByType(rows, 'unclassified').map((r) => r.key),
    ['c']
  )
  assert.equal(filterFlagRowsByType(rows, 'all').length, 3)
})

// ── Sorts: every branch tie-breaks alphabetically ─────────────────────────────────────────────

test('key_asc and key_desc are exact reverses', () => {
  const rows = [row({ key: 'b' }), row({ key: 'a' }), row({ key: 'c' })]
  assert.deepEqual(
    sortFlagRows(rows, 'key_asc').map((r) => r.key),
    ['a', 'b', 'c']
  )
  assert.deepEqual(
    sortFlagRows(rows, 'key_desc').map((r) => r.key),
    ['c', 'b', 'a']
  )
})

test('key sorting is numeric-aware: key-2 before key-10', () => {
  const rows = [row({ key: 'key-10' }), row({ key: 'key-2' })]
  assert.deepEqual(
    sortFlagRows(rows, 'key_asc').map((r) => r.key),
    ['key-2', 'key-10']
  )
})

test('state sort orders on → off → never, and ties break alphabetically', () => {
  const rows = [
    row({ key: 'z-never', state: 'never' }),
    row({ key: 'b-on', state: 'on' }),
    row({ key: 'a-off', state: 'off' }),
    row({ key: 'a-on', state: 'on' }),
  ]
  assert.deepEqual(
    sortFlagRows(rows, 'state').map((r) => r.key),
    ['a-on', 'b-on', 'a-off', 'z-never']
  )
})

test('type sort puts kill-switches first, unclassified last, ties alphabetical', () => {
  const rows = [
    row({ key: 'z', polarity: 'unclassified' }),
    row({ key: 'm', polarity: 'enablement' }),
    row({ key: 'b', polarity: 'killswitch' }),
    row({ key: 'a', polarity: 'enablement' }),
  ]
  assert.deepEqual(
    sortFlagRows(rows, 'type').map((r) => r.key),
    ['b', 'a', 'm', 'z']
  )
})

test('recent sort is newest first, and never-changed rows sort LAST', () => {
  const rows = [
    row({ key: 'never', updatedAt: null }),
    row({ key: 'old', updatedAt: '2026-01-01T00:00:00Z' }),
    row({ key: 'new', updatedAt: '2026-08-01T00:00:00Z' }),
  ]
  assert.deepEqual(
    sortFlagRows(rows, 'recent').map((r) => r.key),
    ['new', 'old', 'never']
  )
})

test('recent sort ties — including two never-changed rows — break alphabetically', () => {
  const rows = [row({ key: 'z', updatedAt: null }), row({ key: 'a', updatedAt: null })]
  assert.deepEqual(
    sortFlagRows(rows, 'recent').map((r) => r.key),
    ['a', 'z']
  )
})

test('every sort is total: no branch leaves order to the input array', () => {
  const base = [
    row({ key: 'c', state: 'on', polarity: 'killswitch', updatedAt: null }),
    row({ key: 'a', state: 'on', polarity: 'killswitch', updatedAt: null }),
    row({ key: 'b', state: 'on', polarity: 'killswitch', updatedAt: null }),
  ]
  for (const sort of ['key_asc', 'key_desc', 'state', 'type', 'recent'] as const) {
    const forward = sortFlagRows(base, sort).map((r) => r.key)
    const reversed = sortFlagRows([...base].reverse(), sort).map((r) => r.key)
    assert.deepEqual(forward, reversed, `${sort} depended on input order`)
  }
})

test('sorting never mutates its input', () => {
  const rows = [row({ key: 'b' }), row({ key: 'a' })]
  sortFlagRows(rows, 'key_asc')
  assert.deepEqual(
    rows.map((r) => r.key),
    ['b', 'a']
  )
})

// ── Pagination: clamps, never returns an empty page ───────────────────────────────────────────

test('an out-of-range page is CLAMPED into range, not answered with an empty table', () => {
  const rows = [row({ key: 'a' }), row({ key: 'b' }), row({ key: 'c' })]
  const result = paginateFlagRows(rows, 99, 2)
  assert.equal(result.page, 2)
  assert.equal(result.totalPages, 2)
  assert.deepEqual(
    result.pageRows.map((r) => r.key),
    ['c']
  )
})

test('page 0, a negative page and a non-finite page all land on page 1', () => {
  const rows = [row({ key: 'a' }), row({ key: 'b' })]
  // Asserted as `=== 1`, not `>= 1`. The old version used `>= 1`, which is true for EVERY possible
  // implementation — `page` is clamped into `[1, totalPages]` and `totalPages >= 1` — so it proved
  // nothing, and it was the ONLY coverage `POSITIVE_INFINITY` had. Dropping the `Number.isFinite`
  // guard sent Infinity to the LAST page while all 48 specs stayed green.
  // (Fresh HIGH-tier reviewer, PR #118 — mutation-verified.)
  for (const page of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(paginateFlagRows(rows, page, 1).page, 1, `page=${String(page)} should clamp to 1`)
  }
})

test('an empty list still reports one page, so the control never renders "page 1 of 0"', () => {
  const result = paginateFlagRows([], 1, 25)
  assert.equal(result.totalPages, 1)
  assert.equal(result.totalRows, 0)
  assert.deepEqual(result.pageRows, [])
})

test('a zero or negative page size does not divide by zero', () => {
  const rows = [row({ key: 'a' }), row({ key: 'b' })]
  assert.equal(paginateFlagRows(rows, 1, 0).totalPages, 2)
  assert.equal(paginateFlagRows(rows, 1, -3).totalPages, 2)
})

// ── URL parameters: allow-listed in, allow-listed out ─────────────────────────────────────────

test('unknown parameters are DROPPED, not echoed back into a link', () => {
  const params = parseFlagListParams(
    { env: 'production', evil: '<script>', page: '2', unknown: 'x' },
    ENVIRONMENTS,
    'development'
  )
  const query = buildFlagListQuery(params, {}, 'development')
  assert.equal(query.includes('evil'), false)
  assert.equal(query.includes('unknown'), false)
  assert.equal(query.includes('script'), false)
})

test('an unrecognised sort, state, type or environment falls back to its default', () => {
  const params = parseFlagListParams(
    { env: 'staging', sort: 'by_vibes', state: 'maybe', type: 'kill-switch' },
    ENVIRONMENTS,
    'development'
  )
  assert.equal(params.environment, 'development')
  assert.equal(params.sort, 'key_asc')
  assert.equal(params.state, 'all')
  // 'kill-switch' with a hyphen is NOT the stored spelling, and must not silently become one.
  assert.equal(params.type, 'all')
})

test('a repeated parameter takes the first value rather than an array', () => {
  const params = parseFlagListParams({ q: ['first', 'second'] }, ENVIRONMENTS, 'development')
  assert.equal(params.q, 'first')
})

test('the query is trimmed and bounded — a filter is not a payload', () => {
  const params = parseFlagListParams({ q: `  ${'x'.repeat(500)}  ` }, ENVIRONMENTS, 'development')
  assert.equal(params.q.length, 200)
})

test('defaults are omitted from the URL, so a plain view has a clean address', () => {
  const params = parseFlagListParams({}, ENVIRONMENTS, 'development')
  assert.equal(buildFlagListQuery(params, {}, 'development'), '')
})

test('a non-default environment IS written, so the view survives a copy-paste', () => {
  const params = parseFlagListParams({ env: 'production' }, ENVIRONMENTS, 'development')
  assert.equal(buildFlagListQuery(params, {}, 'development'), '?env=production')
})

test('a filtered view round-trips through the URL unchanged', () => {
  const original = parseFlagListParams(
    { env: 'production', q: 'stripe', state: 'on', type: 'killswitch', sort: 'recent', page: '3' },
    ENVIRONMENTS,
    'development'
  )
  const query = buildFlagListQuery(original, {}, 'development')
  const reparsed = parseFlagListParams(
    Object.fromEntries(new URLSearchParams(query.slice(1))),
    ENVIRONMENTS,
    'development'
  )
  assert.deepEqual(reparsed, original)
})

test('an override replaces one field and leaves the rest of the view intact', () => {
  const params = parseFlagListParams({ q: 'stripe', sort: 'recent' }, ENVIRONMENTS, 'development')
  const query = buildFlagListQuery(params, { environment: 'production' }, 'development')
  assert.equal(query.includes('q=stripe'), true)
  assert.equal(query.includes('sort=recent'), true)
  assert.equal(query.includes('env=production'), true)
})

// ── The pipeline, in the one correct order ────────────────────────────────────────────────────

const LIVE_SHAPED: FlagListFlagInput[] = [
  flag({
    key: 'partners.recruiting_v3_enabled',
    versions: [
      version('p1', 1),
      version('p2', 2, { metadata: { polarity: 'enablement', criticality: 'high' } }),
    ],
    activations: ENVIRONMENTS.map((environment) => ({
      environment,
      versionId: 'p2',
      updatedAt: '2026-08-01T00:00:00Z',
    })),
  }),
  flag({
    key: 'checkout.stripe_enabled',
    versions: [version('s1', 1, { metadata: { polarity: 'killswitch', criticality: 'high' } })],
    activations: [],
  }),
  flag({ key: 'ml.sync_enabled', versions: [version('m1', 1)], activations: [] }),
]

test('the pipeline projects BEFORE it filters — a state filter answers about the chosen environment', () => {
  const base = parseFlagListParams({ state: 'on' }, ENVIRONMENTS, 'development')
  const view = buildFlagListView(LIVE_SHAPED, base)
  assert.deepEqual(
    view.pageRows.map((r) => r.key),
    ['partners.recruiting_v3_enabled']
  )
})

test('chip counts are computed BEFORE the state filter, so the chips stay a way back', () => {
  const onlyOn = parseFlagListParams({ state: 'on' }, ENVIRONMENTS, 'development')
  const view = buildFlagListView(LIVE_SHAPED, onlyOn)
  // One row is rendered, but the chips still report the other two — otherwise "off" would read 0
  // and there would be no way to click back to it.
  assert.equal(view.pageRows.length, 1)
  assert.deepEqual(view.stateCounts, { all: 3, on: 1, off: 2, never: 2 })
})

test('chip counts DO respect the search and type filters — they describe the current search', () => {
  const searched = parseFlagListParams({ q: 'stripe' }, ENVIRONMENTS, 'development')
  assert.deepEqual(buildFlagListView(LIVE_SHAPED, searched).stateCounts, {
    all: 1,
    on: 0,
    off: 1,
    never: 1,
  })
})

test('the epic outcome test in miniature: on, in which environment, and which were never turned on', () => {
  const production = buildFlagListView(
    LIVE_SHAPED,
    parseFlagListParams({ env: 'production' }, ENVIRONMENTS, 'development')
  )
  const byKey = new Map(production.pageRows.map((r) => [r.key, r]))
  assert.equal(byKey.get('partners.recruiting_v3_enabled')?.state, 'on')
  assert.equal(byKey.get('partners.recruiting_v3_enabled')?.version, 2)
  // Not "off" — nobody ever turned these on in production, and the console must say so.
  assert.equal(byKey.get('checkout.stripe_enabled')?.state, 'never')
  assert.equal(byKey.get('ml.sync_enabled')?.state, 'never')
})

test('typing `stripe` narrows 42-shaped input to the one flag, with nothing above it', () => {
  const many: FlagListFlagInput[] = [
    ...Array.from({ length: 41 }, (_, index) =>
      flag({ key: `noise.flag_${String(index).padStart(2, '0')}` })
    ),
    flag({ key: 'checkout.stripe_enabled' }),
  ]
  const view = buildFlagListView(many, parseFlagListParams({ q: 'stripe' }, ENVIRONMENTS, 'development'))
  assert.deepEqual(
    view.pageRows.map((r) => r.key),
    ['checkout.stripe_enabled']
  )
  assert.equal(view.totalRows, 1)
  assert.equal(view.totalPages, 1)
})

test('a filter that narrows under a deep page still lands the reader on rows, not a blank table', () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    flag({ key: `flag_${String(index).padStart(2, '0')}` })
  )
  const view = buildFlagListView(
    many,
    parseFlagListParams({ page: '3', q: 'flag_0' }, ENVIRONMENTS, 'development')
  )
  assert.equal(view.pageRows.length > 0, true)
  assert.equal(view.page, 1)
  assert.equal(view.totalRows, 10)
})

test('an empty registry produces an empty view rather than throwing', () => {
  const view = buildFlagListView([], parseFlagListParams({}, ENVIRONMENTS, 'development'))
  assert.deepEqual(view.pageRows, [])
  assert.deepEqual(view.stateCounts, { all: 0, on: 0, off: 0, never: 0 })
  assert.equal(view.totalPages, 1)
})

test('the pipeline does not mutate the flags it was handed', () => {
  const flags = [flag({ key: 'b' }), flag({ key: 'a' })]
  const params: FlagListParams = parseFlagListParams({ sort: 'key_asc' }, ENVIRONMENTS, 'development')
  buildFlagListView(flags, params)
  assert.deepEqual(
    flags.map((f) => f.key),
    ['b', 'a']
  )
})

// ── Story 3.1: the answer line's counts, and the dormant collapse ─────────────────────────────

function stateRow(id: string, state: 'on' | 'off' | 'never'): FlagListRow {
  return {
    id,
    key: id,
    description: '',
    state,
    polarity: 'unclassified',
    criticality: 'unclassified',
    version: state === 'on' ? 1 : null,
    updatedAt: state === 'never' ? null : '2026-08-01T00:00:00Z',
  }
}

test('summariseFlagList counts the three states exhaustively', () => {
  const rows = [stateRow('a', 'on'), stateRow('b', 'never'), stateRow('c', 'never'), stateRow('d', 'off')]
  const summary = summariseFlagList(rows)
  assert.deepEqual(summary, { total: 4, serving: 1, switchedOff: 1, neverSwitched: 2 })
  // The three states must account for every row — a fourth state slipping in silently would make
  // the answer line under-report without anything going red.
  assert.equal(
    summary.serving + summary.switchedOff + summary.neverSwitched,
    summary.total,
    'the three counts do not sum to the total'
  )
})

test("summariseFlagList reproduces production's ACTUAL shape: nothing switched off", () => {
  // Measured 2026-08-28 on the live tenant: 3 on, 0 off, 39 never (A20). Pinned as a named case
  // because it is the shape every reader gets today, and the one a "0 switched off" clause would
  // have been rendered into.
  const rows = [
    ...Array.from({ length: 3 }, (_, index) => stateRow(`on-${index}`, 'on')),
    ...Array.from({ length: 39 }, (_, index) => stateRow(`never-${index}`, 'never')),
  ]
  assert.deepEqual(summariseFlagList(rows), {
    total: 42,
    serving: 3,
    switchedOff: 0,
    neverSwitched: 39,
  })
})

test('the dormant group collapses, and takes ONLY the never-touched rows', () => {
  const rows = [stateRow('a', 'on'), stateRow('b', 'never'), stateRow('c', 'off'), stateRow('d', 'never')]
  const grouped = groupDormantFlagRows(rows, { narrowed: false })
  assert.equal(grouped.grouped, true)
  assert.deepEqual(
    grouped.active.map((r) => r.id),
    ['a', 'c'],
    'a deliberately switched-off flag was collapsed into the dormant group'
  )
  assert.deepEqual(
    grouped.dormant.map((r) => r.id),
    ['b', 'd']
  )
  // Nothing may be lost or duplicated by the split — the reason to assert this separately is that
  // the two filters are written independently and could both drop a state.
  assert.equal(grouped.active.length + grouped.dormant.length, rows.length)
})

test('narrowing the list turns grouping OFF — a filtered view has no majority to summarise', () => {
  const rows = [stateRow('a', 'never'), stateRow('b', 'never'), stateRow('c', 'never')]
  const grouped = groupDormantFlagRows(rows, { narrowed: true })
  assert.equal(grouped.grouped, false)
  assert.equal(grouped.dormant.length, 0, 'rows the reader just searched for were hidden')
  assert.equal(grouped.active.length, 3)
})

test('a single dormant row is NOT collapsed — the disclosure would hide one row and add one', () => {
  const one = groupDormantFlagRows([stateRow('a', 'on'), stateRow('b', 'never')], { narrowed: false })
  assert.equal(one.grouped, false)
  assert.equal(one.active.length, 2)

  // Two dormant rows ARE worth collapsing — but only when there is something for them to be
  // collapsed away FROM. This case needs an active row; `[never, never]` alone is the
  // entirely-dormant list, which deliberately does not group (see the regression test below).
  const two = groupDormantFlagRows([stateRow('a', 'on'), stateRow('b', 'never'), stateRow('c', 'never')], {
    narrowed: false,
  })
  assert.equal(two.grouped, true, 'two dormant rows beside an active one are worth collapsing')
  assert.deepEqual(
    two.dormant.map((r) => r.id),
    ['b', 'c']
  )
})

test('the dormant group pages at 15, not at the list page size', () => {
  assert.equal(DORMANT_PAGE_SIZE, 15)
  assert.notEqual(DORMANT_PAGE_SIZE, FLAG_LIST_PAGE_SIZE)
})

test('the `never` filter is EXACT, while `off` stays the union its chip is labelled with', () => {
  // Added additively by Story 3.1. `off` must keep meaning "not on" — its chip reads "Not on" and
  // existing bookmarks carry `state=off` — while `never` gives the dormant disclosure an exact
  // destination. Asserting both in one test is the point: it is the pair that could drift.
  const rows = [stateRow('a', 'on'), stateRow('b', 'off'), stateRow('c', 'never')]
  assert.deepEqual(
    filterFlagRowsByState(rows, 'never').map((r) => r.id),
    ['c']
  )
  assert.deepEqual(
    filterFlagRowsByState(rows, 'off').map((r) => r.id),
    ['b', 'c'],
    '`off` stopped meaning "not on"'
  )
  assert.deepEqual(
    filterFlagRowsByState(rows, 'on').map((r) => r.id),
    ['a']
  )
  assert.equal(filterFlagRowsByState(rows, 'all').length, 3)
})

test('`state=never` survives a round trip through the URL, so the dormant link is bookmarkable', () => {
  const parsed = parseFlagListParams({ state: 'never' }, ENVIRONMENTS, 'production')
  assert.equal(
    parsed.state,
    'never',
    'an unrecognised state falls back to `all` — `never` was not allow-listed'
  )
})

test('a list that is ENTIRELY dormant is not grouped — otherwise the page renders nothing', () => {
  // The collapse exists to stop dormant rows burying the active ones. With no active rows there is
  // nothing to bury, and grouping would leave the main table with zero rows and no empty state.
  // This is a REGRESSION TEST: the first version of `groupDormantFlagRows` did exactly that, and an
  // existing authed spec timed out clicking a feature link that was no longer rendered.
  const rows = [stateRow('a', 'never'), stateRow('b', 'never'), stateRow('c', 'never')]
  const grouped = groupDormantFlagRows(rows, { narrowed: false })
  assert.equal(grouped.grouped, false, 'the whole list was collapsed behind a disclosure')
  assert.equal(grouped.active.length, 3, 'no rows would have rendered in the main table')
  assert.equal(grouped.dormant.length, 0)
})

test('grouping never loses a row, in any combination of the three states', () => {
  // The property behind the bug above, asserted exhaustively rather than at one shape: whatever the
  // mix, `active` and `dormant` together must still be every row.
  for (let on = 0; on <= 2; on += 1) {
    for (let off = 0; off <= 2; off += 1) {
      for (let never = 0; never <= 3; never += 1) {
        const rows = [
          ...Array.from({ length: on }, (_, i) => stateRow(`on${i}`, 'on')),
          ...Array.from({ length: off }, (_, i) => stateRow(`off${i}`, 'off')),
          ...Array.from({ length: never }, (_, i) => stateRow(`never${i}`, 'never')),
        ]
        const grouped = groupDormantFlagRows(rows, { narrowed: false })
        assert.equal(
          grouped.active.length + grouped.dormant.length,
          rows.length,
          `rows lost at on=${on} off=${off} never=${never}`
        )
        if (grouped.grouped) {
          assert.ok(grouped.active.length > 0, `everything collapsed at on=${on} off=${off} never=${never}`)
        }
      }
    }
  }
})
