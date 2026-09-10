/**
 * Paging the Activity list — mockups-as-built · Sprint 3, Story 3.2.
 *
 * ── Why a pure module rather than arithmetic in the page ──────────────────────────────────────
 * Off-by-one and clamping errors are the whole substance of pagination, and they are invisible on a
 * fixture with one page. This repo has already paid for a fixture with one of something hiding an
 * ordering bug (LEARNINGS), so the arithmetic lives where the fast unit layer can put four pages
 * through it without a browser.
 *
 * ── No query change, and no index ─────────────────────────────────────────────────────────────
 * `getFlagRegistryView()` already returns every audit row the flags page renders, and production
 * holds 148 of them (epic D13-b, counted against the live database). Slicing a list that is already
 * fully in memory needs no `range()`, no `count`, and no migration — which is what keeps this story
 * inside the epic's platform-first note (D13).
 */

/**
 * ⚠️ **TWELVE, because the approved state draws twelve.** `ship-activity.png` renders the
 * prototype's whole fixture — twelve entries, and no pagination control, because twelve is all it
 * has. The design does not say "twelve per page"; it says "this is what a page of activity looks
 * like", and the page size is read off it rather than chosen. The controls are built because the
 * product has 148 rows and the design's fixture never needed them.
 */
export const AUDIT_PAGE_SIZE = 12

export type AuditPage<T> = {
  /** The rows to render — never more than `AUDIT_PAGE_SIZE`. */
  rows: T[]
  /** The page actually shown, 1-based and always within range. */
  page: number
  pageCount: number
  /** `null` when there is nowhere to go — so a caller renders no control rather than a dead one. */
  previousPage: number | null
  nextPage: number | null
  /** 1-based index of the first and last row on this page, for "13-24 of 148". */
  from: number
  to: number
  total: number
}

/**
 * Read a page number out of a query string.
 *
 * ⚠️ **Anything UNREADABLE is page 1, never an error and never a crash.** `?page=` arrives from a
 * URL a person can edit and a link somebody can paste wrong, so `''`, `'x'`, `'0'`, `'-3'`,
 * `'1.5'`, `'NaN'` and `'Infinity'` all mean "they meant the first page" rather than seven
 * different failure modes on a read-only audit.
 *
 * ⚠️ **Two things this deliberately does NOT flatten to 1** (cross-agent review, agy — an earlier
 * version of this comment listed both as if it did, which is prose asserting a property the code
 * does not have):
 *   · `'1e9'` parses to a real integer and is returned AS one. Out-of-range is not unreadable, and
 *     `paginateAudit` clamps it to the last page — which is the honest answer to "page a billion".
 *   · `['2','3']` — a repeated query parameter — takes the FIRST. Discarding a value somebody
 *     actually typed because it arrived twice would be a different kind of wrong.
 */
export function parseAuditPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value === undefined) return 1
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 1
  return parsed
}

/**
 * Slice `rows` into the requested page.
 *
 * ⚠️ **A page past the end CLAMPS to the last page rather than rendering empty.** An empty audit
 * page reads as "nothing happened", which is the one thing an audit must never say by accident —
 * the same rule `flag-audit-timeline.tsx` follows for an unresolved flag id. `page` in the result is
 * the page that was actually shown, so a caller marking the current control cannot mark one that is
 * not on screen.
 */
export function paginateAudit<T>(rows: readonly T[], requested: number): AuditPage<T> {
  // ⚠️ **Sanitised HERE too, not only in `parseAuditPage`** (cross-agent review, agy). This is
  // exported, and a caller reaching it with a float or a `NaN` — a different route, a later
  // refactor — would compute `NaN` bounds and fractional row indices rather than clamping. The
  // function that owns the arithmetic owns its own preconditions; depending on a sibling to have
  // been called first is the shape that breaks the day something else calls this.
  const page = Number.isFinite(requested) ? Math.floor(requested) : 1
  const total = rows.length
  // An EMPTY list is one page, not zero. `Math.ceil(0 / 12)` is 0, and a pageCount of 0 makes
  // "page 1 of 0" — a sentence about a list that exists and is empty should not be arithmetic
  // nonsense.
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))
  const shown = Math.min(Math.max(1, page), pageCount)
  const start = (shown - 1) * AUDIT_PAGE_SIZE
  const slice = rows.slice(start, start + AUDIT_PAGE_SIZE)
  return {
    rows: slice,
    page: shown,
    pageCount,
    previousPage: shown > 1 ? shown - 1 : null,
    nextPage: shown < pageCount ? shown + 1 : null,
    // `from`/`to` are 1-based and describe the rows on screen. On an empty list both are 0, which
    // is the honest reading of "showing nothing".
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + slice.length,
    total,
  }
}
