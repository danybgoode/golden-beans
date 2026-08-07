// app-shell-and-agent-rail · Sprint 3, Story 3.2 — the funnel's arithmetic, separated from its JSX.
//
// Zero-import so it can be unit-tested directly: a bar height is the one thing in this epic where a
// rounding decision silently changes what a reader concludes, and it cannot be asserted through a
// component without rendering one.

/**
 * A stage's bar height as a percentage of the tallest stage.
 *
 * Two rules that are not cosmetic:
 *   • a stage with a real, non-zero count never renders below 4% — otherwise a feature with three
 *     retained users out of ten thousand targeted draws a hairline indistinguishable from zero, and
 *     "almost nobody" reads as "nobody". Same failure class as an unreadable figure rendering as 0,
 *     expressed in pixels.
 *   • a genuine zero renders at 0. It is a measurement, and flooring it would invent users.
 */
export function barHeightPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.max(4, Math.min(100, (value / max) * 100))
}

/**
 * How much of the previous stage this one kept, as a label — or null when there is nothing to
 * compare against.
 *
 * Null, never "0%", when the previous stage is zero or unreadable: a drop-off from nothing is not a
 * 100% loss, it is an undefined ratio, and printing a number there would be inventing one.
 */
export function dropOffLabel(previous: number | null, current: number | null): string | null {
  if (previous === null || current === null) return null
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null
  if (previous <= 0) return null
  return `${Math.round((current / previous) * 100)}% of previous`
}
