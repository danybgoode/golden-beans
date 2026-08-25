// flags-console-parity · Sprint 1, Stories 1.3 and 1.4 — the feature list, and the environment
// it answers about.
//
// ── This is a SERVER component, and that is the design, not an omission ───────────────────────
// Every control here is a `<Link>` or a plain GET `<form>`, so search, filters, sort, page AND the
// selected environment all live in the URL. That is what Story 1.3 actually asks for — "a filtered
// view can be bookmarked, shared, and survives a refresh" — and client state cannot provide it.
// The shape is ported from the upstream's `FlagsFilterBar.tsx` (status chips as links beside a GET
// form), which exists for the same reason. The page ships no JavaScript for any of it.
//
// ── Why this is not `DataTable` (D4) ─────────────────────────────────────────────────────────
// `DataTable` is a client island whose search and sort are `useState`. Routing this list through it
// would put the filters back in client state and break the bookmarkability above — and it has no
// pagination, which D4 refuses to add. So the BEHAVIOUR is different and lives here, while the
// VISUAL language is shared: the markup reuses the `.data-table` classes, so the console looks like
// every other table in the product without pretending to be the same component.
//
// ── D6 / Amendment 1 ─────────────────────────────────────────────────────────────────────────
// Nothing in this file is reachable while `FLAG_CONSOLE_ENABLED` is off — `page.tsx` renders the
// legacy `<FlagManager>` instead, unchanged, which is what makes "byte-for-byte pre-epic" a property
// of the diff rather than a promise in prose.
//
// `<FlagManager>` is NOT edited by this sprint and takes no new prop — it is byte-identical to
// `main`. With the console ON it still renders below this list, deliberately: it holds every
// activate/deactivate control, and the per-feature destination that replaces them is Story 2.1.
// Sprint 1 is additive; Sprint 2 retires the stack in the same story that lands its replacement.
//
// An earlier revision of this file claimed the opposite (a `showDefinitions` prop that hid the
// stack). That prop is gone — hiding those controls a sprint early would have left no way to kill a
// live flag. See the epic README's Amendment 1.

import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@/lib/flag-definition'
import type { FlagRegistryRow } from '@/lib/flag-registry'
import { buildFlagListQuery, buildFlagListView, type FlagListParams } from '@/lib/flag-list-view'
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
// Story 2.1 — the words live in one module now that a second surface renders them (D7).
import { CRITICALITY_LABEL, FLAG_STATE_PRESENTATION, TYPE_LABEL } from './flag-vocabulary'

/**
 * Production is the default view.
 *
 * An operator opening this page is nearly always asking about what customers are getting right now,
 * and defaulting to development would answer a question nobody asked while looking authoritative.
 */
export const DEFAULT_FLAG_ENVIRONMENT: FlagEnvironment = 'production'

const SORT_LABEL: Array<{ value: FlagListParams['sort']; label: string }> = [
  { value: 'key_asc', label: 'Name A–Z' },
  { value: 'key_desc', label: 'Name Z–A' },
  { value: 'state', label: 'On first' },
  { value: 'type', label: 'Type (kill switches first)' },
  { value: 'recent', label: 'Recently changed' },
]

export function FlagConsole({
  slug,
  flags,
  params,
}: {
  slug: string
  flags: FlagRegistryRow[]
  params: FlagListParams
}) {
  const basePath = `/app/flags/${slug}`
  const view = buildFlagListView(flags, params)
  // Every link on the page is built from the PARSED params, never from the raw query string, so an
  // unrecognised parameter cannot survive a round trip through a control on this page.
  const linkTo = (overrides: Partial<FlagListParams>) =>
    `${basePath}${buildFlagListQuery(params, { page: 1, ...overrides }, DEFAULT_FLAG_ENVIRONMENT)}`

  return (
    <Panel className="stack">
      {/* ── Story 1.4: the environment selector ──────────────────────────────────────────────
          Flags-scoped and rendered as links, so the chosen environment is in the URL and travels
          with a copied address. `ProductShell` is untouched (D3): this is not ambient chrome, and
          a switcher in the shell would imply it governs pages that do not read it. */}
      <div className="stack-sm">
        <p className="field__label" id="flag-console-environment">
          Environment
        </p>
        <div className="row-wrap" role="group" aria-labelledby="flag-console-environment">
          {FLAG_ENVIRONMENTS.map((environment) => {
            const selected = environment === params.environment
            return (
              <a
                key={environment}
                className={`tag ${selected ? 'tag-live' : 'tag-next'}`}
                aria-current={selected ? 'true' : undefined}
                href={linkTo({ environment })}
              >
                {environment}
              </a>
            )
          })}
        </div>
        <p className="data-table__count">
          What this list reports is what <strong>{params.environment}</strong> is serving.
        </p>
      </div>

      {/* ── Story 1.3: search, filters, sort ─────────────────────────────────────────────────
          State chips sit OUTSIDE the form (they are links), so the form carries `state` and `env`
          as hidden inputs — otherwise submitting a search would silently reset them, which is the
          bug the upstream's comment records solving the same way. */}
      <div className="row-wrap">
        {(
          [
            ['all', 'All', view.stateCounts.all],
            ['on', 'On', view.stateCounts.on],
            ['off', 'Not on', view.stateCounts.off],
          ] as const
        ).map(([value, label, count]) => {
          const selected = params.state === value
          return (
            <a
              key={value}
              className={`tag ${selected ? 'tag-live' : 'tag-next'}`}
              aria-current={selected ? 'true' : undefined}
              href={linkTo({ state: value })}
            >
              {label} ({count})
            </a>
          )
        })}
      </div>

      <form method="GET" action={basePath} className="row-wrap">
        {params.environment !== DEFAULT_FLAG_ENVIRONMENT && (
          <input type="hidden" name="env" value={params.environment} />
        )}
        {params.state !== 'all' && <input type="hidden" name="state" value={params.state} />}
        <label className="field" htmlFor="flag-console-q">
          <span className="field__label">Search</span>
          <input
            id="flag-console-q"
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search by name or description"
            maxLength={200}
          />
        </label>
        <label className="field" htmlFor="flag-console-type">
          <span className="field__label">Type</span>
          <select id="flag-console-type" name="type" defaultValue={params.type}>
            <option value="all">All types</option>
            <option value="killswitch">Kill switch</option>
            <option value="enablement">Enablement</option>
            <option value="unclassified">Unclassified</option>
          </select>
        </label>
        <label className="field" htmlFor="flag-console-sort">
          <span className="field__label">Sort</span>
          <select id="flag-console-sort" name="sort" defaultValue={params.sort}>
            {SORT_LABEL.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-ghost" type="submit">
          Apply
        </button>
      </form>

      <div className="data-table">
        <p className="data-table__count">
          {view.totalRows === 0
            ? 'No features match this view'
            : `Showing ${view.pageRows.length} of ${view.totalRows} features`}
        </p>
        <div className="data-table__scroll">
          <table>
            <caption>Features in {params.environment}</caption>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">State</th>
                <th scope="col">Type</th>
                <th scope="col">Criticality</th>
              </tr>
            </thead>
            <tbody>
              {view.pageRows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    {flags.length === 0
                      ? 'No features are defined for this project yet.'
                      : 'No features match this search. Clear the filters to see all of them again.'}
                  </td>
                </tr>
              ) : (
                view.pageRows.map((row) => {
                  const presentation = FLAG_STATE_PRESENTATION[row.state]
                  return (
                    <tr key={row.id}>
                      <td>
                        {/* Story 2.1 — the row is the way in. Clicking a feature opens its own
                            place rather than expanding an editor inline, which is the whole point
                            of the destination. */}
                        <a href={`${basePath}/${encodeURIComponent(row.key)}`}>
                          <code>{row.key}</code>
                        </a>
                        {row.description !== '' && <p className="data-table__count">{row.description}</p>}
                      </td>
                      <td>
                        <Badge status={presentation.badge}>{presentation.label}</Badge>
                        <p className="data-table__count">{presentation.detail(row)}</p>
                      </td>
                      <td>{TYPE_LABEL[row.polarity]}</td>
                      <td>{CRITICALITY_LABEL[row.criticality]}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rendered only when there is more than one page: a "Page 1 of 1" control is furniture
            that implies there is somewhere else to go. */}
        {view.totalPages > 1 && (
          <div className="row-wrap">
            {view.page > 1 && (
              <a className="btn btn-ghost" href={linkTo({ page: view.page - 1 })} rel="prev">
                Previous
              </a>
            )}
            <span className="data-table__count">
              Page {view.page} of {view.totalPages}
            </span>
            {view.page < view.totalPages && (
              <a className="btn btn-ghost" href={linkTo({ page: view.page + 1 })} rel="next">
                Next
              </a>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
