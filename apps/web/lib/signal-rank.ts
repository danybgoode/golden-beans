// signals-loop · Story 1.0 — impact ranking.
//
// The scope doc is specific about the formula and about why: rank by **users affected × frequency**,
// "the language PostHog speaks", so that a side-by-side comparison of the two loops is legible
// rather than an apples-to-oranges argument about scoring. That constraint is worth more than a
// cleverer metric, so the base impact below is literally that product and nothing else.
//
// Zero imports — every branch is directly unit-testable, and `now` is a parameter rather than a
// call to Date.now() so "deterministic on rerun" is a property of the function, not of the clock.

/** How long it takes an untouched signal's rank to halve. Three days: long enough that a Friday
 *  crash is still near the top on Monday, short enough that a fixed-but-unresolved signal sinks. */
export const RANK_HALF_LIFE_HOURS = 72

/** Recency never multiplies a signal's impact to zero. A very old signal that affected thousands of
 *  users is still more worth reading than a fresh one that affected one — a decay with no floor
 *  eventually asserts the opposite, which is how a real problem falls off a queue forever. */
export const MIN_RECENCY_WEIGHT = 0.05

export type RankInput = {
  usersAffected: number
  eventCount: number
  lastSeenAt: Date
  now: Date
}

/** Users × frequency. The comparable number, undecayed — this is what a dashboard should show when
 *  it says "impact", because a decayed figure that shrinks while nothing changed reads as a bug. */
export function impactScore(usersAffected: number, eventCount: number): number {
  const users = Number.isFinite(usersAffected) ? Math.max(0, Math.trunc(usersAffected)) : 0
  const events = Number.isFinite(eventCount) ? Math.max(0, Math.trunc(eventCount)) : 0
  return users * events
}

/** Exponential decay on age. Clamped at both ends: a `lastSeenAt` in the future (clock skew on a
 *  client-supplied timestamp — a real thing this engine already caps elsewhere) must not produce a
 *  weight above 1 and rocket a signal to the top of the queue. */
export function recencyWeight(lastSeenAt: Date, now: Date, halfLifeHours = RANK_HALF_LIFE_HOURS): number {
  const ageMs = now.getTime() - lastSeenAt.getTime()
  if (!Number.isFinite(ageMs)) return MIN_RECENCY_WEIGHT
  if (ageMs <= 0) return 1
  const ageHours = ageMs / 3_600_000
  const weight = Math.pow(0.5, ageHours / halfLifeHours)
  return Math.max(MIN_RECENCY_WEIGHT, Math.min(1, weight))
}

/**
 * The ordering value for the queue.
 *
 * Rounded to four decimals deliberately. The rank is persisted and then used as a SORT KEY, and an
 * unrounded float means two evaluations microseconds apart write different values for a signal
 * nothing happened to — which makes "deterministic on rerun" false in exactly the way that is
 * hardest to notice: the list re-orders slightly on every refresh and everyone assumes it's fine.
 */
export function impactRank(input: RankInput): number {
  const impact = impactScore(input.usersAffected, input.eventCount)
  const weight = recencyWeight(input.lastSeenAt, input.now)
  return Math.round(impact * weight * 10_000) / 10_000
}
