// app-component-kit-adoption · Sprint 1, Story 1.1 — the gated half of DataTable's coverage (D9).
//
// Everything asserted here decides what a PM concludes from a table, and none of it is visible from
// the component's markup: which rows a filter hides, where the rows we know least about end up, and
// whether "back to the order the server sent" is still reachable after a click.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareCellValues,
  filterRows,
  matchesQuery,
  nextSortState,
  sortRows,
  type SortState,
} from './data-table.ts'

type Key = { label: string; created: string; expires: string | null }

const keys: Key[] = [
  { label: 'production', created: '2026-07-01', expires: '2026-09-01' },
  { label: 'ci', created: '2026-07-05', expires: null },
  { label: 'key-10', created: '2026-07-02', expires: '2026-08-01' },
  { label: 'key-2', created: '2026-07-03', expires: null },
]

test('a header click cycles asc, desc, then back to the server order', () => {
  // The third state is the point: these tables arrive newest-first, and a two-state cycle would
  // make that order unreachable without a page reload.
  let sort: SortState = null
  sort = nextSortState(sort, 'label')
  assert.deepEqual(sort, { columnKey: 'label', direction: 'asc' })
  sort = nextSortState(sort, 'label')
  assert.deepEqual(sort, { columnKey: 'label', direction: 'desc' })
  sort = nextSortState(sort, 'label')
  assert.equal(sort, null)
})

test('clicking a different column starts that column ascending, not wherever the last one was', () => {
  const sort = nextSortState({ columnKey: 'label', direction: 'desc' }, 'created')
  assert.deepEqual(sort, { columnKey: 'created', direction: 'asc' })
})

test('a missing value sorts last in BOTH directions', () => {
  // The rule that matters most in this file. If null sorted first descending, the rows a reader
  // knows least about would land where the eye goes first — the same failure as rendering an
  // unreadable figure as a large number.
  const ascending = sortRows(keys, (key) => key.expires, 'asc').map((key) => key.label)
  const descending = sortRows(keys, (key) => key.expires, 'desc').map((key) => key.label)

  assert.deepEqual(ascending, ['key-10', 'production', 'ci', 'key-2'])
  assert.deepEqual(descending, ['production', 'key-10', 'ci', 'key-2'])

  // ...and the two nulls keep their server order in both, rather than being shuffled.
  assert.deepEqual(ascending.slice(2), ['ci', 'key-2'])
  assert.deepEqual(descending.slice(2), ['ci', 'key-2'])
})

test('labels sort the way a human reads them: key-2 before key-10', () => {
  const sorted = sortRows(keys, (key) => key.label, 'asc').map((key) => key.label)
  assert.deepEqual(sorted, ['ci', 'key-2', 'key-10', 'production'])
})

test('ties keep their server order, so sorting by status does not shuffle within a group', () => {
  const rows = [
    { id: 'first', status: 'active' },
    { id: 'second', status: 'active' },
    { id: 'third', status: 'revoked' },
    { id: 'fourth', status: 'active' },
  ]
  const sorted = sortRows(rows, (row) => row.status, 'asc').map((row) => row.id)
  assert.deepEqual(sorted, ['first', 'second', 'fourth', 'third'])
})

test('sorting never mutates the rows React handed down', () => {
  const original = [...keys]
  sortRows(keys, (key) => key.label, 'desc')
  assert.deepEqual(keys, original)
})

test('a NaN value is treated as absent rather than corrupting the comparison', () => {
  assert.equal(compareCellValues(Number.NaN, 5, 'asc'), 1)
  assert.equal(compareCellValues(5, Number.NaN, 'asc'), -1)
  assert.equal(compareCellValues(Number.NaN, 5, 'desc'), 1)
  assert.equal(compareCellValues(Number.NaN, Number.NaN, 'asc'), 0)
})

test('numbers compare as numbers, not as text', () => {
  assert.ok(compareCellValues(9, 10, 'asc') < 0)
})

test('the filter is a case-insensitive substring over every searchable value', () => {
  assert.ok(matchesQuery(['production', '2026-07-01'], 'PROD'))
  assert.ok(matchesQuery(['production', '2026-07-01'], '07-01'))
  assert.ok(!matchesQuery(['production', '2026-07-01'], 'staging'))
})

test('a null value never matches — absent is not the empty string', () => {
  assert.ok(!matchesQuery([null], ''.padEnd(1, 'x')))
  assert.ok(!matchesQuery([null, 'ci'], 'null'))
})

test('an empty or whitespace-only query shows every row, untouched', () => {
  const rows = filterRows(keys, (key) => [key.label], '   ')
  assert.equal(rows, keys)
  assert.deepEqual(
    filterRows(keys, (key) => [key.label], ''),
    keys
  )
})

test('filtering narrows to the matching rows and keeps their order', () => {
  const rows = filterRows(keys, (key) => [key.label, key.expires], 'key-')
  assert.deepEqual(
    rows.map((key) => key.label),
    ['key-10', 'key-2']
  )
})

test('a query matching nothing yields no rows rather than falling back to all of them', () => {
  // A filter that silently shows everything when it matches nothing is indistinguishable from a
  // filter that is broken. The component renders a distinct "nothing matched" sentence for this.
  assert.deepEqual(
    filterRows(keys, (key) => [key.label], 'nonexistent'),
    []
  )
})
