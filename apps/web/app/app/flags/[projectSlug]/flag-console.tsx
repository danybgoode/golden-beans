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

import type { FlagEnvironment } from '@/lib/flag-definition'
import type { FlagRegistryRow } from '@/lib/flag-registry'
import {
  buildFlagListQuery,
  buildFlagListView,
  groupDormantFlagRows,
  projectFlagRows,
  summariseFlagList,
  type FlagListParams,
} from '@/lib/flag-list-view'
import { dormantGroupLabel, flagListAnswerLine } from '@/lib/flag-console-copy'
// Story 2.1 — the words live in one module now that a second surface renders them (D7).
import { CRITICALITY_LABEL, FLAG_STATE_PRESENTATION, TYPE_LABEL, summaryCardLabels } from './flag-vocabulary'

/**
 * Production is the default view.
 *
 * An operator opening this page is nearly always asking about what customers are getting right now,
 * and defaulting to development would answer a question nobody asked while looking authoritative.
 */
export const DEFAULT_FLAG_ENVIRONMENT: FlagEnvironment = 'production'

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

  // ── Story 3.1, rebuilt against the approved design ───────────────────────────────────────
  // The summary describes the ENVIRONMENT, not the filtered view: it is the page's lede, and a lede
  // that changed every time you typed in the search box would not be an answer to "what is on
  // here". So it projects the unfiltered rows.
  const projected = projectFlagRows(flags, params.environment)
  const summary = summariseFlagList(projected)

  // Grouping is off the moment the reader narrows the list — collapsing rows somebody just searched
  // for would hide the answer they asked for.
  const narrowed = params.q !== '' || params.state !== 'all' || params.type !== 'all'

  // ⚠️ The FULL projection, not a page of it. This was `view.pageRows`, so the disclosure read
  // "23 features have never been turned on" on a tenant with 40 — 23 was simply how many landed on
  // page one. The design has no pager on this list precisely because ONE summary row stands for all
  // of them, and pagination is what made that impossible.
  const narrowedRows = narrowed
    ? buildFlagListView(flags, params, Number.MAX_SAFE_INTEGER).pageRows
    : projected
  const grouping = groupDormantFlagRows(narrowedRows, { narrowed })

  // Every link on the page is built from the PARSED params, never from the raw query string, so an
  // unrecognised parameter cannot survive a round trip through a control on this page.
  const linkTo = (overrides: Partial<FlagListParams>) =>
    `${basePath}${buildFlagListQuery(params, { page: 1, ...overrides }, DEFAULT_FLAG_ENVIRONMENT)}`

  return (
    <>
      {/* ── The answer line ────────────────────────────────────────────────────────────────
          The design's lede, and the reason this page exists: it names WHICH features are serving
          rather than only counting them. Its words come from `lib/flag-console-copy.ts` and its
          arithmetic from `lib/flag-list-view.ts`, so both halves sit where the merge gate can read
          them — this component is only reachable through a signed-in browser. A zero-count clause is
          DROPPED, never rendered as "0" (A20). */}
      <p className="answer">{flagListAnswerLine(summary, params.environment)}</p>

      {/* ── The summary strip ──────────────────────────────────────────────────────────────
          Four counts, each a link that filters the list to itself. `aria-current` marks the one in
          force and is also what paints the selected card — so what a reader sees and what a screen
          reader hears are one attribute, not two kept in agreement by hand. */}
      <div className="summary">
        {summaryCardLabels(params.environment).map((card) => (
          <a
            key={card.key}
            className={`stat ${card.key}`}
            href={linkTo({ state: card.state as FlagListParams['state'] })}
            aria-current={params.state === card.state ? 'true' : undefined}
          >
            <span className="n">
              {card.key === 'all'
                ? summary.total
                : card.key === 'on'
                  ? summary.serving
                  : card.key === 'off'
                    ? summary.switchedOff
                    : summary.neverSwitched}
            </span>
            <span className="k">{card.label}</span>
          </a>
        ))}
      </div>

      {/* Still a plain GET form: search, filters and sort live in the URL, so a filtered view can be
          bookmarked and sent to someone. Story 1.3's requirement; the design changes how it looks,
          not what it is. */}
      <form className="toolbar" method="get" action={basePath}>
        <input type="hidden" name="env" value={params.environment} />
        <input type="hidden" name="state" value={params.state} />
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder="Search features"
          aria-label="Search features"
        />
        {/* The type filter's options come from `TYPE_LABEL`, not from four retyped strings. D7's
            guard caught the first version writing "Kill switches" beside a `TYPE_LABEL` that says
            "Kill switch" — a plural that would have drifted the moment either was reworded. */}
        <select name="type" defaultValue={params.type} aria-label="Type">
          <option value="all">All types</option>
          {(['killswitch', 'enablement', 'unclassified'] as const).map((polarity) => (
            <option key={polarity} value={polarity}>
              {TYPE_LABEL[polarity]}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={params.sort} aria-label="Sort">
          <option value="key_asc">Name A-Z</option>
          <option value="key_desc">Name Z-A</option>
          <option value="state">State</option>
          <option value="recent">Recently changed</option>
        </select>
        <button type="submit" className="btn btn-ghost">
          Apply
        </button>
      </form>

      {/* `data-feature-list` is the visual gate's hook. A class would work until someone renamed it
          for styling; a data attribute says "something asserts on this". */}
      <div className="listcard" data-feature-list>
        <div className="listhead">
          <span className="row-main">Feature</span>
          <span className="h-state">State in {params.environment}</span>
          <span className="h-meta">Type &amp; risk</span>
          <span className="h-act">On / off</span>
        </div>

        {grouping.active.length > 0 && (
          <div className="grp on">
            <span className="bar" />
            <span>On in {params.environment}</span>
            <span className="cnt">{grouping.active.length}</span>
          </div>
        )}

        {grouping.active.length === 0 && grouping.dormant.length === 0 ? (
          <div className="row">
            <span className="row-main">
              {flags.length === 0
                ? 'No features are defined for this project yet.'
                : 'No features match this search. Clear the filters to see all of them again.'}
            </span>
          </div>
        ) : (
          grouping.active.map((row) => {
            const presentation = FLAG_STATE_PRESENTATION[row.state]
            return (
              <div className="row" key={row.id}>
                <span className="row-main">
                  <a className="row-key" href={`${basePath}/${encodeURIComponent(row.key)}`}>
                    <code>{row.key}</code>
                  </a>
                  {row.description !== '' && <span className="row-desc">{row.description}</span>}
                </span>
                <span className="row-state">
                  {/* A dot AND a word — never colour alone. The three states are the distinction
                      `flags-console-parity` Amendment 2 paid to separate, and a colour-only pill
                      re-collapses it for anyone who cannot see the difference. */}
                  <span className={`pill ${row.state}`}>
                    <span className="dot" />
                    {presentation.label}
                  </span>
                  <span className="state-detail">{presentation.detail(row)}</span>
                </span>
                <span className="row-meta">
                  <span className="tag">{TYPE_LABEL[row.polarity]}</span>
                  <span className="tag">{CRITICALITY_LABEL[row.criticality]}</span>
                </span>
                <span className="row-act" />
              </div>
            )
          })
        )}

        {/* ── One row replacing forty ────────────────────────────────────────────────────────
            ⚠️ It stands for EVERY dormant feature, not the ones that happened to land on this page.
            The first version grouped the paginated slice and read "23 features have never been
            turned on" on a tenant with 40 — a number plausible enough that only putting the built
            page beside the design caught it. */}
        {grouping.grouped && (
          <div className="dormant" data-dormant-summary>
            <span className="tw">
              <span className="t">{dormantGroupLabel(grouping.dormant.length, params.environment)}</span>
              <span className="d">
                No one has ever switched them on or off here. Nothing is wrong with them — nothing has
                happened to them.
              </span>
            </span>
            <a className="go" href={linkTo({ state: 'never' })}>
              Show them
            </a>
          </div>
        )}
      </div>

      <p className="foot">
        {grouping.grouped
          ? `Showing ${grouping.active.length} rows for ${summary.total} features — ${grouping.dormant.length} of them summarised in one line.`
          : `Showing ${grouping.active.length} of ${summary.total} features.`}
      </p>
    </>
  )
}
