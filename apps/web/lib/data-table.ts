// app-component-kit-adoption · Sprint 1, Story 1.1 — the arithmetic behind `components/ui/DataTable`.
//
// This file exists because of D9. `DataTable` is a client island, and every assertion about it that
// needs a real browser lives in the authed Playwright rail, which is deliberately OUTSIDE the merge
// gate. Sort and filter are pure functions over rows, so they do not need a browser — extracted
// here, they are covered by `npm run test:unit`, which IS the gate. The component keeps only the
// parts that genuinely need React: state, events, markup.
//
// Import-free on purpose, same as `format-utc.ts`: the behaviour on malformed input is directly
// testable and nothing here can crash a dashboard.

/**
 * What a column can yield for sorting and filtering.
 *
 * `null` is a first-class case, not an oversight. A key with no expiry and a key whose expiry we
 * could not read are both "no date on screen" — but neither is the empty string and neither is
 * zero, and the sort must not pretend otherwise. See `compareCellValues`.
 */
export type CellValue = string | number | null

export type SortDirection = 'asc' | 'desc'

/** `null` means "as the server sent them" — see `nextSortState` for why that is a real state. */
export type SortState = { columnKey: string; direction: SortDirection } | null

/**
 * One header click, as a state transition: unsorted → ascending → descending → unsorted.
 *
 * The third step is the one worth defending. Most tables cycle asc ⇄ desc forever, which quietly
 * destroys information: every one of these tables arrives in a MEANINGFUL server order (newest key
 * first, most impactful task first), and a two-state cycle makes that order unreachable once you
 * have clicked anything. A PM who sorts by label to find a row and then wants "back to normal"
 * would otherwise have to reload the page.
 */
export function nextSortState(current: SortState, columnKey: string): SortState {
  if (current === null || current.columnKey !== columnKey) return { columnKey, direction: 'asc' }
  if (current.direction === 'asc') return { columnKey, direction: 'desc' }
  return null
}

/**
 * A total order over `CellValue`, with two deliberate rules.
 *
 * 1. **`null` sorts last in BOTH directions.** It is not the smallest value; it is the absence of a
 *    value, and there is no direction in which "we have no expiry date for this key" is the answer
 *    to "show me the earliest expiry". Sorting it to the top in one direction would put the rows a
 *    reader knows least about where the eye lands first. This is the same family of decision as
 *    `StatCard`'s null-vs-zero: a missing reading is never rendered as an extreme one.
 * 2. **Strings compare with `numeric: true`.** `key-2` sorts before `key-10`, which is what a human
 *    reading a label list means by alphabetical. Locale is pinned to `'en'` rather than left to the
 *    runtime's default: the repo is English-only by policy (WAYS-OF-WORKING → Language), and an
 *    unpinned locale makes the order depend on the machine the code happens to run on.
 */
export function compareCellValues(a: CellValue, b: CellValue, direction: SortDirection): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1

  const sign = direction === 'asc' ? 1 : -1

  if (typeof a === 'number' && typeof b === 'number') {
    // NaN would make the comparator inconsistent and can silently corrupt a sort. A value that is
    // not a number is treated as the absence of one, which is rule 1 again.
    if (Number.isNaN(a) && Number.isNaN(b)) return 0
    if (Number.isNaN(a)) return 1
    if (Number.isNaN(b)) return -1
    return sign * (a - b)
  }

  return sign * String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' })
}

/**
 * Sort a copy of `rows` by one column's value.
 *
 * Never mutates the input: these rows are props handed down from a server component, and sorting
 * them in place would edit React's own data.
 *
 * The sort is **stable** — rows that tie keep their server order — so sorting a key table by
 * "Status" leaves the active keys in newest-first order within the group rather than shuffling
 * them. `Array.prototype.sort` has been required to be stable since ES2019.
 */
export function sortRows<T>(
  rows: readonly T[],
  getValue: (row: T) => CellValue,
  direction: SortDirection
): T[] {
  return [...rows].sort((a, b) => compareCellValues(getValue(a), getValue(b), direction))
}

/**
 * Does any of a row's values contain `query`?
 *
 * Case-insensitive substring, and nothing cleverer. A fuzzy match would let a filter that shows the
 * wrong rows look like a filter that works; a substring match that misses is obvious to the person
 * typing. An all-whitespace query matches everything — a user who has typed a space has not yet
 * expressed an intent to exclude anything.
 */
export function matchesQuery(values: readonly CellValue[], query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return values.some((value) => value !== null && String(value).toLowerCase().includes(needle))
}

/** `matchesQuery` over a list of rows. Returns the input array untouched when nothing is typed. */
export function filterRows<T>(
  rows: readonly T[],
  getValues: (row: T) => readonly CellValue[],
  query: string
): readonly T[] {
  if (query.trim() === '') return rows
  return rows.filter((row) => matchesQuery(getValues(row), query))
}
