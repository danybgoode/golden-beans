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
// stack), and a later one claimed the prop was GONE. ⚠️ It is not: `flag-manager.tsx:56,89,533`
// still declare and use it, and `page.tsx` still passes `showDefinitions={!consoleEnabled}` (fresh
// reviewer, PR #124). What is true is the BEHAVIOUR the claim was reaching for — the stack is not
// hidden a sprint early, because hiding it would have left no way to kill a live flag. The prop
// exists and is what keeps the gate-off render byte-identical. See the epic README's Amendment 1.

import { Fragment } from 'react'
import type { FlagEnvironment } from '@/lib/flag-definition'
import type { FlagRegistryRow } from '@/lib/flag-registry'
import {
  buildFlagListQuery,
  buildFlagListView,
  groupDormantFlagRows,
  runsByState,
  projectFlagRows,
  summariseFlagList,
  type FlagListSummary,
  type FlagListParams,
} from '@/lib/flag-list-view'
import { dormantGroupLabel, flagListAnswerSegments } from '@/lib/flag-console-copy'
// Story 2.1 — the words live in one module now that a second surface renders them (D7).
import { CRITICALITY_LABEL, FLAG_STATE_PRESENTATION, TYPE_LABEL, summaryCardLabels } from './flag-vocabulary'

/**
 * Production is the default view.
 *
 * An operator opening this page is nearly always asking about what customers are getting right now,
 * and defaulting to development would answer a question nobody asked while looking authoritative.
 */
export const DEFAULT_FLAG_ENVIRONMENT: FlagEnvironment = 'production'

/**
 * Which summary cards the current filter covers.
 *
 * ⚠️ `state=off` (the historic "not on" union) is reachable by URL but has NO card of its own, so a
 * plain equality check left nothing marked current and no card painted — a reader arriving on that
 * link saw a filtered list with no indication of what filtered it (fresh reviewer, round 2).
 *
 * Exact for every filter that has a card. `'off'` spans two of them — off and never — so both are
 * marked rather than neither, and the reader can see which view they are in. Its chip reads "Not on"
 * and old bookmarks carry it, so its meaning is not changed here.
 */
/**
 * The sort options, restored as ONE owned list.
 *
 * ⚠️ Hand-typing these into the `<select>` dropped `type` ("Type (kill switches first)") entirely —
 * a capability removed with no note, while `FlagListSort` and `sortFlagRows` still implement it, so
 * `?sort=type` kept working with no control to reach it. It also turned the en-dashes into hyphens
 * and renamed "On first" to "State" (cross-review, vibe, round 4).
 *
 * That is the same failure D7's vocabulary guard exists for: a label with an owner, retyped
 * somewhere else. The list is the owner again.
 */
const SORT_LABEL: Array<{ value: FlagListParams['sort']; label: string }> = [
  { value: 'key_asc', label: 'Name A–Z' },
  { value: 'key_desc', label: 'Name Z–A' },
  { value: 'state', label: 'On first' },
  { value: 'type', label: 'Type (kill switches first)' },
  { value: 'recent', label: 'Recently changed' },
]

/** One place the card-to-count mapping lives, so the number and the `data-nonzero` flag agree. */
function cardCount(key: 'all' | 'on' | 'off' | 'never', summary: FlagListSummary): number {
  if (key === 'all') return summary.total
  if (key === 'on') return summary.serving
  if (key === 'off') return summary.switchedOff
  return summary.neverSwitched
}

function isCurrent(active: FlagListParams['state'], card: FlagListParams['state']): boolean {
  if (active === 'off') return card === 'switched_off' || card === 'never'
  return active === card
}

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
  // ⚠️ **`params.sort` was silently ignored on the default view.** The first version used the raw
  // `projected` rows whenever nothing was narrowed, so `sort=key_desc`, `state` and `recent` did
  // nothing at all — and `key_asc` only looked right because `flag-registry.ts` already orders by
  // key. Reachable by any reader picking a sort without also searching (fresh reviewer, PR #124).
  //
  // `buildFlagListView` applies the filters AND the sort, so it is the right call in both branches;
  // only the page size differs, and the design has no pager.
  const visible = buildFlagListView(flags, params, Number.MAX_SAFE_INTEGER).pageRows
  const grouping = groupDormantFlagRows(visible, { narrowed })
  // Runs are empty when not grouped: the design shows no headers over a filtered list.
  const runs = runsByState(grouping.active, { grouped: grouping.grouped })

  // Every link on the page is built from the PARSED params, never from the raw query string, so an
  // unrecognised parameter cannot survive a round trip through a control on this page.
  const linkTo = (overrides: Partial<FlagListParams>) =>
    `${basePath}${buildFlagListQuery(params, { page: 1, ...overrides }, DEFAULT_FLAG_ENVIRONMENT)}`

  return (
    <>
      {/* ── The answer line ────────────────────────────────────────────────────────────────
          The design's lede, and the reason this page exists: it NAMES which features are serving
          rather than only counting them — "Production is serving checkout.stripe_enabled and
          domain.paywall_enabled". A comment here claimed that for a function that only counted
          (fresh reviewer, PR #124); the function does it now rather than the comment being softened. Its words come from `lib/flag-console-copy.ts` and its
          arithmetic from `lib/flag-list-view.ts`, so both halves sit where the merge gate can read
          them — this component is only reachable through a signed-in browser. A zero-count clause is
          DROPPED, never rendered as "0" (A20). */}
      <p className="answer">
        {flagListAnswerSegments(
          summary,
          params.environment,
          projected.filter((row) => row.state === 'on').map((row) => row.key)
        ).map((segment, index) =>
          segment.emphasis === 'mono' ? (
            <span className="mono" key={index}>
              {segment.text}
            </span>
          ) : segment.emphasis === 'strong' ? (
            <b key={index}>{segment.text}</b>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          )
        )}
      </p>

      {/* ── The summary strip ──────────────────────────────────────────────────────────────
          Four counts, each a link that filters the list to itself. `aria-current` marks the one in
          force and is also what paints the selected card — so what a reader sees and what a screen
          reader hears are one attribute, not two kept in agreement by hand. */}
      <div className="summary">
        {summaryCardLabels(params.environment).map((card) => (
          <a
            key={card.key}
            className={`stat ${card.key}`}
            data-nonzero={String(cardCount(card.key, summary) > 0)}
            href={linkTo({ state: card.state })}
            aria-current={isCurrent(params.state, card.state) ? 'true' : undefined}
          >
            <span className="n">{cardCount(card.key, summary)}</span>
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
        <span className="sel">
          <select name="type" defaultValue={params.type} aria-label="Type">
            <option value="all">All types</option>
            {(['killswitch', 'enablement', 'unclassified'] as const).map((polarity) => (
              <option key={polarity} value={polarity}>
                {TYPE_LABEL[polarity]}
              </option>
            ))}
          </select>
        </span>
        <span className="sel">
          <select name="sort" defaultValue={params.sort} aria-label="Sort">
            {SORT_LABEL.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        <button type="submit" className="btn btn-ghost">
          Apply
        </button>
      </form>

      {/* `data-feature-list` is the visual gate's hook. A class would work until someone renamed it
          for styling; a data attribute says "something asserts on this". */}
      {/* ⚠️ **Explicit ARIA roles, because `display: flex` strips the native table semantics.**
          This list was a real `<table>` before the redesign and the approved design is flex rows —
          which cost screen-reader users the whole structure: every element read as `generic`, so the
          four column labels were free-floating text with no association to any cell and a reader
          heard "Unclassified Unclassified" with no way to tell type from risk (fresh reviewer, PR
          #124). Roles restore what the layout removed; they are the standard fix here, not a
          workaround. The `columnheader` assertion deleted from the spec is restored with them. */}
      <div className="listcard" data-feature-list role="table" aria-label="Features">
        <div className="listhead" role="row">
          <span className="row-main" role="columnheader">
            Feature
          </span>
          <span className="h-state" role="columnheader">
            State in {params.environment}
          </span>
          <span className="h-meta" role="columnheader">
            Type &amp; risk
          </span>
          {/* ⚠️ No "On / off" header. The prototype puts a toggle and a kebab in `.row-act`; those
              controls do not land until Story 3.3, and a column header advertising controls that do
              not exist is a promise the page cannot keep. The header returns with its cells. */}
        </div>

        {grouping.active.length === 0 && grouping.dormant.length === 0 ? (
          <div className="row" role="row">
            <span className="row-main" role="cell">
              {flags.length === 0
                ? 'No features are defined for this project yet.'
                : 'No features match this search. Clear the filters to see all of them again.'}
            </span>
          </div>
        ) : (
          (runs.length > 0 ? runs : [{ state: null, rows: grouping.active }]).map((run) => (
            <Fragment key={run.state ?? 'ungrouped'}>
              {/* One header PER STATE, naming that state and counting only its own rows. A single
                  hardcoded "On in <env>" over every non-dormant row is what shipped first, and on a
                  list with nothing on it read "On in production · 2" four elements after the page
                  said "Nothing is on in production". */}
              {/* `role="cell"`, NOT `columnheader`: this heading labels a RUN OF ROWS, and telling
                  assistive tech it heads a COLUMN is a different and false claim. The decorative bar
                  is hidden rather than left as an unlabelled cell. */}
              {/* ⚠️ `aria-colspan`: this banner is ONE cell across a three-column table. Without it
                  the run's count was announced under "State in production" — the second column —
                  because a 2-cell row in a 3-column table is positional (fresh reviewer, round 3). */}
              {run.state !== null && (
                <div className={`grp ${run.state}`} role="row">
                  <span className="bar" aria-hidden="true" />
                  <span role="cell" aria-colspan={3}>
                    {run.state === 'on'
                      ? `${FLAG_STATE_PRESENTATION.on.label} in ${params.environment}`
                      : FLAG_STATE_PRESENTATION[run.state].label}
                  </span>
                  <span className="cnt" aria-hidden="true">
                    {run.rows.length}
                  </span>
                </div>
              )}
              {run.rows.map((row) => {
                const presentation = FLAG_STATE_PRESENTATION[row.state]
                return (
                  <div className="row" key={row.id} role="row">
                    <span className="row-main" role="cell">
                      <a className="row-key" href={`${basePath}/${encodeURIComponent(row.key)}`}>
                        <code>{row.key}</code>
                      </a>
                      {row.description !== '' && <span className="row-desc">{row.description}</span>}
                    </span>
                    {/* ⚠️ **No `aria-label` on the cells.** An earlier fix put the column label on
                        each cell, reasoning that `display: none` removes the headers on a phone.
                        `aria-label` is name-from-author and BEATS name-from-content, so the cell
                        holding `checkout.stripe_enabled` announced itself as "Feature" — the label
                        replaced the value it was meant to caption (fresh reviewer, round 3).

                        What actually disambiguates type from risk is the label on the TAGS below,
                        which caption a value rather than replacing one. The comment credited a
                        mechanism that was not the one working. */}
                    <span className="row-state" role="cell">
                      {/* A dot AND a word — never colour alone. The three states are the distinction
                          `flags-console-parity` Amendment 2 paid to separate, and a colour-only pill
                          re-collapses it for anyone who cannot see the difference. */}
                      <span className={`pill ${row.state}`}>
                        <span className="dot" />
                        {presentation.label}
                      </span>
                      <span className="state-detail">{presentation.detail(row)}</span>
                    </span>
                    <span className="row-meta" role="cell">
                      <span className="tag" aria-label={`Type: ${TYPE_LABEL[row.polarity]}`}>
                        {TYPE_LABEL[row.polarity]}
                      </span>
                      <span className="tag" aria-label={`Risk: ${CRITICALITY_LABEL[row.criticality]}`}>
                        {CRITICALITY_LABEL[row.criticality]}
                      </span>
                    </span>
                  </div>
                )
              })}
            </Fragment>
          ))
        )}

        {/* ── One row replacing forty ────────────────────────────────────────────────────────
            ⚠️ It stands for EVERY dormant feature, not the ones that happened to land on this page.
            The first version grouped the paginated slice and read "23 features have never been
            turned on" on a tenant with 40 — a number plausible enough that only putting the built
            page beside the design caught it. */}
        {/* ⚠️ `role="row"` may own only cells. The first retrofit left `.tw` and the "Show them"
            link with no role, so an accessibility tree showed the link as a SIBLING of the row and
            the text in no cell at all (fresh reviewer, round 2). Half a semantics fix reads as a
            whole one until someone dumps the tree. */}
        {grouping.grouped && (
          <div className="dormant" data-dormant-summary role="row">
            {/* ⚠️ The link is INSIDE the cell. Round 2 found it announced as a sibling of the row;
                round 3 "fixed" it by rewriting this comment to say it was inside while leaving the
                element a direct child of `role="row"` — so the comment asserted a property the code
                lacked, which is the exact class of defect the two previous rounds were about
                (cross-review, vibe, round 4, Blocking).

                A `role="row"` may own only cells, so an orphaned `<a>` is both an invalid structure
                and an action with no column. Verified by dumping the tree this time, not by reading
                the diff. */}
            <span className="dormant-text" role="cell" aria-colspan={3}>
              <span className="t">{dormantGroupLabel(grouping.dormant.length, params.environment)}</span>
              <span className="d">
                No one has ever switched them on or off here. Nothing is wrong with them — nothing has
                happened to them.
              </span>
              <a className="go" href={linkTo({ state: 'never' })}>
                Show them
              </a>
            </span>
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
