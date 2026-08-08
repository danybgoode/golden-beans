'use client'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { filterRows, nextSortState, sortRows, type CellValue, type SortState } from '@/lib/data-table'

// app-component-kit-adoption · Sprint 1, Story 1.1 — the one table in the product.
//
// ── D2: this is a CLIENT ISLAND THAT RECEIVES ROWS. It never fetches. ─────────────────────────
// There is no Supabase client here, no `projectSlug` it would resolve itself, no async prop. Rows
// are read server-side through the existing `lib/dashboard-auth.ts` ownership path and handed down.
// That boundary is the difference between a styling chore and a data-fetching refactor that crosses
// a tenancy line this epic has no business touching. If a future call site wants server-side
// sorting, it passes different rows — it does not teach this component to fetch.
//
// ── D3: the API is what TWO conversions needed, and no more ───────────────────────────────────
// `keys` and `agent-keys` (Sprint 2, Story 2.1) are the only call sites this shape was derived
// from. Everything optional here is optional because one of those two did not need it. Column
// widths, pagination, multi-column sort, row selection and sticky headers are all absent on
// purpose: a table abstraction rich enough for twenty call sites and right for none is the named
// failure mode. A third route that needs an option is a finding to log, not a prop to add quietly.
//
// ── The sort/filter arithmetic is NOT in this file ────────────────────────────────────────────
// It lives in `lib/data-table.ts` because of D9: this component can only be asserted in a browser,
// and the authed Playwright rail is outside the merge gate. Pure functions are gate-covered by
// `npm run test:unit`. What is left here is state, events and markup.

export type DataTableColumn<T> = {
  /** Stable identity for the column, and the key the sort state is held against. */
  key: string
  header: string
  /**
   * The sortable, searchable value for this cell.
   *
   * **Presence is the switch.** A column with a `value` gets a sort control and is searched by the
   * filter; a column without one — the actions column, in both founding call sites — gets neither.
   * That is one prop doing the work of `sortable` + `searchable` and it cannot be set
   * inconsistently, which is the failure two booleans invite.
   *
   * Return `null` for "this row has no such value". It sorts last and never matches the filter —
   * see `lib/data-table.ts` for why absent is not the same as empty.
   */
  value?: (row: T) => CellValue
  /** The rendered cell. Defaults to `value(row)` as text, which is what most columns want. */
  cell?: (row: T) => ReactNode
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  filterLabel = 'Filter',
}: {
  /** What this table is, in a phrase. Rendered as a real `<caption>`, not a heading above it. */
  caption: string
  columns: readonly DataTableColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  /**
   * The sentence shown when the table has no rows at all. **Required, and deliberately not
   * defaulted** — an empty state is the caller's to write because only the caller knows what the
   * reader should do next. A shared "No results" would be exactly the blank `<tbody>` this epic
   * exists to remove, one sentence later.
   */
  empty: ReactNode
  filterLabel?: string
}) {
  const filterId = useId()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>(null)

  const searchable = useMemo(() => columns.filter((column) => column.value), [columns])

  const visible = useMemo(() => {
    const matched = filterRows(rows, (row) => searchable.map((column) => column.value?.(row) ?? null), query)
    if (sort === null) return matched
    const column = columns.find((candidate) => candidate.key === sort.columnKey)
    if (!column?.value) return matched
    const getValue = column.value
    return sortRows(matched, (row) => getValue(row), sort.direction)
  }, [rows, columns, searchable, query, sort])

  return (
    <div className="data-table">
      <div className="data-table__controls">
        <label className="data-table__filter" htmlFor={filterId}>
          <span className="data-table__filter-label">{filterLabel}</span>
          <input
            id={filterId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to narrow the list"
          />
        </label>
        {/* Announced, because a filter that silently removes rows is indistinguishable from a
            filter that is broken — and to a screen-reader user, invisibly so. */}
        <p className="data-table__count" role="status">
          {visible.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`
            : `${visible.length} of ${rows.length} rows`}
        </p>
      </div>

      <div className="data-table__scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = sort?.columnKey === column.key ? sort.direction : null
                return (
                  <th
                    key={column.key}
                    scope="col"
                    // The assistive-technology half of the sort indicator. The arrow below is the
                    // sighted half; neither is sufficient alone.
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                  >
                    {column.value ? (
                      <button
                        type="button"
                        className="data-table__sort"
                        onClick={() => setSort((current) => nextSortState(current, column.key))}
                      >
                        {column.header}
                        {sorted ? (
                          <Icon
                            name={sorted === 'asc' ? 'arrow-up' : 'arrow-down'}
                            size={13}
                            label={sorted === 'asc' ? 'sorted ascending' : 'sorted descending'}
                          />
                        ) : null}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="data-table__empty" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : visible.length === 0 ? (
              // A SECOND, different empty state, and the distinction is the point. "You have no
              // keys" and "none of your keys match what you typed" are different facts about the
              // world, and collapsing them into one sentence is how a PM concludes their data is
              // gone. This one is the component's to write because only the component knows the
              // query.
              <tr>
                <td className="data-table__empty" colSpan={columns.length}>
                  Nothing matches “{query.trim()}”. Clear the filter to see all {rows.length}{' '}
                  {rows.length === 1 ? 'row' : 'rows'}.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.cell ? column.cell(row) : (column.value?.(row) ?? null)}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
