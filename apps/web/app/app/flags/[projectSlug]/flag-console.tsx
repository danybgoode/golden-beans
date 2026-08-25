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
import {
  buildFlagListQuery,
  buildFlagListView,
  type FlagActivationState,
  type FlagListParams,
  type FlagListRow,
} from '@/lib/flag-list-view'
import { Badge, type BadgeStatus } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { formatUtc } from '@/lib/format-utc'

/**
 * Production is the default view.
 *
 * An operator opening this page is nearly always asking about what customers are getting right now,
 * and defaulting to development would answer a question nobody asked while looking authoritative.
 */
export const DEFAULT_FLAG_ENVIRONMENT: FlagEnvironment = 'production'

/**
 * The three activation states, said in words rather than left to a colour.
 *
 * ── Why "never turned on here" is not "off" ──────────────────────────────────────────────────
 * This is Story 2.3 / Amendment 2 reaching the screen. `deactivate_flag` keeps the activation row
 * and nulls its version, so a deliberate kill is recorded in the lifecycle audit with an actor and
 * a reason; a flag nobody ever activated has no row and no audit trail, because nothing happened.
 * Live, **40 of 42** flags are in the second state in every environment. Rendering them the same as
 * a deliberate kill is the specific thing that made the old page unanswerable.
 *
 * The badge statuses are borrowed for their SEMANTICS, not their colour: `live` carries a check,
 * `blocked` a warning (somebody did this on purpose), `next` a clock (nobody has got to it).
 */
const STATE_PRESENTATION: Record<
  FlagActivationState,
  { badge: BadgeStatus; label: string; detail: (row: FlagListRow) => string }
> = {
  on: {
    badge: 'live',
    label: 'On',
    detail: (row) =>
      row.version === null ? 'serving a version that could not be read' : `serving v${row.version}`,
  },
  off: {
    badge: 'blocked',
    label: 'Turned off',
    detail: (row) =>
      row.updatedAt === null ? 'switched off here' : `switched off ${formatUtc(row.updatedAt)}`,
  },
  never: {
    badge: 'next',
    label: 'Never turned on here',
    detail: () => 'no one has switched this on or off in this environment',
  },
}

const TYPE_LABEL: Record<string, string> = {
  killswitch: 'Kill switch',
  enablement: 'Enablement',
  unclassified: 'Unclassified',
}

// Every criticality is looked up, including the classified ones. An earlier version special-cased
// only `unclassified` and let the other three fall through as the raw stored value, so a column of
// `high` / `medium` / `low` sat next to a capitalised `Unclassified` (cross-review, Agy, round 1).
// A map means the display form of a value cannot depend on which branch produced it.
const CRITICALITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unclassified: 'Unclassified',
}

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
                  const presentation = STATE_PRESENTATION[row.state]
                  return (
                    <tr key={row.id}>
                      <td>
                        <code>{row.key}</code>
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
