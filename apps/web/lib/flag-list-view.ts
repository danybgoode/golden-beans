// flags-console-parity · Sprint 1, Story 1.2 (epic README, D1, D1a, D2) — the arithmetic behind the
// feature list.
//
// ── Why this is a NEW module and not more of `lib/data-table.ts` (D2) ─────────────────────────
// `data-table.ts` is generic arithmetic over `CellValue`, written for and frozen alongside the
// `DataTable` island. Three things here are not that:
//   1. The sorts are DOMAIN sorts — by activation state, by polarity, by when this environment last
//      changed — not "sort column X ascending".
//   2. `data-table.ts` has no `paginate`, deliberately, and D4 refuses to grow one.
//   3. The decisive one: **Golden's flag state is per ENVIRONMENT.** The upstream this ports from
//      (`medusa-bonsai` → `lib/flags-admin-view.ts`) has a single global `enabled` per flag, so it
//      could sort and filter the stored rows directly. Golden cannot: the same flag is on in
//      development and never touched in production. So this module PROJECTS first —
//      `(flags, environment) → FlagListRow[]` — and every filter, sort and page runs over that
//      projection. Get that order wrong and every count on the page answers about the wrong
//      environment while looking perfectly plausible.
//
// ── Import-free on purpose ────────────────────────────────────────────────────────────────────
// Same constraint as `data-table.ts` and `format-utc.ts`, and the same one the upstream was written
// under: no React, no `next/*`, no SDK, no database. That is what lets `npm run test:unit` — which
// IS the merge gate — cover the whole of this file with zero DOM, while the component that renders
// it can only be reached through a signed-in browser (outside the gate). `flag-environment-view.ts`
// may import FROM here; this file imports from nothing.
//
// ── A4 / D1: no query is added ────────────────────────────────────────────────────────────────
// Every field below is already carried by `getFlagRegistryView()`. This file takes plain data, and
// that signature is what makes a stray Supabase call visible as the wrong turn it would be.

/**
 * What one environment is doing with one flag. **Three states, not two.**
 *
 * The distinction between `off` and `never` is the whole of Story 2.3, and it is not cosmetic —
 * see `resolveActivationState` for how the two are stored differently, and the epic README's
 * Amendment 2 for why the story that was groomed ("not created") could not be built.
 */
export type FlagActivationState =
  /** An activation row points at a definition version. That version is what this environment serves. */
  | 'on'
  /** An activation row exists but holds no version: somebody deliberately turned this off, and the
   *  lifecycle audit says who and why. */
  | 'off'
  /** No activation row has ever existed here. Nobody has turned this on OR off in this environment. */
  | 'never'

/**
 * `killswitch` and `enablement` are the two values the live registry actually holds — one word,
 * no hyphen, matching both the stored `definition.metadata.polarity` and the upstream
 * `filterFlagsByPolarity` this ports from. How it is LABELLED on screen is the vocabulary module's
 * business (D7), not this file's.
 *
 * `unclassified` is D1a. `metadata` is optional in the SDK's `FlagDefinition` and unvalidated by
 * `private.flag_definition_is_valid`, so "the bag has a polarity" is a convention of the Miyagi
 * sync script, not a guarantee the type system or the database makes. One live version already
 * lacks two of its four metadata keys. A list that assumed the convention would render `undefined`
 * the first time a definition arrived from anywhere else.
 */
export type FlagPolarity = 'killswitch' | 'enablement' | 'unclassified'
export type FlagCriticality = 'high' | 'medium' | 'low' | 'unclassified'

export type FlagListSort = 'key_asc' | 'key_desc' | 'state' | 'type' | 'recent'
export type FlagStateFilter = 'all' | 'on' | 'off'
export type FlagTypeFilter = 'all' | 'killswitch' | 'enablement' | 'unclassified'

/** Only the fields this projection reads. Structural, so `flag-registry`'s rows satisfy it as-is. */
export type FlagListVersionInput = {
  id: string
  version: number
  definition: { description?: unknown; metadata?: unknown } | null | undefined
}
export type FlagListActivationInput = {
  environment: string
  versionId: string | null
  updatedAt?: string | null
}
export type FlagListFlagInput = {
  id: string
  key: string
  versions: readonly FlagListVersionInput[]
  activations: readonly FlagListActivationInput[]
}

/** One row of the feature list, already resolved against one environment. */
export type FlagListRow = {
  id: string
  key: string
  /** Empty string when no version carries a readable description — never `undefined` in the markup. */
  description: string
  state: FlagActivationState
  polarity: FlagPolarity
  criticality: FlagCriticality
  /** The version this environment serves, or `null` unless `state === 'on'`. */
  version: number | null
  /** When this environment's activation last changed; `null` when it never has (`state === 'never'`). */
  updatedAt: string | null
}

const POLARITIES = new Set<string>(['killswitch', 'enablement'])
const CRITICALITIES = new Set<string>(['high', 'medium', 'low'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Read one metadata string, defaulting to `unclassified` (D1a).
 *
 * `definition` is a JSONB column: its TypeScript type is a promise the database does not make, so
 * every dereference on the way in is optional. This deliberately does NOT validate the definition —
 * `flag-environment-view.ts` already establishes that the evaluator is the single authority on
 * whether a version can serve anything, and growing a second validator here is the exact failure
 * that file's comments record paying for across three review rounds. All this does is read a label
 * for a list column, and refuse to render a value it does not recognise.
 */
function readMetadata<T extends string>(
  definition: FlagListVersionInput['definition'],
  key: string,
  allowed: ReadonlySet<string>
): T | 'unclassified' {
  if (!isRecord(definition)) return 'unclassified'
  const metadata = definition.metadata
  if (!isRecord(metadata)) return 'unclassified'
  const value = metadata[key]
  return typeof value === 'string' && allowed.has(value) ? (value as T) : 'unclassified'
}

function readDescription(definition: FlagListVersionInput['definition']): string {
  if (!isRecord(definition)) return ''
  return typeof definition.description === 'string' ? definition.description : ''
}

/**
 * The three-state resolution, from data `getFlagRegistryView()` already returns.
 *
 * ── Why "no row" and "row holding NULL" are different, and how they arise ─────────────────────
 * `deactivate_flag` (`20260807160000_flag_activation_conflict_code.sql`) does **not** delete the
 * activation row — it sets `version_id = NULL`, keeps the row, bumps the environment snapshot and
 * writes a `deactivated` entry to the lifecycle audit. So a row holding NULL is the fingerprint of a
 * deliberate act by a named actor with a stated reason. **No row at all** means nobody has ever
 * activated this flag in this environment; there is nothing in the audit, because nothing happened.
 *
 * Collapsing the two is not a small imprecision at this project's scale: live, **40 of 42**
 * `miyagisanchez` flags have no activation row in any environment, and exactly two are on. A console
 * that draws all forty the same as a deliberate kill has not answered the question this epic exists
 * to answer.
 *
 * Exported because `summariseFlagEnvironments()` needs the identical distinction for the
 * per-feature destination (Story 2.3), and two implementations of one rule is how they drift.
 */
export function resolveActivationState(
  activations: readonly FlagListActivationInput[],
  environment: string
): { state: FlagActivationState; versionId: string | null; updatedAt: string | null } {
  const row = activations.find((candidate) => candidate.environment === environment)
  if (row === undefined) return { state: 'never', versionId: null, updatedAt: null }
  const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : null
  if (row.versionId === null) return { state: 'off', versionId: null, updatedAt }
  return { state: 'on', versionId: row.versionId, updatedAt }
}

/**
 * Project every flag against one environment.
 *
 * ── Which version describes the row ───────────────────────────────────────────────────────────
 * When the environment is serving something, the row describes **the version it is actually
 * serving** — not the newest draft. A flag live on v1 while v2 sits unactivated is described by v1,
 * because v1 is what that environment does. When nothing is serving, the row falls back to the
 * **highest-numbered** version, which is the best available answer to "what is this flag".
 *
 * Reading the newest version unconditionally would have been simpler and quietly wrong: it would
 * describe production using a draft production has never seen, which is precisely the kind of
 * confident-and-false line this epic is replacing.
 */
export function projectFlagRows(
  flags: readonly FlagListFlagInput[],
  environment: string
): FlagListRow[] {
  return flags.map((flag) => {
    const { state, versionId, updatedAt } = resolveActivationState(flag.activations, environment)
    const served = versionId === null ? undefined : flag.versions.find((row) => row.id === versionId)
    // `versions` arrives ordered by the registry query, but the fallback must not depend on that:
    // an ordering assumption is invisible until the day it changes.
    const latest = flag.versions.reduce<FlagListVersionInput | undefined>(
      (best, row) => (best === undefined || row.version > best.version ? row : best),
      undefined
    )
    const describing = served ?? latest
    return {
      id: flag.id,
      key: flag.key,
      description: readDescription(describing?.definition),
      state,
      polarity: readMetadata<'killswitch' | 'enablement'>(describing?.definition, 'polarity', POLARITIES),
      criticality: readMetadata<'high' | 'medium' | 'low'>(
        describing?.definition,
        'criticality',
        CRITICALITIES
      ),
      // An activation can point at a version this view does not carry — not reachable through the
      // app's own write path, but the honest answer is "we cannot read it", not a version number we
      // invented. `state` stays `on`, because the environment IS serving something.
      version: served?.version ?? null,
      updatedAt,
    }
  })
}

/** Alphabetical by key. Pinned to `'en'` because the repo is English-only by policy, and an
 *  unpinned locale makes row order depend on the machine the code happens to run on. */
const byKeyAsc = (a: FlagListRow, b: FlagListRow) => a.key.localeCompare(b.key, 'en', { numeric: true })

// Rank, not a boolean, so `state` sorting stays total across THREE states. "On" first is what a
// reader came to check; "turned off" before "never turned on" because a deliberate act is more
// interesting than an absence.
const STATE_RANK: Record<FlagActivationState, number> = { on: 0, off: 1, never: 2 }
// Kill-switches first: their default is ON, so disabling one is the deliberate, dangerous act.
// Unclassified last — it is the absence of an answer, and absences never sort to the top (the same
// rule `compareCellValues` applies to `null`).
const POLARITY_RANK: Record<FlagPolarity, number> = { killswitch: 0, enablement: 1, unclassified: 2 }

/**
 * Dispatch to the chosen sort. **Every branch tie-breaks alphabetically by key**, so the order is
 * always fully determined and never "whatever the array happened to be in" — the property the
 * upstream was written for and the reason a list of 42 stops moving under the reader.
 *
 * Never mutates the input: these rows are handed down from a server component.
 */
export function sortFlagRows(rows: readonly FlagListRow[], sort: FlagListSort): FlagListRow[] {
  const list = [...rows]
  switch (sort) {
    case 'key_desc':
      return list.sort((a, b) => -byKeyAsc(a, b))
    case 'state':
      return list.sort((a, b) =>
        STATE_RANK[a.state] === STATE_RANK[b.state]
          ? byKeyAsc(a, b)
          : STATE_RANK[a.state] - STATE_RANK[b.state]
      )
    case 'type':
      return list.sort((a, b) =>
        POLARITY_RANK[a.polarity] === POLARITY_RANK[b.polarity]
          ? byKeyAsc(a, b)
          : POLARITY_RANK[a.polarity] - POLARITY_RANK[b.polarity]
      )
    case 'recent':
      // Most recently changed first; never-changed rows sort last in BOTH directions, for the same
      // reason `compareCellValues` sorts `null` last: "this environment has never been touched" is
      // not an extreme date, it is the absence of one.
      return list.sort((a, b) => {
        if (a.updatedAt === b.updatedAt) return byKeyAsc(a, b)
        if (a.updatedAt === null) return 1
        if (b.updatedAt === null) return -1
        return a.updatedAt > b.updatedAt ? -1 : 1
      })
    case 'key_asc':
    default:
      return list.sort(byKeyAsc)
  }
}

/** Case-insensitive substring against the flag's key **or** its description. Nothing cleverer: a
 *  fuzzy match lets a filter showing the wrong rows look like one that works, whereas a substring
 *  match that misses is obvious to the person typing. An all-whitespace query matches everything. */
export function filterFlagRowsByQuery(rows: readonly FlagListRow[], query: string): FlagListRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...rows]
  return rows.filter(
    (row) =>
      row.key.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle)
  )
}

/**
 * Filter by activation state.
 *
 * **`off` means "not on"** — it matches both `off` and `never`. That is the plain reading of the
 * word for someone scanning a list, and at this project's live numbers the alternative is actively
 * misleading: a strict reading would put 40 flags in neither the "on" nor the "off" bucket and show
 * `off (0)`, which reads as a broken filter. The three-way distinction is not lost — it is rendered
 * on the row itself, which is where a reader asks *why* something is not on. The filter answers
 * "what can I not see", the row answers "why".
 */
export function filterFlagRowsByState(
  rows: readonly FlagListRow[],
  state: FlagStateFilter
): FlagListRow[] {
  if (state === 'all') return [...rows]
  return rows.filter((row) => (state === 'on' ? row.state === 'on' : row.state !== 'on'))
}

export function filterFlagRowsByType(rows: readonly FlagListRow[], type: FlagTypeFilter): FlagListRow[] {
  if (type === 'all') return [...rows]
  return rows.filter((row) => row.polarity === type)
}

export type FlagPageResult = {
  pageRows: FlagListRow[]
  totalPages: number
  /** The page actually served — clamped into `[1, totalPages]`, never out of range. */
  page: number
  /** Rows matched before paging, for the chip counts and "showing N of M". */
  totalRows: number
}

/**
 * Slice into a page. **Clamps an out-of-range page instead of returning an empty one**, which is
 * the behaviour worth defending: `?page=9` on a two-page list is a stale bookmark or a filter that
 * just narrowed under the reader, and answering it with a blank table looks exactly like "your
 * flags are gone". Non-finite, zero and negative inputs land on page 1 by the same rule.
 */
export function paginateFlagRows(
  rows: readonly FlagListRow[],
  page: number,
  pageSize: number
): FlagPageResult {
  const size = Math.max(1, Math.floor(pageSize) || 1)
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const requested = Number.isFinite(page) ? Math.floor(page) : 1
  const clamped = Math.min(Math.max(1, requested || 1), totalPages)
  const start = (clamped - 1) * size
  return {
    pageRows: rows.slice(start, start + size),
    totalPages,
    page: clamped,
    totalRows: rows.length,
  }
}

export const FLAG_LIST_PAGE_SIZE = 25

export type FlagListParams = {
  environment: string
  q: string
  state: FlagStateFilter
  type: FlagTypeFilter
  sort: FlagListSort
  page: number
}

const SORTS = new Set<string>(['key_asc', 'key_desc', 'state', 'type', 'recent'])
const STATE_FILTERS = new Set<string>(['all', 'on', 'off'])
const TYPE_FILTERS = new Set<string>(['all', 'killswitch', 'enablement', 'unclassified'])

/**
 * Read the list's state out of a URL, **allow-listed**.
 *
 * Anything unrecognised falls back to the default rather than being carried along: an unknown sort
 * is a typo or a stale link, and the honest answer to both is the default view, not an error and
 * certainly not the raw value echoed back into the page.
 */
export function parseFlagListParams(
  input: Record<string, string | string[] | undefined>,
  environments: readonly string[],
  defaultEnvironment: string
): FlagListParams {
  const read = (key: string): string => {
    const value = input[key]
    const first = Array.isArray(value) ? value[0] : value
    return typeof first === 'string' ? first : ''
  }
  const environment = read('env')
  const page = Number.parseInt(read('page'), 10)
  const sort = read('sort')
  const state = read('state')
  const type = read('type')
  return {
    environment: environments.includes(environment) ? environment : defaultEnvironment,
    // Trimmed once, here, so every consumer — the filter, the URL builder and the input's own value
    // — agrees about what was typed. Bounded because a query is a filter, not a payload.
    q: read('q').trim().slice(0, 200),
    state: STATE_FILTERS.has(state) ? (state as FlagStateFilter) : 'all',
    type: TYPE_FILTERS.has(type) ? (type as FlagTypeFilter) : 'all',
    sort: SORTS.has(sort) ? (sort as FlagListSort) : 'key_asc',
    page: Number.isFinite(page) && page > 0 ? page : 1,
  }
}

/**
 * Build the query string for a list link. Mirrors the upstream's `buildFlagsPageUrl` shape: only
 * allow-listed keys, defaults omitted so a plain view has a clean URL, and **unknown parameters are
 * dropped rather than echoed** — this builds from the parsed `FlagListParams`, so an attacker-
 * supplied parameter cannot survive a round trip through a link on the page.
 *
 * `env` is always written when it is not the default, which is what makes Story 1.4's requirement —
 * that a filtered view survives a copy-paste into another session — true rather than nearly true.
 */
export function buildFlagListQuery(
  params: FlagListParams,
  overrides: Partial<FlagListParams> = {},
  defaultEnvironment?: string
): string {
  const next = { ...params, ...overrides }
  const search = new URLSearchParams()
  if (defaultEnvironment === undefined || next.environment !== defaultEnvironment) {
    search.set('env', next.environment)
  }
  if (next.q !== '') search.set('q', next.q)
  if (next.state !== 'all') search.set('state', next.state)
  if (next.type !== 'all') search.set('type', next.type)
  if (next.sort !== 'key_asc') search.set('sort', next.sort)
  if (next.page > 1) search.set('page', String(next.page))
  const query = search.toString()
  return query === '' ? '' : `?${query}`
}

/**
 * The whole pipeline, in the one order that is correct (D2): **project against the environment
 * first**, then narrow, then order, then page.
 *
 * Exposed as a single function so no call site can accidentally sort before projecting, or count
 * chips off a list that has already been paged. `stateCounts` is deliberately computed after the
 * query and type filters but **before** the state filter — otherwise selecting "on" would report
 * `off (0)` and the chips would stop being a way back.
 */
export function buildFlagListView(
  flags: readonly FlagListFlagInput[],
  params: FlagListParams,
  pageSize: number = FLAG_LIST_PAGE_SIZE
): FlagPageResult & { stateCounts: { all: number; on: number; off: number } } {
  const projected = projectFlagRows(flags, params.environment)
  const narrowed = filterFlagRowsByType(filterFlagRowsByQuery(projected, params.q), params.type)
  const stateCounts = {
    all: narrowed.length,
    on: narrowed.filter((row) => row.state === 'on').length,
    off: narrowed.filter((row) => row.state !== 'on').length,
  }
  const ordered = sortFlagRows(filterFlagRowsByState(narrowed, params.state), params.sort)
  return { ...paginateFlagRows(ordered, params.page, pageSize), stateCounts }
}
