// Ship › Features — the list, and the environment it answers about.
//
// ── design-system-rails · Sprint 4, Story 4.1 — this page BODY now renders from `design-system/`
// It did not before, and the distinction is the whole value of the coverage number. Sprint 3 put
// every console route inside the design system's frame; this is the first sprint where a page's own
// markup is assembled from `design-system/primitives` instead of from `console.css`'s port of the
// prototype. The classes that painted it (`.is-console .listcard`, `.row`, `.stat`, …) are DELETED
// in this same commit — never as a cleanup story, because with the console live a missing rule is
// noticed the day it goes missing (sprint contract #11).
//
// ── This is a SERVER component, and that is the design, not an omission ───────────────────────
// Every control here is a `<Link>` or a plain GET `<form>`, so search, filters, sort AND the
// selected environment all live in the URL — a filtered view can be bookmarked, shared, and
// survives a refresh. Client state cannot provide that. The page ships no JavaScript for any of it.
//
// ── Why this is not `DataTable` (flags-console-parity D4) ────────────────────────────────────
// `DataTable` is a client island whose search and sort are `useState`. Routing this list through it
// would put the filters back in client state and break the bookmarkability above. So the BEHAVIOUR
// is different and lives here, while the VISUAL language is shared — from the design system now,
// rather than by reusing another component's class names.
//
// ── The shape asserted, never the literal 2 (sprint contract #1) ─────────────────────────────
// The design's claim is "42 features become 2 rows plus one line". That is the PROTOTYPE's dataset.
// Production `miyagisanchez`, queried 2026-08-29: 42 flags, 3 active in Production, 39 never
// activated, 0 deliberately off — so live it is 3 rows and one line standing for 39. What is
// asserted is the SHAPE: rows plus at most one summary, and the summary standing for rows that are
// not also listed. The arithmetic is pinned exhaustively in `lib/flag-list-view.test.ts`, where the
// dataset is controlled.

import { Fragment } from 'react'
import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@/lib/flag-definition'
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
import { evaluateVersionDefault } from '@/lib/flag-environment-view'
import { Icon } from '@/components/ui/Icon'
import {
  Answer,
  Callout,
  Col,
  DormantSummary,
  GroupBanner,
  ListCard,
  ListHead,
  Row,
  RowMain,
  RowState,
  StatLink,
  Summary,
  Tag,
} from '@/design-system/primitives'
import { FlagSwitch } from './[flagKey]/flag-switch'
import { CRITICALITY_LABEL, FLAG_STATE_PRESENTATION, TYPE_LABEL, summaryCardLabels } from './flag-vocabulary'

/**
 * Production is the default view.
 *
 * An operator opening this page is nearly always asking about what customers are getting right now,
 * and defaulting to development would answer a question nobody asked while looking authoritative.
 */
export const DEFAULT_FLAG_ENVIRONMENT: FlagEnvironment = 'production'

/**
 * The sort options, as ONE owned list.
 *
 * ⚠️ Hand-typing these into the `<select>` dropped `type` ("Type (kill switches first)") entirely —
 * a capability removed with no note, while `FlagListSort` and `sortFlagRows` still implement it, so
 * `?sort=type` kept working with no control to reach it (cross-review, vibe, round 4).
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

/**
 * Which summary cards the current filter covers.
 *
 * ⚠️ `state=off` (the historic "not on" union) is reachable by URL but has NO card of its own, so a
 * plain equality check left nothing marked current and no card painted — a reader arriving on that
 * link saw a filtered list with no indication of what filtered it (fresh reviewer, round 2).
 */
function isCurrent(active: FlagListParams['state'], card: FlagListParams['state']): boolean {
  if (active === 'off') return card === 'switched_off' || card === 'never'
  return active === card
}

export function FlagConsole({
  slug,
  flags,
  params,
  snapshotVersion,
  canManage,
  servingEnabled,
}: {
  slug: string
  flags: FlagRegistryRow[]
  params: FlagListParams
  /**
   * The selected environment's snapshot revision, for the row switch's optimistic-concurrency
   * check. Straight off `getFlagRegistryView()` — no query is added. A missing row means the
   * environment has never had a snapshot, whose revision is 0; the RPC rejects a mismatch either
   * way, so a wrong guess fails loudly rather than overwriting.
   */
  snapshotVersion: number
  /**
   * Whether the viewer may turn features on and off.
   *
   * ⚠️ **This is about CONTROLS, not about data.** Flag keys, descriptions and activation states
   * stay member-readable — nothing below is hidden by this. What it decides is whether a member
   * sees a switch the server would refuse them: `activateFlagAction` / `deactivateFlagAction` both
   * call `requireProjectOwnership`, so the boundary is theirs and this only avoids offering a
   * control that cannot work.
   */
  canManage: boolean
  /** `FLAG_SERVING_ENABLED`. With it off the switches are disabled and the list says why, once. */
  servingEnabled: boolean
}) {
  const basePath = `/app/flags/${slug}`
  // ⚠️ Narrowed, not cast. `FlagListParams.environment` is `string` because `lib/flag-list-view.ts`
  // is import-free by design and cannot name `FlagEnvironment`; `parseFlagListParams` has already
  // checked it against the allow-list, so this always finds a match in practice. An `as
  // FlagEnvironment` here would be the one place the compiler stops checking that the row switch is
  // handed an environment the server actions accept.
  const environment: FlagEnvironment =
    FLAG_ENVIRONMENTS.find((candidate) => candidate === params.environment) ?? DEFAULT_FLAG_ENVIRONMENT

  // The summary describes the ENVIRONMENT, not the filtered view: it is the page's lede, and a lede
  // that changed every time you typed in the search box would not be an answer to "what is on here".
  // So it projects the unfiltered rows.
  const projected = projectFlagRows(flags, params.environment)
  const summary = summariseFlagList(projected)

  // Grouping is off the moment the reader narrows the list — collapsing rows somebody just searched
  // for would hide the answer they asked for.
  const narrowed = params.q !== '' || params.state !== 'all' || params.type !== 'all'

  // ⚠️ The FULL projection, not a page of it. This was `view.pageRows`, so the disclosure read
  // "23 features have never been turned on" on a tenant with 40 — 23 was simply how many landed on
  // page one. The design has no pager on this list precisely because ONE summary row stands for all
  // of them, and pagination is what made that impossible.
  //
  // `buildFlagListView` applies the filters AND the sort, so it is the right call in both branches;
  // only the page size differs, and the design has no pager.
  const visible = buildFlagListView(flags, params, Number.MAX_SAFE_INTEGER).pageRows
  const grouping = groupDormantFlagRows(visible, { narrowed })
  // Runs are empty when not grouped: the design shows no headers over a filtered list.
  const runs = runsByState(grouping.active, { grouped: grouping.grouped })

  // ── What each row's switch needs, resolved ONCE ────────────────────────────────────────────
  // The list already holds every version of every flag (`getFlagRegistryView`), so this is a
  // projection, not a fetch. `latestDefault` is carried because ACTIVATED IS NOT ON: a version whose
  // default variant is falsey serves `false` while the console reports the feature as on, and
  // `describeActivationSurprise` raises a confirm on exactly that.
  const switchable = new Map(
    flags.map((flag) => {
      const latest = flag.versions.reduce<(typeof flag.versions)[number] | undefined>(
        (best, row) => (best === undefined || row.version > best.version ? row : best),
        undefined
      )
      const evaluated =
        latest === undefined
          ? { value: undefined, readable: false }
          : evaluateVersionDefault(flag.key, latest)
      return [
        flag.id,
        {
          latestVersionId: latest?.id ?? null,
          latestVersion: latest?.version ?? null,
          latestDefaultValue: evaluated.value,
          latestReadable: evaluated.readable,
        },
      ]
    })
  )

  // ⚠️ **How many columns this table has, in ONE place.** The banner rows below span the whole
  // width, and `aria-colspan` is a NUMBER — so it has to agree with the number of `columnheader`s
  // actually rendered. Story 3.3 added a fourth (`On / off`) for owners and left two hardcoded `3`s
  // behind, which is a structurally wrong table for exactly the viewers who have the extra column.
  const columnCount = canManage ? 4 : 3

  // Every link on the page is built from the PARSED params, never from the raw query string, so an
  // unrecognised parameter cannot survive a round trip through a control on this page.
  const linkTo = (overrides: Partial<FlagListParams>) =>
    `${basePath}${buildFlagListQuery(params, { page: 1, ...overrides }, DEFAULT_FLAG_ENVIRONMENT)}`

  return (
    <>
      {/* ── The answer line ────────────────────────────────────────────────────────────────
          The design's lede, and the reason this page exists: it NAMES which features are serving
          rather than only counting them. Its words come from `lib/flag-console-copy.ts` and its
          arithmetic from `lib/flag-list-view.ts`, so both halves sit where the merge gate can read
          them — this component is only reachable through a signed-in browser. A zero-count clause is
          DROPPED, never rendered as "0". */}
      <Answer>
        {flagListAnswerSegments(
          summary,
          params.environment,
          projected.filter((row) => row.state === 'on').map((row) => row.key)
        ).map((segment, index) =>
          segment.emphasis === 'mono' ? (
            <span className="ds-mono" key={index}>
              {segment.text}
            </span>
          ) : segment.emphasis === 'strong' ? (
            <b key={index}>{segment.text}</b>
          ) : (
            <Fragment key={index}>{segment.text}</Fragment>
          )
        )}
      </Answer>

      {/* ── The two sentences that used to live under the list ─────────────────────────────
          They are ABOVE the list on purpose: each explains why the switches in it look the way they
          do, and an explanation below the thing it explains is read after the reader has already
          drawn a conclusion.

          The serving notice is preserved VERBATIM from the legacy surface, and deliberately not
          reworded: with serving dark the switches are disabled and this sentence is the only thing
          that says why. It names the variable because the person who can change it is reading. */}
      {!servingEnabled && (
        <Callout tone="warn">
          <b>Flag serving is currently switched off.</b> Features can be prepared, but turning them on and off
          is unavailable until <code>FLAG_SERVING_ENABLED</code> is enabled in a new deployment.
        </Callout>
      )}
      {!canManage && (
        <Callout>
          <b>Read-only access.</b> A project owner turns features on and off, creates them, and manages this
          project&apos;s credentials.
        </Callout>
      )}

      {/* ── The summary strip ──────────────────────────────────────────────────────────────
          Four counts, each a link that filters the list to itself. `aria-current` marks the one in
          force and is also what paints the selected card — so what a reader sees and what a screen
          reader hears are one attribute, not two kept in agreement by hand. */}
      <Summary>
        {summaryCardLabels(params.environment).map((card) => (
          <StatLink
            key={card.key}
            tone={card.key}
            value={cardCount(card.key, summary)}
            label={card.label}
            href={linkTo({ state: card.state })}
            current={isCurrent(params.state, card.state)}
          />
        ))}
      </Summary>

      {/* Still a plain GET form: search, filters and sort live in the URL, so a filtered view can be
          bookmarked and sent to someone. The design changes how it looks, not what it is. */}
      <form className="ds-toolbar" method="get" action={basePath}>
        <input type="hidden" name="env" value={params.environment} />
        <input type="hidden" name="state" value={params.state} />
        <label className="ds-search">
          <span className="ds-search-icon" aria-hidden="true">
            <Icon name="search" size={14} />
          </span>
          {/* No `ds-input`: `.ds-search input` already owns this control's box, and stacking the
              two would give it two paddings and two grounds, one of which wins by source order. */}
          <input
            type="search"
            name="q"
            defaultValue={params.q}
            placeholder="Search features"
            aria-label="Search features"
          />
        </label>
        {/* The type filter's options come from `TYPE_LABEL`, not from four retyped strings. D7's
            guard caught the first version writing "Kill switches" beside a `TYPE_LABEL` that says
            "Kill switch" — a plural that would have drifted the moment either was reworded. */}
        <span className="ds-select">
          <select name="type" defaultValue={params.type} aria-label="Type">
            <option value="all">All types</option>
            {(['killswitch', 'enablement', 'unclassified'] as const).map((polarity) => (
              <option key={polarity} value={polarity}>
                {TYPE_LABEL[polarity]}
              </option>
            ))}
          </select>
        </span>
        <span className="ds-select">
          <select name="sort" defaultValue={params.sort} aria-label="Sort">
            {SORT_LABEL.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
        <button type="submit" className="ds-btn ds-btn--secondary">
          Apply
        </button>
      </form>

      {/* `data-feature-list` is the visual gate's hook. A class would work until someone renamed it
          for styling; a data attribute says "something asserts on this". */}
      {/* ⚠️ **Explicit ARIA roles, because `display: flex` strips the native table semantics.**
          This list was a real `<table>` before the redesign and the approved design is flex rows —
          which cost screen-reader users the whole structure: every element read as `generic`, so the
          four column labels were free-floating text with no association to any cell. The roles that
          restore it are carried by the primitives (`ListCard`, `Row`, `Col`), so a page cannot
          forget one. */}
      <div data-feature-list>
        <ListCard label="Features">
          <ListHead>
            <Col header>Feature</Col>
            <Col header width="state">
              State in {params.environment}
            </Col>
            <Col header width="meta">
              Type &amp; risk
            </Col>
            {/* Owner-only, matching the cells. A column header over an empty column is a promise
                the page cannot keep, pointing the other way. */}
            {canManage && (
              <Col header width="act">
                On / off
              </Col>
            )}
          </ListHead>

          {grouping.active.length === 0 && grouping.dormant.length === 0 ? (
            <Row>
              <Col colSpan={columnCount}>
                {flags.length === 0
                  ? 'No features are defined for this project yet.'
                  : 'No features match this search. Clear the filters to see all of them again.'}
              </Col>
            </Row>
          ) : (
            (runs.length > 0 ? runs : [{ state: null, rows: grouping.active }]).map((run) => (
              <Fragment key={run.state ?? 'ungrouped'}>
                {/* One header PER STATE, naming that state and counting only its own rows. A single
                    hardcoded "On in <env>" over every non-dormant row is what shipped first, and on
                    a list with nothing on it read "On in production · 2" four elements after the
                    page said "Nothing is on in production". */}
                {run.state !== null && (
                  <GroupBanner state={run.state} count={run.rows.length} columns={columnCount}>
                    {run.state === 'on'
                      ? `${FLAG_STATE_PRESENTATION.on.label} in ${params.environment}`
                      : FLAG_STATE_PRESENTATION[run.state].label}
                  </GroupBanner>
                )}
                {run.rows.map((row) => {
                  const presentation = FLAG_STATE_PRESENTATION[row.state]
                  return (
                    <Row key={row.id}>
                      <RowMain
                        title={row.key}
                        description={row.description === '' ? undefined : row.description}
                        href={`${basePath}/${encodeURIComponent(row.key)}`}
                      />
                      {/* ⚠️ **No `aria-label` on the cells.** An earlier fix put the column label on
                          each cell, reasoning that the headers are clipped on a phone. `aria-label`
                          is name-from-author and BEATS name-from-content, so the cell holding
                          `checkout.stripe_enabled` announced itself as "Feature" — the label
                          replaced the value it was meant to caption. What actually disambiguates
                          type from risk is the label on the TAGS below, which captions a value
                          rather than replacing one. */}
                      <RowState
                        state={row.state}
                        label={presentation.label}
                        detail={presentation.detail(row)}
                      />
                      <Col width="meta">
                        <Tag tone={row.polarity === 'killswitch' ? 'kill' : undefined} label="Type">
                          {TYPE_LABEL[row.polarity]}
                        </Tag>
                        <Tag tone={row.criticality === 'high' ? 'risk-high' : undefined} label="Risk">
                          {CRITICALITY_LABEL[row.criticality]}
                        </Tag>
                      </Col>
                      {/* The design's 38 × 21 switch, in the cell its header names. `FlagSwitch` in
                          its `switch` variant: the SAME component the feature's own page uses, so
                          the write path, the asymmetric confirm, the in-flight lock and the verbatim
                          server rejection are one implementation rather than two. It is given ONE
                          environment — the one the reader is looking at — because a row is not the
                          place to offer three. */}
                      {canManage && (
                        <Col width="act">
                          <FlagSwitch
                            slug={slug}
                            flagId={row.id}
                            flagKey={row.key}
                            environments={[{ environment, state: row.state, snapshotVersion }]}
                            latestVersionId={switchable.get(row.id)?.latestVersionId ?? null}
                            latestVersion={switchable.get(row.id)?.latestVersion ?? null}
                            latestDefaultValue={switchable.get(row.id)?.latestDefaultValue}
                            latestReadable={switchable.get(row.id)?.latestReadable ?? false}
                            canManage={canManage}
                            servingEnabled={servingEnabled}
                            variant="switch"
                          />
                        </Col>
                      )}
                    </Row>
                  )
                })}
              </Fragment>
            ))
          )}

          {/* ── One line replacing thirty-nine ────────────────────────────────────────────────
              ⚠️ It stands for EVERY dormant feature, not the ones that happened to land on this
              page. The first version grouped the paginated slice and read "23 features have never
              been turned on" on a tenant with 40 — a number plausible enough that only putting the
              built page beside the design caught it. */}
          {grouping.grouped && (
            <DormantSummary
              title={dormantGroupLabel(grouping.dormant.length, params.environment)}
              detail="No one has ever switched them on or off here. Nothing is wrong with them — nothing has happened to them."
              action="Show them"
              href={linkTo({ state: 'never' })}
              columns={columnCount}
            />
          )}
        </ListCard>
      </div>

      <p className="ds-foot">
        {grouping.grouped
          ? `Showing ${grouping.active.length} rows for ${summary.total} features — ${grouping.dormant.length} of them summarised in one line.`
          : `Showing ${grouping.active.length} of ${summary.total} features.`}
      </p>
    </>
  )
}
