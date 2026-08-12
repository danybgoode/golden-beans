/**
 * Week-over-week change for a daily series: the last 7 days against the 7 before them.
 *
 * ── Why this is a `lib/` module and not a helper inside the landing component ─────────────────
 * It lived in `LiveProofSection.tsx` as a private function, where nothing could test it — the only
 * way to exercise it was to render a server component against a seeded database. It computes a
 * percentage that the landing page prints next to the words "independently checkable", which makes
 * it exactly the kind of arithmetic CODE-QUALITY.md #5 says to extract into a pure, zero-import
 * module so `npm run test:unit` covers it in the merge gate.
 *
 * ── The bug this extraction fixed (cross-family review of PR #92) ─────────────────────────────
 * The original compared `slice(-7)` against `slice(-14, -7)` and divided, with no check that the
 * second window was actually a week. JavaScript's negative slice indices clamp: for a 10-day
 * series, `slice(-7)` yields 7 days but `slice(-14, -7)` yields only 3, because -14 clamps to 0
 * while -7 resolves to index 3. Dividing a 7-day sum by a 3-day sum reported a perfectly flat
 * series as **+133% growth** — on a public page, beside a claim that the numbers are checkable.
 *
 * The fix is to refuse rather than to approximate. A short window returns `wow: null` and the page
 * renders the value with no trend badge, which is the honest rendering of "there is not enough
 * history to compare yet" (CODE-QUALITY.md #8 — never invent a number to fill a space).
 */

export interface DailyPoint {
  /** ISO date, `YYYY-MM-DD`. Sorted lexically, which is chronological for this format. */
  date: string
  value: number
}

export interface WeekOverWeek {
  /** The most recent day's value. */
  current: number
  /** Sum of the last 7 days. */
  lastSum: number
  /**
   * Fractional change against the previous 7 days, or `null` when it cannot be computed honestly:
   * fewer than 14 points (no full prior week to compare against), or a prior week that summed to
   * zero (every change from zero is an infinite one).
   */
  wow: number | null
}

/** The comparison window, in days. Both halves must be complete for `wow` to be non-null. */
const WINDOW = 7

export function weekOverWeek(series: readonly DailyPoint[]): WeekOverWeek | null {
  if (series.length === 0) return null

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date))
  const lastWeek = sorted.slice(-WINDOW)
  const priorWeek = sorted.slice(-WINDOW * 2, -WINDOW)

  const lastSum = lastWeek.reduce((sum, point) => sum + point.value, 0)
  const priorSum = priorWeek.reduce((sum, point) => sum + point.value, 0)
  const current = sorted[sorted.length - 1].value

  // BOTH conditions, and the length check is the one that matters. `priorSum > 0` alone was the
  // original guard and it passes happily for a 3-day "week" — a non-zero sum says nothing about
  // whether the windows are comparable.
  const comparable = priorWeek.length === WINDOW && lastWeek.length === WINDOW && priorSum > 0

  return { current, lastSum, wow: comparable ? (lastSum - priorSum) / priorSum : null }
}
